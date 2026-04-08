# 근무시간: 승인형 + 기간 이력 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 값으로 저장되던 근무시간을 (1) 변경 시 관리자 승인을 거치는 흐름과 (2) 적용 시작일 기준으로 누적되는 이력 구조로 전환한다.

**Architecture:** 새 테이블 `work_schedules`(이력)과 `work_schedule_change_requests`(요청)를 추가. 첫 설정은 즉시 저장, 이후는 직원의 변경 요청 → 관리자 승인 → 새 이력 행 추가 흐름. 통계/지각 판정은 매 record의 work_date에 대해 그날 적용 중인 이력 행을 조회해서 동적으로 계산. `profiles.work_start_time/end_time`은 더 이상 사용하지 않음(컬럼은 유지).

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (Postgres + RLS + RPC), React 클라이언트 컴포넌트, Tailwind CSS.

**설계 문서:** `docs/superpowers/specs/2026-04-08-work-schedule-history-design.md`

---

## 파일 구조 (생성 / 수정)

**DB**
- 생성: `supabase/migrations/058_work_schedule_history.sql`

**라이브러리 (lib)**
- 수정: `src/lib/attendance/types.ts` — 새 타입 추가
- 수정: `src/lib/attendance/queries.ts` — 이력/요청 조회 함수 추가
- 수정: `src/lib/attendance/actions.ts` — 새 액션 추가, `updateWorkSchedule` 제거
- 수정: `src/lib/attendance/stats.ts` — `calcAttendanceStats` 시그니처 변경, `getScheduleForDate` 헬퍼 추가

**서버 페이지**
- 수정: `src/app/dashboard/attendance/page.tsx` — `work_schedules` / 변경 요청 fetch 추가, props 전달

**클라이언트 컴포넌트**
- 전면 개편: `src/components/dashboard/attendance/WorkScheduleCard.tsx`
- 생성: `src/components/dashboard/attendance/WorkScheduleChangeRequestModal.tsx`
- 생성: `src/components/dashboard/attendance/AdminWorkScheduleRequests.tsx`
- 수정: `src/components/dashboard/attendance/AttendancePageClient.tsx` — 새 props
- 수정: `src/components/dashboard/attendance/tabs/CheckInOutTab.tsx` — 새 props
- 수정: `src/components/dashboard/attendance/tabs/AdminTab.tsx` — `AdminWorkScheduleRequests` 추가
- 수정: `src/components/dashboard/attendance/tabs/RecordsTab.tsx` — schedules prop
- 수정: `src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx`
- 수정: `src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx`
- 수정: `src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx`
- 수정: `src/components/dashboard/attendance/tabs/records/AdminRecordsView.tsx`
- 수정: `src/components/dashboard/attendance/WeekSummaryCard.tsx`
- 수정: `src/components/dashboard/attendance/AttendanceCalendar.tsx` (영향 있는 경우)

---

## Task 1: DB 마이그레이션 — 테이블 + RLS + 시드

**Files:**
- Create: `supabase/migrations/058_work_schedule_history.sql`

- [ ] **Step 1: 마이그레이션 파일 생성**

`supabase/migrations/058_work_schedule_history.sql` 내용:

```sql
-- 058_work_schedule_history.sql
-- 근무시간을 단일 값에서 "적용 시작일 기준 이력" 구조로 전환
-- + 직원 변경 요청 → 관리자 승인 흐름

-- =========================================
-- 1. work_schedules : 이력 테이블
-- =========================================
CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  work_start_time TIME NOT NULL,
  work_end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  is_initial_seed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, effective_from)
);

CREATE INDEX work_schedules_user_effective_idx
  ON public.work_schedules (user_id, effective_from DESC);

COMMENT ON TABLE public.work_schedules IS
  '직원별 근무시간 이력. effective_from 기준으로 기간을 결정.';

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws_select_own_or_admin"
  ON public.work_schedules
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_approved_user()
       AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 일반 직원은 직접 INSERT/UPDATE/DELETE 불가 (RPC 경유)
CREATE POLICY "ws_admin_all"
  ON public.work_schedules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================
-- 2. work_schedule_change_requests : 변경 요청
-- =========================================
CREATE TABLE public.work_schedule_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_start_time TIME NOT NULL,
  requested_end_time TIME NOT NULL,
  effective_from DATE NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT '대기중'
    CHECK (status IN ('대기중', '승인', '반려')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX wscr_status_idx
  ON public.work_schedule_change_requests (status, created_at DESC);
CREATE INDEX wscr_user_idx
  ON public.work_schedule_change_requests (user_id, created_at DESC);

ALTER TABLE public.work_schedule_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wscr_select_own_or_admin"
  ON public.work_schedule_change_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "wscr_insert_own"
  ON public.work_schedule_change_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wscr_delete_own_pending"
  ON public.work_schedule_change_requests
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND status = '대기중');

CREATE POLICY "wscr_admin_update"
  ON public.work_schedule_change_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================
-- 3. 시드: 기존 직원의 현재 근무시간을 초기 이력으로 이전
-- =========================================
INSERT INTO public.work_schedules (
  user_id, work_start_time, work_end_time,
  effective_from, is_initial_seed, created_by
)
SELECT
  id,
  COALESCE(work_start_time, '09:00:00'::TIME),
  COALESCE(work_end_time, '18:00:00'::TIME),
  '2000-01-01'::DATE,
  TRUE,
  NULL
FROM public.profiles
ON CONFLICT (user_id, effective_from) DO NOTHING;
```

- [ ] **Step 2: 마이그레이션 적용**

```bash
cd jdi-portal
npx supabase db push
```

기대 결과: `058_work_schedule_history.sql Applied` 메시지. 에러 시 SQL 구문 점검.

- [ ] **Step 3: 검증 — 시드 행이 모든 직원에 대해 1개씩 들어갔는지 확인**

Supabase 콘솔 SQL 에디터에서:
```sql
SELECT
  (SELECT COUNT(*) FROM public.profiles) AS profile_count,
  (SELECT COUNT(*) FROM public.work_schedules WHERE is_initial_seed) AS seed_count;
```
기대: 두 값이 동일.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/058_work_schedule_history.sql
git commit -m "기능: 근무시간 이력/변경요청 테이블 추가"
```

---

## Task 2: DB 마이그레이션 — RPC 함수

**Files:**
- Modify: `supabase/migrations/058_work_schedule_history.sql` (Task 1 파일에 이어서 추가)

- [ ] **Step 1: 058 파일 끝에 RPC 함수 5개 추가**

```sql
-- =========================================
-- 4. RPC 함수
-- =========================================

-- 헬퍼: 호출자의 비-시드 이력 행 개수
CREATE OR REPLACE FUNCTION public.work_schedule_non_seed_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.work_schedules
  WHERE user_id = p_user_id AND is_initial_seed = FALSE;
