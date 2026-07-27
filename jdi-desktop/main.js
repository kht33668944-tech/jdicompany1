/**
 * JDI 포털 데스크톱 앱 (Electron)
 *
 * 하는 일: https://jdiportal.com 을 프로그램 창으로 띄우고, 트레이(작업표시줄 숨겨진 아이콘)에 상주시킨다.
 * 화면과 기능은 전부 웹에서 오므로, 웹을 배포하면 이 앱도 자동으로 최신이 된다.
 *
 * 주의: 원격 페이지를 로드하므로 보안 설정(contextIsolation/sandbox)을 절대 완화하지 않는다.
 */

const { app, BrowserWindow, Tray, Menu, shell, ipcMain, nativeImage } = require("electron");
const path = require("node:path");

const PORTAL_URL = "https://jdiportal.com";
const PORTAL_HOST = "jdiportal.com";
const APP_ID = "com.jdicompany.portal";

let mainWindow = null;
let tray = null;
// 트레이 메뉴의 "완전히 종료"를 눌렀을 때만 true — 창 X 버튼은 숨김 처리만 한다
let isQuitting = false;

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

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: "포털 열기",
      click: () => showMainWindow(),
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

function onReady() {
  // 알림 권한만 허용하고 나머지(위치·카메라·마이크 등)는 거부
  const { session } = require("electron");
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "notifications");
  });

  createTray();
  createMainWindow();

  // Windows 시작 시 자동 실행으로 켜진 경우에는 창을 띄우지 않고 트레이에만 상주
  const startHidden = process.argv.includes("--hidden");
  if (startHidden && mainWindow) {
    mainWindow.once("ready-to-show", () => mainWindow.hide());
  }

  // preload 에서 보낸 "창 보여줘" 신호 (알림 클릭 시)
  ipcMain.on("jdi:show-window", () => showMainWindow());

  app.on("activate", () => showMainWindow());
}

// 창을 모두 닫아도 종료하지 않는다 — 트레이 상주가 목적
app.on("window-all-closed", () => {
  // 의도적으로 비워둠 (macOS 관례와 동일하게 Windows 에서도 트레이에 남긴다)
});

app.on("before-quit", () => {
  isQuitting = true;
});
