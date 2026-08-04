# 업무보고 검토 v3 — "내가 검토를 요청하는" 방향 추가

- 작성일: 2026-08-04
- 선행 설계: `2026-07-24-work-timeline-review-design.md` (v1 = 마이그레이션 108, v2 = 109)
- 구현 계획: `../plans/2026-08-04-work-timeline-review-request-direction.md`

## 1) 문제

업무 타임라인의 검토는 지금 **한 방향으로만** 동작한다.

> 관리자가 직원의 업무보고를 보고 "보완하세요" 지시 → 직원이 보완 제출 → 관리자가 승인/반려

반대 방향, 즉 **작성자가 결과물을 올리고 "확인해 주세요"라고 요청하는 흐름이 없다.**
동료끼리 서로 봐주는 상호 검토도 불가능하다.

원인은 테이블에 **"요청한 사람"을 담는 칸이 없다**는 것이다.
`work_timeline_reviews` 는 `reviewer_id`(판정자) / `author_id`(보완자) 두 칸만 두고,
요청 시 `auth.uid()` 를 `reviewer_id` 에 그대로 넣는다(`109_work_timeline_review_v2.sql`).

그 결과 RPC 의 권한 검사는 작성자 본인도 통과시키지만(`v_entry.user_id = v_uid` 허용),
실제로 요청하면 **자기가 자기 판정자**가 되어 아무 의미가 없다. 반쯤 열려 있으나 쓸 수 없는 상태다.

## 2) 목표

- 요청자 칸 `requested_by` 를 추가한다.
- 요청할 때 **검토받을 사람을 직접 지정**할 수 있게 한다.
- 이 한 칸으로 **"관리자에게 확인 요청"** 과 **"동료끼리 상호 검토"** 를 동시에 해결한다.

비목표(이번에 하지 않음): 검토자 여러 명 지정, 업무보고당 검토 여러 건 동시 진행, 재촉 알림 확장.

## 3) 핵심 아이디어 — 상태 흐름은 그대로, 시작 지점만 다르게

기존 상태 머신(`open → submitted → approved`, `rejected → open`)을 두 방향이 **그대로 공유**한다.
새로 만드는 것은 "어느 상태에서 시작하느냐"뿐이다.

| | 지시형 (기존) | 확인요청형 (신규) |
|---|---|---|
| 요청자 | 관리자 (남의 보고서) | 업무보고 작성자 본인 |
| 검토자 지정 | 없음 — 요청자 자신이 판정자 | **명단에서 직접 선택** |
| 시작 상태 | `open` (작성자가 보완할 차례) | `submitted` (검토자가 판정할 차례) |
| 알림 대상 | 작성자 | 지정된 검토자 |

확인요청형에서 검토자가 **반려**하면 `open` 이 되고 작성자가 보완 제출 → `submitted` → 다시 판정.
**여기서부터는 기존 흐름과 완전히 동일**하므로 승인·반려·보완 제출 로직을 하나도 새로 만들지 않는다.

## 4) 방향은 서버가 판정한다

클라이언트가 "모드"를 고르지 않는다. RPC 안에서 `auth.uid()` 와 `entry.user_id` 를 비교해 결정한다.

- `auth.uid() = entry.user_id` → **확인요청형**
  `p_reviewer_id` 필수 · 본인 지정 금지 · 승인 사용자만 · `state='submitted'`
- `auth.uid() ≠ entry.user_id` → **지시형**
  관리자만 허용 · `reviewer_id = auth.uid()` · `state='open'` (기존 동작 그대로)

두 경우 모두 `requested_by = auth.uid()`.

관리자가 "남의 보고서를 제3자에게 검토시키는" 경우는 범위에서 제외한다(실무 수요 없음, YAGNI).

## 5) 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 업무보고당 진행 중 검토 | **1건 제한 유지** | 화면이 단순하고 인박스 계산이 그대로. 기존 부분 유니크 인덱스 `work_timeline_reviews_active_unique` 를 그대로 둔다 |
| 취소 권한 | `reviewer_id` → **`requested_by` 또는 관리자**, `state IN ('open','submitted')` 일 때 | 안 고치면 직원이 자기가 보낸 요청을 못 지운다. 확인요청형은 시작이 `submitted` 라 기존 조건으로는 취소 자체가 불가능 |
| 승인/반려 권한 | 그대로 (`reviewer_id` 또는 관리자) | `assert_can_resolve_review` 재사용 |
| 요청 메모 | 확인요청형은 비우면 `'검토 부탁드립니다.'` 자동 | 테이블 CHECK 가 1자 이상을 요구. 지시형은 기존대로 필수 |
| RLS | **손대지 않음** | 조회 정책이 이미 `reviewer_id / author_id / 관리자` 기준. `work_timeline_entries` SELECT 는 승인 사용자 전체 허용(`083_work_timeline.sql`)이라 지정된 동료가 본문·첨부를 보는 데 문제없음 |
| 알림 타입 | **신설 안 함** — `timeline_review_requested` 재사용, 대상만 분기 | `src/lib/notifications/types.ts`, `supabase/functions/push-dispatch/index.ts` 에 이미 등록됨 |
| 인덱스 | **추가 안 함** | 신규 요청은 곧바로 `submitted` 라 기존 부분 인덱스 `work_timeline_reviews_reviewer_submitted` 를 그대로 탄다 |

## 6) 데이터 변경

`work_timeline_reviews` 에 컬럼 하나만 추가한다.

```
requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
```

기존 행은 `requested_by = reviewer_id` 로 백필한 뒤 `NOT NULL` 을 건다
(v1/v2 에서는 요청자가 곧 검토자였으므로 의미가 정확히 보존된다).

## 7) 화면

**업무보고 상세 — 검토 칸** (`WorkTimelineReviewSection.tsx`)

- 내가 작성자면 → **"검토받을 사람" 선택** + `요청 메모` + `검토 요청 보내기`
- 관리자가 남의 보고서를 볼 때 → 지금 그대로 (`보완 요청 내용`)
- 검토 카드 머리글은 방향에 따라 `"○○ 검토 의견"` / `"○○님의 검토 요청"` 으로 분기
- 요청 취소 버튼은 **요청한 사람**에게, 검토가 끝나기 전이면 노출

**대시보드 검토함** (`ReviewInboxWidget.tsx`)

두 칸(`보완할 검토` / `확인할 검토`)은 그대로 동작한다. 신규 요청은 `submitted` 라
`확인할 검토`(reviewer = 나)에 자동으로 들어온다. 배지 문구만 방향별로 나눈다.

- 지시형 응답 → `보완 완료됨`
- 확인요청형 → `검토 요청`

## 8) 이중 경로 주의 (성능 불변조건 3)

대시보드 검토 인박스는 **빠른 경로(`src/lib/dashboard/fast-queries.ts`)와 폴백(`src/lib/dashboard/queries.ts`) 양쪽**에
같은 결과를 실어야 한다. 방향 값을 한쪽에만 넣으면 운영에서만 문구가 틀린다.
`scripts/work-timeline-reviews.test.mjs` 가 이 대칭을 정적으로 강제한다.

## 9) 검증

- `node --test scripts/work-timeline-reviews.test.mjs` — 마이그레이션·이중 경로 정적 검사
- `npm run test:performance` · `npm run test:security` · `npm run lint` · `npm run build`
- 수동 확인: 직원→관리자 요청·반려·보완·승인 전체 왕복 / 직원 A→직원 B 상호 검토 / 요청 취소 /
  관리자의 기존 지시형 요청 회귀
