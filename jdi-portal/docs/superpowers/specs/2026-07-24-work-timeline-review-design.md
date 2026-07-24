# 업무보고 검토 기능 설계

- 날짜: 2026-07-24
- 도메인: `work-timeline`(상세 화면·검토 UI), `tasks`(보완 할일 연동), `dashboard`(검토 인박스 표시), `notifications`/`push`(알림)
- 상태: 설계 확정 (사용자 승인) · 구현 예정
- 예상 마이그레이션 번호: `107_work_timeline_reviews.sql` (테이블·인덱스·RLS·RPC·트리거), 재촉은 같은 파일 또는 `108`로 분리 가능
- 참고 선례: 업무지시(directives) 기능 — `docs/superpowers/specs/2026-07-24-work-directives-design.md`, 마이그레이션 `103`/`105`. 이 검토 기능은 그 패턴을 거의 대칭 복제한다.

## 배경 / 목적

지금 직원이 **업무 타임라인**에 완료한 업무(업무보고)를 올리면, 그걸 본 관리자(대표님)나 작성자 본인이
"이 부분을 보완했으면 좋겠다"고 느껴도 포털 안에서 그 의견을 남기고 처리 상태를 추적할 방법이 없다.
말로 전하거나 메신저로 흘려보내면 누가 무엇을 보완해야 하는지, 어디까지 됐는지 한곳에서 볼 수 없다.

이 흐름을 포털 안으로 가져온다.

1. **검토 요청**: 업무 타임라인 상세 화면 아래 "검토" 영역에서 검토 의견(보완 요청 내용)을 적고 요청한다.
2. **할일 자동 생성**: 요청 즉시 **업무보고 작성자에게** 보완 할일이 생기고, 작성자는 실시간 알림 + 출근 후 대시보드 "검토할 업무" 인박스로 이를 확인한다.
3. **보완 → 재검토**: 작성자가 그 할일을 **완료**하면 자동으로 "검토대기"가 되고 검토자에게 알림이 간다.
4. **승인 / 반려**: 검토자가 승인하면 종료, 반려하면 사유와 함께 할일이 다시 열려 보완을 반복한다.

업무보고·검토 의견·보완 할일은 서로 링크로 연결되어 어느 화면에서든 나머지로 이동할 수 있다.

## 결정 사항 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 데이터 방식 | 신규 테이블 `work_timeline_reviews`(본문·상태) + 이력 테이블 `work_timeline_review_events` + `tasks` 연결 컬럼 `review_id` |
| 검토 요청 권한 | **관리자(admin) 또는 업무보고 작성자 본인** |
| 요청자 = 검토자 | 요청을 건 사람이 나중에 승인/반려도 담당 (관리자 요청 → 관리자가 확정 / 작성자 셀프 요청 → 본인이 확정) |
| 보완 담당 | 항상 업무보고 작성자 (`work_timeline_entries.user_id`) |
| 확인 흐름 | **승인 / 반려**. 반려 시 사유 입력 + 할일 재오픈 → 보완 반복 (승인될 때까지) |
| 동시 진행 | 업무보고당 **진행 중 검토 1건** (DB 부분 유니크 인덱스로 강제) |
| 보완 완료 신호 | 별도 버튼 없음 — **보완 할일이 완료되면 자동으로 "검토대기"** 전환 (트리거) |
| 노출 강도 | **실시간 알림(팝업·벨·푸시) + 출근 후 "검토할 업무" 인박스** (상시 배너는 이번 범위 제외) |
| 인박스 내용 | 작성자 시점 = "보완할 검토", 검토자 시점 = "확인할 검토" 두 갈래 |
| 재촉 알림 | **포함** — 미확인/미처리 검토를 다음 근무일 특정 시각에 1회 재알림 (업무지시 105 패턴) |
| 검토 의견 열람 | 요청자·작성자·관리자만 (민감할 수 있어 RLS로 제한) |

검토에 사용한 화면 시안: <https://claude.ai/code/artifact/b7b2f085-729a-4b8c-8744-93c7dde4bb62>
(비공개 링크. 구현의 기준은 아래 서술이며, 시안은 참고용이다.)

### 왜 신규 테이블인가

- 업무보고(`work_timeline_entries`)의 UPDATE RLS는 `user_id = auth.uid()`로 작성자 본인만 허용한다.
  검토자(작성자가 아닌 사람)가 업무보고 row 자체를 바꿀 수 없으므로, 검토 상태를 업무보고에 얹을 수 없다.
- 업무지시(directives)가 이미 "요청 본문 + 상태 + tasks 연결 + RPC" 구조로 검증돼 있다. 그 레일을 재사용한다.
- 이력 테이블을 두면 **반려가 여러 번 반복돼도 과거 사유를 모두** 보관·표시할 수 있다(사용자가 이력 포함 버전 선택).

