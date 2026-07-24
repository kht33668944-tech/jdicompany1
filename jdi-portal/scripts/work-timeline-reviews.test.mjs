import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");

// 대시보드 검토 인박스(pendingReviews)는 빠른 경로(fast-queries.ts, 직접 Postgres)와
// 폴백 경로(queries.ts, Supabase RPC/쿼리) 양쪽에 반드시 같은 결과를 실어야 한다.
// 한쪽만 고치면 운영에서만 안 보이는 사고가 난다 (CLAUDE.md 성능 불변조건 3).
// work-directives.test.mjs 의 "대시보드: 미확인 지시를 빠른 경로와 폴백 양쪽에 싣는다" 와 같은 패턴.
test("대시보드: 검토 인박스를 빠른 경로와 폴백 양쪽에 싣는다 (성능 불변조건 3)", () => {
  const fast = read("src/lib/dashboard/fast-queries.ts");

  // 같은 스냅샷 쿼리 안에서 처리 — DB 왕복을 늘리지 않는다
  assert.match(fast, /work_timeline_reviews/);
  // 마이그레이션 107 의 부분 인덱스를 타야 한다: author_id + state = 'open' (보완 필요)
  assert.match(fast, /r\.author_id = prm\.user_id and r\.state = 'open'/);
  // 부분 인덱스: reviewer_id + state = 'submitted' (확인 필요)
  assert.match(fast, /r\.reviewer_id = prm\.user_id and r\.state = 'submitted'/);
  // 결과가 pendingReviews.toFix / toConfirm 으로 노출된다
  assert.match(fast, /'pendingReviews'/);
  assert.match(fast, /'toFix'/);
  assert.match(fast, /'toConfirm'/);

  const fallback = read("src/lib/dashboard/queries.ts");

  assert.match(fallback, /from\("work_timeline_reviews"\)/);
  // toFix: 내가 보완해야 할 검토 — author_id = 나, state = open
  assert.match(fallback, /\.eq\("author_id", userId\)[\s\S]{0,40}\.eq\("state", "open"\)/);
  // toConfirm: 내가 확인해야 할 검토 — reviewer_id = 나, state = submitted
  assert.match(fallback, /\.eq\("reviewer_id", userId\)[\s\S]{0,40}\.eq\("state", "submitted"\)/);
  // 폴백도 pendingReviews 를 반환해 스냅샷 빌더에 넘긴다
  assert.match(fallback, /pendingReviews/);
  assert.match(fallback, /getPendingReviews/);
  // Supabase error 무시 금지
  assert.match(fallback, /if \(toFixResult\.error\) throw toFixResult\.error;/);
  assert.match(fallback, /if \(toConfirmResult\.error\) throw toConfirmResult\.error;/);
});
