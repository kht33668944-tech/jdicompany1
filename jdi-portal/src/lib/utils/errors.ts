/**
 * 새 버전이 배포되면, 그 전에 열려 있던 화면은 서버와 짝이 맞지 않는다.
 * Next.js 는 Server Action 을 빌드마다 새 ID 로 만들기 때문에, 옛 화면이 보내는
 * 요청을 새 서버가 알아보지 못하고 아래와 같은 영어 오류를 던진다.
 *
 *   Server Action "4092437ef0..." was not found on the server
 *   Failed to find Server Action "..."
 *
 * 데스크톱 앱이 트레이에 하루 종일 켜져 있어 화면을 며칠씩 안 닫는 환경이라
 * 배포할 때마다 직원이 이 오류를 만난다. 유일한 해결은 새로고침이다.
 * 그래서 이 오류만 따로 알아보고, 사람이 읽을 수 있는 안내로 바꾼 뒤
 * `StaleDeploymentWatcher` 가 새로고침을 처리하게 신호를 보낸다.
 */
export const STALE_DEPLOYMENT_MESSAGE =
  "새 버전이 배포되어 화면을 새로 불러와야 합니다. 잠시 후 자동으로 새로고침됩니다.";

/** `StaleDeploymentWatcher` 가 듣는 이벤트 이름. */
export const STALE_DEPLOYMENT_EVENT = "jdi:stale-deployment";

/** 배포 갱신으로 Server Action 을 못 찾은 상황인지 판별한다. */
export function isStaleDeploymentError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;
  return (
    // Next.js 가 내는 문구 (버전에 따라 조금씩 다르다)
    /Failed to find Server Action/i.test(message) ||
    /Server Action .* was not found on the server/i.test(message) ||
    /failed-to-find-server-action/i.test(message)
  );
}

/**
 * 앱 전체가 오류 문구를 만들 때 지나는 통로.
 * 배포 갱신 오류라면 영어 원문 대신 안내 문구를 돌려주고, 브라우저에서는
 * 새로고침을 담당하는 감시자에게 알린다(서버 렌더링 중에는 알리지 않는다).
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (isStaleDeploymentError(error)) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(STALE_DEPLOYMENT_EVENT));
    }
    return STALE_DEPLOYMENT_MESSAGE;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
