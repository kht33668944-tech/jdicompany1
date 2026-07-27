/**
 * preload — 웹 페이지와 앱 껍데기 사이의 유일한 통로.
 *
 * 웹 페이지에 `window.jdiDesktop` 하나만 노출한다.
 * - showWindow: 트레이로 숨겨진 창을 다시 띄운다 (알림 클릭 시)
 * - notify: 알림을 앱 본체가 띄우게 한다 (웹이 직접 띄우면 앱 이름이 "Electron" 으로 표시됨)
 *
 * 브라우저에는 window.jdiDesktop 이 없으므로 웹 코드는 옵셔널 호출로 안전하게 무시된다.
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jdiDesktop", {
  /** 데스크톱 앱 안에서 실행 중인지 확인용 */
  isDesktopApp: true,
  /** 트레이로 숨겨진 창을 다시 표시하고 앞으로 가져온다 */
  showWindow: () => ipcRenderer.send("jdi:show-window"),
  /** 앱 본체가 Windows 알림을 띄우게 한다 (앱 이름·아이콘이 정상 표시됨) */
  notify: (payload) =>
    ipcRenderer.send("jdi:notify", {
      title: String(payload?.title ?? "JDI 포털"),
      body: payload?.body == null ? "" : String(payload.body),
      link: typeof payload?.link === "string" ? payload.link : null,
    }),
});

// 알림을 클릭했을 때 앱 본체가 알려주는 이동 경로 — 내부 경로만 따른다
ipcRenderer.on("jdi:navigate", (_event, link) => {
  if (typeof link === "string" && link.startsWith("/")) {
    window.location.href = link;
  }
});
