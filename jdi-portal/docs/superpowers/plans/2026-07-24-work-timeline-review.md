# 업무보고 검토 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 업무 타임라인 상세 화면에서 검토를 요청하면 작성자에게 보완 할일이 자동 생성되고, 보완 완료 후 검토자가 승인/반려하는 흐름을 포털 안에 만든다.

**Architecture:** 업무지시(directives, 마이그레이션 103/105)의 "요청 본문 + 상태 + tasks 연결 + SECURITY DEFINER RPC + 대시보드 인박스 + 재촉" 패턴을 대칭 복제한다. 상태 전이는 전부 RPC로만, 업무보고 완료 감지는 tasks 트리거로 자동화한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase(Postgres + RLS + RPC + Realtime), Tailwind CSS 4, `pg` 직접 풀(빠른 경로), pg_cron.

설계: `docs/superpowers/specs/2026-07-24-work-timeline-review-design.md`
시안(참고): <https://claude.ai/code/artifact/b7b2f085-729a-4b8c-8744-93c7dde4bb62>

## Global Constraints

- Node ≥ 22, TypeScript strict, `@/*` → `jdi-portal/src/*`. 모든 작업은 `jdi-portal/` 안에서.
- **KST 날짜**: SQL에서 `NOW()`/`CURRENT_DATE`를 그대로 쓰지 말고 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`.
- **RLS**: 사용자 데이터 테이블은 RLS 활성 + `public.is_approved_user()`. `SECURITY DEFINER` 함수는 내부에서 `auth.uid()`·권한·상태 재검증. UPDATE 정책은 만들지 않고 RPC로만 상태 전이.
- **Supabase 응답**: `error`를 무시하고 `data`만 처리하지 않는다.
- **성능 불변조건**: 매 대시보드 로드가 읽는 경로는 부분 인덱스. 빠른 경로(`pg`)와 Supabase RPC 폴백 **양쪽**을 함께 수정. 작업 후 `npm run test:performance`(40개) 통과 필수.
- **마이그레이션**: 현재 최신 `105`. 새 파일 `107_work_timeline_reviews.sql`로 **추가**(기존 수정 금지). `db push --linked`는 운영 DB 변경이므로 **사용자 확인 후** 실행.
- **서버/클라이언트 경계**: `"use client"`는 필요한 곳만. 서버 전용 키 노출 금지.
- **커밋**: 사용자가 요청하지 않은 `git push`/강제 푸시 금지. 커밋 메시지는 한국어, 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 상태 리터럴(코드 전반 통일): review.state = `'open' | 'submitted' | 'approved' | 'cancelled'`. event.kind = `'requested' | 'submitted' | 'approved' | 'rejected' | 'cancelled'`. 알림 타입 = `'timeline_review_requested' | 'timeline_review_submitted' | 'timeline_review_resolved'`. 할일 제목 접두어 = `'[검토 보완] '`.

---

## Phase 1 — DB (마이그레이션 107)

> 아래 Task 1~4는 **같은 파일** `supabase/migrations/107_work_timeline_reviews.sql`에 섹션을 순서대로 append 한다. 파일은 Task 5에서 한 번에 적용·검증한다. 각 Task는 "파일에 섹션 추가 + SQL 문법 자체 점검"까지가 deliverable이며, 커밋은 Task 5에서 모아서 한다(하나의 마이그레이션은 원자적 단위).

### Task 1: 테이블·인덱스·RLS

**Files:**
- Create: `jdi-portal/supabase/migrations/107_work_timeline_reviews.sql` (섹션 1)

**Interfaces:**
- Produces 테이블 `work_timeline_reviews`(컬럼: id, entry_id, reviewer_id, author_id, task_id, comment, state, created_at, resolved_at, reminded_on, updated_at), `work_timeline_review_events`(id, review_id, actor_id, kind, note, created_at), `tasks.review_id` 컬럼.

- [ ] **Step 1: 마이그레이션 파일 생성 — 헤더 + 테이블 + 인덱스 + tasks 컬럼 + RLS**

```sql
-- ============================================================
-- 107: 업무보고 검토 (work timeline reviews)
--   설계: docs/superpowers/specs/2026-07-24-work-timeline-review-design.md
--   계획: docs/superpowers/plans/2026-07-24-work-timeline-review.md
--   선례: 103_work_directives.sql (동일 패턴)
-- ============================================================

-- ---------- 검토 본문·상태 ----------
CREATE TABLE public.work_timeline_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.work_timeline_entries(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  comment TEXT NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 2000),
  state TEXT NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'submitted', 'approved', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  reminded_on DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 업무보고당 진행 중(open/submitted) 검토는 1건만
CREATE UNIQUE INDEX work_timeline_reviews_active_unique
  ON public.work_timeline_reviews (entry_id)
  WHERE state IN ('open', 'submitted');

-- 대시보드/재촉이 매번 읽는 경로: 부분 인덱스 (전체 스캔 금지)
CREATE INDEX work_timeline_reviews_author_open
  ON public.work_timeline_reviews (author_id, created_at DESC)
  WHERE state = 'open';
CREATE INDEX work_timeline_reviews_reviewer_submitted
  ON public.work_timeline_reviews (reviewer_id, created_at DESC)
  WHERE state = 'submitted';
CREATE INDEX work_timeline_reviews_entry
  ON public.work_timeline_reviews (entry_id, created_at DESC);

-- ---------- 이력 타임라인 ----------
CREATE TABLE public.work_timeline_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id UUID NOT NULL REFERENCES public.work_timeline_reviews(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('requested', 'submitted', 'approved', 'rejected', 'cancelled')),
  note TEXT CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_timeline_review_events_review
  ON public.work_timeline_review_events (review_id, created_at);

-- ---------- 할일 연결 ----------
ALTER TABLE public.tasks
  ADD COLUMN review_id UUID
    REFERENCES public.work_timeline_reviews(id) ON DELETE SET NULL;

-- 검토 1건당 보완 할일 1개 보장
CREATE UNIQUE INDEX tasks_review_unique
  ON public.tasks (review_id)
  WHERE review_id IS NOT NULL;

-- ---------- RLS ----------
ALTER TABLE public.work_timeline_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_timeline_review_events ENABLE ROW LEVEL SECURITY;

-- 검토 의견은 당사자(요청자·작성자)와 관리자만 조회
CREATE POLICY "검토: 당사자·관리자 조회"
  ON public.work_timeline_reviews FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      reviewer_id = auth.uid()
      OR author_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

CREATE POLICY "검토이력: 검토를 볼 수 있으면 조회"
  ON public.work_timeline_review_events FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.work_timeline_reviews r
      WHERE r.id = work_timeline_review_events.review_id
        AND (
          r.reviewer_id = auth.uid()
          OR r.author_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role = 'admin'
          )
        )
    )
  );