## 상태 흐름

```
[검토 요청]  →  보완중  →  (작성자가 할일 완료: 자동)  →  검토대기  →  [승인] → 완료 ✅
                  ↑                                                    │
                  └──────────────  [반려] (사유 입력, 할일 재오픈)  ←────┘
                                                          [요청 취소] → 취소
```

- **보완중(`open`)**: 요청 즉시. 작성자에게 보완 할일 생성.
- **검토대기(`submitted`)**: 보완 할일이 `완료`로 바뀌면 트리거가 자동 전환 + 검토자에게 알림.
- **완료(`approved`)**: 검토자가 승인. 종료(이력 보관).
- **취소(`cancelled`)**: 검토자가 승인 전 철회. 할일도 함께 닫힘.
- **반려**: `submitted` → `open`으로 되돌리는 액션. 사유를 이력에 남기고 할일을 `대기`로 재오픈, 작성자에게 알림. (별도 종료 상태가 아니라 루프)

## 1) DB — 마이그레이션 `107_work_timeline_reviews.sql`

### work_timeline_reviews (검토 본문·상태)

```sql
CREATE TABLE public.work_timeline_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.work_timeline_entries(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE, -- 요청=검토=확정자
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,   -- 업무보고 작성자(보완 담당). entry.user_id를 생성 시점에 복제(RLS 편의)
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,                -- 자동 생성된 보완 할일
  comment TEXT NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 2000), -- 최초 검토 의견
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','submitted','approved','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  reminded_on DATE,                                                          -- 재촉 하루 1회 방지
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 업무보고당 진행 중(open/submitted) 검토는 1건만
CREATE UNIQUE INDEX work_timeline_reviews_active_unique
  ON public.work_timeline_reviews (entry_id)
  WHERE state IN ('open','submitted');

-- 인박스/재촉 빠른 조회용 부분 인덱스 (매 대시보드 로드에서 읽음)
CREATE INDEX work_timeline_reviews_author_open
  ON public.work_timeline_reviews (author_id) WHERE state = 'open';
CREATE INDEX work_timeline_reviews_reviewer_submitted
  ON public.work_timeline_reviews (reviewer_id) WHERE state = 'submitted';
```

### work_timeline_review_events (이력 타임라인)

```sql
CREATE TABLE public.work_timeline_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.work_timeline_reviews(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('requested','submitted','approved','rejected','cancelled')),
  note TEXT CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 2000), -- 반려 사유 등
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_timeline_review_events_review
  ON public.work_timeline_review_events (review_id, created_at);
```

### tasks 연결 컬럼

```sql
ALTER TABLE public.tasks
  ADD COLUMN review_id UUID REFERENCES public.work_timeline_reviews(id) ON DELETE SET NULL;

-- 검토 1건당 보완 할일 1개 보장 (directive_recipient_id 패턴과 동일)
CREATE UNIQUE INDEX tasks_review_unique
  ON public.tasks (review_id) WHERE review_id IS NOT NULL;
```

### 트리거 — 보완 할일 완료 감지

`set_task_completed_at`(084)와 같은 자리에서, `review_id`가 있는 할일의 status 변화를 감지한다.

- 할일이 `완료`로 진입 & 연결 검토가 `open` → 검토 `submitted`로 전환, `submitted` 이벤트 기록, **검토자에게 알림**.
- 할일이 `완료`에서 벗어남(재오픈) & 연결 검토가 `submitted` → 다시 `open`으로 되돌림(정합성 유지).

```sql
CREATE OR REPLACE FUNCTION public.sync_review_on_task_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.review_id IS NULL THEN RETURN NEW; END IF;
  -- 완료 진입
  IF NEW.status = '완료' AND (OLD.status IS DISTINCT FROM '완료') THEN
    UPDATE public.work_timeline_reviews
      SET state = 'submitted', updated_at = NOW()
      WHERE id = NEW.review_id AND state = 'open';
    -- 이벤트 + 검토자 알림은 조건부로 (아래 서술)
  -- 완료 이탈(재오픈)
  ELSIF OLD.status = '완료' AND NEW.status <> '완료' THEN
    UPDATE public.work_timeline_reviews
      SET state = 'open', updated_at = NOW()
      WHERE id = NEW.review_id AND state = 'submitted';
  END IF;
  RETURN NEW;
END; $$;
```

> 알림 insert는 트리거 안에서 직접 하거나(directives의 SECURITY DEFINER 내부 insert 패턴), 별도 함수로 분리한다. 이벤트 기록도 트리거에서 함께 남긴다.

### RPC (상태 전이는 전부 여기로만 — UPDATE 정책 없음)

directives의 `accept/decline_work_directive`와 대칭. 모두 `SECURITY DEFINER`, 내부에서 `auth.uid()`·권한·상태를 재검증.

