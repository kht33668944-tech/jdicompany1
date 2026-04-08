/** Web Push VAPID 공개키 — 빌드 시 환경변수로 주입 */
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

/** Service Worker 등록 경로 */
export const SW_PATH = "/sw.js";

/** localStorage 키: 채팅 진입 배너를 본 적이 있는지 */
export const CHAT_PUSH_PROMPT_KEY = "chat_push_prompt_dismissed";

/** Base64URL → Uint8Array 변환 (PushManager.subscribe applicationServerKey 형식 요건) */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