-- INSERT/UPDATE/DELETE 정책은 만들지 않는다.
-- 모든 쓰기는 아래 RPC(SECURITY DEFINER)로만 가능하다.
```

- [ ] **Step 2: SQL 문법 자체 점검**

Run: `cd jdi-portal && node -e "const s=require('fs').readFileSync('supabase/migrations/107_work_timeline_reviews.sql','utf8'); const o=(s.match(/\(/g)||[]).length, c=(s.match(/\)/g)||[]).length; if(o!==c) throw new Error('괄호 불균형 '+o+'/'+c); console.log('괄호 균형 OK', o);"`
Expected: `괄호 균형 OK <n>` (에러 없이 종료). 세미콜론으로 각 문이 끝나는지 육안 확인.

### Task 2: 완료 감지 트리거

**Files:**
- Modify: `jdi-portal/supabase/migrations/107_work_timeline_reviews.sql` (섹션 2 append)

**Interfaces:**
- Produces 트리거 함수 `public.sync_review_on_task_status()` + `AFTER UPDATE OF status ON tasks` 트리거. 할일이 `완료` 진입 시 연결 검토를 `submitted`로, 이탈 시 `open`으로 되돌리고 이벤트·알림 기록.

- [ ] **Step 1: 트리거 함수·트리거 append**

```sql
-- ---------- 보완 할일 완료 감지 ----------
-- 검토와 연결된 할일(review_id)의 status 변화를 감지해 검토 상태를 자동 전이한다.
CREATE OR REPLACE FUNCTION public.sync_review_on_task_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_author_name TEXT;
BEGIN
  IF NEW.review_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 완료 진입: open -> submitted
  IF NEW.status = '완료' AND (OLD.status IS DISTINCT FROM '완료') THEN
    UPDATE public.work_timeline_reviews
      SET state = 'submitted', updated_at = NOW()
      WHERE id = NEW.review_id AND state = 'open'
      RETURNING * INTO v_rev;

    IF FOUND THEN
      INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind)
      VALUES (v_rev.id, v_rev.author_id, 'submitted');

      SELECT full_name INTO v_author_name FROM public.profiles WHERE id = v_rev.author_id;

      IF v_rev.reviewer_id <> v_rev.author_id THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (
          v_rev.reviewer_id,
          'timeline_review_submitted',
          '보완이 완료됐어요',
          COALESCE(v_author_name, '작성자') || '님이 검토 보완을 끝냈습니다. 확인해 주세요.',
          '/dashboard/work-timeline/' || v_rev.entry_id
        );
      END IF;
    END IF;

  -- 완료 이탈(재오픈): submitted -> open (정합성 유지)
  ELSIF OLD.status = '완료' AND NEW.status <> '완료' THEN
    UPDATE public.work_timeline_reviews
      SET state = 'open', updated_at = NOW()
      WHERE id = NEW.review_id AND state = 'submitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_sync_review_on_status
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_review_on_task_status();
```

- [ ] **Step 2: 괄호 균형 재점검**

Run: `cd jdi-portal && node -e "const s=require('fs').readFileSync('supabase/migrations/107_work_timeline_reviews.sql','utf8'); const o=(s.match(/\(/g)||[]).length, c=(s.match(/\)/g)||[]).length; if(o!==c) throw new Error('괄호 불균형 '+o+'/'+c); console.log('OK');"`
Expected: `OK`

### Task 3: RPC (요청/승인/반려/취소)

**Files:**
- Modify: `jdi-portal/supabase/migrations/107_work_timeline_reviews.sql` (섹션 3 append)

**Interfaces:**
- Produces:
  - `request_timeline_review(p_entry_id UUID, p_comment TEXT) RETURNS UUID` — 검토 id 반환
  - `approve_timeline_review(p_review_id UUID, p_note TEXT DEFAULT NULL) RETURNS VOID`
  - `reject_timeline_review(p_review_id UUID, p_note TEXT) RETURNS VOID`
  - `cancel_timeline_review(p_review_id UUID) RETURNS VOID`
- Consumes: `work_timeline_entries(user_id, title)`, `tasks`, `task_assignees(task_id, user_id)`, `notifications`, `profiles(role, is_approved, full_name)`.

- [ ] **Step 1: 요청 RPC append**

```sql
-- ---------- 검토 요청 ----------
CREATE OR REPLACE FUNCTION public.request_timeline_review(p_entry_id UUID, p_comment TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_entry public.work_timeline_entries%ROWTYPE;
  v_is_admin BOOLEAN;
  v_comment TEXT;
  v_review_id UUID;
  v_task_id UUID;
  v_position INTEGER;
  v_reviewer_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  v_comment := btrim(COALESCE(p_comment, ''));
  IF v_comment = '' THEN
    RAISE EXCEPTION '검토 의견을 입력해 주세요.';
  END IF;
  IF char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION '검토 의견은 2000자 이하로 입력해 주세요.';
  END IF;

  SELECT * INTO v_entry FROM public.work_timeline_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '업무보고를 찾을 수 없습니다.';
  END IF;

  v_is_admin := EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'admin');
  -- 권한: 관리자 또는 업무보고 작성자 본인
  IF NOT v_is_admin AND v_entry.user_id <> v_uid THEN
    RAISE EXCEPTION '검토를 요청할 권한이 없습니다.';
  END IF;

  -- 진행 중 검토 1건 제한 (부분 유니크가 최종 방어, 여기서 친절한 메시지)
  IF EXISTS (
    SELECT 1 FROM public.work_timeline_reviews r
    WHERE r.entry_id = p_entry_id AND r.state IN ('open', 'submitted')
  ) THEN
    RAISE EXCEPTION '이미 진행 중인 검토가 있습니다.';
  END IF;

  INSERT INTO public.work_timeline_reviews (entry_id, reviewer_id, author_id, comment, state)
  VALUES (p_entry_id, v_uid, v_entry.user_id, v_comment, 'open')
  RETURNING id INTO v_review_id;

  -- 보완 할일 생성 (상태별 독립 순서 — tasks CLAUDE.md)
  SELECT COALESCE(MAX(t.position), 0) + 1 INTO v_position FROM public.tasks t WHERE t.status = '대기';

  INSERT INTO public.tasks (title, description, status, priority, position, created_by, review_id)
  VALUES (
    '[검토 보완] ' || v_entry.title,
    v_comment,
    '대기',
    '보통',
    v_position,
    v_uid,
    v_review_id
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.task_assignees (task_id, user_id) VALUES (v_task_id, v_entry.user_id);

  UPDATE public.work_timeline_reviews SET task_id = v_task_id WHERE id = v_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (v_review_id, v_uid, 'requested', v_comment);

  -- 작성자에게 알림 (요청자 ≠ 작성자일 때)
  IF v_entry.user_id <> v_uid THEN
    SELECT full_name INTO v_reviewer_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_entry.user_id,
      'timeline_review_requested',
      '검토 요청이 도착했어요',
      COALESCE(v_reviewer_name, '검토자') || '님이 "' || v_entry.title || '"에 검토 의견을 남겼습니다.',
      '/dashboard/work-timeline/' || p_entry_id
    );
  END IF;

  RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_timeline_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_timeline_review(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: 승인/반려/취소 RPC append**

```sql
-- ---------- 공통: 검토자·관리자 권한 확인 헬퍼 ----------
CREATE OR REPLACE FUNCTION public.assert_can_resolve_review(p_review public.work_timeline_reviews)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF p_review.reviewer_id <> v_uid
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.role = 'admin') THEN
    RAISE EXCEPTION '이 검토를 처리할 권한이 없습니다.';
  END IF;
END;
$$;

-- ---------- 승인 ----------
CREATE OR REPLACE FUNCTION public.approve_timeline_review(p_review_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_note TEXT;
  v_reviewer_name TEXT;
BEGIN
  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;
  PERFORM public.assert_can_resolve_review(v_rev);
  IF v_rev.state <> 'submitted' THEN
    RAISE EXCEPTION '보완이 완료된 검토만 승인할 수 있습니다.';
  END IF;
  v_note := NULLIF(btrim(COALESCE(p_note, '')), '');

  UPDATE public.work_timeline_reviews
    SET state = 'approved', resolved_at = NOW(), updated_at = NOW()
    WHERE id = p_review_id;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (p_review_id, v_uid, 'approved', v_note);

  IF v_rev.author_id <> v_uid THEN
    SELECT full_name INTO v_reviewer_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_rev.author_id, 'timeline_review_resolved', '검토가 승인됐어요',
      COALESCE(v_reviewer_name, '검토자') || '님이 검토를 승인했습니다.',
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_timeline_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_timeline_review(UUID, TEXT) TO authenticated;

-- ---------- 반려 (재보완 루프) ----------
CREATE OR REPLACE FUNCTION public.reject_timeline_review(p_review_id UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
  v_note TEXT;
  v_reviewer_name TEXT;
  v_position INTEGER;
BEGIN
  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;
  PERFORM public.assert_can_resolve_review(v_rev);
  IF v_rev.state <> 'submitted' THEN
    RAISE EXCEPTION '보완이 완료된 검토만 반려할 수 있습니다.';
  END IF;
  v_note := btrim(COALESCE(p_note, ''));
  IF v_note = '' THEN RAISE EXCEPTION '반려 사유를 입력해 주세요.'; END IF;

  -- 검토를 open으로 되돌린다
  UPDATE public.work_timeline_reviews
    SET state = 'open', updated_at = NOW()
    WHERE id = p_review_id;

  -- 연결 할일을 대기로 재오픈 (트리거는 open->이미 처리했으므로 여기서 직접).
  -- 주의: 이 UPDATE가 sync_review_on_task_status를 다시 타지만 status가 '완료'->'대기'이고
  -- 검토는 이미 open이라 재전이 조건(submitted)에 걸리지 않아 무한루프 없음.
  SELECT COALESCE(MAX(t.position), 0) + 1 INTO v_position FROM public.tasks t WHERE t.status = '대기';
  IF v_rev.task_id IS NOT NULL THEN
    UPDATE public.tasks SET status = '대기', position = v_position WHERE id = v_rev.task_id;
  END IF;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind, note)
  VALUES (p_review_id, v_uid, 'rejected', v_note);

  IF v_rev.author_id <> v_uid THEN
    SELECT full_name INTO v_reviewer_name FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_rev.author_id, 'timeline_review_resolved', '검토가 반려됐어요',
      COALESCE(v_reviewer_name, '검토자') || '님이 재보완을 요청했습니다. 사유: ' || v_note,
      '/dashboard/work-timeline/' || v_rev.entry_id
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_timeline_review(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_timeline_review(UUID, TEXT) TO authenticated;

-- ---------- 요청 취소 (철회) ----------
CREATE OR REPLACE FUNCTION public.cancel_timeline_review(p_review_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rev public.work_timeline_reviews%ROWTYPE;
BEGIN
  SELECT * INTO v_rev FROM public.work_timeline_reviews WHERE id = p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '검토를 찾을 수 없습니다.'; END IF;
  PERFORM public.assert_can_resolve_review(v_rev);
  IF v_rev.state NOT IN ('open', 'submitted') THEN
    RAISE EXCEPTION '이미 종료된 검토입니다.';
  END IF;

  UPDATE public.work_timeline_reviews
    SET state = 'cancelled', resolved_at = NOW(), updated_at = NOW()
    WHERE id = p_review_id;

  -- 보완 할일은 남기되 검토 취소 표시 (열린 질문 결정: 남김 + 제목 표기)
  IF v_rev.task_id IS NOT NULL THEN
    UPDATE public.tasks
      SET title = title || ' (검토 취소)'
      WHERE id = v_rev.task_id AND title NOT LIKE '%(검토 취소)';
  END IF;

  INSERT INTO public.work_timeline_review_events (review_id, actor_id, kind)
  VALUES (p_review_id, v_uid, 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_timeline_review(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_timeline_review(UUID) TO authenticated;
```

- [ ] **Step 3: 괄호 균형 재점검**

Run: `cd jdi-portal && node -e "const s=require('fs').readFileSync('supabase/migrations/107_work_timeline_reviews.sql','utf8'); const o=(s.match(/\(/g)||[]).length, c=(s.match(/\)/g)||[]).length; if(o!==c) throw new Error('불균형 '+o+'/'+c); console.log('OK');"`
Expected: `OK`

### Task 4: 재촉 알림 (pg_cron)

**Files:**
- Modify: `jdi-portal/supabase/migrations/107_work_timeline_reviews.sql` (섹션 4 append)

**Interfaces:**
- Produces `public.remind_pending_timeline_reviews() RETURNS VOID` + `cron.schedule('timeline_review_reminder', ...)`.
- Consumes: `attendance_records(user_id, work_date, status)` — 오늘 출근 판정. `105_work_directive_reminder.sql`의 출근 판정 방식을 따른다.

- [ ] **Step 1: 105 재촉 함수의 출근 판정부 확인**

Run: `cd jdi-portal && sed -n '1,80p' supabase/migrations/105_work_directive_reminder.sql`
확인할 것: 오늘 KST 날짜 계산식(`(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`), `attendance_records`로 "오늘 출근함"을 판정하는 정확한 컬럼·조건, `cron.schedule` 문법. 아래 코드의 출근 서브쿼리를 이와 **동일하게** 맞춘다.

- [ ] **Step 2: 재촉 함수·스케줄 append**

```sql
-- ---------- 미확인/미처리 검토 재촉 (평일 1회) ----------
CREATE OR REPLACE FUNCTION public.remind_pending_timeline_reviews()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_rev RECORD;
BEGIN
  FOR v_rev IN
    SELECT r.*, e.title AS entry_title
    FROM public.work_timeline_reviews r
    JOIN public.work_timeline_entries e ON e.id = r.entry_id
    WHERE r.state IN ('open', 'submitted')
      AND r.created_at < NOW() - INTERVAL '12 hours'
      AND (r.reminded_on IS NULL OR r.reminded_on < v_today)
  LOOP
    -- open: 작성자에게 "보완이 필요합니다" (작성자가 오늘 출근한 경우만)
    IF v_rev.state = 'open' THEN
      IF EXISTS (
        SELECT 1 FROM public.attendance_records a
        WHERE a.user_id = v_rev.author_id AND a.work_date = v_today AND a.status <> '미출근'
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_rev.author_id, 'timeline_review_requested', '검토 보완이 남아 있어요',
          '"' || v_rev.entry_title || '" 검토 보완이 아직 남아 있습니다.',
          '/dashboard/work-timeline/' || v_rev.entry_id);
        UPDATE public.work_timeline_reviews SET reminded_on = v_today WHERE id = v_rev.id;
      END IF;
    -- submitted: 검토자에게 "확인해 주세요" (검토자가 오늘 출근한 경우만)
    ELSIF v_rev.state = 'submitted' THEN
      IF EXISTS (
        SELECT 1 FROM public.attendance_records a
        WHERE a.user_id = v_rev.reviewer_id AND a.work_date = v_today AND a.status <> '미출근'
      ) THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (v_rev.reviewer_id, 'timeline_review_submitted', '확인할 검토가 있어요',
          '"' || v_rev.entry_title || '" 보완이 완료되어 확인을 기다립니다.',
          '/dashboard/work-timeline/' || v_rev.entry_id);
        UPDATE public.work_timeline_reviews SET reminded_on = v_today WHERE id = v_rev.id;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.remind_pending_timeline_reviews() FROM PUBLIC;

-- 평일 11:30 KST = UTC 02:30 (업무지시 11:00과 겹치지 않게)
SELECT cron.schedule('timeline_review_reminder', '30 2 * * 1-5',
  'SELECT public.remind_pending_timeline_reviews();');
```

> Step 1에서 확인한 105의 출근 서브쿼리 형태가 다르면(예: `attendance_records` 컬럼명/상태값), 위 두 `EXISTS` 블록을 그에 맞춰 수정한다.

- [ ] **Step 3: 괄호 균형 재점검**

Run: `cd jdi-portal && node -e "const s=require('fs').readFileSync('supabase/migrations/107_work_timeline_reviews.sql','utf8'); const o=(s.match(/\(/g)||[]).length, c=(s.match(/\)/g)||[]).length; if(o!==c) throw new Error('불균형 '+o+'/'+c); console.log('OK');"`
Expected: `OK`

### Task 5: 마이그레이션 적용 + RLS 회귀 테스트

**Files:**
- Create: `jdi-portal/supabase/tests/work_timeline_reviews_rls.sql`
- (적용) `supabase/migrations/107_work_timeline_reviews.sql`

- [ ] **Step 1: RLS 회귀 테스트 작성** — 기존 `supabase/tests/work_timeline_rls.sql` 형식을 그대로 따른다.

Run(형식 확인): `cd jdi-portal && sed -n '1,60p' supabase/tests/work_timeline_rls.sql`
그 형식(트랜잭션 + `set local role` / `request.jwt.claims` 세팅 패턴)에 맞춰 아래 시나리오를 검증하는 파일을 작성:
- 제3자(요청자·작성자·관리자 아님)는 `work_timeline_reviews` SELECT 시 0행.
- 작성자·요청자·관리자는 해당 검토 SELECT 가능.
- 어떤 역할도 `work_timeline_reviews`에 직접 INSERT/UPDATE 불가(RPC만 허용) — 직접 INSERT가 실패(0행 또는 정책 거부)함을 확인.

- [ ] **Step 2: 마이그레이션 적용 (운영 DB 변경 — 사용자 확인 게이트)**

⚠️ 이 단계는 운영 DB를 바꾼다. 실행 전 사용자에게 "107 마이그레이션(검토 테이블/함수)을 운영 DB에 적용해도 될까요?"라고 확인한다. 승인 시:

Run: `cd jdi-portal && printf 'y\n' | npx supabase db push --linked`
Expected: `107_work_timeline_reviews.sql` 적용 성공, 에러 없음. (드리프트 경고가 나오면 중단하고 사용자에게 보고.)

- [ ] **Step 3: 적용 후 스모크 점검**

Run: `cd jdi-portal && npx supabase db push --linked` (재실행 시 "no changes" 확인) — 이미 적용됐으면 적용할 것이 없다고 나와야 한다.
Expected: 추가 적용 없음(멱등).

- [ ] **Step 4: 커밋 (Phase 1 전체)**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/supabase/migrations/107_work_timeline_reviews.sql jdi-portal/supabase/tests/work_timeline_reviews_rls.sql
git commit -m "기능: 업무보고 검토 DB(107) — 테이블·RLS·요청/승인/반려/취소 RPC·완료 트리거·재촉

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — 알림 타입 등록

### Task 6: 알림 타입 3종 등록

**Files:**
- Modify: `jdi-portal/src/lib/notifications/types.ts` (NotificationType 유니온)
- Modify: `jdi-portal/src/components/dashboard/NotificationCenter.tsx` (TYPE_ICONS/TYPE_COLORS)
- Modify: `jdi-portal/supabase/functions/push-dispatch/index.ts` (SETTING_KEY_BY_TYPE)

**Interfaces:**
- Produces 알림 타입 `'timeline_review_requested' | 'timeline_review_submitted' | 'timeline_review_resolved'`이 TS 유니온·아이콘맵·푸시맵에 존재.

- [ ] **Step 1: 유니온에 3종 추가** — `src/lib/notifications/types.ts`의 `NotificationType` 유니온에 세 문자열을 추가한다.

Run(현재 확인): `cd jdi-portal && grep -n "NotificationType" src/lib/notifications/types.ts`
그 유니온 정의에 `| "timeline_review_requested" | "timeline_review_submitted" | "timeline_review_resolved"`를 추가.

- [ ] **Step 2: NotificationCenter 아이콘/색 추가** — `TYPE_ICONS`, `TYPE_COLORS` 객체에 세 키 추가.

Run(현재 확인): `cd jdi-portal && grep -n "TYPE_ICONS\|TYPE_COLORS\|work_directive" src/components/dashboard/NotificationCenter.tsx`
`work_directive` 항목이 쓰는 아이콘/색 형식을 그대로 참고해, 세 타입에 대해 예: `timeline_review_requested`/`timeline_review_submitted` → 검토 관련 아이콘(예 `ClipboardText`/`CheckCircle`), `timeline_review_resolved` → `CheckCircle`. 색은 indigo 계열로.

- [ ] **Step 3: push-dispatch 매핑 추가** — `SETTING_KEY_BY_TYPE`에 세 타입을 추가한다.

Run(현재 확인): `cd jdi-portal && grep -n "SETTING_KEY_BY_TYPE\|QUIET_HOURS_TYPES" supabase/functions/push-dispatch/index.ts`
`work_directive`가 매핑된 설정 키(예 업무 관련 on/off 컬럼)와 동일 키로 세 타입을 매핑. 야간 푸시 억제가 필요하면 `QUIET_HOURS_TYPES`에도 `timeline_review_requested`, `timeline_review_submitted` 추가(승인/반려 결과는 즉시성 위해 제외 권장).

- [ ] **Step 4: 타입 체크 + 빌드 확인**

Run: `cd jdi-portal && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/lib/notifications/types.ts jdi-portal/src/components/dashboard/NotificationCenter.tsx jdi-portal/supabase/functions/push-dispatch/index.ts
git commit -m "기능: 검토 알림 타입 3종 등록(유니온·아이콘·푸시 매핑)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> push-dispatch 재배포(`npx supabase functions deploy push-dispatch --no-verify-jwt`)는 운영 배포이므로 Phase 6 검증 시 사용자 확인 후 진행.

---

## Phase 3 — 검토 로직·타입 (work-timeline lib)

### Task 7: 검토 타입·상수

**Files:**
- Modify: `jdi-portal/src/lib/work-timeline/types.ts`
- Modify: `jdi-portal/src/lib/work-timeline/constants.ts`

**Interfaces:**
- Produces 타입 `ReviewState`, `ReviewEventKind`, `WorkTimelineReview`, `WorkTimelineReviewEvent`, `WorkTimelineReviewWithEvents`. 상수 `REVIEW_COMMENT_MAX_LENGTH = 2000`, `REVIEW_TASK_TITLE_PREFIX = "[검토 보완] "`, 상태 라벨/색 맵 `REVIEW_STATE_LABELS`.

- [ ] **Step 1: 타입 추가** (`types.ts` 하단에 append)

```typescript
export type ReviewState = "open" | "submitted" | "approved" | "cancelled";
export type ReviewEventKind =
  | "requested" | "submitted" | "approved" | "rejected" | "cancelled";

export interface WorkTimelineReview {
  id: string;
  entry_id: string;
  reviewer_id: string;
  author_id: string;
  task_id: string | null;
  comment: string;
  state: ReviewState;
  created_at: string;
  resolved_at: string | null;
  updated_at: string;
  reviewer_name: string | null;
  author_name: string | null;
  task_status: string | null; // 연결 할일의 status (표시용)
}

export interface WorkTimelineReviewEvent {
  id: string;
  review_id: string;
  actor_id: string;
  actor_name: string | null;
  kind: ReviewEventKind;
  note: string | null;
  created_at: string;
}

export interface WorkTimelineReviewWithEvents extends WorkTimelineReview {
  events: WorkTimelineReviewEvent[];
}
```

- [ ] **Step 2: 상수 추가** (`constants.ts`에 append)

```typescript
export const REVIEW_COMMENT_MAX_LENGTH = 2000;
export const REVIEW_TASK_TITLE_PREFIX = "[검토 보완] ";

export const REVIEW_STATE_LABELS: Record<
  "open" | "submitted" | "approved" | "cancelled",
  { label: string; tone: "amber" | "indigo" | "emerald" | "slate" }
> = {
  open: { label: "보완중", tone: "amber" },
  submitted: { label: "검토대기", tone: "indigo" },
  approved: { label: "검토 완료", tone: "emerald" },
  cancelled: { label: "검토 취소", tone: "slate" },
};
```

- [ ] **Step 3: 타입 체크**

Run: `cd jdi-portal && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/lib/work-timeline/types.ts jdi-portal/src/lib/work-timeline/constants.ts
git commit -m "기능: 검토 도메인 타입·상수 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 8: 검토 조회·액션

**Files:**
- Create: `jdi-portal/src/lib/work-timeline/reviewQueries.ts`
- Create: `jdi-portal/src/lib/work-timeline/reviewActions.ts`

**Interfaces:**
- Produces:
  - `getEntryReview(entryId: string): Promise<WorkTimelineReviewWithEvents | null>` (서버 쿼리, 진행 중 우선·없으면 최근 1건)
  - `requestReview(entryId: string, comment: string): Promise<void>`
  - `approveReview(reviewId: string, note?: string): Promise<void>`
  - `rejectReview(reviewId: string, note: string): Promise<void>`
  - `cancelReview(reviewId: string): Promise<void>`
- Consumes: RPC `request_timeline_review`/`approve_timeline_review`/`reject_timeline_review`/`cancel_timeline_review`.

- [ ] **Step 1: reviewQueries.ts 작성**

```typescript
import { createClient } from "@/lib/supabase/server";
import type { WorkTimelineReviewWithEvents } from "./types";

// 상세 화면·인박스에서 쓰는 단건 검토 조회. RLS로 당사자/관리자만 조회 가능.
export async function getEntryReview(
  entryId: string,
): Promise<WorkTimelineReviewWithEvents | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_timeline_reviews")
    .select(
      `id, entry_id, reviewer_id, author_id, task_id, comment, state,
       created_at, resolved_at, updated_at,
       reviewer:profiles!work_timeline_reviews_reviewer_id_fkey(full_name),
       author:profiles!work_timeline_reviews_author_id_fkey(full_name),
       task:tasks(status),
       events:work_timeline_review_events(
         id, review_id, actor_id, kind, note, created_at,
         actor:profiles!work_timeline_review_events_actor_id_fkey(full_name)
       )`,
    )
    .eq("entry_id", entryId)
    .order("created_at", { ascending: false })
    .order("created_at", { referencedTable: "work_timeline_review_events", ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as {
    id: string; entry_id: string; reviewer_id: string; author_id: string;
    task_id: string | null; comment: string; state: WorkTimelineReviewWithEvents["state"];
    created_at: string; resolved_at: string | null; updated_at: string;
    reviewer: { full_name: string | null } | null;
    author: { full_name: string | null } | null;
    task: { status: string } | null;
    events: Array<{
      id: string; review_id: string; actor_id: string;
      kind: WorkTimelineReviewWithEvents["events"][number]["kind"];
      note: string | null; created_at: string;
      actor: { full_name: string | null } | null;
    }>;
  };

  return {
    id: row.id, entry_id: row.entry_id, reviewer_id: row.reviewer_id, author_id: row.author_id,
    task_id: row.task_id, comment: row.comment, state: row.state,
    created_at: row.created_at, resolved_at: row.resolved_at, updated_at: row.updated_at,
    reviewer_name: row.reviewer?.full_name ?? null,
    author_name: row.author?.full_name ?? null,
    task_status: row.task?.status ?? null,
    events: (row.events ?? []).map((e) => ({
      id: e.id, review_id: e.review_id, actor_id: e.actor_id,
      actor_name: e.actor?.full_name ?? null, kind: e.kind, note: e.note, created_at: e.created_at,
    })),
  };
}
```

> 조인 FK 별칭(`work_timeline_reviews_reviewer_id_fkey` 등)은 실제 제약 이름과 일치해야 한다. Task 5 적용 후 `\d work_timeline_reviews`로 FK 이름을 확인하거나, 기존 `queries.ts`의 `author_profile:profiles!..._user_id_fkey` 표기법을 참고해 맞춘다.

- [ ] **Step 2: reviewActions.ts 작성** (directives/actions.ts의 `getAuthenticatedContext`/`assertUuid` 패턴 복제)

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { REVIEW_COMMENT_MAX_LENGTH } from "./constants";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAuth() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}
function assertUuid(v: string, label: string) {
  if (!UUID_PATTERN.test(v)) throw new Error(`${label} 값이 올바르지 않습니다.`);
}

