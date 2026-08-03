import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// 실제 배포 코드를 그대로 검증한다 (Node strip-types 로 .ts 직접 import)
import { pickLatestKstDayEntries } from "../src/lib/utils/date.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("최신 항목의 KST 날짜와 그 날짜의 항목만 골라낸다 (UTC 자정 경계 포함)", () => {
  const entries = [
    { id: "c", completed_at: "2026-07-27T16:30:00Z" }, // KST 7/28 01:30
    { id: "b", completed_at: "2026-07-27T15:10:00Z" }, // KST 7/28 00:10
    { id: "a", completed_at: "2026-07-27T10:00:00Z" }, // KST 7/27 19:00 — 이전 날
  ];
  const picked = pickLatestKstDayEntries(entries);
  assert.equal(picked?.date, "2026-07-28");
  assert.deepEqual(picked?.entries.map((entry) => entry.id), ["c", "b"]);
});

test("빈 목록이면 null을 반환한다", () => {
  assert.equal(pickLatestKstDayEntries([]), null);
});

test("업무 타임라인 페이지가 오늘이 비어 있으면 가장 최근 날짜로 폴백한다", () => {
  const page = read("src/app/dashboard/work-timeline/page.tsx");
  // 날짜 파라미터 없이 처음 진입했고 오늘 결과가 0건일 때만 폴백 조회한다
  assert.match(page, /!dateParam && entries\.length === 0/);
  assert.match(page, /pickLatestKstDayEntries/);
  // 폴백 조회는 날짜 필터 없이(전체 기간) 최신순으로 가져온다
  assert.match(page, /date:\s*null/);
});
