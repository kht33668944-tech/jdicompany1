/**
 * 채팅 첨부 서명 URL 로컬 캐시 (localStorage).
 *
 * 목적: 채널을 옮겨 다닐 때 사진이 즉시 뜨게 한다.
 *  - 첫 진입은 SSR 이 initialFileUrls 로 내려주므로 왕복 0 (chat/queries.getMessageFileUrls)
 *  - 채널 전환은 클라이언트 상태 전환이라 SSR 이 없다 → 여기서 캐시가 그 자리를 메운다
 *
 * 설계:
 *  - 서명 URL 은 발급 후 CHAT_FILE_URL_TTL_SECONDS(1시간) 동안 유효하다. 저장 시
 *    만료 시각을 함께 적어두고, 읽을 때 만료 여유(EXPIRY_MARGIN_MS)를 빼고 판단한다.
 *    (남은 시간이 몇 초뿐인 URL 을 쓰면 이미지가 로딩되다 깨질 수 있다)
 *  - localStorage 를 쓰는 이유: 동기 접근이라 ensure() 안에서 즉시 확인할 수 있다.
 *    IndexedDB(비동기)면 한 프레임 늦어 "잠깐 로딩 → 사진" 깜빡임이 남는다.
 *  - 시크릿 모드·용량 초과·차단 등 모든 실패는 graceful no-op (캐시가 없을 뿐 동작은 동일).
 *  - 저장되는 것은 표시용 임시 URL 이며 권한 검증은 항상 서버 RLS 가 담당한다.
 *    명시적 로그아웃 시에는 clearAllLocalCaches 가 함께 비운다.
 */

const STORAGE_KEY = "jdi-chat-file-urls";

/** 만료 5분 전부터는 없는 것으로 취급 — 로딩 도중 만료 방지 */
const EXPIRY_MARGIN_MS = 5 * 60_000;

/** 용량 폭주 방지 상한. 초과 시 만료가 임박한 것부터 버린다. */
const MAX_ENTRIES = 300;

interface CacheEntry {
  url: string;
  /** epoch ms */
  expiresAt: number;
}

type CacheStore = Record<string, CacheEntry>;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // 쿠키/스토리지 차단 환경
    return null;
  }
}

function readStore(): CacheStore {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as CacheStore;
  } catch {
    return {};
  }
}

function writeStore(store: CacheStore): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 용량 초과 등 — 캐시를 통째로 비우고 한 번만 재시도한다.
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // 여기까지 실패하면 캐시 없이 동작한다.
    }
  }
}

function isUsable(entry: CacheEntry | undefined, nowMs: number): entry is CacheEntry {
  return !!entry && typeof entry.url === "string" && entry.expiresAt - EXPIRY_MARGIN_MS > nowMs;
}

/**
 * 요청한 경로 중 **아직 충분히 유효한** URL 만 돌려준다.
 * 만료됐거나 없는 경로는 결과에 담기지 않으므로 호출부가 서버에 요청하면 된다.
 */
export function readCachedFileUrls(paths: string[]): Record<string, string> {
  if (paths.length === 0) return {};
  const store = readStore();
  const nowMs = Date.now();
  const result: Record<string, string> = {};

  for (const path of paths) {
    const entry = store[path];
    if (isUsable(entry, nowMs)) result[path] = entry.url;
  }

  return result;
}

/**
 * 발급받은 URL 을 캐시에 저장한다.
 * @param ttlSeconds 서명 URL 의 유효시간(초). 저장 시각 기준으로 만료 시각을 계산한다.
 */
export function writeCachedFileUrls(
  urls: Record<string, string>,
  ttlSeconds: number
): void {
  const entries = Object.entries(urls);
  if (entries.length === 0) return;

  const store = readStore();
  const nowMs = Date.now();
  const expiresAt = nowMs + ttlSeconds * 1000;

  // 이미 만료된 항목은 이번 기회에 정리
  for (const [path, entry] of Object.entries(store)) {
    if (!entry || entry.expiresAt <= nowMs) delete store[path];
  }

  for (const [path, url] of entries) {
    if (path && url) store[path] = { url, expiresAt };
  }

  // 상한 초과 시 만료가 임박한 것부터 버린다
  const all = Object.entries(store);
  if (all.length > MAX_ENTRIES) {
    all.sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    for (const [path] of all.slice(0, all.length - MAX_ENTRIES)) delete store[path];
  }

  writeStore(store);
}

/** 로그아웃 시 정리 (clearAllLocalCaches 에서 호출) */
export function clearChatFileUrlCache(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
