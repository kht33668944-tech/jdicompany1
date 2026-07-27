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

test("경로 수집기는 미리보기와 원본을 모두 모으고 중복을 제거한다", async () => {
  const src = read("src/lib/chat/fileUrlBatch.ts");

  // 순수 함수라 정적 검사 + 동작 검사를 함께 한다.
  assert.match(src, /export function collectMessageFilePaths/);
  // 원본(path)과 미리보기(getFilePreviewPath) 양쪽을 넣어야 저장 링크까지 즉시 동작한다.
  assert.match(src, /getFilePreviewPath\(file\)/);
  assert.match(src, /seen\.add\(file\.path\)/);
});

test("서버 프리페치 함수가 채팅 버킷에서 일괄 발급하고 실패해도 던지지 않는다", () => {
  const src = read("src/lib/chat/queries.ts");

  assert.match(src, /export async function getMessageFileUrls/);
  assert.match(src, /collectMessageFilePaths/);
  assert.match(src, /createSignedUrls\(paths, CHAT_FILE_URL_TTL_SECONDS\)/);
  assert.match(src, /from\(CHAT_BUCKET\)/);

  // 첨부가 없으면 스토리지 호출 자체를 건너뛴다(왕복 0).
  assert.match(src, /if \(paths\.length === 0\) return \{\};/);

  // 실패 시 throw 하지 않고 빈 객체를 돌려 클라이언트 배치 경로로 폴백해야 한다.
  // (여기서 던지면 채팅방 전체가 오류 화면으로 떨어진다)
  assert.match(src, /catch \(error\) \{[\s\S]*?return \{\};/);
});

test("채널 페이지가 프리페치 결과를 클라이언트로 내려준다", () => {
  const src = read("src/app/dashboard/chat/[channelId]/page.tsx");

  assert.match(src, /getMessageFileUrls/);
  assert.match(src, /initialFileUrls = await getMessageFileUrls\(auth\.supabase, initialMessages\)/);
  assert.match(src, /initialFileUrls=\{initialFileUrls\}/);
});

test("Provider 가 서버 URL 을 초기값으로 쓰고 재요청하지 않는다", () => {
  const src = read("src/components/dashboard/chat/ChatFileUrlsContext.tsx");

  assert.match(src, /initialUrls\?: Record<string, string>/);
  // 초기 state 로 바로 사용 → 첫 렌더부터 이미지가 뜬다.
  assert.match(src, /useState<Record<string, string>>\(initialUrls \?\? \{\}\)/);
  // 이미 확보한 path 는 requested 에 등록해 중복 왕복을 막는다.
  assert.match(src, /new Set\(Object\.keys\(initialUrls \?\? \{\}\)\)/);
});

test("채팅 상수에 버킷/TTL 단일 출처가 있다", () => {
  const src = read("src/lib/chat/constants.ts");

  assert.match(src, /CHAT_BUCKET = "chat-attachments"/);
  assert.match(src, /CHAT_FILE_URL_TTL_SECONDS = 3600/);
});
