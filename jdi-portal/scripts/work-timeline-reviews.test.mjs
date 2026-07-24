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
  // 마이그레이션 108 의 부분 인덱스를 타야 한다: author_id + state = 'open' (보완 필요)
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

// 아래 두 테스트는 work-directives.test.mjs 의
// "103 마이그레이션: 테이블 2개 + 연결 컬럼 + RLS" /
// "103 마이그레이션: 수락/거절 RPC 의 권한 재검증" 과 대칭인 보안 회귀 검사다.
test("108 마이그레이션: RLS 활성 + SELECT 정책은 당사자·관리자로 제한, 쓰기 정책 없음", () => {
  const path = "supabase/migrations/108_work_timeline_reviews.sql";
  const sql = read(path);

  // RLS 활성 — 두 테이블 모두
  assert.match(sql, /ALTER TABLE public\.work_timeline_reviews ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.work_timeline_review_events ENABLE ROW LEVEL SECURITY/);

  const rlsBlock = sql.slice(
    sql.indexOf("-- ---------- RLS ----------"),
    sql.indexOf("-- ---------- 보완 할일 완료 감지 ----------"),
  );
  assert.ok(rlsBlock.length > 0, "RLS 섹션을 찾지 못했습니다");

  // 승인 사용자 확인
  assert.match(rlsBlock, /is_approved_user\(\)/);

  // work_timeline_reviews SELECT 정책: 검토자·작성자·관리자만
  assert.match(rlsBlock, /ON public\.work_timeline_reviews FOR SELECT TO authenticated/);
  assert.match(rlsBlock, /reviewer_id = auth\.uid\(\)/);
  assert.match(rlsBlock, /author_id = auth\.uid\(\)/);
  assert.match(rlsBlock, /p\.role = 'admin'/);

  // work_timeline_review_events SELECT 정책: 연결된 검토를 볼 수 있으면 조회
  assert.match(rlsBlock, /ON public\.work_timeline_review_events FOR SELECT TO authenticated/);
  assert.match(
    rlsBlock,
    /FROM public\.work_timeline_reviews r\s*\n\s*WHERE r\.id = work_timeline_review_events\.review_id/,
  );

  // INSERT/UPDATE/DELETE 정책은 없다 — 쓰기는 RPC(SECURITY DEFINER) 전용
  assert.doesNotMatch(
    rlsBlock,
    /FOR (INSERT|UPDATE|DELETE) TO authenticated/,
    "work_timeline_reviews/_events 에는 쓰기 정책이 있으면 안 됩니다 (RPC 전용)",
  );
});

test("108 마이그레이션: 검토 RPC 4개는 SECURITY DEFINER + search_path 고정 + auth.uid() 검증 + 최소 권한 부여", () => {
  const path = "supabase/migrations/108_work_timeline_reviews.sql";
  const sql = read(path);

  const rpcs = [
    { name: "request_timeline_review", signature: "request_timeline_review(UUID, TEXT)" },
    { name: "approve_timeline_review", signature: "approve_timeline_review(UUID, TEXT)" },
    { name: "reject_timeline_review", signature: "reject_timeline_review(UUID, TEXT)" },
    { name: "cancel_timeline_review", signature: "cancel_timeline_review(UUID)" },
  ];

  for (const { name, signature } of rpcs) {
    const startMarker = `FUNCTION public.${name}(`;
    const revokeMarker = `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC;`;
    const grantMarker = `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`;

    const start = sql.indexOf(startMarker);
    assert.ok(start >= 0, `${name} 함수 정의를 찾지 못했습니다`);
    const revokeIdx = sql.indexOf(revokeMarker);
    assert.ok(revokeIdx >= 0, `${name}: REVOKE ALL ... FROM PUBLIC 이 없습니다`);
    assert.ok(sql.includes(grantMarker), `${name}: GRANT EXECUTE ... TO authenticated 가 없습니다`);

    const body = sql.slice(start, revokeIdx);
    assert.match(body, /SECURITY DEFINER/, `${name}: SECURITY DEFINER 가 없습니다`);
    assert.match(body, /SET search_path = public/, `${name}: search_path 고정이 없습니다`);
    // 세션 사용자를 신뢰하지 않고 auth.uid() 로 직접 재검증한다
    // (approve/reject/cancel 은 공통 헬퍼 assert_can_resolve_review 를 통해 검증)
    assert.match(body, /auth\.uid\(\)/, `${name}: auth.uid() 검증이 없습니다`);
  }

  // 승인/반려/취소는 공통 권한 헬퍼로 검토자·관리자만 처리하도록 강제한다
  const helperCalls = (sql.match(/PERFORM public\.assert_can_resolve_review\(v_rev\);/g) ?? []).length;
  assert.ok(
    helperCalls >= 3,
    `approve/reject/cancel 각각 assert_can_resolve_review 로 권한을 재검증해야 합니다 (현재 ${helperCalls})`,
  );
});
