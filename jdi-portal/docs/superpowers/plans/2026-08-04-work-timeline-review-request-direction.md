# 구현 계획 — 업무보고 검토 v3 (검토 요청 방향 추가)

- 설계: `../specs/2026-08-04-work-timeline-review-request-direction-design.md`
- 선행: 마이그레이션 108(v1), 109(v2), 110(보완 첨부 소유자 검증)

## 1. 마이그레이션 `118_work_timeline_review_request_direction.sql`

> 번호는 작업 직전 `npx supabase migration list --linked` 의 **Remote 열 최댓값 다음**으로 다시 확인한다.
> 모든 worktree/브랜치가 같은 운영 DB를 공유하므로 로컬 파일 최댓값은 근거가 되지 않는다.

1. `work_timeline_reviews.requested_by` 추가 → `requested_by = reviewer_id` 백필 → `SET NOT NULL`
2. **구 2인자 함수 삭제**: `DROP FUNCTION IF EXISTS public.request_timeline_review(UUID, TEXT);`
   `DEFAULT` 로 3인자를 얹으면 오버로드가 공존해 2인자 호출이 모호해진다.
3. `request_timeline_review(p_entry_id UUID, p_comment TEXT, p_reviewer_id UUID)` 재작성
   - 로그인 + `is_approved` 확인 → 업무보고 조회 → 진행 중 1건 제한 검사 (기존 유지)
   - 방향 판정(`v_entry.user_id = v_uid`)으로 `reviewer_id / author_id / state / 메모 기본값` 분기
   - 확인요청형: `p_reviewer_id` NULL 금지 · 본인 금지 · 승인 사용자 확인
   - 지시형: 관리자 아니면 `'검토를 요청할 권한이 없습니다.'`
   - `requested_by` 포함 INSERT → `work_timeline_review_events(kind='requested')`
   - 알림 대상만 방향별 분기 (`type='timeline_review_requested'`)
   - `SECURITY DEFINER` + `SET search_path = public` + `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`
4. `cancel_timeline_review(UUID)` 재정의 — 권한을 `requested_by = auth.uid() OR 관리자` 로,
   대상 상태를 `open`/`submitted` 로 명시
5. 인덱스 추가 없음

## 2. 서버 액션 `src/lib/work-timeline/reviewActions.ts`

- `requestReview(entryId, comment, reviewerId?: string | null)` 로 확장
- `reviewerId` 가 있으면 `assertUuid` 검증 후 `p_reviewer_id` 로 전달, 없으면 `null`
- `cancelReview` 는 변경 없음 (권한 판단은 DB)

## 3. 타입 · 조회

- `src/lib/work-timeline/types.ts`
  - `WorkTimelineReview.requested_by: string`
  - `PendingReviewItem.direction: ReviewDirection` (`"assigned" | "requested"`)
- `src/lib/work-timeline/reviewQueries.ts` — `select` 와 매핑에 `requested_by` 추가
- **이중 경로 동시 수정** (성능 불변조건 3)
  - `src/lib/dashboard/fast-queries.ts` — `pending_reviews_to_fix` / `_to_confirm` CTE 에
    `'direction', case when r.requested_by = r.author_id then 'requested' else 'assigned' end`
  - `src/lib/dashboard/queries.ts` — `getPendingReviews` 의 `select` 에 `requested_by, author_id` 추가,
    `mapPendingReviewRows` 에서 같은 규칙으로 계산

## 4. 화면

- `src/app/dashboard/work-timeline/[id]/page.tsx`
  작성자 본인일 때만 기존 `getWorkTimelineProfiles()`(`src/lib/work-timeline/queries.ts`)로 명단 로드
- `WorkTimelineDetailClient.tsx` — props 통과
- `WorkTimelineReviewSection.tsx`
  - `ReviewRequestForm` 에 검토자 선택(네이티브 `<select>`, 본인 제외) + 방향별 문구
  - `ReviewCard` 머리글 방향별 분기
  - 취소 버튼 조건 → `review.requested_by === currentUserId && (open || submitted)`
- `ReviewInboxWidget.tsx` — `toConfirm` 배지를 `direction` 으로 분기

## 5. 테스트 `scripts/work-timeline-reviews.test.mjs`

108/109 검사와 같은 정적 검사 패턴으로 118 검사 추가:

- `requested_by` 추가 · 백필 · `SET NOT NULL`
- 구 2인자 함수 `DROP` 확인
- 3인자 RPC 의 `SECURITY DEFINER` · `search_path` · `auth.uid()` · 본인 지정 금지 · 승인 사용자 확인 · `REVOKE`/`GRANT`
- `cancel_timeline_review` 가 `requested_by` 기준
- 대시보드 양쪽 경로에 `direction` 이 실리는지

## 6. 검증과 반영 순서

```bash
cd jdi-portal
npm run lint
node --test scripts/work-timeline-reviews.test.mjs
npm run test:performance
npm run test:security
npm run build
```

운영 반영은 **DB 먼저**: `npx supabase db push --linked` → `migration list --linked` 로 Remote 확인
→ 그 다음 PR 병합(= Cloud Build 자동 배포).
순서를 뒤집으면 배포 직후 검토 요청이 전부 실패한다(코드가 3인자 RPC 를 호출).
