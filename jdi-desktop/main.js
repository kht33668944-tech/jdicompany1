/**
 * JDI 포털 데스크톱 앱 (Electron)
 *
 * 하는 일: https://jdiportal.com 을 프로그램 창으로 띄우고, 트레이(작업표시줄 숨겨진 아이콘)에 상주시킨다.
 * 화면과 기능은 전부 웹에서 오므로, 웹을 배포하면 이 앱도 자동으로 최신이 된다.
 *
 * 주의: 원격 페이지를 로드하므로 보안 설정(contextIsolation/sandbox)을 절대 완화하지 않는다.
 */

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  shell,
  ipcMain,
  nativeImage,
  dialog,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { autoUpdater } = require("electron-updater");

// 운영 주소. 개발 중 로컬 서버로 시험할 때만 JDI_PORTAL_URL 로 바꾼다.
// 예: JDI_PORTAL_URL=http://localhost:3000 npm start
const PORTAL_URL = process.env.JDI_PORTAL_URL || "https://jdiportal.com";
const PORTAL_HOST = new URL(PORTAL_URL).hostname;
const APP_ID = "com.jdicompany.portal";
// 앱을 켠 뒤 새 버전을 확인하기까지의 지연 — 시작 속도를 방해하지 않기 위해 잠시 미룬다
const UPDATE_CHECK_DELAY_MS = 10_000;
// 켜둔 채로 며칠 쓰는 경우를 위해 6시간마다 다시 확인
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

let mainWindow = null;
let tray = null;
// 트레이 메뉴의 "완전히 종료"를 눌렀을 때만 true — 창 X 버튼은 숨김 처리만 한다
let isQuitting = false;
// 업데이트 상태 — 트레이 메뉴 표시에 사용
let updateState = "idle"; // idle | checking | downloading | ready | error
// 사용자가 트레이 메뉴에서 직접 확인한 경우에만 결과를 알림창으로 보여준다
let updateCheckIsManual = false;

// Windows 알림에 "JDI 포털" 이름이 뜨도록 앱 ID 지정 (지정하지 않으면 electron.app.* 으로 표시됨)
app.setAppUserModelId(APP_ID);

// 중복 실행 방지 — 두 번째 실행은 즉시 종료하고 기존 창을 앞으로 가져온다
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => showMainWindow());
  app.whenReady().then(onReady);
}

function getIcon() {
  return nativeImage.createFromPath(path.join(__dirname, "icon.png"));
}

/**
 * Windows 알림 헤더에 "JDI 포털" 이 뜨게 한다.
 *
 * 위의 `app.setAppUserModelId(APP_ID)` 는 "이 알림이 어느 앱 것인지" 만 정한다.
 * 화면에 보여줄 **이름** 은 Windows 가 따로 찾는데, 보통 같은 ID 를 가진 시작메뉴
 * 바로가기에서 가져온다. 그런데 NSIS 설치본이 만든 바로가기에는 그 ID 가 비어 있어
 * (실측 확인) 이름을 못 찾고 알림에 "Electron" 이 표시됐다.
 *
 * 레지스트리에 ID 를 직접 등록해두면 바로가기 상태와 무관하게 이름이 잡히고,
 * 앱을 켤 때마다 다시 써주므로 설치가 꼬여도 스스로 복구된다.
 */