- `request_timeline_review(p_entry_id UUID, p_comment TEXT) RETURNS UUID`
  - 호출자 = admin 또는 entry 작성자인지 확인.
  - 해당 entry에 진행 중(open/submitted) 검토가 없음을 확인(부분 유니크가 최종 방어).
  - `work_timeline_reviews` insert(state `open`, reviewer=호출자, author=entry.user_id, comment).
  - `tasks` insert: `title = '[검토 보완] ' || entry.title`, `description = p_comment`, `status '대기'`, `priority '보통'`, `created_by = 호출자`, `review_id = 신규 검토 id`. `task_assignees`에 **작성자** 배정.
  - 검토 row에 `task_id` 채움. `requested` 이벤트 기록. **작성자에게 알림**(호출자 ≠ 작성자일 때). 검토 id 반환.
- `approve_timeline_review(p_review_id UUID, p_note TEXT DEFAULT NULL) RETURNS void`
  - 호출자 = reviewer 또는 admin. state `submitted`(또는 `open`도 허용할지 결정 — 기본은 submitted에서만).
  - state `approved`, `resolved_at = NOW()`. `approved` 이벤트. **작성자에게 알림**.
- `reject_timeline_review(p_review_id UUID, p_note TEXT) RETURNS void`
  - 호출자 = reviewer 또는 admin. state `submitted`에서만. `p_note`(사유) 필수.
  - 연결 할일을 `대기`로 재오픈(트리거가 review를 open으로 되돌림, 또는 여기서 명시적으로 open 세팅). `rejected` 이벤트(note=사유). **작성자에게 알림**.
- `cancel_timeline_review(p_review_id UUID) RETURNS void`
  - 호출자 = reviewer 또는 admin. state `open`/`submitted`에서. state `cancelled`, `resolved_at`. 연결 할일은 완료로 보내지 않고 닫힘 처리(예: status는 그대로 두되 인박스에서 빠지도록 review만 종료, 또는 할일 삭제 여부는 구현 시 결정 — 기본: 할일은 남기고 review만 취소, 할일 title에 취소 표시). `cancelled` 이벤트.

### RLS

- `work_timeline_reviews` / `work_timeline_review_events`
  - **SELECT**: `is_approved_user()` AND (`auth.uid() IN (reviewer_id, author_id)` OR admin). 검토 의견 열람을 당사자·관리자로 제한.
  - **INSERT/UPDATE/DELETE**: 정책 없음(직접 조작 차단). 모든 쓰기는 위 RPC(SECURITY DEFINER)로만.
- `tasks.review_id`: tasks 기존 RLS 그대로. 컬럼 추가만.

## 2) 알림 (`notifications` / `push`)

directives처럼 `notifications`에 row를 insert하면 실시간 토스트 + 벨 뱃지 + 웹푸시가 자동 발동한다.

- 신규 타입 3종을 `src/lib/notifications/types.ts`의 `NotificationType` 유니온에 추가:
  - `timeline_review_requested` — 작성자에게 "검토 요청이 도착했어요"
  - `timeline_review_submitted` — 검토자에게 "보완이 완료됐어요, 확인해 주세요"
  - `timeline_review_resolved` — 작성자에게 "검토가 승인/반려됐어요"
- `NotificationCenter.tsx`의 `TYPE_ICONS`/`TYPE_COLORS`에 3종 아이콘/색 추가(없어도 폴백 동작하나 추가).
- `supabase/functions/push-dispatch/index.ts`의 `SETTING_KEY_BY_TYPE`에 매핑 추가. 야간 푸시 억제가 필요하면 `QUIET_HOURS_TYPES`에도 추가.
- `link`는 해당 업무보고 상세(`/dashboard/work-timeline/{entryId}`)로. 클릭 시 검토 영역으로 바로 이동.

## 3) 대시보드 노출 — "검토할 업무" 인박스

### 빠른 경로 확장 (`src/lib/dashboard/fast-queries.ts`)

`DASHBOARD_SNAPSHOT_QUERY`에 `pending_directives`와 같은 패턴으로 CTE 추가(위 부분 인덱스 사용):

- `my_reviews_to_fix` — `author_id = 본인 AND state = 'open'` (작성자: 보완할 검토)
- `my_reviews_to_confirm` — `reviewer_id = 본인 AND state = 'submitted'` (검토자: 확인할 검토)

최종 `jsonb_build_object`에 `pendingReviews: { toFix: [...], toConfirm: [...] }` 키 추가.
`DashboardSnapshot`(`dashboard-snapshot.ts`) · `DashboardData`(`queries.ts`) · `buildDashboardDataFromSnapshot`에 필드 추가.
**Supabase RPC 폴백 경로도 함께 수정**(빠른 경로/폴백 양쪽 반영 — 성능 불변조건 3).

