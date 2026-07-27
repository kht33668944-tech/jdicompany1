/**
 * preload — 웹 페이지와 앱 껍데기 사이의 유일한 통로.
 *
 * 웹 페이지에 `window.jdiDesktop` 하나만 노출한다.
 * 알림을 클릭했을 때 트레이로 숨겨진 창을 다시 띄우는 용도.
 * (브라우저에서는 window.jdiDesktop 이 없으므로 웹 코드는 옵셔널 호출로 안전하게 무시된다.)
 */

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("jdiDesktop", {
  /** 데스크톱 앱 안에서 실행 중인지 확인용 */
  isDesktopApp: true,
  /** 트레이로 숨겨진 창을 다시 표시하고 앞으로 가져온다 */
  showWindow: () => ipcRenderer.send("jdi:show-window"),
});