$$;

-- 4-1. 첫 설정 (직원 본인, non-seed가 0개일 때만)
CREATE OR REPLACE FUNCTION public.set_initial_work_schedule(
  p_start TIME,
  p_end TIME
)
RETURNS public.work_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_row public.work_schedules;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  IF public.work_schedule_non_seed_count(v_uid) > 0 THEN
    RAISE EXCEPTION '이미 근무시간이 설정되어 있습니다. 변경 요청을 제출해주세요.';
  END IF;

  INSERT INTO public.work_schedules (
    user_id, work_start_time, work_end_time,
    effective_from, is_initial_seed, created_by
  )
  VALUES (v_uid, p_start, p_end, v_today, FALSE, v_uid)
  ON CONFLICT (user_id, effective_from)
  DO UPDATE SET
    work_start_time = EXCLUDED.work_start_time,
    work_end_time = EXCLUDED.work_end_time,
    is_initial_seed = FALSE,
    created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_initial_work_schedule(TIME, TIME) TO authenticated;

-- 4-2. 변경 요청 제출
CREATE OR REPLACE FUNCTION public.submit_work_schedule_change_request(
  p_start TIME,
  p_end TIME,
  p_effective_from DATE,
  p_reason TEXT
)
RETURNS public.work_schedule_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_row public.work_schedule_change_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '인증이 필요합니다.';
  END IF;

  IF public.work_schedule_non_seed_count(v_uid) = 0 THEN
    RAISE EXCEPTION '먼저 근무시간을 설정해주세요.';
  END IF;

  IF p_effective_from < v_today THEN
    RAISE EXCEPTION '적용 시작일은 오늘 또는 이후여야 합니다.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.work_schedule_change_requests
    WHERE user_id = v_uid AND status = '대기중'
  ) THEN
    RAISE EXCEPTION '이미 대기 중인 변경 요청이 있습니다.';
  END IF;

  INSERT INTO public.work_schedule_change_requests (
    user_id, requested_start_time, requested_end_time,
    effective_from, reason
  )
  VALUES (v_uid, p_start, p_end, p_effective_from, NULLIF(p_reason, ''))
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_work_schedule_change_request(TIME, TIME, DATE, TEXT) TO authenticated;

-- 4-3. 변경 요청 승인 (관리자)
CREATE OR REPLACE FUNCTION public.approve_work_schedule_change_request(
  p_request_id UUID
)
RETURNS public.work_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.work_schedule_change_requests;
  v_row public.work_schedules;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  SELECT * INTO v_req
  FROM public.work_schedule_change_requests
  WHERE id = p_request_id AND status = '대기중'
  FOR UPDATE;

  IF v_req IS NULL THEN
    RAISE EXCEPTION '대기 중인 요청을 찾을 수 없습니다.';
  END IF;

  -- 이력 행 추가 (충돌 시 대체)
  INSERT INTO public.work_schedules (
    user_id, work_start_time, work_end_time,
    effective_from, is_initial_seed, created_by
  )
  VALUES (
    v_req.user_id, v_req.requested_start_time, v_req.requested_end_time,
    v_req.effective_from, FALSE, v_uid
  )
  ON CONFLICT (user_id, effective_from)
  DO UPDATE SET
    work_start_time = EXCLUDED.work_start_time,
    work_end_time = EXCLUDED.work_end_time,
    is_initial_seed = FALSE,
    created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  -- 요청 상태 갱신
  UPDATE public.work_schedule_change_requests
  SET status = '승인', reviewed_by = v_uid, reviewed_at = NOW()
  WHERE id = p_request_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_work_schedule_change_request(UUID) TO authenticated;

-- 4-4. 변경 요청 반려 (관리자)
CREATE OR REPLACE FUNCTION public.reject_work_schedule_change_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS public.work_schedule_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.work_schedule_change_requests;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION '반려 사유를 입력해주세요.';
  END IF;

  UPDATE public.work_schedule_change_requests
  SET status = '반려',
      reviewed_by = v_uid,
      reviewed_at = NOW(),
      reject_reason = p_reason
  WHERE id = p_request_id AND status = '대기중'
  RETURNING * INTO v_row;

  IF v_row IS NULL THEN
    RAISE EXCEPTION '대기 중인 요청을 찾을 수 없습니다.';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_work_schedule_change_request(UUID, TEXT) TO authenticated;

-- 4-5. 관리자가 직원의 근무시간을 직접 저장 (즉시 반영)
CREATE OR REPLACE FUNCTION public.admin_set_work_schedule(
  p_user_id UUID,
  p_start TIME,
  p_end TIME,
  p_effective_from DATE
)
RETURNS public.work_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.work_schedules;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND role = 'admin') THEN
    RAISE EXCEPTION '권한이 없습니다: 관리자만 가능합니다.';
  END IF;

  INSERT INTO public.work_schedules (
    user_id, work_start_time, work_end_time,
    effective_from, is_initial_seed, created_by
  )
  VALUES (p_user_id, p_start, p_end, p_effective_from, FALSE, v_uid)
  ON CONFLICT (user_id, effective_from)
  DO UPDATE SET
    work_start_time = EXCLUDED.work_start_time,
    work_end_time = EXCLUDED.work_end_time,
    is_initial_seed = FALSE,
    created_by = EXCLUDED.created_by
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_work_schedule(UUID, TIME, TIME, DATE) TO authenticated;
```

- [ ] **Step 2: 마이그레이션 재적용**

```bash
npx supabase db push
```

기대 결과: 058이 이미 적용된 상태에서 실패하면 reset 또는 supabase db diff/repair. 가장 안전한 진행: 058 파일을 한 번에 작성한 뒤(Task 1 + Task 2 통합) 한 번만 push. **실무 권장: Task 1과 Task 2의 SQL을 같은 PR에서 한 파일로 작성한 뒤 한 번에 push.**

- [ ] **Step 3: 검증 — RPC 함수 존재 확인**

```sql
SELECT proname FROM pg_proc
WHERE proname IN (
  'set_initial_work_schedule',
  'submit_work_schedule_change_request',
  'approve_work_schedule_change_request',
  'reject_work_schedule_change_request',
  'admin_set_work_schedule',
  'work_schedule_non_seed_count'
)
ORDER BY proname;
```
기대: 6개 함수 모두 출력.

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/058_work_schedule_history.sql
git commit -m "기능: 근무시간 이력/변경요청 RPC 추가"
```

---

## Task 3: TypeScript 타입 추가

**Files:**
- Modify: `src/lib/attendance/types.ts`

- [ ] **Step 1: 새 타입 추가**

`src/lib/attendance/types.ts` 끝에 다음 추가:

```ts
export interface WorkSchedule {
  id: string;
  user_id: string;
  work_start_time: string;       // "HH:MM:SS"
  work_end_time: string;         // "HH:MM:SS"
  effective_from: string;        // "YYYY-MM-DD"
  is_initial_seed: boolean;
  created_by: string | null;
  created_at: string;
}

export interface WorkScheduleChangeRequest {
  id: string;
  user_id: string;
  requested_start_time: string;
  requested_end_time: string;
  effective_from: string;
  reason: string | null;
  status: "대기중" | "승인" | "반려";
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  profiles?: { full_name: string };
}
```

- [ ] **Step 2: 타입 체크**

```bash
cd jdi-portal && npx tsc --noEmit
```
기대: 새 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/attendance/types.ts
git commit -m "타입: WorkSchedule 및 변경요청 타입 추가"
```

---

## Task 4: 쿼리 함수 추가

**Files:**
- Modify: `src/lib/attendance/queries.ts`

- [ ] **Step 1: import 보강 + 함수 추가**

상단 import에 추가:
```ts
import type {
  WorkSchedule,
  WorkScheduleChangeRequest,
} from "./types";
```
(기존 import 블록 안에 끼워 넣을 것)

파일 끝에 다음 함수 추가:

```ts
/** 직원 본인의 모든 근무시간 이력 (effective_from ASC) */
export async function getWorkSchedules(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSchedule[]> {
  const { data, error } = await supabase
    .from("work_schedules")
    .select("*")
    .eq("user_id", userId)
    .order("effective_from", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 오늘 시점 적용 중인 근무시간 1행 */
export async function getCurrentWorkSchedule(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSchedule | null> {
  const today = toDateString();
  const { data, error } = await supabase
    .from("work_schedules")
    .select("*")
    .eq("user_id", userId)
    .lte("effective_from", today)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 본인의 변경 요청 목록 */
export async function getMyWorkScheduleChangeRequests(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkScheduleChangeRequest[]> {
  const { data, error } = await supabase
    .from("work_schedule_change_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** 관리자용: 대기 중 변경 요청 전체 */
export async function getPendingWorkScheduleChangeRequests(
  supabase: SupabaseClient
): Promise<WorkScheduleChangeRequest[]> {
  const { data, error } = await supabase
    .from("work_schedule_change_requests")
    .select("*, profiles:user_id(full_name)")
    .eq("status", "대기중")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as WorkScheduleChangeRequest[]) ?? [];
}

/** 관리자용: 특정 직원의 모든 이력 */
export async function getWorkSchedulesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<WorkSchedule[]> {
  return getWorkSchedules(supabase, userId);
}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
기대: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/attendance/queries.ts
git commit -m "쿼리: 근무시간 이력/변경요청 조회 함수 추가"
```

---

## Task 5: 액션 함수 교체

**Files:**
- Modify: `src/lib/attendance/actions.ts`

- [ ] **Step 1: 기존 `updateWorkSchedule` 제거 + 새 액션 5개 추가**

`updateWorkSchedule` 함수(파일 하단 ~237-255행)를 통째로 삭제하고 다음으로 교체:

```ts
/** 첫 근무시간 설정 (이력에 비-시드 행이 없을 때만 가능) */
export async function setInitialWorkSchedule(
  startTime: string,
  endTime: string
) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("set_initial_work_schedule", {
    p_start: startTime,
    p_end: endTime,
  });
  if (error) throw error;
  return data;
}

/** 근무시간 변경 요청 제출 */
export async function submitWorkScheduleChangeRequest(params: {
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  reason: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(
    "submit_work_schedule_change_request",
    {
      p_start: params.startTime,
      p_end: params.endTime,
      p_effective_from: params.effectiveFrom,
      p_reason: params.reason ?? "",
    }
  );
  if (error) throw error;

  // 모든 관리자에게 알림
  const { data: admins } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  if (admins) {
    await Promise.all(
      admins.map((a: { id: string }) =>
        createNotification({
          userId: a.id,
          type: "work_schedule_change_requested",
          title: "근무시간 변경 요청",
          body: `${params.startTime.slice(0, 5)} ~ ${params.endTime.slice(
            0,
            5
          )} (적용일: ${params.effectiveFrom})`,
          link: "/dashboard/attendance",
        })
      )
    );
  }
  return data;
}

/** 본인 대기중 요청 취소 */
export async function cancelMyWorkScheduleChangeRequest(requestId: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("work_schedule_change_requests")
    .delete()
    .eq("id", requestId)
    .eq("status", "대기중");
  if (error) throw error;
}

/** 변경 요청 승인 (관리자) */
export async function approveWorkScheduleChangeRequest(
  requestId: string,
  adminId: string
) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc(
    "approve_work_schedule_change_request",
    { p_request_id: requestId }
  );
  if (error) throw error;

  // 신청자에게 알림
  const { data: req } = await supabase
    .from("work_schedule_change_requests")
    .select(
      "user_id, requested_start_time, requested_end_time, effective_from"
    )
    .eq("id", requestId)
    .single();
  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "work_schedule_approved",
      title: "근무시간 변경이 승인되었습니다",
      body: `${req.requested_start_time.slice(
        0,
        5
      )} ~ ${req.requested_end_time.slice(0, 5)} (적용일: ${req.effective_from})`,
      link: "/dashboard/attendance",
    });
  }
}

/** 변경 요청 반려 (관리자) */
export async function rejectWorkScheduleChangeRequest(
  requestId: string,
  adminId: string,
  rejectReason: string
) {
  const supabase = getSupabase();
  const { data: req } = await supabase
    .from("work_schedule_change_requests")
    .select("user_id, requested_start_time, requested_end_time, effective_from")
    .eq("id", requestId)
    .single();

  const { error } = await supabase.rpc("reject_work_schedule_change_request", {
    p_request_id: requestId,
    p_reason: rejectReason,
  });
  if (error) throw error;

  if (req) {
    await createNotification({
      userId: req.user_id,
      type: "work_schedule_rejected",
      title: "근무시간 변경이 반려되었습니다",
      body: `사유: ${rejectReason}`,
      link: "/dashboard/attendance",
    });
  }
}

/** 관리자가 직접 저장 (즉시 반영) */
export async function adminSetWorkSchedule(params: {
  userId: string;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("admin_set_work_schedule", {
    p_user_id: params.userId,
    p_start: params.startTime,
    p_end: params.endTime,
    p_effective_from: params.effectiveFrom,
  });
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: 타입 체크 — 기존 `updateWorkSchedule` 호출처 식별**

```bash
npx tsc --noEmit
```
기대: `updateWorkSchedule` 참조 에러 발생 (WorkScheduleCard.tsx). 이는 Task 6에서 해결.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/attendance/actions.ts
git commit -m "액션: 근무시간 승인 흐름 액션 추가, updateWorkSchedule 제거"
```

---

## Task 6: stats.ts — 시그니처 변경 + 헬퍼 추가

**Files:**
- Modify: `src/lib/attendance/stats.ts`

- [ ] **Step 1: `getScheduleForDate` 헬퍼 + `calcAttendanceStats` 시그니처 변경**

`stats.ts`를 다음으로 교체 (전체):

```ts
import type { AttendanceRecord } from "./types";

const DEFAULT_WORK_START = "09:00:00";
const DEFAULT_WORK_END = "18:00:00";

/** ISO timestamp에서 분 단위 시간을 KST 기준으로 추출 */
function extractTimeMinutes(isoString: string): number {
  const date = new Date(isoString);
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

/** "HH:MM:SS" 또는 "HH:MM" 문자열을 분 단위로 변환 */
export function timeStringToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/** 분 단위를 "HH:MM AM/PM" 형식으로 변환 */
export function minutesToTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

/** 한 직원의 근무시간 이력 1행 (stats 계산용 슬림 형) */
export interface WorkScheduleEntry {
  effective_from: string;
  work_start_time: string;
  work_end_time: string;
}

/**
 * 주어진 work_date에 대해 적용되는 근무시간 기준을 반환.
 * schedules는 effective_from ASC 정렬되어 있어야 함.
 * 매칭 행이 없으면 09:00 / 18:00 기본값 반환.
 */
export function getScheduleForDate(
  schedules: WorkScheduleEntry[],
  workDate: string
): { workStart: string; workEnd: string } {
  let match: WorkScheduleEntry | null = null;
  for (const s of schedules) {
    if (s.effective_from <= workDate) match = s;
    else break;
  }
  if (!match) {
    return { workStart: DEFAULT_WORK_START, workEnd: DEFAULT_WORK_END };
  }
  return { workStart: match.work_start_time, workEnd: match.work_end_time };
}

export interface AttendanceStats {
  totalDays: number;
  avgWorkMinutes: number;
  onTimeRate: number;
  avgLateMinutes: number;
  avgCheckInMinutes: number;
  avgCheckOutMinutes: number;
  normalCount: number;
  lateCount: number;
  earlyLeaveCount: number;
}

export const EMPTY_STATS: AttendanceStats = {
  totalDays: 0, avgWorkMinutes: 0, onTimeRate: 0,
  avgLateMinutes: 0, avgCheckInMinutes: 0, avgCheckOutMinutes: 0,
  normalCount: 0, lateCount: 0, earlyLeaveCount: 0,
};

export function calcAttendanceStats(
  records: AttendanceRecord[],
  schedules: WorkScheduleEntry[]
): AttendanceStats {
  const checkedInRecords = records.filter((r) => r.check_in);
  const totalDays = checkedInRecords.length;

  if (totalDays === 0) return { ...EMPTY_STATS };

  let totalWorkMinutes = 0;
  let totalCheckInMinutes = 0;
  let totalCheckOutMinutes = 0;
  let checkOutCount = 0;
  let lateCount = 0;
  let totalLateMinutes = 0;
  let earlyLeaveCount = 0;

  for (const record of checkedInRecords) {
    const { workStart, workEnd } = getScheduleForDate(schedules, record.work_date);
    const workStartMin = timeStringToMinutes(workStart);
    const workEndMin = timeStringToMinutes(workEnd);

    const checkInMin = extractTimeMinutes(record.check_in!);
    totalCheckInMinutes += checkInMin;

    if (checkInMin > workStartMin) {
      lateCount++;
      totalLateMinutes += checkInMin - workStartMin;
    }

    if (record.check_out) {
      const checkOutMin = extractTimeMinutes(record.check_out);
      totalCheckOutMinutes += checkOutMin;
      checkOutCount++;

      if (checkOutMin < workEndMin) {
        earlyLeaveCount++;
      }
    }

    if (record.total_minutes) {
      totalWorkMinutes += record.total_minutes;
    }
  }

  const normalCount = totalDays - lateCount;

  return {
    totalDays,
    avgWorkMinutes: Math.round(totalWorkMinutes / totalDays),
    onTimeRate: Math.round((normalCount / totalDays) * 100),
    avgLateMinutes: lateCount > 0 ? Math.round(totalLateMinutes / lateCount) : 0,
    avgCheckInMinutes: Math.round(totalCheckInMinutes / totalDays),
    avgCheckOutMinutes: checkOutCount > 0 ? Math.round(totalCheckOutMinutes / checkOutCount) : 0,
    normalCount,
    lateCount,
    earlyLeaveCount,
  };
}

/** 요일별 (월~금) 평균 출근 시간 계산 */
export function calcWeekdayAvgCheckIn(records: AttendanceRecord[]): { day: string; avgMinutes: number }[] {
  const weekdays = ["월", "화", "수", "목", "금"];
  const buckets: number[][] = [[], [], [], [], []];

  for (const record of records) {
    if (!record.check_in) continue;
    const date = new Date(`${record.work_date}T12:00:00+09:00`);
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) {
      buckets[dow - 1].push(extractTimeMinutes(record.check_in));
    }
  }

  return weekdays.map((day, i) => ({
    day,
    avgMinutes: buckets[i].length > 0
      ? Math.round(buckets[i].reduce((a, b) => a + b, 0) / buckets[i].length)
      : 0,
  }));
}

/** 주차별 총 근무시간 계산 */
export function calcWeeklyWorkHours(records: AttendanceRecord[]): { week: string; hours: number }[] {
  const sorted = [...records].sort((a, b) => a.work_date.localeCompare(b.work_date));
  if (sorted.length === 0) return [];

  const weeks: Map<string, number> = new Map();

  for (const record of sorted) {
    const date = new Date(`${record.work_date}T12:00:00+09:00`);
    const dayOfMonth = date.getDate();
    const weekNum = Math.ceil(dayOfMonth / 7);
    const key = `${weekNum}주`;
    const prev = weeks.get(key) ?? 0;
    weeks.set(key, prev + (record.total_minutes ?? 0));
  }

  return Array.from(weeks.entries()).map(([week, minutes]) => ({
    week,
    hours: Math.round((minutes / 60) * 10) / 10,
  }));
}
```

- [ ] **Step 2: 타입 체크 — 호출처 식별**

```bash
npx tsc --noEmit
```
기대: `calcAttendanceStats(records, workStart, workEnd)`로 호출하던 모든 곳에서 에러 발생. 다음 Task에서 수정.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/attendance/stats.ts
git commit -m "통계: 근무시간 이력 기반 동적 계산"
```

---

## Task 7: 서버 페이지 — fetch 보강

**Files:**
- Modify: `src/app/dashboard/attendance/page.tsx`

- [ ] **Step 1: imports 추가 + fetch 추가**

`page.tsx` import 블록에 추가:
```ts
import {
  // ... 기존
  getWorkSchedules,
  getMyWorkScheduleChangeRequests,
  getPendingWorkScheduleChangeRequests,
} from "@/lib/attendance/queries";
```

`basePromises` 배열에 다음 2개 추가 (배열 끝):
```ts
getWorkSchedules(supabase, user.id),
getMyWorkScheduleChangeRequests(supabase, user.id),
```

해당 destructure도 갱신. 일반 직원 분기:
```ts
let workSchedules: Awaited<ReturnType<typeof getWorkSchedules>> = [];
let myWorkScheduleChangeRequests: Awaited<ReturnType<typeof getMyWorkScheduleChangeRequests>> = [];
let pendingWorkScheduleChangeRequests: Awaited<ReturnType<typeof getPendingWorkScheduleChangeRequests>> | null = null;
```

(`let` 선언부를 기존 변수들과 함께 추가)

```ts
if (profile.role === "admin") {
  const [
    tr, wr, mr, vb, vr, cr, ws, mwscr,
    ata, ap, pvr, cvr, pcr, pwscr,
  ] = await Promise.all([
    ...basePromises,
    getAllTodayAttendance(supabase),
    getCachedAllProfiles(),
    getPendingVacationRequests(supabase),
    getCancelVacationRequests(supabase),
    getPendingCorrectionRequests(supabase),
    getPendingWorkScheduleChangeRequests(supabase),
  ]);
  todayRecord = tr;
  weekRecords = wr;
  monthRecords = mr;
  vacationBalance = vb;
  vacationRequests = vr;
  correctionRequests = cr;
  workSchedules = ws;
  myWorkScheduleChangeRequests = mwscr;
  allTodayAttendance = ata;
  allProfiles = ap;
  pendingVacationRequests = pvr;
  cancelVacationRequests = cvr;
  pendingCorrectionRequests = pcr;
  pendingWorkScheduleChangeRequests = pwscr;
} else {
  const [tr, wr, mr, vb, vr, cr, ws, mwscr] = await Promise.all([
    ...basePromises,
  ]);
  todayRecord = tr;
  weekRecords = wr;
  monthRecords = mr;
  vacationBalance = vb;
  vacationRequests = vr;
  correctionRequests = cr;
  workSchedules = ws;
  myWorkScheduleChangeRequests = mwscr;
}
```

`basePromises`는 `as const`이므로 destructure 길이가 늘어난 만큼 그대로 유효. 변경 후 타입 체크에서 catch.

마지막 `<AttendancePageClient ...>`에 props 추가:
```tsx
workSchedules={workSchedules}
myWorkScheduleChangeRequests={myWorkScheduleChangeRequests}
pendingWorkScheduleChangeRequests={pendingWorkScheduleChangeRequests}
```

- [ ] **Step 2: 타입 체크**

```bash
npx tsc --noEmit
```
기대: `AttendancePageClient`의 props 타입 미스매치 에러. Task 8에서 해결.

- [ ] **Step 3: 커밋**

```bash
git add src/app/dashboard/attendance/page.tsx
git commit -m "페이지: 근무시간 이력/요청 fetch 추가"
```

---

## Task 8: AttendancePageClient — props 확장 + CheckInOutTab prop 변경

**Files:**
- Modify: `src/components/dashboard/attendance/AttendancePageClient.tsx`
- Modify: `src/components/dashboard/attendance/tabs/CheckInOutTab.tsx`

- [ ] **Step 1: AttendancePageClient props 추가**

상단 import에 추가:
```ts
import type {
  // ... 기존
  WorkSchedule,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";
```

`AttendancePageClientProps`에 다음 3개 추가:
```ts
workSchedules: WorkSchedule[];
myWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[] | null;
```

`CheckInOutTab`에 전달하는 props 변경:
```tsx
{activeTab === "checkin" && (
  <CheckInOutTab
    userId={props.profile.id}
    isAdmin={isAdmin}
    todayRecord={props.todayRecord}
    weekRecords={props.weekRecords}
    weekStart={props.weekStart}
    workSchedules={props.workSchedules}
    myChangeRequests={props.myWorkScheduleChangeRequests}
  />
)}
```

(기존의 `workStartTime` / `workEndTime` 제거)

`RecordsTab` 호출에도 props 추가:
```tsx
{activeTab === "records" && (
  <RecordsTab
    profile={props.profile}
    allProfiles={props.allProfiles ?? []}
    workSchedules={props.workSchedules}
  />
)}
```

`AdminTab` 호출에도 props 추가:
```tsx
{activeTab === "admin" && isAdmin && (
  <AdminTab
    adminId={props.profile.id}
    allTodayAttendance={props.allTodayAttendance ?? []}
    allProfiles={props.allProfiles ?? []}
    pendingVacationRequests={props.pendingVacationRequests ?? []}
    cancelVacationRequests={props.cancelVacationRequests ?? []}
    pendingCorrectionRequests={props.pendingCorrectionRequests ?? []}
    pendingWorkScheduleChangeRequests={props.pendingWorkScheduleChangeRequests ?? []}
  />
)}
```

- [ ] **Step 2: CheckInOutTab.tsx 수정**

전체를 다음으로 교체:

```tsx
"use client";

import CheckInOutCard from "../CheckInOutCard";
import WeekSummaryCard from "../WeekSummaryCard";
import WorkScheduleCard from "../WorkScheduleCard";
import type {
  AttendanceRecord,
  WorkSchedule,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";

interface CheckInOutTabProps {
  userId: string;
  isAdmin: boolean;
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  weekStart: string;
  workSchedules: WorkSchedule[];
  myChangeRequests: WorkScheduleChangeRequest[];
}

export default function CheckInOutTab({
  userId,
  isAdmin,
  todayRecord,
  weekRecords,
  weekStart,
  workSchedules,
  myChangeRequests,
}: CheckInOutTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CheckInOutCard userId={userId} todayRecord={todayRecord} />
        <WeekSummaryCard weekRecords={weekRecords} weekStart={weekStart} workSchedules={workSchedules} />
      </div>
      <WorkScheduleCard
        userId={userId}
        isAdmin={isAdmin}
        workSchedules={workSchedules}
        myChangeRequests={myChangeRequests}
      />
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```
기대: `WorkScheduleCard`/`WeekSummaryCard`/`RecordsTab`/`AdminTab` props 미스매치 에러 → 다음 Task들에서 해결.

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/attendance/AttendancePageClient.tsx src/components/dashboard/attendance/tabs/CheckInOutTab.tsx
git commit -m "UI: 근무시간 이력 props 전달"
```

---

## Task 9: WorkScheduleCard 전면 개편

**Files:**
- Modify: `src/components/dashboard/attendance/WorkScheduleCard.tsx`
- Create: `src/components/dashboard/attendance/WorkScheduleChangeRequestModal.tsx`

- [ ] **Step 1: 변경 요청 모달 생성**

`src/components/dashboard/attendance/WorkScheduleChangeRequestModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "phosphor-react";
import { submitWorkScheduleChangeRequest } from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { toDateString } from "@/lib/utils/date";

interface Props {
  currentStart: string;
  currentEnd: string;
  onClose: () => void;
}

export default function WorkScheduleChangeRequestModal({
  currentStart,
  currentEnd,
  onClose,
}: Props) {
  const router = useRouter();
  const today = toDateString();
  const [start, setStart] = useState(currentStart.slice(0, 5));
  const [end, setEnd] = useState(currentEnd.slice(0, 5));
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (effectiveFrom < today) {
      setError("적용 시작일은 오늘 이후여야 합니다.");
      return;
    }
    setSubmitting(true);
    try {
      await submitWorkScheduleChangeRequest({
        startTime: `${start}:00`,
        endTime: `${end}:00`,
        effectiveFrom,
        reason,
      });
      router.refresh();
      onClose();
    } catch (e) {
      setError(getErrorMessage(e, "변경 요청 제출에 실패했습니다."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-slate-800">근무시간 변경 요청</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          요청은 대표 승인 후 지정한 적용 시작일부터 반영됩니다.
        </p>

        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">출근</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">퇴근</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">적용 시작일</label>
            <input
              type="date"
              value={effectiveFrom}
              min={today}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">사유 (선택)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              placeholder="예: 5월부터 출근시간 조정"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold hover:bg-slate-200"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500 disabled:opacity-40"
          >
            {submitting ? "제출 중..." : "요청 제출"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: WorkScheduleCard.tsx 전면 교체**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, FloppyDisk, HourglassMedium } from "phosphor-react";
import {
  setInitialWorkSchedule,
  cancelMyWorkScheduleChangeRequest,
  adminSetWorkSchedule,
} from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { toDateString } from "@/lib/utils/date";
import { getScheduleForDate } from "@/lib/attendance/stats";
import type {
  WorkSchedule,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";
import WorkScheduleChangeRequestModal from "./WorkScheduleChangeRequestModal";

interface Props {
  userId: string;
  isAdmin: boolean;
  workSchedules: WorkSchedule[];
  myChangeRequests: WorkScheduleChangeRequest[];
}

function fmt(t: string) {
  return t.slice(0, 5);
}

export default function WorkScheduleCard({
  userId,
  isAdmin,
  workSchedules,
  myChangeRequests,
}: Props) {
  const router = useRouter();
  const today = toDateString();

  // 비-시드 이력이 0개면 첫 설정 모드
  const hasNonSeedHistory = workSchedules.some((s) => !s.is_initial_seed);

  // 현재 적용 중인 시간
  const current = getScheduleForDate(workSchedules, today);
  const currentStartLabel = fmt(current.workStart);
  const currentEndLabel = fmt(current.workEnd);

  // 미래 예약된 변경 (effective_from > today, 비-시드 행)
  const upcoming = workSchedules
    .filter((s) => !s.is_initial_seed && s.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));

  const pendingRequest = myChangeRequests.find((r) => r.status === "대기중");

  // 폼 상태 (첫 설정 / 관리자 직접 저장 모드)
  const [start, setStart] = useState(
    hasNonSeedHistory ? currentStartLabel : "09:00"
  );
  const [end, setEnd] = useState(
    hasNonSeedHistory ? currentEndLabel : "18:00"
  );
  const [effectiveFromForAdmin, setEffectiveFromForAdmin] = useState(today);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);

  const handleInitialSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await setInitialWorkSchedule(`${start}:00`, `${end}:00`);
      setFeedback({ type: "success", message: "근무시간이 저장되었습니다." });
      router.refresh();
    } catch (e) {
      setFeedback({ type: "error", message: getErrorMessage(e, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  };

  const handleAdminSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await adminSetWorkSchedule({
        userId,
        startTime: `${start}:00`,
        endTime: `${end}:00`,
        effectiveFrom: effectiveFromForAdmin,
      });
      setFeedback({ type: "success", message: "근무시간이 저장되었습니다." });
      router.refresh();
    } catch (e) {
      setFeedback({ type: "error", message: getErrorMessage(e, "저장에 실패했습니다.") });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm("대기 중인 변경 요청을 취소하시겠습니까?")) return;
    try {
      await cancelMyWorkScheduleChangeRequest(id);
      router.refresh();
    } catch (e) {
      setFeedback({ type: "error", message: getErrorMessage(e, "취소에 실패했습니다.") });
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">내 근무시간</h3>
      </div>

      {/* 첫 설정 모드 (직원, 비-시드 이력 0개) */}
      {!hasNonSeedHistory && !isAdmin && (
        <>
          <p className="text-xs text-slate-500 mb-3">
            처음 한 번은 자유롭게 설정할 수 있어요. 이후 변경은 대표 승인이 필요합니다.
          </p>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">출근 시간</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">퇴근 시간</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div className="pt-5">
              <button onClick={handleInitialSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-500 disabled:opacity-40">
                <FloppyDisk size={16} />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* 일반 직원 — 변경 요청 모드 */}
      {hasNonSeedHistory && !isAdmin && (
        <>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 mb-3">
            <div className="text-xs text-slate-500 mb-1">현재 적용 중</div>
            <div className="text-sm font-semibold text-slate-700">
              {currentStartLabel} ~ {currentEndLabel}
            </div>
          </div>

          {upcoming.length > 0 && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-3 text-xs">
              <div className="font-semibold text-blue-700 mb-1">예정된 변경</div>
              {upcoming.map((u) => (
                <div key={u.id} className="text-blue-700">
                  {u.effective_from}부터 {fmt(u.work_start_time)} ~ {fmt(u.work_end_time)}
                </div>
              ))}
            </div>
          )}

          {pendingRequest ? (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-3">
              <div className="flex items-center gap-2 mb-1">
                <HourglassMedium size={16} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">승인 대기 중</span>
              </div>
              <div className="text-sm text-amber-800">
                {fmt(pendingRequest.requested_start_time)} ~ {fmt(pendingRequest.requested_end_time)}
                <span className="text-xs text-amber-600 ml-2">
                  (적용일: {pendingRequest.effective_from})
                </span>
              </div>
              {pendingRequest.reason && (
                <div className="text-xs text-amber-700 mt-1">사유: {pendingRequest.reason}</div>
              )}
              <button
                onClick={() => handleCancelRequest(pendingRequest.id)}
                className="mt-2 text-xs text-amber-700 underline"
              >
                요청 취소
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowRequestModal(true)}
              className="w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500"
            >
              변경 요청
            </button>
          )}
        </>
      )}

      {/* 관리자 — 즉시 저장 모드 */}
      {isAdmin && (
        <>
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 mb-3">
            <div className="text-xs text-slate-500 mb-1">현재 적용 중</div>
            <div className="text-sm font-semibold text-slate-700">
              {currentStartLabel} ~ {currentEndLabel}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">출근</label>
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">퇴근</label>
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">적용 시작일</label>
              <input type="date" value={effectiveFromForAdmin}
                onChange={(e) => setEffectiveFromForAdmin(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            </div>
          </div>
          <button onClick={handleAdminSave} disabled={saving}
            className="mt-3 w-full py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500 disabled:opacity-40">
            {saving ? "저장 중..." : "즉시 저장 (관리자)"}
          </button>
        </>
      )}

      {feedback && (
        <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${
          feedback.type === "success"
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {feedback.message}
        </div>
      )}

      {showRequestModal && (
        <WorkScheduleChangeRequestModal
          currentStart={current.workStart}
          currentEnd={current.workEnd}
          onClose={() => setShowRequestModal(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```
기대: WorkScheduleCard 관련 에러 해결. 남은 에러: WeekSummaryCard / RecordsTab / AdminTab.

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/attendance/WorkScheduleCard.tsx src/components/dashboard/attendance/WorkScheduleChangeRequestModal.tsx
git commit -m "UI: WorkScheduleCard 첫설정/변경요청/관리자 모드 분기"
```

---

## Task 10: WeekSummaryCard — schedules prop 적용

**Files:**
- Modify: `src/components/dashboard/attendance/WeekSummaryCard.tsx`

- [ ] **Step 1: WeekSummaryCard 읽기**

먼저 현재 파일을 읽어 `calcAttendanceStats` 또는 단일 시간 사용처 확인.

```bash
# (분석용 — 도구로는 Read)
```

- [ ] **Step 2: props에 `workSchedules: WorkSchedule[]` 추가, 통계 호출 변경**

기존:
```tsx
calcAttendanceStats(weekRecords, workStartTime, workEndTime)
```
변경:
```tsx
calcAttendanceStats(weekRecords, workSchedules)
```

import에 `WorkSchedule` 타입 추가, props에서 `workStartTime`/`workEndTime` 제거.

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/attendance/WeekSummaryCard.tsx
git commit -m "UI: WeekSummaryCard schedules 기반 계산"
```

---

## Task 11: RecordsTab + 하위 컴포넌트 — schedules 전파

**Files:**
- Modify: `src/components/dashboard/attendance/tabs/RecordsTab.tsx`
- Modify: `src/components/dashboard/attendance/tabs/records/RecordsDetailTable.tsx`
- Modify: `src/components/dashboard/attendance/tabs/records/AttendanceCharts.tsx`
- Modify: `src/components/dashboard/attendance/tabs/records/RecordsSummaryCards.tsx`
- Modify: `src/components/dashboard/attendance/tabs/records/AdminRecordsView.tsx`

- [ ] **Step 1: 각 파일을 Read해서 현재 시그니처 파악**

각 파일에서 `calcAttendanceStats` 호출 위치, 그리고 `workStartTime` / `workEndTime` / `profile.work_start_time` 사용처 모두 식별.

- [ ] **Step 2: 일관 변경**

각 파일에서:
1. props에 `workSchedules: WorkSchedule[]` 추가
2. `calcAttendanceStats(records, workStart, workEnd)` → `calcAttendanceStats(records, workSchedules)`
3. 일별 표시(`RecordsDetailTable`)에서 지각 여부 판정 시 `getScheduleForDate(workSchedules, record.work_date)` 사용
4. 부모에서 자식으로 `workSchedules` prop 전파

`RecordsTab.tsx`는 props에 `workSchedules` 받아 하위 컴포넌트에 전달.

`AdminRecordsView.tsx`는 직원 선택 시 해당 직원의 schedules도 fetch 필요. 클라이언트 컴포넌트에서 직접 supabase fetch:

```tsx
import { createClient } from "@/lib/supabase/client";
import { getWorkSchedulesForUser } from "@/lib/attendance/queries";
// ...
const [employeeSchedules, setEmployeeSchedules] = useState<WorkSchedule[]>([]);
useEffect(() => {
  if (!selectedEmployee) return;
  getWorkSchedulesForUser(createClient(), selectedEmployee.id).then(setEmployeeSchedules);
}, [selectedEmployee]);
```

그리고 통계 호출에 `employeeSchedules` 전달.

- [ ] **Step 3: 타입 체크 + 빌드**

```bash
npx tsc --noEmit
npm run build
```
기대: 빌드 성공.

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/attendance/tabs/RecordsTab.tsx src/components/dashboard/attendance/tabs/records/
git commit -m "UI: 기록 탭 schedules 기반 계산"
```

---

## Task 12: AdminTab — 변경 요청 승인 섹션

**Files:**
- Modify: `src/components/dashboard/attendance/tabs/AdminTab.tsx`
- Create: `src/components/dashboard/attendance/AdminWorkScheduleRequests.tsx`

- [ ] **Step 1: AdminWorkScheduleRequests 생성**

`src/components/dashboard/attendance/AdminWorkScheduleRequests.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClockClockwise } from "phosphor-react";
import {
  approveWorkScheduleChangeRequest,
  rejectWorkScheduleChangeRequest,
} from "@/lib/attendance/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import type { WorkScheduleChangeRequest } from "@/lib/attendance/types";

interface Props {
  adminId: string;
  requests: WorkScheduleChangeRequest[];
}

function fmt(t: string) {
  return t.slice(0, 5);
}

export default function AdminWorkScheduleRequests({ adminId, requests }: Props) {
  const router = useRouter();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await approveWorkScheduleChangeRequest(id, adminId);
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, "승인에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await rejectWorkScheduleChangeRequest(id, adminId, reason);
      setRejectingId(null);
      setReason("");
      router.refresh();
    } catch (e) {
      setError(getErrorMessage(e, "반려에 실패했습니다."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <ClockClockwise size={20} className="text-slate-400" />
        <h3 className="text-base font-bold text-slate-800">근무시간 변경 요청</h3>
        {requests.length > 0 && (
          <span className="bg-red-50 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
            {requests.length}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">대기 중인 변경 요청이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((req) => (
            <li key={req.id} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  {req.profiles?.full_name ?? "—"}
                </span>
                <span className="text-xs text-slate-400">적용일: {req.effective_from}</span>
              </div>
              <div className="text-sm text-slate-700 mb-1">
                요청: <span className="font-semibold">{fmt(req.requested_start_time)} ~ {fmt(req.requested_end_time)}</span>
              </div>
              {req.reason && (
                <p className="text-xs text-slate-500 mb-2">사유: {req.reason}</p>
              )}
              {rejectingId === req.id ? (
                <div className="flex gap-2 mt-2">
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="반려 사유"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs border border-slate-200"
                  />
                  <button onClick={() => handleReject(req.id)} disabled={loading || !reason.trim()}
                    className="px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg disabled:opacity-40">확인</button>
                  <button onClick={() => { setRejectingId(null); setReason(""); }}
                    className="px-3 py-1.5 bg-slate-200 text-slate-600 text-xs font-medium rounded-lg">취소</button>
                </div>
              ) : (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleApprove(req.id)} disabled={loading}
                    className="flex-1 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 disabled:opacity-40">승인</button>
                  <button onClick={() => setRejectingId(req.id)} disabled={loading}
                    className="flex-1 py-2 bg-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-300 disabled:opacity-40">반려</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: AdminTab.tsx 수정**

```tsx
"use client";

import AdminAttendanceTable from "../AdminAttendanceTable";
import AdminVacationRequests from "../AdminVacationRequests";
import AdminWorkScheduleRequests from "../AdminWorkScheduleRequests";
import type {
  AttendanceWithProfile,
  Profile,
  VacationRequest,
  CorrectionRequest,
  WorkScheduleChangeRequest,
} from "@/lib/attendance/types";

interface AdminTabProps {
  adminId: string;
  allTodayAttendance: AttendanceWithProfile[];
  allProfiles: Profile[];
  pendingVacationRequests: VacationRequest[];
  cancelVacationRequests: VacationRequest[];
  pendingCorrectionRequests: CorrectionRequest[];
  pendingWorkScheduleChangeRequests: WorkScheduleChangeRequest[];
}

export default function AdminTab({
  adminId,
  allTodayAttendance,
  allProfiles,
  pendingVacationRequests,
  cancelVacationRequests,
  pendingCorrectionRequests,
  pendingWorkScheduleChangeRequests,
}: AdminTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <AdminAttendanceTable todayAttendance={allTodayAttendance} allProfiles={allProfiles} />
      <div className="space-y-6">
        <AdminVacationRequests
          adminId={adminId}
          vacationRequests={pendingVacationRequests}
          cancelRequests={cancelVacationRequests}
          correctionRequests={pendingCorrectionRequests}
        />
        <AdminWorkScheduleRequests
          adminId={adminId}
          requests={pendingWorkScheduleChangeRequests}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 빌드 검증**

```bash
npm run build
```
기대: 빌드 성공, 모든 타입 에러 해소.

- [ ] **Step 4: 커밋**

```bash
git add src/components/dashboard/attendance/AdminWorkScheduleRequests.tsx src/components/dashboard/attendance/tabs/AdminTab.tsx
git commit -m "UI: 관리자 근무시간 변경요청 승인 섹션"
```

---

## Task 13: 수동 검증

**준비:** 로컬 개발 서버 실행

```bash
npm run dev
```

- [ ] **Step 1: 신규 직원 첫 설정 확인**

  1. 새 테스트 계정 또는 비-시드 이력이 0개인 직원으로 로그인
  2. 근태관리 → 출퇴근 탭 → "내 근무시간" 카드에 첫 설정 모드 (출근/퇴근/저장)가 보이는지
  3. 시간 입력 → 저장 → 성공 메시지 확인
  4. 페이지 새로고침 후 카드가 "변경 요청 모드"로 바뀌는지 확인

- [ ] **Step 2: 변경 요청 흐름**

  1. 같은 계정에서 "변경 요청" 클릭 → 모달 등장
  2. 새 시간 + 적용 시작일(오늘 이후) + 사유 입력 → 제출
  3. "승인 대기 중" 카드 표시 확인
  4. 관리자 계정으로 로그인 → 관리자 탭 → "근무시간 변경 요청" 섹션에 카드 표시
  5. 알림이 관리자에게 도착했는지 (벨 아이콘) 확인

- [ ] **Step 3: 승인 / 적용 확인**

  1. 관리자 → 승인 클릭
  2. 직원 계정 새로고침 → "예정된 변경" 영역에 effective_from + 새 시간 표시 (effective_from이 미래인 경우)
  3. effective_from을 오늘로 한 번 더 테스트 → "현재 적용 중"이 즉시 갱신되는지

- [ ] **Step 4: 반려 흐름**

  1. 직원이 새 변경 요청 제출
  2. 관리자 → 반려 버튼 → 사유 입력 → 확인
  3. 직원에게 알림 도착, 카드에서 대기중 사라짐, 현재 적용 중 시간 유지 확인

- [ ] **Step 5: 기록 탭 — 기간별 다른 기준 확인**

  관리자 권한으로 직접 SQL 또는 admin 폼으로 한 직원에게 미래 일자가 아닌 과거 일자(테스트 목적, admin 모드는 과거도 허용) 기준 행을 추가:
  - `effective_from = 4월 1일`, 09:00/18:00
  - `effective_from = 4월 5일`, 08:30/18:30

  해당 직원의 기록 탭 조회 시 4월 1~4일 기록과 4월 5일 이후 기록의 지각 판정이 다른 기준으로 계산되는지 확인.

- [ ] **Step 6: 관리자 본인 즉시 저장**

  관리자 계정에서 카드가 "관리자 즉시 저장 모드"로 표시되는지, 저장 시 즉시 반영되는지 확인.

- [ ] **Step 7: 빌드 / 린트 통과**

```bash
npm run build
npm run lint
```
기대: 둘 다 에러 없이 통과.

- [ ] **Step 8: 최종 커밋 (수정 사항 있을 시)**

검증 중 발견된 버그 픽스가 있다면:
```bash
git add -p
git commit -m "픽스: <발견된 문제 요약>"
```

---

## 검증 체크리스트 (스펙 커버리지)

- [x] 첫 1회 직접 설정 — Task 9 첫 설정 모드, Task 2 `set_initial_work_schedule`
- [x] 이후 변경은 수정요청 — Task 9 모달, Task 5 액션, Task 2 RPC
- [x] 관리자 승인 시 실제 반영 — Task 12 승인 UI, Task 2 `approve_work_schedule_change_request`
- [x] 반려 시 기존 유지 — Task 2 reject RPC는 work_schedules 변경 X
- [x] 변경 시점 기준 기간 분리 (이력 구조) — Task 1 테이블, Task 6 `getScheduleForDate`
- [x] 과거 기록은 그날의 기준으로 계산 — Task 6 `calcAttendanceStats` 시그니처 변경
- [x] 정상/지각/평균 모두 그날 기준 — Task 6 + Task 11
- [x] 과거 기록 유지, 변경 이후만 새 기준 — Task 1 시드 + A안 (effective_from 단일 키)
- [x] 기존 직원 1회 자유 수정 기회 — `is_initial_seed=true` + Task 2 `non_seed_count` 검사

---

## 후속 작업 (이번 PR 범위 외)

- `profiles.work_start_time` / `work_end_time` 컬럼 드롭 (별도 마이그레이션)
- 변경 요청 이력 페이지네이션
- effective_from을 관리자가 승인 시점에 조정하는 기능