### 위젯 (`ReviewInboxWidget.tsx`)

`DirectiveInboxWidget`을 복제:
- 항목 0건이면 null.
- 출근 전: "확인할 검토 N건 · 출근 후 확인해 주세요" 접힘. 출근 후 자동 펼침(`hasCheckedIn`).
- 카드 목록:
  - 작성자용(toFix): 검토 의견 + "보완 할일 열기" 링크(할일로 이동해 처리).
  - 검토자용(toConfirm): "보완 완료됨" + [승인]/[반려] 버튼(RPC 호출 → toast → `router.refresh()`).
- `DashboardClient.tsx`에서 `DirectiveInboxWidget` 아래에 마운트, `data.pendingReviews` 주입.

## 4) 상세 화면 UI — `work-timeline` 상세에 "검토" 섹션

### 데이터 로드 (`src/app/dashboard/work-timeline/[id]/page.tsx`)

`getWorkTimelineEntryById` 후, 그 entry의 **진행 중/최근 검토 + 이벤트 이력**을 함께 조회해
`WorkTimelineDetailClient`에 `initialReview`(+events)로 전달. `currentUserId`/`currentUserRole`은 이미 전달됨.

### 컴포넌트 (`WorkTimelineReviewSection.tsx`)

`WorkTimelineDetailClient` 하단 `<article>` 아래에 삽입. 시안(섹션 01 탭 ①~⑤)이 화면 기준.

- **진행 중 검토 없음** & (admin || 작성자 본인): `검토 요청` 버튼 → 검토 의견 textarea → 제출(`request_timeline_review`).
- **진행 중**: 상태 배지(보완중/검토대기), 검토 의견, 이벤트 타임라인, "보완 할일 열기" 링크.
  - 검토자(또는 admin): `submitted`에서 [승인]/[반려(사유)], `open`에서 [요청 취소].
  - 작성자: 할일 링크(할일 화면에서 처리·완료).
- **종료(완료/취소)**: 이력 접힘 카드로 보관.

### 검토 로직 (`src/lib/work-timeline/`)

- `reviewQueries.ts` — `getEntryReview(entryId)`(검토 + 이벤트), 상세/인박스에서 사용.
- `reviewActions.ts`(`"use server"`) — 각 RPC 래퍼(`requestReview`/`approveReview`/`rejectReview`/`cancelReview`), 성공 후 `revalidatePath`.
- `types.ts` — `WorkTimelineReview`, `WorkTimelineReviewEvent`, state/kind 리터럴 타입.
- `constants.ts` — 상태 라벨/색(보완중·검토대기·완료·취소), 제목 접두어 `[검토 보완] `.

## 5) 할일 화면 역링크 (`tasks`)

- `tasks` 조회에 `review_id` 포함, `TaskDetailClient`(또는 패널)에서 `review_id`가 있으면
  **"검토 대상 업무보고 보기"** 링크(`/dashboard/work-timeline/{entryId}`) 표시.
- `src/lib/tasks/types.ts`의 task 타입에 `review_id: string | null` 추가.

## 6) 재촉 알림 (pg_cron)

`105_work_directive_reminder.sql`의 `remind_pending_work_directives` 복제:

- `remind_pending_timeline_reviews()` (SECURITY DEFINER): 조건
  - 작성자 대상: `state='open'` AND `created_at < now()-12h` AND 작성자가 오늘 출근 AND (`reminded_on`이 오늘 아님).
  - 검토자 대상: `state='submitted'` AND (보완 완료가 12h 넘게 방치) AND 검토자 오늘 출근 AND 재촉 미발송.
  - 각 대상에게 알림 insert 후 `reminded_on = 오늘`로 하루 1회 제한.
- `cron.schedule`로 평일 특정 시각 KST 1회(업무지시와 겹치지 않게 시각 조정).

## 7) 검증

- `npm run test:performance` — 성능 회귀(빠른 경로/폴백·부분 인덱스) 통과 필수.
- `npm run test:security` — 새 RLS/RPC 경계(당사자만 열람, 쓰기는 RPC로만) 검사 추가.
- `supabase/tests/`에 `work_timeline_reviews_rls.sql` 회귀(작성자·검토자·제3자·관리자 각 시점).
- 상세 화면·인박스·역링크 수동 확인(작성자/검토자/관리자 3역).

## 열린 질문 (구현 중 확정)

- 취소 시 보완 할일 처리: 남기고 검토만 종료 vs 할일도 닫기(기본: 남김, title에 `(검토 취소)` 표기).
- `approve`를 `open` 상태에서도(보완 완료 전) 허용할지: 기본은 `submitted`에서만. 관리자 강제 승인 필요 시 확장.
- 재촉 시각(업무지시 11:00과 분리): 예 11:30 KST.
