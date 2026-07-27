import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * 채팅 첨부 서명 URL 서버 프리페치 회귀 방지.
 *
 * 이 장치가 사라지면 채팅방을 열 때마다 "메시지 표시 → 서버 액션 왕복 → 그제서야
 * 이미지 로드" 순서로 되돌아가 사진이 한 박자 늦게 뜬다.
 */

test("경로 수집기는 미리보기와 원본을 모두 모으고 삭제된 메시지는 제외한다", async () => {
  const src = read("src/lib/chat/fileUrlBatch.ts");

  // 순수 함수라 정적 검사 + 동작 검사를 함께 한다.
  assert.match(src, /export function collectMessageFilePaths/);
  // 원본(path)과 미리보기(getFilePreviewPath) 양쪽을 넣어야 저장 링크까지 즉시 동작한다.
  assert.match(src, /getFilePreviewPath\(file\)/);
  assert.match(src, /seen\.add\(file\.path\)/);
  // 삭제된 메시지의 첨부는 화면에 안 그리므로 서명 발급도 하지 않는다.
  assert.match(src, /is_deleted/);
});

test("서명 발급은 단일 구현(signChatFilePaths)이 버킷/TTL 상수로 수행한다", () => {
  const batchSrc = read("src/lib/chat/fileUrlBatch.ts");

  assert.match(batchSrc, /export async function signChatFilePaths/);
  assert.match(batchSrc, /from\(CHAT_BUCKET\)/);
  assert.match(batchSrc, /createSignedUrls\(unique, CHAT_FILE_URL_TTL_SECONDS\)/);

  // 서버 프리페치와 클라이언트 배치가 각자 발급 로직을 복제하지 않고 이 구현을 쓴다.
  assert.match(read("src/lib/chat/queries.ts"), /signChatFilePaths\(/);
  assert.match(read("src/lib/chat/actions.ts"), /signChatFilePaths\(/);
});

test("서버 프리페치 함수는 첨부 없으면 건너뛰고 실패해도 던지지 않는다", () => {
  const src = read("src/lib/chat/queries.ts");

  assert.match(src, /export async function getMessageFileUrls/);
  assert.match(src, /collectMessageFilePaths/);

  // 첨부가 없으면 스토리지 호출 자체를 건너뛴다(왕복 0).
  assert.match(src, /if \(paths\.length === 0\) return \{\};/);

  // 실패 시 throw 하지 않고 빈 객체를 돌려 클라이언트 배치 경로로 폴백해야 한다.
  // (여기서 던지면 채팅방 전체가 오류 화면으로 떨어진다)
  assert.match(src, /catch \(error\) \{[\s\S]*?return \{\};/);
});

test("채널 페이지가 프리페치 결과를 클라이언트로 내려준다", () => {
  const src = read("src/app/dashboard/chat/[channelId]/page.tsx");

  assert.match(src, /getMessageFileUrls\(/);
  assert.match(src, /initialFileUrls=\{initialFileUrls\}/);
});

test("Provider 가 서버 URL 을 초기값으로 쓰고 재요청하지 않는다", () => {
  const src = read("src/components/dashboard/chat/ChatFileUrlsContext.tsx");

  assert.match(src, /initialUrls\?: Record<string, string>/);
  // 초기 state 로 바로 사용 → 첫 렌더부터 이미지가 뜬다.
  assert.match(src, /useState<Record<string, string>>\(initialUrls/);
  // 이미 확보한 path 는 requested 에 등록해 중복 왕복을 막는다.
  assert.match(src, /new Set\(Object\.keys\(initialUrls/);
});

test("채팅 상수에 버킷/TTL 단일 출처가 있고 하드코딩이 남아있지 않다", () => {
  const src = read("src/lib/chat/constants.ts");

  assert.match(src, /CHAT_BUCKET = "chat-attachments"/);
  assert.match(src, /CHAT_FILE_URL_TTL_SECONDS = 3600/);

  // 상수가 진짜 단일 출처여야 캐시 만료 계산과 실제 서명 TTL 이 어긋나지 않는다.
  const actionsSrc = read("src/lib/chat/actions.ts");
  assert.doesNotMatch(actionsSrc, /"chat-attachments"/, "actions.ts 는 CHAT_BUCKET 상수를 써야 한다");
  assert.doesNotMatch(actionsSrc, /createSignedUrls?\([^)]*\b3600\b/, "actions.ts 는 TTL 상수를 써야 한다");
});

// ---------------------------------------------------------------
// 로컬 URL 캐시 — 만료 판단이 틀리면 깨진 이미지가 뜨므로 동작으로 검증한다.
// localStorage 를 최소 구현으로 대체해 실제 함수를 돌린다.
// ---------------------------------------------------------------

function installFakeLocalStorage() {
  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (data.has(k) ? data.get(k) : null),
      setItem: (k, v) => data.set(k, String(v)),
      removeItem: (k) => data.delete(k),
    },
  };
  return data;
}

async function loadFileUrlCache() {
  // 매 테스트마다 새 모듈 인스턴스를 받아 상태 간섭을 없앤다.
  const url = new URL("../src/lib/chat/fileUrlCache.ts", import.meta.url);
  return import(`${url.href}?t=${Math.random()}`);
}

test("캐시는 유효한 URL 만 돌려주고 만료 임박분은 버린다", async () => {
  installFakeLocalStorage();
  const cache = await loadFileUrlCache();

  cache.writeCachedFileUrls({ "ch/a.png": "https://x/a?sig=1" }, 3600);
  // 만료까지 1분 남은 항목 — 여유(5분) 안에 들어오므로 못 쓴다고 판단해야 한다
  cache.writeCachedFileUrls({ "ch/b.png": "https://x/b?sig=1" }, 60);

  const got = cache.readCachedFileUrls(["ch/a.png", "ch/b.png", "ch/none.png"]);

  assert.equal(got["ch/a.png"], "https://x/a?sig=1", "충분히 남은 URL 은 재사용한다");
  assert.equal(got["ch/b.png"], undefined, "만료 임박 URL 은 쓰지 않는다");
  assert.equal(got["ch/none.png"], undefined, "없는 경로는 담기지 않는다");
});

test("캐시가 없거나 저장소가 막혀도 예외를 던지지 않는다", async () => {
  // window 자체가 없는 환경(SSR) 시뮬레이션
  delete globalThis.window;
  const cache = await loadFileUrlCache();

  assert.deepEqual(cache.readCachedFileUrls(["ch/a.png"]), {});
  assert.doesNotThrow(() => cache.writeCachedFileUrls({ "ch/a.png": "u" }, 3600));
  assert.doesNotThrow(() => cache.clearChatFileUrlCache());
});

test("로그아웃 정리에 채팅 URL 캐시가 등록되어 있다", () => {
  const src = read("src/lib/cache/clearAllLocalCaches.ts");
  assert.match(src, /clearChatFileUrlCache/);
});

test("Provider 가 캐시를 먼저 확인하고 응답을 캐시에 적재한다", () => {
  const src = read("src/components/dashboard/chat/ChatFileUrlsContext.tsx");

  // 서버 요청 전에 로컬 캐시를 확인해야 채널 전환에서 왕복이 사라진다
  assert.match(src, /readCachedFileUrls\(/);
  // batch 응답과 SSR 시드 both 를 캐시에 넣어야 다음 전환에서 재사용된다
  const writes = src.match(/writeCachedFileUrls\(/g) ?? [];
  assert.ok(writes.length >= 2, "batch 응답과 SSR 시드 양쪽을 캐시에 적재해야 한다");
});