export async function requestReview(entryId: string, comment: string): Promise<void> {
  assertUuid(entryId, "업무보고");
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("검토 의견을 입력해 주세요.");
  if (trimmed.length > REVIEW_COMMENT_MAX_LENGTH) {
    throw new Error(`검토 의견은 ${REVIEW_COMMENT_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("request_timeline_review", {
    p_entry_id: entryId, p_comment: trimmed,
  });
  if (error) throw error;
  revalidatePath(`/dashboard/work-timeline/${entryId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function approveReview(reviewId: string, note?: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("approve_timeline_review", {
    p_review_id: reviewId, p_note: note?.trim() || null,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline", "layout");
}

export async function rejectReview(reviewId: string, note: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const trimmed = note.trim();
  if (!trimmed) throw new Error("반려 사유를 입력해 주세요.");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("reject_timeline_review", {
    p_review_id: reviewId, p_note: trimmed,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard/work-timeline", "layout");
}

export async function cancelReview(reviewId: string): Promise<void> {
  assertUuid(reviewId, "검토");
  const { supabase } = await getAuth();
  const { error } = await supabase.rpc("cancel_timeline_review", { p_review_id: reviewId });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline", "layout");
}
```

- [ ] **Step 3: 타입 체크**

Run: `cd jdi-portal && npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/lib/work-timeline/reviewQueries.ts jdi-portal/src/lib/work-timeline/reviewActions.ts
git commit -m "기능: 검토 조회·서버액션(요청/승인/반려/취소)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — 상세 화면 UI

### Task 9: 상세 페이지에서 검토 로드

**Files:**
- Modify: `jdi-portal/src/app/dashboard/work-timeline/[id]/page.tsx`

**Interfaces:**
- Consumes `getEntryReview(entryId)`.
- Produces `WorkTimelineDetailClient`에 `initialReview` prop 전달.

- [ ] **Step 1: 페이지에서 검토 병렬 로드**

`getWorkTimelineEntryById` 호출부 근처에서 `getEntryReview(id)`를 함께 `await Promise.all([...])`로 로드하고, `<WorkTimelineDetailClient ... initialReview={review} />`로 전달.

Run(현재 확인): `cd jdi-portal && sed -n '1,80p' src/app/dashboard/work-timeline/[id]/page.tsx`
그 구조에 맞춰 import(`getEntryReview`)와 prop 전달을 추가. (권한 오류로 검토가 null이면 그대로 null 전달 — 정상.)

- [ ] **Step 2: 타입 체크** — `WorkTimelineDetailClient`가 아직 `initialReview`를 안 받으면 Task 10에서 추가하므로, 이 Step은 Task 10과 함께 커밋. 여기서는 page.tsx만 수정.

Run: `cd jdi-portal && npx tsc --noEmit`
Expected: `initialReview` prop 미정의 에러가 날 수 있음 → Task 10 완료 후 함께 통과. (page.tsx 문법 에러가 없는지만 확인.)

### Task 10: 검토 섹션 컴포넌트

**Files:**
- Create: `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineReviewSection.tsx`
- Modify: `jdi-portal/src/components/dashboard/work-timeline/WorkTimelineDetailClient.tsx`

**Interfaces:**
- Consumes: props `{ entryId, entryOwnerId, currentUserId, currentUserRole, initialReview }`. 액션 `requestReview/approveReview/rejectReview/cancelReview`. 상수 `REVIEW_STATE_LABELS`.
- Produces: 상세 화면 하단 검토 UI. 시안(아티팩트 섹션 01)이 시각 기준.

- [ ] **Step 1: WorkTimelineReviewSection.tsx 작성** — `"use client"`. 상태·권한 분기는 아래 규칙을 따른다.

핵심 로직(요약, 시안 탭 ①~⑤ 대응):
- `canRequest = (currentUserRole === "admin" || entryOwnerId === currentUserId)` 그리고 `!initialReview || initialReview.state === "approved" || initialReview.state === "cancelled"` → **검토 요청 폼** 표시(진행 중 검토가 없을 때만).
- 진행 중(`open`/`submitted`) 검토가 있으면 검토 카드: 상태 배지(`REVIEW_STATE_LABELS`), 검토 의견, 이벤트 타임라인, `task_id`가 있으면 "보완 할일 열기" 링크(`/dashboard/tasks/{task_id}`).
- `isReviewer = (initialReview.reviewer_id === currentUserId || currentUserRole === "admin")`:
  - `state === "submitted"` → [승인](`approveReview`) / [반려](사유 입력 → `rejectReview`).
  - `state === "open"` → [요청 취소](`cancelReview`).
- 종료(`approved`/`cancelled`) 검토는 이벤트 타임라인을 접힌 형태로 표시하고, `canRequest`면 새 요청 폼도 함께 노출.
- 각 액션은 `useState` 로딩 + `try/catch`로 `toast.success`/`toast.error`(sonner) + `router.refresh()`. (WorkTimelineDetailClient의 기존 toast/router 패턴과 동일.)
- Tailwind 클래스는 상세 화면 기존 톤(slate/indigo, `rounded-md`, `border-slate-200`, `text-slate-*`)에 맞춘다. 상태 배지 색은 tone→클래스 매핑(amber/indigo/emerald/slate).

전체 코드는 시안의 마크업 구조를 참고하되 앱의 실제 컴포넌트(예 `Select`, `UserAvatar`, phosphor 아이콘)를 사용. 컴포넌트가 커지면 요청 폼(`ReviewRequestForm`)과 이력(`ReviewTimeline`)을 같은 파일 내 하위 컴포넌트로 분리.

> 이 컴포넌트는 새 코드이므로 placeholder 금지: 실제 JSX·핸들러를 모두 작성한다. 분량이 크면 실행 시 시안 HTML(아티팩트)과 `WorkTimelineDetailClient.tsx`의 기존 버튼/토스트 패턴을 열어 그대로 대응시킨다.

- [ ] **Step 2: WorkTimelineDetailClient에 섹션 삽입 + prop 추가**

`WorkTimelineDetailClientProps`에 `initialReview: WorkTimelineReviewWithEvents | null` 추가. `<article>` 닫힌 직후(삭제 확인 블록 위)에 다음을 삽입:

```tsx
<WorkTimelineReviewSection
  entryId={entry.id}
  entryOwnerId={entry.user_id}
  currentUserId={currentUserId}
  currentUserRole={currentUserRole}
  initialReview={initialReview}
/>
```

상단 import에 `import WorkTimelineReviewSection from "./WorkTimelineReviewSection";`와 타입 import 추가.

- [ ] **Step 3: 빌드·린트·타입 체크**

Run: `cd jdi-portal && npx tsc --noEmit && npm run lint`
Expected: 에러 없음. (page.tsx의 `initialReview` prop 에러도 여기서 해소.)

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/app/dashboard/work-timeline/[id]/page.tsx jdi-portal/src/components/dashboard/work-timeline/WorkTimelineReviewSection.tsx jdi-portal/src/components/dashboard/work-timeline/WorkTimelineDetailClient.tsx
git commit -m "기능: 업무보고 상세 화면 검토 섹션(요청·승인·반려·취소·이력)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — 대시보드 인박스 + 할일 역링크

### Task 11: 빠른 경로에 pending_reviews 추가

**Files:**
- Modify: `jdi-portal/src/lib/dashboard/fast-queries.ts` (`DASHBOARD_SNAPSHOT_QUERY` + Supabase RPC 폴백)
- Modify: `jdi-portal/src/lib/dashboard/dashboard-snapshot.ts` (스냅샷 타입·조립)
- Modify: `jdi-portal/src/lib/dashboard/queries.ts` (`DashboardData` 타입)
- (필요 시) Modify: Supabase RPC 폴백 함수 정의가 있는 마이그레이션 → **새 마이그레이션 `107`로 폴백 RPC 갱신** (기존 수정 금지)

**Interfaces:**
- Produces `DashboardData.pendingReviews: { toFix: PendingReviewItem[]; toConfirm: PendingReviewItem[] }`.
  - `PendingReviewItem = { reviewId: string; entryId: string; entryTitle: string; comment: string; counterpartName: string | null; createdAt: string; taskId: string | null }`.

- [ ] **Step 1: 현재 스냅샷 쿼리 구조 파악**

Run: `cd jdi-portal && grep -n "pending_directives\|directive_pending_counts\|jsonb_build_object\|pendingDirectives" src/lib/dashboard/fast-queries.ts src/lib/dashboard/dashboard-snapshot.ts src/lib/dashboard/queries.ts`
`pending_directives` CTE와 최종 `jsonb_build_object` 위치, 그리고 Supabase RPC 폴백 함수명을 확인.

- [ ] **Step 2: `DASHBOARD_SNAPSHOT_QUERY`에 CTE 2개 추가** — `pending_directives` 바로 옆에, 본인 기준 두 갈래:

```sql
, pending_reviews_to_fix AS (
  SELECT r.id AS review_id, r.entry_id, e.title AS entry_title, r.comment,
         rp.full_name AS counterpart_name, r.created_at, r.task_id
  FROM public.work_timeline_reviews r
  JOIN public.work_timeline_entries e ON e.id = r.entry_id
  LEFT JOIN public.profiles rp ON rp.id = r.reviewer_id
  WHERE r.author_id = $1 AND r.state = 'open'      -- $1 = 본인 uid (기존 파라미터 규약에 맞춤)
  ORDER BY r.created_at DESC
)
, pending_reviews_to_confirm AS (
  SELECT r.id AS review_id, r.entry_id, e.title AS entry_title, r.comment,
         ap.full_name AS counterpart_name, r.created_at, r.task_id
  FROM public.work_timeline_reviews r
  JOIN public.work_timeline_entries e ON e.id = r.entry_id
  LEFT JOIN public.profiles ap ON ap.id = r.author_id
  WHERE r.reviewer_id = $1 AND r.state = 'submitted'
  ORDER BY r.created_at DESC
)
```

최종 `jsonb_build_object(...)`에 추가:

```sql
'pendingReviews', jsonb_build_object(
  'toFix', COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM pending_reviews_to_fix f), '[]'::jsonb),
  'toConfirm', COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM pending_reviews_to_confirm c), '[]'::jsonb)
)
```

> `$1` 자리표시자는 기존 쿼리의 uid 바인딩 방식과 정확히 일치시킬 것(Step 1에서 확인). 부분 인덱스 `work_timeline_reviews_author_open`/`_reviewer_submitted`가 이 조건을 커버한다.

- [ ] **Step 3: 스냅샷 타입·조립·DashboardData 갱신** — `dashboard-snapshot.ts`의 `DashboardSnapshot` 타입과 `buildDashboardDataFromSnapshot`, `queries.ts`의 `DashboardData`에 `pendingReviews`(위 인터페이스) 추가. snake_case→camelCase 매핑을 기존 필드 방식대로.

- [ ] **Step 4: Supabase RPC 폴백 갱신** — 빠른 경로 실패 시 쓰는 폴백이 RPC(예 `get_dashboard_snapshot`)라면, 그 RPC도 `pendingReviews`를 반환하도록 **새 마이그레이션 `108_dashboard_pending_reviews.sql`**에서 `CREATE OR REPLACE`로 갱신. (폴백이 별도 Supabase 쿼리 조합이면 그 TS 경로에 두 조회를 추가.) **성능 불변조건 3: 빠른 경로/폴백 양쪽 반영.**

Run(폴백 형태 확인): `cd jdi-portal && grep -n "rpc(\|fallback\|get_dashboard" src/lib/dashboard/fast-queries.ts`

- [ ] **Step 5: 타입 체크 + 성능 테스트**

Run: `cd jdi-portal && npx tsc --noEmit && npm run test:performance`
Expected: 타입 OK, 성능 40개 통과(부분 인덱스·양쪽 경로 반영).

- [ ] **Step 6: (폴백 마이그레이션이 있으면) 107 적용 (사용자 확인 게이트)** — Task 5 Step 2와 동일 절차.

- [ ] **Step 7: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/lib/dashboard/fast-queries.ts jdi-portal/src/lib/dashboard/dashboard-snapshot.ts jdi-portal/src/lib/dashboard/queries.ts
git add jdi-portal/supabase/migrations/108_dashboard_pending_reviews.sql 2>/dev/null || true
git commit -m "기능: 대시보드 스냅샷에 검토 인박스(pending_reviews) 추가 — 빠른 경로+폴백

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 12: 검토 인박스 위젯

**Files:**
- Create: `jdi-portal/src/components/dashboard/widgets/ReviewInboxWidget.tsx`
- Modify: `jdi-portal/src/components/dashboard/DashboardClient.tsx`

**Interfaces:**
- Consumes: `data.pendingReviews`, `attendanceStatuses`(출근 판정), 액션 `approveReview`/`rejectReview`.
- Produces: 대시보드 홈에 검토 인박스(출근 후 자동 펼침).

- [ ] **Step 1: DirectiveInboxWidget 구조 확인**

Run: `cd jdi-portal && sed -n '1,120p' src/components/dashboard/widgets/DirectiveInboxWidget.tsx`
확인: props 형태, `hasCheckedIn` 판정, 접힘/펼침 UI, 수락/거절 → toast → `router.refresh()` 패턴.

- [ ] **Step 2: ReviewInboxWidget.tsx 작성** — DirectiveInboxWidget 구조를 그대로 따르되:
- 입력: `{ toFix, toConfirm, attendanceStatuses, currentUserId }`.
- `toFix.length + toConfirm.length === 0` → `null`.
- 출근 전: "검토할 업무 N건 · 출근 후 확인해 주세요" 접힘. 출근 후 펼침.
- **toFix**(작성자): 각 항목에 검토 의견 요약 + "보완 할일 열기" 링크(`/dashboard/tasks/{taskId}`) — 버튼 없이 이동만.
- **toConfirm**(검토자): "보완 완료됨" + [승인]/[반려(사유)] 버튼 → 액션 호출 → toast → `router.refresh()`.
- 클래스·아이콘은 DirectiveInboxWidget과 동일 톤.

- [ ] **Step 3: DashboardClient에 마운트**

Run(현재 확인): `cd jdi-portal && grep -n "DirectiveInboxWidget\|TodayWorkBoardWidget" src/components/dashboard/DashboardClient.tsx`
`<DirectiveInboxWidget .../>` 바로 아래에 `<ReviewInboxWidget toFix={data.pendingReviews.toFix} toConfirm={data.pendingReviews.toConfirm} attendanceStatuses={...} currentUserId={...} />` 추가. import도 추가.

- [ ] **Step 4: 빌드·린트·타입·성능**

Run: `cd jdi-portal && npx tsc --noEmit && npm run lint && npm run test:performance`
Expected: 모두 통과.

- [ ] **Step 5: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/components/dashboard/widgets/ReviewInboxWidget.tsx jdi-portal/src/components/dashboard/DashboardClient.tsx
git commit -m "기능: 대시보드 검토 인박스 위젯(작성자=보완할 검토 / 검토자=확인할 검토)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 13: 할일 화면 역링크

**Files:**
- Modify: `jdi-portal/src/lib/tasks/types.ts` (task 타입에 `review_id`)
- Modify: `jdi-portal/src/lib/tasks/queries.ts` (조회 select에 `review_id` + 검토 entry_id)
- Modify: 할일 상세 UI (`TaskDetailClient.tsx` 또는 `detail/` 하위) — 역링크 표시

**Interfaces:**
- Produces: 보완 할일 상세에 "검토 대상 업무보고 보기" 링크(`/dashboard/work-timeline/{entryId}`).

- [ ] **Step 1: task 타입·조회에 review_id 추가**

Run(현재 확인): `cd jdi-portal && grep -rn "directive_recipient_id" src/lib/tasks/`
`directive_recipient_id`가 task 타입/조회에 들어간 방식과 동일하게 `review_id`(그리고 검토→entry_id를 얻기 위한 조인 `review:work_timeline_reviews(entry_id)`)를 추가.

- [ ] **Step 2: 상세 UI에 역링크**

Run(현재 확인): `cd jdi-portal && grep -rn "directive\|연결된\|LinkSimple" src/components/dashboard/tasks/`
할일 상세에서 `review_id`(또는 조인된 `entry_id`)가 있으면 "검토 대상 업무보고 보기" 링크를 렌더. 업무 타임라인 상세의 "연결된 할일" 링크(WorkTimelineDetailClient.tsx의 `entry.task_id` 링크)와 대칭.

- [ ] **Step 3: 빌드·린트·타입**

Run: `cd jdi-portal && npx tsc --noEmit && npm run lint`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/src/lib/tasks/types.ts jdi-portal/src/lib/tasks/queries.ts jdi-portal/src/components/dashboard/tasks/
git commit -m "기능: 보완 할일 상세에 검토 대상 업무보고 역링크

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — 검증·마무리

### Task 14: 보안 회귀 테스트 추가

**Files:**
- Modify: `jdi-portal/scripts/*security*.test.mjs` (또는 `test:security`가 도는 파일)

- [ ] **Step 1: test:security 대상 파일 확인**

Run: `cd jdi-portal && npm run test:security 2>&1 | head -30 && grep -rln "work_directive\|directive" scripts/`
검토 관련 정적 검사를 추가할 파일 위치 파악(예: RPC가 SECURITY DEFINER인지, UPDATE 정책 부재, 알림 타입 매핑 등 기존 directive 검사와 대칭).

- [ ] **Step 2: 검토 정적 검사 추가** — 기존 directive 검사 항목을 대칭 복제:
- `107` 마이그레이션에 `work_timeline_reviews`/`_events` RLS 활성 + SELECT 정책이 당사자·admin 제한을 포함.
- 4개 RPC가 `SECURITY DEFINER SET search_path = public` + `auth.uid()` 검증 포함.
- `work_timeline_reviews`에 INSERT/UPDATE/DELETE 정책이 **없음**(RPC 전용).

- [ ] **Step 3: 실행**

Run: `cd jdi-portal && npm run test:security`
Expected: 통과.

- [ ] **Step 4: 커밋**

```bash
cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능"
git add jdi-portal/scripts/
git commit -m "테스트: 검토 기능 보안 회귀 검사 추가

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 15: 전체 검증 + 수동 확인

- [ ] **Step 1: 전체 정적 검증**

Run: `cd jdi-portal && npm run lint && npx tsc --noEmit && npm run build && npm run test:performance && npm run test:security`
Expected: 전부 통과. build 성공.

- [ ] **Step 2: push-dispatch 재배포 (운영 배포 — 사용자 확인 게이트)**

알림 푸시가 새 타입에 반응하려면 Edge Function 재배포 필요. 사용자 확인 후:
Run: `cd jdi-portal && npx supabase functions deploy push-dispatch --no-verify-jwt`

- [ ] **Step 3: 수동 확인 시나리오** (개발 서버 `npm run dev`, 3역 계정)
- 관리자 A가 직원 B의 업무보고 상세에서 검토 요청 → B에게 실시간 토스트 + 벨 + 대시보드 "검토할 업무"(보완할 검토) + "오늘 할 일"에 보완 할일 등장.
- B가 보완 할일 완료 → 검토 `검토대기`로 자동 전환, A에게 알림 + A 대시보드 "확인할 검토"에 등장.
- A가 반려(사유) → 할일 재오픈, B에게 알림, 상세 이력에 반려 기록.
- B 재완료 → A 승인 → 검토 `완료`, 상세에 전체 이력.
- B(작성자)가 셀프 요청 → 본인 할일 생성 → 본인이 승인까지. (요청 폼이 작성자 본인에게 보이는지 확인.)
- 제3자 C는 상세에서 검토 의견이 보이지 않음(요청 폼도 안 보임 — 권한 없음).

- [ ] **Step 4: 최종 상태 확인**

Run: `cd "C:/Users/jdico/orca/workspaces/jdicompany/업무-검토기능" && git status --short && git log --oneline -12`
Expected: 워킹트리 clean, 커밋 이력에 Phase 1~6 반영. **사용자 요청 전까지 push 하지 않는다.**

---

## Self-Review 결과 (계획 작성자 체크)

- **스펙 커버리지**: 설계 1)DB → Task 1~5, 2)알림 → Task 6, 3)대시보드 인박스 → Task 11~12, 4)상세 UI → Task 9~10, 5)할일 역링크 → Task 13, 6)재촉 → Task 4, 7)검증 → Task 5/14/15. 열린 질문 3개는 Task 3(취소=할일 남김+제목표기), Task 3(approve는 submitted에서만), Task 4(재촉 11:30)에서 기본값으로 확정.
- **상태 리터럴 일관성**: `open/submitted/approved/cancelled`(review), `requested/submitted/approved/rejected/cancelled`(event), 알림 타입 3종, 접두어 `[검토 보완] `를 SQL·TS·컴포넌트 전반에서 동일하게 사용.
- **주의(실행 시 확인 필요)**: (a) reviewQueries의 FK 별칭은 실제 제약 이름과 맞춰야 함(Task 8 노트). (b) fast-queries의 uid 바인딩 자리표시자·폴백 형태는 Task 11 Step 1/4에서 실제 확인 후 맞출 것. (c) 105의 attendance 출근 판정 컬럼/상태값을 Task 4 Step 1에서 확인 후 동일화. (d) 반려 시 tasks status 되돌림이 트리거를 재유발하지만 재전이 조건(submitted)에 안 걸려 무한루프 없음 — 실행 시 재확인.