function registerAppUserModelId() {
  if (process.platform !== "win32") return;

  // 패키징하면 icon.png 는 asar 안이라 Windows 가 직접 읽지 못한다 → 밖으로 한 번 복사한다.
  let iconPath = path.join(__dirname, "icon.png");
  try {
    const copied = path.join(app.getPath("userData"), "app-icon.png");
    fs.copyFileSync(iconPath, copied);
    iconPath = copied;
  } catch {
    /* 아이콘 복사에 실패해도 이름 등록은 계속 진행한다 */
  }

  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_ID}`;
  const write = (name, value) => {
    execFile("reg", ["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"], (error) => {
      if (error) console.error(`[aumid] ${name} 등록 실패:`, error.message);
    });
  };
  write("DisplayName", "JDI 포털");
  write("IconUri", iconPath);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    title: "JDI 포털",
    icon: getIcon(),
    backgroundColor: "#ffffff",
    // 로딩 중 흰 화면 깜빡임 방지 — 준비되면 보여준다
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.loadURL(PORTAL_URL);

  // 창 X 버튼 → 종료가 아니라 트레이로 숨김
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 새 창(target=_blank)은 기본 브라우저로 — 앱 창 안에서 열리지 않게
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // 포털 외부 주소로의 이동 차단 (피싱/오작동 방지). 외부 링크는 기본 브라우저로 넘긴다.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const target = new URL(url);
      if (target.hostname === PORTAL_HOST) return;
      event.preventDefault();
      shell.openExternal(url);
    } catch {
      event.preventDefault();
    }
  });

  // 연결 실패 시 안내 (사내망/인터넷 끊김)
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (errorCode === -3) return; // 사용자가 취소한 이동은 무시
    console.warn(`[jdi-desktop] 로드 실패 (${errorCode} ${errorDescription}): ${validatedURL}`);
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();

  // Windows 는 다른 프로그램이 포커스를 가진 상태에서의 focus() 요청을 무시한다.
  // 알림을 클릭했는데 창이 뒤에 숨어 있으면 안 되므로,
  // 잠깐 최상단으로 올렸다가 곧바로 해제해 확실히 앞으로 가져온다.
  mainWindow.setAlwaysOnTop(true);
  mainWindow.show();
  mainWindow.focus();
  mainWindow.moveTop();
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
  }, 300);
}

function isAutoLaunchEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

function getUpdateMenuLabel() {
  if (updateState === "checking") return "업데이트 확인 중...";
  if (updateState === "downloading") return "새 버전 내려받는 중...";
  if (updateState === "ready") return "새 버전 설치하고 다시 시작";
  return "업데이트 확인";
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "포털 열기",
      click: () => showMainWindow(),
    },
    { type: "separator" },
    {
      label: `버전 ${app.getVersion()}`,
      enabled: false,
    },
    {
      label: getUpdateMenuLabel(),
      enabled: updateState !== "checking" && updateState !== "downloading",
      click: () => {
        if (updateState === "ready") {
          isQuitting = true;
          autoUpdater.quitAndInstall();
          return;
        }
        checkForUpdates({ manual: true });
      },
    },
    { type: "separator" },
    {
      label: "Windows 시작 시 자동 실행",
      type: "checkbox",
      checked: isAutoLaunchEnabled(),
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          // 자동 실행 시에는 창 없이 트레이에만 뜨도록 인자 전달
          args: ["--hidden"],
        });
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "완전히 종료",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(getIcon());
  tray.setToolTip("JDI 포털");
  tray.setContextMenu(buildTrayMenu());

  // 트레이 아이콘 클릭 → 창 열기/숨기기 전환
  tray.on("click", () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showMainWindow();
    }
  });
}

// ============================================================
// 자동 업데이트 — 껍데기 프로그램(.exe) 자체의 새 버전을 GitHub 릴리스에서 받아온다.
// 포털 화면·기능은 서버에서 오므로 이 업데이트와 무관하게 항상 최신이다.
// ============================================================

function setUpdateState(next) {
  updateState = next;
  refreshTrayMenu();
}

function checkForUpdates({ manual = false } = {}) {
  // 개발 중(npm start)에는 업데이트 정보가 없으므로 건너뛴다
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox({
        type: "info",
        title: "JDI 포털",
        message: "개발 모드에서는 업데이트를 확인할 수 없습니다.",
        buttons: ["확인"],
      });
    }
    return;
  }
  updateCheckIsManual = manual;
  setUpdateState("checking");
  autoUpdater.checkForUpdates().catch((error) => {
    console.warn("[jdi-desktop] 업데이트 확인 실패:", error);
    setUpdateState("error");
  });
}

function setupAutoUpdater() {
  // 새 버전이 있으면 조용히 내려받고, 앱을 완전히 종료할 때 설치한다
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-not-available", () => {
    setUpdateState("idle");
    if (updateCheckIsManual) {
      updateCheckIsManual = false;
      dialog.showMessageBox({
        type: "info",
        title: "JDI 포털",
        message: "이미 최신 버전입니다.",
        detail: `현재 버전: ${app.getVersion()}`,
        buttons: ["확인"],
      });
    }
  });

  autoUpdater.on("update-available", () => setUpdateState("downloading"));

  autoUpdater.on("update-downloaded", (info) => {
    setUpdateState("ready");
    dialog
      .showMessageBox({
        type: "info",
        title: "JDI 포털 업데이트",
        message: "새 버전이 준비되었습니다.",
        detail: `버전 ${info?.version ?? ""} 로 업데이트합니다.\n지금 다시 시작하면 바로 적용되고, 나중에 선택하면 프로그램을 완전히 종료할 때 자동으로 설치됩니다.`,
        buttons: ["지금 다시 시작", "나중에"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          isQuitting = true;
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (error) => {
    console.warn("[jdi-desktop] 업데이트 오류:", error);
    setUpdateState("error");
    if (updateCheckIsManual) {
      updateCheckIsManual = false;
      dialog.showMessageBox({
        type: "error",
        title: "JDI 포털",
        message: "업데이트를 확인하지 못했습니다.",
        detail: "잠시 후 다시 시도해 주세요. 포털 화면과 기능은 이 업데이트와 관계없이 항상 최신 상태입니다.",
        buttons: ["확인"],
      });
    }
  });

  // 시작 직후 한 번, 이후 6시간마다 확인
  setTimeout(() => checkForUpdates(), UPDATE_CHECK_DELAY_MS);
  setInterval(() => checkForUpdates(), UPDATE_CHECK_INTERVAL_MS);
}

function onReady() {
  // 알림 권한만 허용하고 나머지(위치·카메라·마이크 등)는 거부
  const { session } = require("electron");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "notifications");
  });

  registerAppUserModelId();
  createTray();
  createMainWindow();
  setupAutoUpdater();

  // Windows 시작 시 자동 실행으로 켜진 경우에는 창을 띄우지 않고 트레이에만 상주
  const startHidden = process.argv.includes("--hidden");
  if (startHidden && mainWindow) {
    mainWindow.once("ready-to-show", () => mainWindow.hide());
  }

  // preload 에서 보낸 "창 보여줘" 신호 (알림 클릭 시)
  ipcMain.on("jdi:show-window", () => showMainWindow());

  // 포털이 보낸 알림 요청 → 앱 이름("JDI 포털")과 앱 아이콘으로 Windows 알림 표시.
  // 웹페이지가 직접 만든 알림은 앱 이름이 "Electron" 으로 표시되어 이 경로를 쓴다.
  ipcMain.on("jdi:notify", (_event, payload) => {
    if (!Notification.isSupported()) return;
    const title = typeof payload?.title === "string" ? payload.title : "JDI 포털";
    const body = typeof payload?.body === "string" ? payload.body : "";
    // 내부 경로(/dashboard/...)만 허용 — 외부 주소로의 이동을 막는다
    const link = typeof payload?.link === "string" && payload.link.startsWith("/") ? payload.link : null;

    const notification = new Notification({ title, body, icon: getIcon() });
    notification.on("click", () => {
      showMainWindow();
      if (link && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("jdi:navigate", link);
      }
    });
    notification.show();
  });

  app.on("activate", () => showMainWindow());
}

// 창을 모두 닫아도 종료하지 않는다 — 트레이 상주가 목적
app.on("window-all-closed", () => {
  // 의도적으로 비워둠 (macOS 관례와 동일하게 Windows 에서도 트레이에 남긴다)
});

app.on("before-quit", () => {
  isQuitting = true;
});
