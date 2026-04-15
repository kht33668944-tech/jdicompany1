# 점심시간 자동 공제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 근무시간에서 점심 1시간을 자동 공제(실근무 > 4시간일 때만), 기존 기록 소급 재계산.

**Architecture:** `attendance_records.total_minutes` (GENERATED 컬럼)의 계산식을 수정하는 단일 마이그레이션. 클라이언트 코드는 변경 없음 — 이 컬럼을 소비하는 모든 통계/차트가 자동으로 공제된 값을 받는다.

**Tech Stack:** Supabase (PostgreSQL), Next.js 16

**Spec:** `docs/superpowers/specs/2026-04-15-lunch-time-deduction-design.md`

---

## File Structure

- Create: `supabase/migrations/065_lunch_deduction.sql` — GENERATED 컬럼 재정의

**변경하지 않음:** `src/lib/attendance/stats.ts`, `WeekSummaryCard.tsx`, `AttendanceCharts.tsx`, `RecordsSummaryCards.tsx`, `AttendanceTable.tsx`, `QuickStatsWidget.tsx`, `src/lib/dashboard/queries.ts` — 모두 `total_minutes` 컬럼값을 그대로 사용하므로 자동 반영.

---

### Task 1: 마이그레이션 작성

**Files:**
- Create: `supabase/migrations/065_lunch_deduction.sql`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/065_lunch_deduction.sql`:

```sql
-- 점심시간 1시간 자동 공제
-- 정책: check_out - check_in > 240분(4시간)일 때만 60분 차감
-- GENERATED 컬럼이므로 기존 모든 행이 자동 재계산됨 (소급 적용)

BEGIN;

ALTER TABLE public.attendance_records
  DROP COLUMN total_minutes;

ALTER TABLE public.attendance_records
  ADD COLUMN total_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN
        CASE
          WHEN EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60 > 240
          THEN (EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60) - 60
          ELSE  EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60
        END
      ELSE NULL
    END
  ) STORED;

COMMIT;
```

- [ ] **Step 2: 로컬에서 마이그레이션 적용**

Run: `npx supabase db push` (또는 `npx supabase migration up`)
Expected: 마이그레이션 065가 성공적으로 적용됨. 에러 없음.

- [ ] **Step 3: 기존 데이터 검증 쿼리 실행**

Run:
```sql
SELECT
  id,
  EXTRACT(EPOCH FROM (check_out - check_in))::INT / 60 AS raw_minutes,
  total_minutes,
  total_minutes - (EXTRACT(EPOCH FROM (check_out - check_in))::INT / 60) AS diff
FROM public.attendance_records
WHERE check_in IS NOT NULL AND check_out IS NOT NULL
ORDER BY raw_minutes DESC
LIMIT 20;
```

Expected:
- `raw_minutes > 240` 행은 `diff = -60`
- `raw_minutes <= 240` 행은 `diff = 0`

- [ ] **Step 4: 커밋**

```bash
git add supabase/migrations/065_lunch_deduction.sql
git commit -m "기능: 근무시간에서 점심 1시간 자동 공제 (실근무 4시간 초과 시)"
```

---

### Task 2: 타입·빌드 검증

**Files:** 변경 없음. 클라이언트 영향 확인.

- [ ] **Step 1: 린트 실행**

Run: `npm run lint`
Expected: 에러 없음.

- [ ] **Step 2: 빌드 실행**

Run: `npm run build`
Expected: 빌드 성공.

- [ ] **Step 3: 수동 UI 확인**

Run: `npm run dev`
확인할 페이지:
- `/dashboard/attendance` — 근태 요약 카드 숫자가 이전보다 1시간 적게 보이는지 (4시간 초과 근무 날짜만)
- `/dashboard/attendance` 내 주간/월간 차트 — 에러 없이 렌더
- `/dashboard` 메인 — QuickStatsWidget 평균 근무시간

Expected: 모두 정상 렌더, 숫자가 공제된 값으로 표시.

---

### Task 3: 문서 업데이트

**Files:**
- Modify: `src/components/dashboard/attendance/CLAUDE.md`

- [ ] **Step 1: 도메인 규칙에 점심 공제 메모 추가**

`src/components/dashboard/attendance/CLAUDE.md` 끝에 섹션 추가:

```markdown
## 점심시간 공제

- `attendance_records.total_minutes` GENERATED 컬럼에서 자동 처리
- 정책: `check_out - check_in > 240분`일 때만 -60분
- 클라이언트는 이 컬럼값을 그대로 소비 (별도 공제 로직 없음)
- 정책 변경 시 migration 065 식만 수정
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/dashboard/attendance/CLAUDE.md
git commit -m "문서: 근태 도메인에 점심시간 공제 규칙 추가"
```

---

## 롤백 절차

문제 발생 시 `066_revert_lunch_deduction.sql` 생성:

```sql
BEGIN;
ALTER TABLE public.attendance_records DROP COLUMN total_minutes;
ALTER TABLE public.attendance_records
  ADD COLUMN total_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN check_in IS NOT NULL AND check_out IS NOT NULL
    THEN EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60
    ELSE NULL END
  ) STORED;
COMMIT;
```
