# 업무지시(Work Directives) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 직원이 포털 안에서 서로에게 업무지시를 등록하고, 받는 사람이 출근 후 대시보드에서 수락하면 자동으로 자기 할일이 되는 기능을 만든다.

**Architecture:** 신규 테이블 `work_directives`(지시 본문) + `work_directive_recipients`(받는 사람별 상태) 두 개를 만들고, `tasks`에 `directive_recipient_id` 연결 컬럼 하나를 더한다. 수락/거절은 `SECURITY DEFINER` RPC 한 번으로 할일 생성까지 끝낸다. 미확인 지시 목록과 사용자별 미확인 건수는 기존 대시보드 스냅샷 쿼리 안에 CTE로 얹어 **DB 왕복을 늘리지 않는다**. 화면은 받는 쪽(대시보드 오늘 할 일 위 카드)과 보내는 쪽(오늘 업무 현황 표의 이름 클릭 → 팝업) 둘뿐이며 사이드바 메뉴는 추가하지 않는다.

**Tech Stack:** Next.js 16 App Router / React 19 / TypeScript strict / Tailwind CSS 4 / Supabase(Postgres + RLS + Edge Functions) / 직접 `pg` Pool / 테스트는 `node:test`

설계 문서: `docs/superpowers/specs/2026-07-24-work-directives-design.md`

## Global Constraints

- 모든 작업은 `jdi-portal/` 안에서 한다. 명령은 `cd jdi-portal` 후 실행한다.
- **KST 고정**: SQL에서 `CURRENT_DATE` / `NOW()::date`를 그대로 쓰지 않는다. 반드시 `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE`를 쓴다.
- **RLS 필수**: 새 테이블은 `ENABLE ROW LEVEL SECURITY` + `public.is_approved_user()` 반영. `SECURITY DEFINER` 함수는 내부에서 `auth.uid()`와 권한을 다시 검증한다.
- **Supabase `error` 무시 금지**: `data`만 보고 넘어가지 않는다. 모든 호출에서 `error`를 확인하고 던진다.
- **성능 불변조건 3**: 대시보드/할일 데이터는 **빠른 경로(`fast-queries.ts`)와 폴백(`queries.ts`) 양쪽**을 함께 고친다. 한쪽만 고치면 운영에서만 안 보이는 사고가 난다.
- **마이그레이션은 추가만**: 기존 파일을 수정하지 않는다. 현재 최신은 `102_dashboard_task_summary_project.sql`이므로 이번에 `103`, `104`를 새로 만든다.
- **문자열 값 고정**: `kind`는 `'지시' | '요청'`, `state`는 `'미확인' | '수락' | '거절'`, 할일 `status`는 `'대기' | '진행중' | '완료'`, `priority`는 `'긴급' | '높음' | '보통' | '낮음'`. 한글 값 그대로 DB에 저장한다(기존 `tasks` 규약과 동일).
- **알림 타입 4종**: `work_directive`, `work_directive_answer`, `work_directive_reminder`, `work_directive_pending`.
- `git push`는 하지 않는다. 커밋만 한다.
- 커밋 메시지는 한국어, 기존 형식(`기능:` / `문서:` / `정리:` 접두어)을 따른다.

---

## File Structure

**신규 생성**

| 파일 | 책임 |
|---|---|
| `supabase/migrations/103_work_directives.sql` | 테이블 2개, `tasks` 연결 컬럼, 트리거, RLS, 수락/거절 RPC |
| `supabase/migrations/104_work_directive_reminder.sql` | 미확인 재촉 함수 + pg_cron 등록 |
| `src/lib/directives/types.ts` | 도메인 타입 |
| `src/lib/directives/constants.ts` | 종류/상태 상수, 배지 라벨·색상, 길이 제한 |
| `src/lib/directives/actions.ts` | 등록/수락/거절 + "보낸 지시 목록" 조회 — `"use server"` |
| `src/components/dashboard/widgets/DirectiveInboxWidget.tsx` | 받는 쪽 카드 |
| `src/components/dashboard/widgets/MemberWorkPanel.tsx` | 보내는 쪽 팝업 |
| `scripts/work-directives.test.mjs` | 정적 회귀 검사 (이중 경로·RLS·KST 강제) |

**수정**

| 파일 | 무엇을 |
|---|---|
| `src/lib/dashboard/dashboard-snapshot.ts` | 스냅샷/데이터 타입에 `pendingDirectives`, `directivePendingCounts` 추가 |
| `src/lib/dashboard/fast-queries.ts` | 스냅샷 SQL에 CTE 2개 추가 |
| `src/lib/dashboard/queries.ts` | 폴백 경로에서 같은 두 값을 채움 |
| `src/components/dashboard/DashboardClient.tsx` | `DirectiveInboxWidget` 배치 + 새 props 전달 |
| `src/components/dashboard/widgets/TodayWorkBoardWidget.tsx` | 표의 이름을 버튼으로, 미확인 배지, 팝업 열기 |
| `supabase/functions/push-dispatch/index.ts` | 알림 타입 4종 등록 + `work_directive` 조용한 시간 규칙 |
| `package.json` | `test:performance`에 `work-directives.test.mjs` 추가 |
| `CLAUDE.md` (루트) | 최신 마이그레이션 번호 갱신 |

이 저장소의 테스트는 **DB를 띄우지 않는 정적 검사**(`node:test` + 소스 문자열 검사)다. `scripts/projects-feature.test.mjs`가 그 본보기다. 이 계획도 같은 방식을 쓰고, DB 동작은 각 Task 끝의 **수동 확인** 단계로 검증한다.

---

### Task 1: 마이그레이션 103 — 테이블·RLS·수락/거절 RPC

**Files:**
- Create: `supabase/migrations/103_work_directives.sql`
- Create: `scripts/work-directives.test.mjs`
- Modify: `package.json` (scripts.`test:performance`)

**Interfaces:**
- Consumes: 기존 `public.profiles(id, role, is_approved)`, `public.tasks`, `public.task_assignees`, `public.projects`, `public.notifications`, 함수 `public.is_approved_user()`
- Produces:
  - 테이블 `public.work_directives`, `public.work_directive_recipients`
  - 컬럼 `public.tasks.directive_recipient_id UUID NULL`
  - `public.accept_work_directive(p_recipient_id UUID) RETURNS UUID` — 생성된 task id 반환
  - `public.decline_work_directive(p_recipient_id UUID, p_reason TEXT) RETURNS VOID`

- [ ] **Step 1: 실패하는 정적 검사부터 작성**

`scripts/work-directives.test.mjs` 생성:

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p) => existsSync(join(process.cwd(), p));

test("103 마이그레이션: 테이블 2개 + 연결 컬럼 + RLS", () => {
  const path = "supabase/migrations/103_work_directives.sql";
  assert.ok(exists(path), "103_work_directives.sql 이 없습니다");
  const sql = read(path);

  assert.match(sql, /CREATE TABLE public\.work_directives/);
  assert.match(sql, /CREATE TABLE public\.work_directive_recipients/);
  assert.match(sql, /ALTER TABLE public\.tasks\s+ADD COLUMN directive_recipient_id/);

  // RLS 활성
  assert.match(sql, /ALTER TABLE public\.work_directives ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ALTER TABLE public\.work_directive_recipients ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /is_approved_user\(\)/);

  // 대시보드가 매 요청 읽는 경로 → 미확인 부분 인덱스 필수
  assert.match(sql, /work_directive_recipients_pending[\s\S]*?WHERE state = '미확인'/);

  // 중복 수락 방지
  assert.match(sql, /tasks_directive_recipient_unique[\s\S]*?WHERE directive_recipient_id IS NOT NULL/);

  // kind 위조 방지 트리거
  assert.match(sql, /CREATE TRIGGER work_directives_set_kind/);
  assert.match(sql, /NEW\.kind :=/);

  // KST 규칙: 날짜는 반드시 Asia/Seoul 변환
  assert.doesNotMatch(sql, /CURRENT_DATE/);
});

test("103 마이그레이션: 수락/거절 RPC 의 권한 재검증", () => {
  const sql = read("supabase/migrations/103_work_directives.sql");

  assert.match(sql, /FUNCTION public\.accept_work_directive\(p_recipient_id UUID\)/);
  assert.match(sql, /FUNCTION public\.decline_work_directive\(p_recipient_id UUID, p_reason TEXT\)/);

  // SECURITY DEFINER 는 search_path 고정 + 내부 재검증이 필수
  const definerCount = (sql.match(/SECURITY DEFINER/g) ?? []).length;
  assert.ok(definerCount >= 3, `SECURITY DEFINER 함수가 3개 이상이어야 합니다 (현재 ${definerCount})`);
  assert.ok(
    (sql.match(/SET search_path = public/g) ?? []).length >= 3,
    "SECURITY DEFINER 함수마다 search_path 를 고정해야 합니다",
  );
  assert.match(sql, /v_uid := auth\.uid\(\)/);

  // 대표님 지시는 거절 불가
  assert.match(sql, /대표님 지시는 거절할 수 없습니다/);
  // 중복 응답 방지
  assert.match(sql, /이미 응답한 지시입니다/);

  // 수락 시 담당자 배정까지 한 트랜잭션 안에서
  assert.match(sql, /INSERT INTO public\.task_assignees/);
});
```

- [ ] **Step 2: 검사를 돌려 실패를 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: 2개 모두 FAIL. 첫 메시지는 `103_work_directives.sql 이 없습니다`.

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/103_work_directives.sql` 생성:

```sql
-- ============================================================
-- 103: 업무지시 (work directives)
--   설계: docs/superpowers/specs/2026-07-24-work-directives-design.md
-- ============================================================

-- ---------- 지시 본문 ----------
CREATE TABLE public.work_directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  kind TEXT NOT NULL CHECK (kind IN ('지시', '요청')),
  priority TEXT CHECK (priority IS NULL OR priority IN ('긴급', '높음', '보통', '낮음')),
  due_date DATE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX work_directives_created_by
  ON public.work_directives (created_by, created_at DESC);

-- ---------- 받는 사람별 상태 ----------
CREATE TABLE public.work_directive_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id UUID NOT NULL REFERENCES public.work_directives(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT '미확인' CHECK (state IN ('미확인', '수락', '거절')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  decline_reason TEXT CHECK (
    decline_reason IS NULL OR char_length(btrim(decline_reason)) BETWEEN 1 AND 500
  ),
  responded_at TIMESTAMPTZ,
  reminded_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (directive_id, user_id)
);

-- 대시보드가 매 요청 읽는 경로: 미확인 건만 부분 인덱스로 (전체 스캔 금지)
CREATE INDEX work_directive_recipients_pending
  ON public.work_directive_recipients (user_id, created_at DESC)
  WHERE state = '미확인';

CREATE INDEX work_directive_recipients_directive
  ON public.work_directive_recipients (directive_id);

CREATE INDEX work_directive_recipients_task
  ON public.work_directive_recipients (task_id)
  WHERE task_id IS NOT NULL;

-- ---------- 할일 연결 ----------
ALTER TABLE public.tasks
  ADD COLUMN directive_recipient_id UUID
    REFERENCES public.work_directive_recipients(id) ON DELETE SET NULL;

-- 한 수신 건에서 할일이 두 개 생기는 것(중복 수락)을 DB 가 막는다
CREATE UNIQUE INDEX tasks_directive_recipient_unique
  ON public.tasks (directive_recipient_id)
  WHERE directive_recipient_id IS NOT NULL;

-- ---------- kind 위조 방지 ----------
-- kind 는 클라이언트 입력이 아니라 보낸 사람의 권한에서 파생된다.
-- 앱에서 계산해 넣으면 직접 REST 호출로 '지시' 를 위조할 수 있으므로 DB 에서 덮어쓴다.
CREATE OR REPLACE FUNCTION public.set_work_directive_kind()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.created_by := auth.uid();
    NEW.kind := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      ) THEN '지시'
      ELSE '요청'
    END;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_directives_set_kind
  BEFORE INSERT ON public.work_directives
  FOR EACH ROW EXECUTE FUNCTION public.set_work_directive_kind();

-- ---------- RLS ----------
ALTER TABLE public.work_directives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_directive_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "지시: 보낸 사람·받는 사람·관리자만 조회"
  ON public.work_directives FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.work_directive_recipients r
        WHERE r.directive_id = work_directives.id AND r.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  );

CREATE POLICY "지시: 승인 사용자 등록"
  ON public.work_directives FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

CREATE POLICY "지시: 보낸 사람·관리자 삭제"
  ON public.work_directives FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "수신: 지시를 볼 수 있으면 조회"
  ON public.work_directive_recipients FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.work_directives d
      WHERE d.id = work_directive_recipients.directive_id
    )
  );

CREATE POLICY "수신: 지시를 만든 사람만 추가"
  ON public.work_directive_recipients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND EXISTS (
      SELECT 1 FROM public.work_directives d
      WHERE d.id = work_directive_recipients.directive_id
        AND d.created_by = auth.uid()
    )
  );

CREATE POLICY "수신: 보낸 사람·관리자 삭제"
  ON public.work_directive_recipients FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.work_directives d
      WHERE d.id = work_directive_recipients.directive_id
        AND d.created_by = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- UPDATE 정책은 일부러 만들지 않는다.
-- 상태 변경은 아래 두 RPC 로만 가능하다 (남이 대신 수락하는 것을 DB 에서 차단).

-- ---------- 수락 ----------
CREATE OR REPLACE FUNCTION public.accept_work_directive(p_recipient_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_rec public.work_directive_recipients%ROWTYPE;
  v_dir public.work_directives%ROWTYPE;
  v_task_id UUID;
  v_position INTEGER;
  v_sender_name TEXT;
  v_actor_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true
  ) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  SELECT * INTO v_rec
  FROM public.work_directive_recipients
  WHERE id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '업무지시를 찾을 수 없습니다.';
  END IF;
  IF v_rec.user_id <> v_uid THEN
    RAISE EXCEPTION '본인에게 온 업무지시만 수락할 수 있습니다.';
  END IF;
  IF v_rec.state <> '미확인' THEN
    RAISE EXCEPTION '이미 응답한 지시입니다.';
  END IF;

  SELECT * INTO v_dir FROM public.work_directives WHERE id = v_rec.directive_id;

  -- 상태별 독립 순서 (src/components/dashboard/tasks/CLAUDE.md)
  SELECT COALESCE(MAX(t.position), 0) + 1 INTO v_position
  FROM public.tasks t
  WHERE t.status = '대기';

  INSERT INTO public.tasks (
    title, description, status, priority, due_date, project_id,
    position, created_by, directive_recipient_id
  ) VALUES (
    v_dir.title,
    v_dir.body,
    '대기',
    COALESCE(v_dir.priority, '보통'),
    v_dir.due_date,
    v_dir.project_id,
    v_position,
    v_dir.created_by,
    v_rec.id
  )
  RETURNING id INTO v_task_id;

  INSERT INTO public.task_assignees (task_id, user_id)
  VALUES (v_task_id, v_uid);

  UPDATE public.work_directive_recipients
  SET state = '수락', task_id = v_task_id, responded_at = NOW()
  WHERE id = v_rec.id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;
  SELECT full_name INTO v_sender_name FROM public.profiles WHERE id = v_dir.created_by;

  IF v_dir.created_by <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_dir.created_by,
      'work_directive_answer',
      '업무지시를 수락했습니다',
      COALESCE(v_actor_name, '동료') || '님이 "' || v_dir.title || '" 을(를) 수락했습니다.',
      '/dashboard'
    );
  END IF;

  RETURN v_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_work_directive(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_work_directive(UUID) TO authenticated;

-- ---------- 거절 ----------
CREATE OR REPLACE FUNCTION public.decline_work_directive(p_recipient_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_rec public.work_directive_recipients%ROWTYPE;
  v_dir public.work_directives%ROWTYPE;
  v_reason TEXT;
  v_actor_name TEXT;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_uid AND p.is_approved = true
  ) THEN
    RAISE EXCEPTION '승인된 사용자만 사용할 수 있습니다.';
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF v_reason = '' THEN
    RAISE EXCEPTION '거절 사유를 입력해 주세요.';
  END IF;

  SELECT * INTO v_rec
  FROM public.work_directive_recipients
  WHERE id = p_recipient_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '업무지시를 찾을 수 없습니다.';
  END IF;
  IF v_rec.user_id <> v_uid THEN
    RAISE EXCEPTION '본인에게 온 업무지시만 응답할 수 있습니다.';
  END IF;
  IF v_rec.state <> '미확인' THEN
    RAISE EXCEPTION '이미 응답한 지시입니다.';
  END IF;

  SELECT * INTO v_dir FROM public.work_directives WHERE id = v_rec.directive_id;
  IF v_dir.kind = '지시' THEN
    RAISE EXCEPTION '대표님 지시는 거절할 수 없습니다.';
  END IF;

  UPDATE public.work_directive_recipients
  SET state = '거절', decline_reason = v_reason, responded_at = NOW()
  WHERE id = v_rec.id;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_uid;

  IF v_dir.created_by <> v_uid THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      v_dir.created_by,
      'work_directive_answer',
      '업무 요청이 거절되었습니다',
      COALESCE(v_actor_name, '동료') || '님이 "' || v_dir.title || '" 을(를) 거절했습니다. 사유: ' || v_reason,
      '/dashboard'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_work_directive(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_work_directive(UUID, TEXT) TO authenticated;
```

- [ ] **Step 4: 검사를 다시 돌려 통과 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: `pass 2`, `fail 0`.

- [ ] **Step 5: 회귀 검사에 새 파일 등록**

`package.json`의 `scripts["test:performance"]` 끝에 `scripts/work-directives.test.mjs`를 덧붙인다. 세션 종료 훅(`scripts/perf-guard-hook.mjs`)이 `npm run test:performance`를 돌리므로, 여기 넣어야 앞으로 자동으로 지켜진다.

```json
"test:performance": "node --test scripts/performance-audit.test.mjs scripts/performance-architecture.test.mjs scripts/login-performance-and-fonts.test.mjs scripts/dashboard-snapshot.test.mjs scripts/dashboard-summary-parity.test.mjs scripts/dashboard-summary-selector.test.mjs scripts/influencer-list-loading.test.mjs scripts/performance-timing.test.mjs scripts/task-bounded-loading.test.mjs scripts/work-directives.test.mjs"
```

- [ ] **Step 6: 전체 회귀 검사 통과 확인**

```bash
cd jdi-portal && npm run test:performance
```

기대: `fail 0`. (기존 40개 + 이번 2개)

- [ ] **Step 7: 운영 DB에 적용 — 사용자 확인 필요**

⚠️ **운영 DB 변경이다. 실행 전에 사용자에게 알리고 동의를 받는다.**

```bash
cd jdi-portal && yes | npx supabase db push --linked
```

기대 출력에 `103_work_directives.sql` 적용 성공이 보인다.

- [ ] **Step 8: 수동 확인**

Supabase 대시보드 → Table Editor 에서 `work_directives`, `work_directive_recipients` 두 표가 보이고, `tasks`에 `directive_recipient_id` 칸이 생겼는지 눈으로 확인한다.

- [ ] **Step 9: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add jdi-portal/supabase/migrations/103_work_directives.sql jdi-portal/scripts/work-directives.test.mjs jdi-portal/package.json
git commit -m "기능: 업무지시 DB(103) — 테이블 2개·RLS·수락/거절 RPC"
```

---

### Task 2: `src/lib/directives/` 모듈

**Files:**
- Create: `src/lib/directives/types.ts`
- Create: `src/lib/directives/constants.ts`
- Create: `src/lib/directives/actions.ts`
- Modify: `scripts/work-directives.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 1의 테이블과 RPC 이름 (`accept_work_directive`, `decline_work_directive`), 기존 `createClient` (`@/lib/supabase/server`)
- Produces:
  - `type DirectiveKind = "지시" | "요청"`
  - `type DirectiveState = "미확인" | "수락" | "거절"`
  - `interface PendingDirective` — 필드: `recipient_id, directive_id, kind, title, body, priority, due_date, project, sender_name, created_at`
  - `interface SentDirective` — 필드: `recipient_id, directive_id, kind, title, state, task_status, decline_reason, created_at`
  - `interface DirectivePendingCount` — 필드: `user_id, count`
  - `getSentDirectivesFor(targetUserId: string): Promise<SentDirective[]>`
  - `createDirective(input: CreateDirectiveInput): Promise<void>`
  - `acceptDirective(recipientId: string): Promise<void>`
  - `declineDirective(recipientId: string, reason: string): Promise<void>`
  - `CreateDirectiveInput = { title: string; body: string; recipientIds: string[]; priority?: string | null; dueDate?: string | null; projectId?: string | null }`

> **설계 문서와 다른 점 (의도된 변경).** 설계 문서 3)절은 `src/lib/directives/queries.ts`에 읽기 세 개를 두라고 적었지만, 실제로는 만들지 않는다. 이유는 두 가지다.
> 1. `getSentDirectivesFor`는 **클라이언트 컴포넌트**인 팝업이 부른다. `@/lib/supabase/server`를 쓰는 평범한 모듈은 클라이언트에서 부를 수 없으므로 `"use server"` 파일(=`actions.ts`)에 두어야 한다.
> 2. `getPendingDirectives` / `getPendingCountsByUser`는 대시보드 스냅샷의 일부라서 `src/lib/dashboard/queries.ts`(폴백 경로)에 있어야 빠른 경로와 짝이 맞는다. 별도 모듈에 두면 두 벌이 생겨 성능 불변조건 3을 어기기 쉽다.

- [ ] **Step 1: 실패하는 검사 추가**

`scripts/work-directives.test.mjs` 끝에 덧붙인다:

```javascript
test("lib/directives: 모듈 구성과 서버 검증", () => {
  for (const f of ["types.ts", "constants.ts", "actions.ts"]) {
    assert.ok(exists(`src/lib/directives/${f}`), `src/lib/directives/${f} 이 없습니다`);
  }

  const actions = read("src/lib/directives/actions.ts");
  assert.match(actions, /^"use server";/);
  // 팝업(클라이언트 컴포넌트)이 부르므로 조회도 서버 액션이어야 한다
  assert.match(actions, /export async function getSentDirectivesFor/);
  // 상태 변경은 반드시 RPC 로만
  assert.match(actions, /rpc\("accept_work_directive"/);
  assert.match(actions, /rpc\("decline_work_directive"/);
  // 수신자 테이블을 클라이언트에서 직접 UPDATE 하지 않는다
  assert.doesNotMatch(actions, /from\("work_directive_recipients"\)[\s\S]{0,80}\.update\(/);
  // Supabase error 무시 금지
  assert.ok(
    (actions.match(/\.error/g) ?? []).length >= 4,
    "Supabase 응답의 error 를 매 호출마다 확인해야 합니다",
  );
  // 알림 실패가 지시 등록을 되돌리지 않는다
  assert.match(actions, /알림/);

  const constants = read("src/lib/directives/constants.ts");
  assert.match(constants, /대표님 지시/);
  assert.match(constants, /업무 요청/);
});
```

- [ ] **Step 2: 검사 실패 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: 새 테스트가 FAIL — `src/lib/directives/types.ts 이 없습니다`.

- [ ] **Step 3: `types.ts` 작성**

```typescript
import type { ProjectRef } from "@/lib/projects/types";
import type { TaskStatus } from "@/lib/tasks/types";

export type DirectiveKind = "지시" | "요청";
export type DirectiveState = "미확인" | "수락" | "거절";

/** 받는 쪽 카드에 뿌리는 한 건 */
export interface PendingDirective {
  recipient_id: string;
  directive_id: string;
  kind: DirectiveKind;
  title: string;
  body: string;
  priority: string | null;
  due_date: string | null;
  project: ProjectRef | null;
  sender_name: string;
  created_at: string;
}

/** 팝업 아래쪽 "이 사람에게 보낸 지시" 한 건 */
export interface SentDirective {
  recipient_id: string;
  directive_id: string;
  kind: DirectiveKind;
  title: string;
  state: DirectiveState;
  /** state 가 '수락' 일 때만 채워진다. 지시의 진행 상태는 이 값으로 보여준다. */
  task_status: TaskStatus | null;
  decline_reason: string | null;
  created_at: string;
}

/** 표의 이름 옆 배지용 */
export interface DirectivePendingCount {
  user_id: string;
  count: number;
}

export interface CreateDirectiveInput {
  title: string;
  body: string;
  recipientIds: string[];
  priority?: string | null;
  dueDate?: string | null;
  projectId?: string | null;
}
```

- [ ] **Step 4: `constants.ts` 작성**

```typescript
import type { DirectiveKind } from "./types";

export const DIRECTIVE_TITLE_MAX_LENGTH = 200;
export const DIRECTIVE_BODY_MAX_LENGTH = 4000;
export const DIRECTIVE_REASON_MAX_LENGTH = 500;

/** 한 번에 보낼 수 있는 인원 상한 (실수로 전체 발송하는 것을 막는 안전장치) */
export const DIRECTIVE_MAX_RECIPIENTS = 20;

export const DIRECTIVE_KIND_CONFIG: Record<
  DirectiveKind,
  { label: string; badge: string; accent: string; canDecline: boolean }
> = {
  지시: {
    label: "대표님 지시",
    badge: "bg-rose-50 text-rose-700 border-rose-200",
    accent: "border-l-rose-500",
    canDecline: false,
  },
  요청: {
    label: "업무 요청",
    badge: "bg-indigo-50 text-indigo-700 border-indigo-200",
    accent: "border-l-indigo-300",
    canDecline: true,
  },
};
```

- [ ] **Step 5: `actions.ts` 작성**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  DIRECTIVE_BODY_MAX_LENGTH,
  DIRECTIVE_MAX_RECIPIENTS,
  DIRECTIVE_REASON_MAX_LENGTH,
  DIRECTIVE_TITLE_MAX_LENGTH,
} from "./constants";
import type { CreateDirectiveInput, SentDirective } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getAuthenticatedContext(): Promise<{ supabase: ServerClient; userId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} 값이 올바르지 않습니다.`);
}

export async function createDirective(input: CreateDirectiveInput): Promise<void> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("제목을 입력해 주세요.");
  if (title.length > DIRECTIVE_TITLE_MAX_LENGTH) {
    throw new Error(`제목은 ${DIRECTIVE_TITLE_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  if (!body) throw new Error("내용을 입력해 주세요.");
  if (body.length > DIRECTIVE_BODY_MAX_LENGTH) {
    throw new Error(`내용은 ${DIRECTIVE_BODY_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }

  const recipientIds = Array.from(new Set(input.recipientIds));
  if (recipientIds.length === 0) throw new Error("받는 사람을 한 명 이상 선택해 주세요.");
  if (recipientIds.length > DIRECTIVE_MAX_RECIPIENTS) {
    throw new Error(`한 번에 ${DIRECTIVE_MAX_RECIPIENTS}명까지 보낼 수 있습니다.`);
  }
  recipientIds.forEach((id) => assertUuid(id, "받는 사람"));
  if (input.projectId) assertUuid(input.projectId, "프로젝트");

  const { supabase, userId } = await getAuthenticatedContext();

  // kind 는 DB 트리거가 보낸 사람 권한으로 덮어쓴다. 여기서는 자리만 채운다.
  const inserted = await supabase
    .from("work_directives")
    .insert({
      title,
      body,
      kind: "요청",
      priority: input.priority || null,
      due_date: input.dueDate || null,
      project_id: input.projectId || null,
      created_by: userId,
    })
    .select("id, title, kind")
    .single();
  if (inserted.error) throw inserted.error;

  const directive = inserted.data;

  const recipients = await supabase
    .from("work_directive_recipients")
    .insert(recipientIds.map((id) => ({ directive_id: directive.id, user_id: id })));
  if (recipients.error) throw recipients.error;

  // 알림 생성 실패가 지시 등록 자체를 되돌리지 않는다 (업무 도메인 규칙).
  const label = directive.kind === "지시" ? "새 업무지시" : "새 업무 요청";
  const notified = await supabase.from("notifications").insert(
    recipientIds
      .filter((id) => id !== userId)
      .map((id) => ({
        user_id: id,
        type: "work_directive",
        title: label,
        body: directive.title,
        link: "/dashboard",
      }))
  );
  if (notified.error) {
    console.error("업무지시 알림 생성 실패", notified.error);
  }

  revalidatePath("/dashboard");
}

export async function acceptDirective(recipientId: string): Promise<void> {
  assertUuid(recipientId, "업무지시");
  const { supabase } = await getAuthenticatedContext();
  const { error } = await supabase.rpc("accept_work_directive", {
    p_recipient_id: recipientId,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/tasks");
}

export async function declineDirective(recipientId: string, reason: string): Promise<void> {
  assertUuid(recipientId, "업무지시");
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("거절 사유를 입력해 주세요.");
  if (trimmed.length > DIRECTIVE_REASON_MAX_LENGTH) {
    throw new Error(`거절 사유는 ${DIRECTIVE_REASON_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  const { supabase } = await getAuthenticatedContext();
  const { error } = await supabase.rpc("decline_work_directive", {
    p_recipient_id: recipientId,
    p_reason: trimmed,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
}

interface SentDirectiveRow {
  id: string;
  directive_id: string;
  state: SentDirective["state"];
  decline_reason: string | null;
  created_at: string;
  work_directives: { title: string; kind: SentDirective["kind"] } | null;
  tasks: { status: SentDirective["task_status"] } | null;
}

/**
 * 팝업에서 여는 "이 사람에게 보낸 지시" 목록.
 * 대시보드 첫 화면 예산을 늘리지 않기 위해 초기 로드에 넣지 않고, 팝업을 열 때만 부른다.
 * 클라이언트 컴포넌트가 부르므로 서버 액션이어야 한다.
 */
export async function getSentDirectivesFor(targetUserId: string): Promise<SentDirective[]> {
  assertUuid(targetUserId, "직원");
  const { supabase } = await getAuthenticatedContext();
  const { data, error } = await supabase
    .from("work_directive_recipients")
    .select(
      "id, directive_id, state, decline_reason, created_at, work_directives(title, kind), tasks(status)"
    )
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  const rows = (data ?? []) as unknown as SentDirectiveRow[];
  return rows
    .filter((row) => row.work_directives !== null)
    .map((row) => ({
      recipient_id: row.id,
      directive_id: row.directive_id,
      kind: row.work_directives!.kind,
      title: row.work_directives!.title,
      state: row.state,
      task_status: row.state === "수락" ? (row.tasks?.status ?? null) : null,
      decline_reason: row.decline_reason,
      created_at: row.created_at,
    }));
}
```

> RLS 덕분에 이 조회는 **자기가 보낸 지시와 자기가 받은 지시만** 돌려준다. 관리자는 전부 본다. 화면에서 따로 거르지 않아도 남의 지시가 새지 않는다.

- [ ] **Step 6: 검사 통과 + 타입 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs && npx tsc --noEmit
```

기대: 테스트 `fail 0`, `tsc` 출력 없음.

- [ ] **Step 7: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add jdi-portal/src/lib/directives jdi-portal/scripts/work-directives.test.mjs
git commit -m "기능: 업무지시 도메인 모듈(types·constants·actions)"
```

---

### Task 3: 대시보드 데이터 경로 — 빠른 경로 + 폴백

**Files:**
- Modify: `src/lib/dashboard/dashboard-snapshot.ts`
- Modify: `src/lib/dashboard/fast-queries.ts` (상수 `DASHBOARD_SNAPSHOT_QUERY`)
- Modify: `src/lib/dashboard/queries.ts`
- Modify: `scripts/work-directives.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `PendingDirective`, `DirectivePendingCount`
- Produces: `DashboardSnapshot` / `DashboardSnapshotData` / `DashboardData`에 두 필드 추가
  - `pendingDirectives: PendingDirective[]` — **로그인한 본인이 받은** 미확인 지시
  - `directivePendingCounts: DirectivePendingCount[]` — 사용자별 미확인 건수(배지용)

- [ ] **Step 1: 실패하는 검사 추가 (성능 불변조건 3 강제)**

`scripts/work-directives.test.mjs` 끝에 덧붙인다:

```javascript
test("대시보드: 미확인 지시를 빠른 경로와 폴백 양쪽에 싣는다 (성능 불변조건 3)", () => {
  const fast = read("src/lib/dashboard/fast-queries.ts");
  // 같은 스냅샷 쿼리 안에서 처리 — DB 왕복을 늘리지 않는다
  assert.match(fast, /pending_directives/);
  assert.match(fast, /directive_pending_counts/);
  assert.match(fast, /'pendingDirectives'/);
  assert.match(fast, /'directivePendingCounts'/);
  // 미확인 부분 인덱스를 타야 한다
  assert.match(fast, /r\.state = '미확인'/);

  const fallback = read("src/lib/dashboard/queries.ts");
  assert.match(fallback, /pendingDirectives/);
  assert.match(fallback, /directivePendingCounts/);
  assert.match(fallback, /work_directive_recipients/);

  const snapshot = read("src/lib/dashboard/dashboard-snapshot.ts");
  assert.match(snapshot, /pendingDirectives: PendingDirective\[\]/);
  assert.match(snapshot, /directivePendingCounts: DirectivePendingCount\[\]/);
});
```

- [ ] **Step 2: 검사 실패 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: 새 테스트 FAIL.

- [ ] **Step 3: `dashboard-snapshot.ts` 타입 추가**

파일 맨 위 import 에 추가:

```typescript
import type { DirectivePendingCount, PendingDirective } from "../directives/types";
```

`DashboardSnapshot` 인터페이스에 두 줄 추가:

```typescript
export interface DashboardSnapshot {
  todayRecord: AttendanceRecord | null;
  weekRecords: AttendanceRecord[];
  taskSummary: DashboardTaskSummaryResult;
  todayAttendanceStatuses: TodayAttendanceStatus[];
  schedules: ScheduleWithProfile[];
  pendingDirectives: PendingDirective[];
  directivePendingCounts: DirectivePendingCount[];
}
```

`DashboardSnapshotData` 인터페이스에도 같은 두 줄 추가:

```typescript
export interface DashboardSnapshotData {
  todayRecord: AttendanceRecord | null;
  weeklyMinutes: number;
  weekdayWorked: boolean[];
  taskSummary: DashboardTaskSummaryResult;
  todayAttendanceStatuses: TodayAttendanceStatus[];
  todaySchedules: ScheduleWithProfile[];
  recentActivities: unknown[];
  nextScheduleMinutes: number | null;
  userName: string;
  canViewCompanyWork: boolean;
  pendingDirectives: PendingDirective[];
  directivePendingCounts: DirectivePendingCount[];
}
```

`buildDashboardDataFromSnapshot`의 `return` 객체에 두 줄 추가:

```typescript
  return {
    todayRecord: snapshot.todayRecord,
    weeklyMinutes,
    weekdayWorked,
    taskSummary: snapshot.taskSummary,
    todayAttendanceStatuses: snapshot.todayAttendanceStatuses,
    todaySchedules: snapshot.schedules,
    recentActivities: [],
    nextScheduleMinutes,
    userName: context.userName,
    canViewCompanyWork: context.canViewCompanyWork,
    pendingDirectives: snapshot.pendingDirectives,
    directivePendingCounts: snapshot.directivePendingCounts,
  };
```

- [ ] **Step 4: 빠른 경로 SQL에 CTE 2개 추가**

`src/lib/dashboard/fast-queries.ts`의 `DASHBOARD_SNAPSHOT_QUERY` 안, `schedules as (...)` CTE **뒤**이자 마지막 `select jsonb_build_object(` **앞**에 다음 두 CTE를 넣는다(앞 CTE 끝에 쉼표를 붙인다):

```sql
  ,
  pending_directives as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'recipient_id', r.id,
          'directive_id', d.id,
          'kind', d.kind,
          'title', d.title,
          'body', d.body,
          'priority', d.priority,
          'due_date', d.due_date,
          'project', (
            select jsonb_build_object('id', pj.id, 'name', pj.name, 'color', pj.color)
            from public.projects pj
            where pj.id = d.project_id
          ),
          'sender_name', coalesce(sender.full_name, ''),
          'created_at', r.created_at
        )
        -- 대표님 지시(=admin 발신)를 항상 위로, 그다음 오래된 순
        order by case when d.kind = '지시' then 0 else 1 end asc, r.created_at asc
      ),
      '[]'::jsonb
    ) as value
    from public.work_directive_recipients r
    join public.work_directives d on d.id = r.directive_id
    left join public.profiles sender on sender.id = d.created_by
    cross join parameters prm
    cross join approved_requester
    where r.state = '미확인'
      and r.user_id = prm.user_id
  ),
  directive_pending_counts as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('user_id', c.user_id, 'count', c.pending_count)
        order by c.user_id asc
      ),
      '[]'::jsonb
    ) as value
    from (
      select r.user_id, count(*)::int as pending_count
      from public.work_directive_recipients r
      cross join approved_requester
      where r.state = '미확인'
      group by r.user_id
    ) c
  )
```

같은 파일의 마지막 `select jsonb_build_object(...)`에 두 키를 추가한다. `'schedules', (select value from schedules)` 줄 뒤에:

```sql
    'schedules', (select value from schedules),
    'pendingDirectives', (select value from pending_directives),
    'directivePendingCounts', (select value from directive_pending_counts)
  ) as snapshot
  from approved_requester
```

`directive_pending_counts`는 배지용이라 건수만 가져온다. 두 CTE 모두 `work_directive_recipients_pending` 부분 인덱스를 탄다. **DB 왕복은 여전히 1회다.**

- [ ] **Step 5: 폴백 경로에 같은 데이터 채우기**

`src/lib/dashboard/queries.ts` 상단 import 에 추가:

```typescript
import type { DirectivePendingCount, PendingDirective } from "../directives/types";
```

같은 파일에 조회 함수 두 개를 추가한다(파일 안 다른 `get*` 함수들 옆):

```typescript
interface PendingDirectiveRow {
  id: string;
  directive_id: string;
  created_at: string;
  work_directives: {
    kind: PendingDirective["kind"];
    title: string;
    body: string;
    priority: string | null;
    due_date: string | null;
    project: { id: string; name: string; color: string } | null;
    profiles: { full_name: string | null } | null;
  } | null;
}

async function getPendingDirectives(
  supabase: SupabaseClient,
  userId: string
): Promise<PendingDirective[]> {
  const { data, error } = await supabase
    .from("work_directive_recipients")
    .select(
      "id, directive_id, created_at, work_directives(kind, title, body, priority, due_date, project:projects(id, name, color), profiles(full_name))"
    )
    .eq("user_id", userId)
    .eq("state", "미확인")
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as PendingDirectiveRow[];
  return rows
    .filter((row) => row.work_directives !== null)
    .map((row) => ({
      recipient_id: row.id,
      directive_id: row.directive_id,
      kind: row.work_directives!.kind,
      title: row.work_directives!.title,
      body: row.work_directives!.body,
      priority: row.work_directives!.priority,
      due_date: row.work_directives!.due_date,
      project: row.work_directives!.project,
      sender_name: row.work_directives!.profiles?.full_name ?? "",
      created_at: row.created_at,
    }))
    .sort((a, b) => {
      // 빠른 경로와 같은 정렬: 지시 먼저, 그다음 오래된 순
      if (a.kind !== b.kind) return a.kind === "지시" ? -1 : 1;
      return a.created_at.localeCompare(b.created_at);
    });
}

async function getDirectivePendingCounts(
  supabase: SupabaseClient
): Promise<DirectivePendingCount[]> {
  const { data, error } = await supabase
    .from("work_directive_recipients")
    .select("user_id")
    .eq("state", "미확인");

  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { user_id: string }[]) {
    counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  }
  return Array.from(counts, ([user_id, count]) => ({ user_id, count })).sort((a, b) =>
    a.user_id.localeCompare(b.user_id)
  );
}
```

`getDashboardData`의 `Promise.all`에 두 개를 더하고 스냅샷에 넘긴다:

```typescript
  const [
    todayRecord,
    weekRecords,
    taskSummary,
    todaySchedules,
    todayAttendanceStatuses,
    pendingDirectives,
    directivePendingCounts,
  ] = await Promise.all([
    getTodayRecord(supabase, userId),
    getWeekRecords(supabase, userId, weekStart, weekEnd),
    getDashboardTaskSummaryFallback(supabase, taskSummaryWindow),
    getTodaySchedules(supabase, today),
    getTodayAttendanceStatuses(supabase),
    getPendingDirectives(supabase, userId),
    getDirectivePendingCounts(supabase),
  ]);

  const snapshotData = buildDashboardDataFromSnapshot({
    todayRecord,
    weekRecords,
    taskSummary,
    todayAttendanceStatuses,
    schedules: todaySchedules,
    pendingDirectives,
    directivePendingCounts,
  }, {
    userName,
    canViewCompanyWork,
    weekStart,
    now,
  });
```

- [ ] **Step 6: 검사·타입·전체 회귀 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs && npx tsc --noEmit && npm run test:performance
```

기대: 모두 `fail 0`, `tsc` 출력 없음.

- [ ] **Step 7: 수동 확인 — 두 경로가 같은 값을 주는지**

```bash
cd jdi-portal && npm run dev
```

브라우저에서 `http://localhost:3000/dashboard` 를 연다. 터미널 로그의 `dashboard task summary` 줄에서 `source` 를 확인한다.
- `source: "pool"` 이면 빠른 경로가 쓰이는 중이다.
- `.env.local`의 `DATABASE_URL`을 잠시 주석 처리하고 서버를 재시작하면 `source: "rpc"`(폴백)로 바뀐다. 두 경우 모두 화면이 같아야 한다. 확인 후 주석을 되돌린다.

- [ ] **Step 8: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add jdi-portal/src/lib/dashboard jdi-portal/scripts/work-directives.test.mjs
git commit -m "기능: 대시보드에 미확인 업무지시 싣기(빠른경로+폴백 양쪽)"
```

---

### Task 4: 받는 쪽 — `DirectiveInboxWidget`

**Files:**
- Create: `src/components/dashboard/widgets/DirectiveInboxWidget.tsx`
- Modify: `src/components/dashboard/DashboardClient.tsx`
- Modify: `scripts/work-directives.test.mjs`

**Interfaces:**
- Consumes: `PendingDirective`(Task 2), `acceptDirective` / `declineDirective`(Task 2), `data.pendingDirectives`(Task 3), 기존 `TodayAttendanceStatus`
- Produces: 기본 export `DirectiveInboxWidget`, props `{ userId: string; directives: PendingDirective[]; attendanceStatuses: TodayAttendanceStatus[] }`

- [ ] **Step 1: 실패하는 검사 추가**

`scripts/work-directives.test.mjs` 끝에 덧붙인다:

```javascript
test("받는 쪽 위젯: 출근 연동·종류 분리·수락 흐름", () => {
  const path = "src/components/dashboard/widgets/DirectiveInboxWidget.tsx";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const widget = read(path);

  assert.match(widget, /^"use client";/);
  // 출근 전에는 접힌 한 줄
  assert.match(widget, /hasCheckedIn/);
  // 종류별 배지
  assert.match(widget, /DIRECTIVE_KIND_CONFIG/);
  // 지시는 거절 불가
  assert.match(widget, /canDecline/);
  assert.match(widget, /acceptDirective/);
  assert.match(widget, /declineDirective/);
  // 수락 후 오늘 할 일과 함께 갱신
  assert.match(widget, /router\.refresh\(\)/);

  const client = read("src/components/dashboard/DashboardClient.tsx");
  assert.match(client, /DirectiveInboxWidget/);
  // 오늘 할 일 위젯보다 위에 놓인다
  assert.ok(
    client.indexOf("DirectiveInboxWidget") < client.indexOf("<TodayWorkBoardWidget"),
    "DirectiveInboxWidget 은 TodayWorkBoardWidget 보다 위에 있어야 합니다",
  );
});
```

- [ ] **Step 2: 검사 실패 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: FAIL — `src/components/dashboard/widgets/DirectiveInboxWidget.tsx 이 없습니다`.

- [ ] **Step 3: 위젯 작성**

`src/components/dashboard/widgets/DirectiveInboxWidget.tsx` 생성:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, SpinnerGap, X } from "phosphor-react";
import { toast } from "sonner";
import type { TodayAttendanceStatus } from "@/lib/attendance/types";
import type { PendingDirective } from "@/lib/directives/types";
import { DIRECTIVE_KIND_CONFIG } from "@/lib/directives/constants";
import { acceptDirective, declineDirective } from "@/lib/directives/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { formatDueDate } from "@/lib/tasks/utils";

interface Props {
  userId: string;
  directives: PendingDirective[];
  attendanceStatuses: TodayAttendanceStatus[];
}

function hasCheckedIn(statuses: TodayAttendanceStatus[], userId: string): boolean {
  const mine = statuses.find((status) => status.user_id === userId);
  return mine !== undefined && mine.status !== "미출근";
}

export default function DirectiveInboxWidget({ userId, directives, attendanceStatuses }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [expanded, setExpanded] = useState(false);

  if (directives.length === 0) return null;

  const checkedIn = hasCheckedIn(attendanceStatuses, userId);
  const open = checkedIn || expanded;

  const handleAccept = (recipientId: string) => {
    setBusyId(recipientId);
    startTransition(async () => {
      try {
        await acceptDirective(recipientId);
        toast.success("수락했습니다. 오늘 할 일에 추가되었어요.");
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setBusyId(null);
      }
    });
  };

  const handleDecline = (recipientId: string) => {
    setBusyId(recipientId);
    startTransition(async () => {
      try {
        await declineDirective(recipientId, reason);
        toast.success("거절했습니다.");
        setDeclineFor(null);
        setReason("");
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setBusyId(null);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl px-5 py-3 text-left hover:border-indigo-300 focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <span className="text-sm font-semibold text-slate-700">
          확인할 업무지시 {directives.length}건
        </span>
        <span className="text-xs text-slate-400">출근 후 확인해 주세요 · 눌러서 펼치기</span>
      </button>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
          업무지시
          <span className="inline-flex items-center justify-center min-w-[1.5rem] px-2 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-bold">
            {directives.length}
          </span>
        </h2>
        <p className="text-xs text-slate-400">수락하면 오늘 할 일에 추가됩니다</p>
      </header>

      <ul>
        {directives.map((directive) => {
          const config = DIRECTIVE_KIND_CONFIG[directive.kind];
          const busy = busyId === directive.recipient_id && pending;
          return (
            <li
              key={directive.recipient_id}
              className={`flex flex-col gap-3 px-5 py-4 border-l-[3px] ${config.accent} border-t border-t-slate-100 first:border-t-0 sm:flex-row sm:items-start sm:gap-4`}
            >
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span
                  className={`self-start text-[11px] font-bold px-2 py-0.5 rounded-full border ${config.badge}`}
                >
                  {config.label}
                </span>
                <p className="font-semibold text-slate-800 text-sm">{directive.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed whitespace-pre-line">
                  {directive.body}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span>{directive.sender_name}</span>
                  {directive.due_date && (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      {formatDueDate(directive.due_date)}
                    </span>
                  )}
                  {directive.priority && (
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      중요도 {directive.priority}
                    </span>
                  )}
                  {directive.project && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: directive.project.color }}
                    >
                      {directive.project.name}
                    </span>
                  )}
                </div>

                {declineFor === directive.recipient_id && (
                  <div className="flex flex-col gap-2 mt-1 sm:flex-row">
                    <input
                      type="text"
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="거절 사유를 입력해 주세요"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-2 focus:outline-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleDecline(directive.recipient_id)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      거절 보내기
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeclineFor(null);
                        setReason("");
                      }}
                      className="px-2 py-1.5 rounded-lg text-slate-400 text-xs"
                      aria-label="거절 취소"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2 sm:flex-col sm:w-auto">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAccept(directive.recipient_id)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50"
                >
                  {busy ? <SpinnerGap size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  수락
                </button>
                {config.canDecline && declineFor !== directive.recipient_id && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDeclineFor(directive.recipient_id)}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50"
                  >
                    거절
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: `DashboardClient.tsx`에 배치**

import 추가:

```tsx
import DirectiveInboxWidget from "./widgets/DirectiveInboxWidget";
```

`{children}` 아래, `<TodayWorkBoardWidget` **바로 위**에 넣는다:

```tsx
      <DirectiveInboxWidget
        userId={userId}
        directives={data.pendingDirectives}
        attendanceStatuses={data.todayAttendanceStatuses}
      />

      <TodayWorkBoardWidget
```

- [ ] **Step 5: 검사·타입·린트 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs && npx tsc --noEmit && npm run lint
```

기대: 테스트 `fail 0`, `tsc` 출력 없음, lint 오류 없음.

- [ ] **Step 6: 수동 확인 — 한 바퀴 돌려보기**

```bash
cd jdi-portal && npm run dev
```

Supabase SQL Editor 에서 본인 계정으로 테스트 지시를 하나 만든다 (`<본인 UUID>`를 실제 값으로 바꾼다):

```sql
WITH d AS (
  INSERT INTO public.work_directives (title, body, kind, created_by)
  VALUES ('테스트 지시', '수락 흐름 확인용입니다.', '요청', '<본인 UUID>')
  RETURNING id
)
INSERT INTO public.work_directive_recipients (directive_id, user_id)
SELECT d.id, '<본인 UUID>' FROM d;
```

`/dashboard`를 새로고침한다. 확인할 것:
1. 출근 전이면 접힌 한 줄, 출근 후면 카드가 펼쳐진다.
2. `수락`을 누르면 항목이 사라지고 바로 아래 오늘 할 일에 나타난다.
3. 브라우저 폭을 400px 로 줄여도 가로 스크롤이 생기지 않고 버튼이 아래로 내려간다.

- [ ] **Step 7: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add jdi-portal/src/components/dashboard jdi-portal/scripts/work-directives.test.mjs
git commit -m "기능: 대시보드 업무지시 카드(수락/거절, 출근 연동)"
```

---

### Task 5: 보내는 쪽 — 이름 클릭 팝업 `MemberWorkPanel`

**Files:**
- Create: `src/components/dashboard/widgets/MemberWorkPanel.tsx`
- Modify: `src/components/dashboard/widgets/TodayWorkBoardWidget.tsx`
- Modify: `src/components/dashboard/DashboardClient.tsx` (`directivePendingCounts` 전달)
- Modify: `scripts/work-directives.test.mjs`

**Interfaces:**
- Consumes: `createDirective`(Task 2), `getSentDirectivesFor`(Task 2), `DirectivePendingCount`(Task 3), 기존 `DashboardTaskPerson`·`DashboardTaskSummary`·`useProjects`·`ModalContainer`·`UserAvatar`
- Produces: 기본 export `MemberWorkPanel`, props
  `{ member: DashboardTaskPerson; tasks: DashboardTaskSummary[]; profiles: DashboardTaskPerson[]; pendingCount: number; attendanceLabel: string; onClose: () => void }`

- [ ] **Step 1: 실패하는 검사 추가**

`scripts/work-directives.test.mjs` 끝에 덧붙인다:

```javascript
test("보내는 쪽 팝업: 오늘 업무 3줄 + 지시 작성 + 표 배지", () => {
  const path = "src/components/dashboard/widgets/MemberWorkPanel.tsx";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const panel = read(path);

  assert.match(panel, /^"use client";/);
  // 대기 / 진행중 / 완료 세 줄을 한 카드에
  assert.match(panel, /대기/);
  assert.match(panel, /진행중/);
  assert.match(panel, /완료/);
  assert.match(panel, /createDirective/);
  // 보낸 지시 목록은 팝업을 열 때만 조회 (대시보드 초기 예산 보호)
  assert.match(panel, /getSentDirectivesFor/);
  assert.match(panel, /useEffect/);

  const widget = read("src/components/dashboard/widgets/TodayWorkBoardWidget.tsx");
  // 이름이 버튼이 된다
  assert.match(widget, /MemberWorkPanel/);
  assert.match(widget, /setPanelMember/);
  // 미확인 배지
  assert.match(widget, /directivePendingCounts/);
  assert.match(widget, /미확인/);
});
```

- [ ] **Step 2: 검사 실패 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: FAIL — `src/components/dashboard/widgets/MemberWorkPanel.tsx 이 없습니다`.

- [ ] **Step 3: 팝업 컴포넌트 작성**

`src/components/dashboard/widgets/MemberWorkPanel.tsx` 생성:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "phosphor-react";
import { toast } from "sonner";
import ModalContainer from "@/components/shared/ModalContainer";
import UserAvatar from "@/components/shared/UserAvatar";
import Select from "@/components/shared/Select";
import type {
  DashboardTaskPerson,
  DashboardTaskSummary,
} from "@/lib/dashboard/dashboard-task-summary";
import type { SentDirective } from "@/lib/directives/types";
import { createDirective, getSentDirectivesFor } from "@/lib/directives/actions";
import { getErrorMessage } from "@/lib/utils/errors";
import { useProjects } from "@/lib/projects/useProjects";
import { toProjectEditOptions } from "@/lib/projects/utils";

interface Props {
  member: DashboardTaskPerson;
  tasks: DashboardTaskSummary[];
  profiles: DashboardTaskPerson[];
  pendingCount: number;
  attendanceLabel: string;
  onClose: () => void;
}

const PRIORITY_OPTIONS = [
  { value: "", label: "중요도 선택 안 함" },
  { value: "긴급", label: "긴급" },
  { value: "높음", label: "높음" },
  { value: "보통", label: "보통" },
  { value: "낮음", label: "낮음" },
];

const STATE_BADGE: Record<string, string> = {
  미확인: "bg-amber-50 text-amber-700",
  거절: "bg-slate-100 text-slate-500",
  대기: "bg-slate-100 text-slate-600",
  진행중: "bg-amber-50 text-amber-700",
  완료: "bg-emerald-50 text-emerald-700",
};

function stateLabel(item: SentDirective): string {
  if (item.state === "수락") return item.task_status ?? "수락";
  return item.state;
}

export default function MemberWorkPanel({
  member,
  tasks,
  profiles,
  pendingCount,
  attendanceLabel,
  onClose,
}: Props) {
  const router = useRouter();
  const { projects } = useProjects();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState<SentDirective[] | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipientIds, setRecipientIds] = useState<string[]>([member.id]);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    let alive = true;
    getSentDirectivesFor(member.id)
      .then((rows) => {
        if (alive) setSent(rows);
      })
      .catch(() => {
        if (alive) setSent([]);
      });
    return () => {
      alive = false;
    };
  }, [member.id]);

  const waiting = tasks.filter((task) => task.status === "대기");
  const doing = tasks.filter((task) => task.status === "진행중");
  const done = tasks.filter((task) => task.status === "완료");

  const rows: { key: string; label: string; items: DashboardTaskSummary[]; tone: string }[] = [
    { key: "wait", label: "대기", items: waiting, tone: "text-slate-800" },
    { key: "doing", label: "진행중", items: doing, tone: "text-amber-600" },
    { key: "done", label: "완료", items: done, tone: "text-emerald-600" },
  ];

  const toggleRecipient = (id: string) => {
    setRecipientIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    startTransition(async () => {
      try {
        await createDirective({
          title,
          body,
          recipientIds,
          priority: priority || null,
          dueDate: dueDate || null,
          projectId: projectId || null,
        });
        toast.success("업무지시를 보냈습니다.");
        onClose();
        router.refresh();
      } catch (error) {
        toast.error(getErrorMessage(error));
      }
    });
  };

  return (
    <ModalContainer onClose={onClose} maxWidth="max-w-xl" className="!p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <UserAvatar name={member.full_name} avatarUrl={member.avatar_url} />
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800">{member.full_name}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
              {attendanceLabel}
            </span>
            {pendingCount > 0 && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">
                지시 {pendingCount} 미확인
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-slate-400">
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {/* 오늘 업무 — 한 카드에 세 줄 */}
        <section className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-[11px] font-bold tracking-wider text-slate-400 mb-2">오늘 업무</h3>
          <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50">
            {rows.map((row) => (
              <div
                key={row.key}
                className="flex items-baseline gap-3 px-3 py-2 border-t border-slate-100 first:border-t-0"
              >
                <span className="flex items-baseline gap-1.5 w-[4.2rem] shrink-0 text-xs font-semibold text-slate-500">
                  {row.label}
                  <b className={`ml-auto text-sm tabular-nums ${row.tone}`}>{row.items.length}</b>
                </span>
                <span className="flex-1 min-w-0 text-xs text-slate-400 truncate">
                  {row.items.length === 0
                    ? "아직 없음"
                    : row.items.map((task) => task.title).join(" · ")}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* 업무 지시하기 */}
        <section className="px-5 py-4 border-b border-slate-100 flex flex-col gap-3">
          <h3 className="text-[11px] font-bold tracking-wider text-slate-400">업무 지시하기</h3>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">제목</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="무엇을 해야 하나요?"
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">내용</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={4}
              placeholder="배경과 원하는 결과를 적어 주세요."
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-2 focus:outline-indigo-500"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-slate-600">받는 사람</span>
            <div className="flex flex-wrap gap-1.5">
              {profiles.map((profile) => {
                const selected = recipientIds.includes(profile.id);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => toggleRecipient(profile.id)}
                    aria-pressed={selected}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      selected
                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                        : "bg-white text-slate-500 border-slate-200"
                    }`}
                  >
                    {profile.full_name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">마감일 (선택)</span>
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">중요도 (선택)</span>
              <Select value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
            </label>
            <label className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-semibold text-slate-600">프로젝트 (선택)</span>
              <Select
                value={projectId}
                onChange={setProjectId}
                options={toProjectEditOptions(projects, projectId)}
              />
            </label>
          </div>
        </section>

        {/* 보낸 지시 */}
        <section className="px-5 py-4">
          <h3 className="text-[11px] font-bold tracking-wider text-slate-400 mb-2">
            {member.full_name}님에게 보낸 지시
          </h3>
          {sent === null && <p className="text-xs text-slate-400">불러오는 중…</p>}
          {sent !== null && sent.length === 0 && (
            <p className="text-xs text-slate-400">아직 보낸 지시가 없습니다.</p>
          )}
          <ul className="flex flex-col gap-1.5">
            {(sent ?? []).map((item) => (
              <li
                key={item.recipient_id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100"
              >
                <span className="text-xs text-slate-600 truncate">{item.title}</span>
                <span
                  className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                    STATE_BADGE[stateLabel(item)] ?? "bg-slate-100 text-slate-500"
                  }`}
                >
                  {stateLabel(item)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="flex gap-2 justify-end px-5 py-3 bg-slate-50 border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-semibold"
        >
          닫기
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={handleSubmit}
          className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-bold disabled:opacity-50"
        >
          지시 보내기
        </button>
      </div>
    </ModalContainer>
  );
}
```

- [ ] **Step 4: `TodayWorkBoardWidget.tsx` — 이름 버튼화 + 배지**

props 인터페이스에 한 줄 추가:

```tsx
import type { DirectivePendingCount } from "@/lib/directives/types";
import MemberWorkPanel from "./MemberWorkPanel";

interface Props {
  userId: string;
  profiles: DashboardTaskPerson[];
  taskSummary: DashboardTaskSummaryResult;
  attendanceStatuses: TodayAttendanceStatus[];
  schedules: ScheduleWithProfile[];
  defaultAssigneeFilter: string;
  directivePendingCounts: DirectivePendingCount[];
}
```

컴포넌트 본문(다른 `useState` 선언들 옆)에 상태와 헬퍼를 추가한다:

```tsx
  const [panelMember, setPanelMember] = useState<DashboardTaskPerson | null>(null);

  // 주의: 아래 approvedProfiles.map 안에는 이미 `pendingCount`(대기 업무 수)가 있다.
  // 이름이 겹치지 않도록 지시 미확인 수는 directivePendingOf 로 읽는다.
  const directivePendingOf = (profileId: string): number =>
    directivePendingCounts.find((entry) => entry.user_id === profileId)?.count ?? 0;

  const memberBadge = (profileId: string) => {
    const count = directivePendingOf(profileId);
    if (count === 0) return null;
    return (
      <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
        지시 {count} 미확인
      </span>
    );
  };
```

"직원별 오늘 현황" 목록에는 이름이 **두 군데** 나온다(모바일용과 데스크톱용). 둘 다 버튼으로 바꾼다.

**① 모바일 (파일의 `{/* 모바일: 이름 줄 + 통계 한 줄 (아바타 제거) */}` 아래)** — 다음 줄을

```tsx
                        <p className="truncate text-sm font-bold text-slate-800">{profile.full_name}</p>
```

다음으로 바꾼다:

```tsx
                        <button
                          type="button"
                          onClick={() => setPanelMember(profile)}
                          className="flex min-w-0 items-center gap-1.5 rounded text-left focus-visible:outline-2 focus-visible:outline-indigo-500"
                        >
                          <span className="truncate text-sm font-bold text-slate-800">{profile.full_name}</span>
                          {memberBadge(profile.id)}
                        </button>
```

**② 데스크톱 (파일의 `{/* 데스크톱: 기존 표 행 그대로 */}` 아래)** — 같은 모양의 줄이 한 번 더 나온다. 그 줄도 위와 똑같은 버튼으로 바꾼다(들여쓰기만 파일에 맞춘다).

> 두 곳 모두 `<p>` 를 `<button>` 으로 바꾸는 것이므로, 바꾼 뒤 파일에 `{profile.full_name}</p>` 가 남아 있지 않아야 한다. `grep -c "full_name}</p>" src/components/dashboard/widgets/TodayWorkBoardWidget.tsx` 결과가 `0` 인지 확인한다.

컴포넌트 return 문 끝(다른 모달들이 렌더링되는 자리)에 팝업을 추가한다:

```tsx
      {panelMember && (
        <MemberWorkPanel
          member={panelMember}
          tasks={todayBoardTasks.filter((task) => taskBelongsToProfile(task, panelMember.id))}
          profiles={approvedProfiles}
          pendingCount={directivePendingOf(panelMember.id)}
          attendanceLabel={getAttendanceText(attendanceByUser.get(panelMember.id))}
          onClose={() => setPanelMember(null)}
        />
      )}
```

> `todayBoardTasks`, `approvedProfiles`, `attendanceByUser`, `taskBelongsToProfile`, `getAttendanceText` 는 모두 이 파일에 이미 있는 변수·함수다. 새로 만들지 않는다.

- [ ] **Step 5: `DashboardClient.tsx`에서 새 prop 전달**

```tsx
      <TodayWorkBoardWidget
        userId={userId}
        profiles={data.taskSummary.profiles}
        taskSummary={data.taskSummary}
        attendanceStatuses={data.todayAttendanceStatuses}
        schedules={data.todaySchedules}
        defaultAssigneeFilter={defaultTaskAssigneeFilter}
        directivePendingCounts={data.directivePendingCounts}
      />
```

- [ ] **Step 6: 검사·타입·린트·전체 회귀**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs && npx tsc --noEmit && npm run lint && npm run test:performance
```

기대: 모두 통과.

> ⚠️ `npm run test:performance`의 기존 검사 중 일부는 `TodayWorkBoardWidget.tsx`가 **네이티브 `<select>`** 를 쓰는지 확인한다. 이 파일의 기존 필터 UI를 커스텀 드롭다운으로 바꾸지 않는다. 이번 작업에서는 이름 렌더링과 팝업만 건드린다.

- [ ] **Step 7: 수동 확인**

```bash
cd jdi-portal && npm run dev
```

`/dashboard`에서:
1. "직원별 오늘 현황"의 이름을 클릭 → 팝업이 열린다.
2. "오늘 업무"가 **한 카드에 대기 / 진행중 / 완료 세 줄**로 보인다.
3. 제목·내용을 쓰고 `지시 보내기` → 성공 토스트, 팝업 닫힘.
4. 받는 사람 계정으로 로그인하면 대시보드 위쪽에 그 지시가 보인다.
5. 미확인이 있는 사람 이름 옆에 `지시 N 미확인` 배지가 보인다.
6. 폭 400px 에서 팝업이 가로 스크롤 없이 보이고 버튼이 전체 폭을 쓴다.

- [ ] **Step 8: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add jdi-portal/src/components/dashboard jdi-portal/scripts/work-directives.test.mjs
git commit -m "기능: 오늘 업무 현황 이름 클릭 팝업(업무 확인+지시 등록+미확인 배지)"
```

---

### Task 6: 알림 — 마이그레이션 104 + 조용한 시간

**Files:**
- Create: `supabase/migrations/104_work_directive_reminder.sql`
- Modify: `supabase/functions/push-dispatch/index.ts`
- Modify: `scripts/work-directives.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `work_directive_recipients`, 기존 `public.notifications`, `public.attendance_records`
- Produces: `public.remind_pending_work_directives() RETURNS VOID`, pg_cron 작업 `work_directive_reminder`

- [ ] **Step 1: 실패하는 검사 추가**

`scripts/work-directives.test.mjs` 끝에 덧붙인다:

```javascript
test("104 마이그레이션: 미확인 재촉은 KST 기준 평일 1회", () => {
  const path = "supabase/migrations/104_work_directive_reminder.sql";
  assert.ok(exists(path), `${path} 이 없습니다`);
  const sql = read(path);

  assert.match(sql, /FUNCTION public\.remind_pending_work_directives\(\)/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = public/);
  // KST 고정
  assert.match(sql, /NOW\(\) AT TIME ZONE 'Asia\/Seoul'/);
  assert.doesNotMatch(sql, /CURRENT_DATE/);
  // 출근한 사람에게만
  assert.match(sql, /attendance_records/);
  // 하루 1회 (중복 방지)
  assert.match(sql, /reminded_on/);
  // 평일 11:00 KST = 02:00 UTC
  assert.match(sql, /cron\.schedule\(\s*'work_directive_reminder',\s*'0 2 \* \* 1-5'/);
  // 받는 사람 + 보낸 사람 양쪽 알림
  assert.match(sql, /work_directive_reminder'/);
  assert.match(sql, /work_directive_pending'/);
});

test("push-dispatch: 알림 타입 등록 + 밤 시간 푸시 차단", () => {
  const fn = read("supabase/functions/push-dispatch/index.ts");
  for (const type of [
    "work_directive",
    "work_directive_answer",
    "work_directive_reminder",
    "work_directive_pending",
  ]) {
    assert.ok(fn.includes(`${type}:`), `SETTING_KEY_BY_TYPE 에 ${type} 이 없습니다`);
  }
  // 조용한 시간
  assert.match(fn, /QUIET_HOURS/);
  assert.match(fn, /Asia\/Seoul/);
});
```

- [ ] **Step 2: 검사 실패 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs
```

기대: 새 테스트 2개 FAIL.

- [ ] **Step 3: 마이그레이션 104 작성**

`supabase/migrations/104_work_directive_reminder.sql` 생성:

```sql
-- ============================================================
-- 104: 업무지시 미확인 재촉
--   출근했는데도 12시간 넘게 확인하지 않은 지시를 평일 오전 11시(KST)에 한 번만 알린다.
-- ============================================================

CREATE OR REPLACE FUNCTION public.remind_pending_work_directives()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      rec.id AS recipient_id,
      rec.user_id,
      d.created_by AS sender_id,
      d.title,
      d.kind,
      COALESCE(p.full_name, '동료') AS recipient_name
    FROM public.work_directive_recipients rec
    JOIN public.work_directives d ON d.id = rec.directive_id
    LEFT JOIN public.profiles p ON p.id = rec.user_id
    WHERE rec.state = '미확인'
      AND rec.created_at < NOW() - INTERVAL '12 hours'
      AND (rec.reminded_on IS NULL OR rec.reminded_on < v_today)
      AND EXISTS (
        SELECT 1 FROM public.attendance_records ar
        WHERE ar.user_id = rec.user_id
          AND ar.work_date = v_today
          AND ar.status <> '미출근'
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      r.user_id,
      'work_directive_reminder',
      CASE WHEN r.kind = '지시' THEN '확인하지 않은 업무지시' ELSE '확인하지 않은 업무 요청' END,
      '"' || r.title || '" 아직 확인하지 않았습니다.',
      '/dashboard'
    );

    IF r.sender_id <> r.user_id THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (
        r.sender_id,
        'work_directive_pending',
        '아직 미확인입니다',
        r.recipient_name || '님이 "' || r.title || '" 을(를) 아직 확인하지 않았습니다.',
        '/dashboard'
      );
    END IF;

    UPDATE public.work_directive_recipients
    SET reminded_on = v_today
    WHERE id = r.recipient_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.remind_pending_work_directives() FROM PUBLIC;

-- 평일 11:00 KST = 02:00 UTC
SELECT cron.schedule(
  'work_directive_reminder',
  '0 2 * * 1-5',
  $$ SELECT public.remind_pending_work_directives(); $$
);
```

- [ ] **Step 4: `push-dispatch` 수정**

`supabase/functions/push-dispatch/index.ts`의 `SETTING_KEY_BY_TYPE` 객체에 4줄 추가한다(`expense_due: "expense_notify",` 다음 줄):

```typescript
  work_directive: "system_announce",
  work_directive_answer: "system_announce",
  work_directive_reminder: "system_announce",
  work_directive_pending: "system_announce",
```

같은 파일 `SETTING_KEY_BY_TYPE` 정의 아래에 조용한 시간 규칙을 추가한다:

```typescript
// 밤에 등록된 업무지시는 인앱 알림만 남기고 푸시는 보내지 않는다 (퇴근 후 시간 보호).
// 아침에 포털을 열면 대시보드에 그대로 떠 있다.
const QUIET_HOURS_TYPES = new Set(["work_directive"]);
const QUIET_HOURS_START = 22; // 22:00 KST 부터
const QUIET_HOURS_END = 7;    // 07:00 KST 까지

function isWithinQuietHours(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}
```

`resolveRecipientsForNotifications` 안에서 `settingKey` 를 계산한 뒤, 반환 직전에 조용한 시간을 확인해 수신자를 비운다:

```typescript
  const settingKey = SETTING_KEY_BY_TYPE[type] ?? null;
  const userIds = QUIET_HOURS_TYPES.has(type) && isWithinQuietHours() ? [] : [userId];
  return {
    userIds,
    payload: { title, body, link, tag: `notif:${record.id}` },
    settingKey,
  };
```

- [ ] **Step 5: 검사 통과 확인**

```bash
cd jdi-portal && node --test scripts/work-directives.test.mjs && npm run test:performance
```

기대: 모두 `fail 0`.

- [ ] **Step 6: 배포 — 사용자 확인 필요**

⚠️ **운영 DB와 Edge Function 배포다. 실행 전에 사용자에게 알리고 동의를 받는다.**

```bash
cd jdi-portal && yes | npx supabase db push --linked
cd jdi-portal && npx supabase functions deploy push-dispatch --no-verify-jwt
```

- [ ] **Step 7: 수동 확인**

Supabase SQL Editor 에서 재촉 함수를 직접 한 번 돌려 본다(오늘 출근 기록이 있어야 대상이 잡힌다):

```sql
SELECT public.remind_pending_work_directives();
SELECT id, state, reminded_on FROM public.work_directive_recipients ORDER BY created_at DESC LIMIT 5;
```

같은 날 두 번 돌려도 알림이 한 번만 늘어나는지 확인한다:

```sql
SELECT count(*) FROM public.notifications WHERE type = 'work_directive_reminder';
```

밤 시간 규칙은 22시 이후에 지시를 하나 등록해 폰 푸시가 오지 않고 포털 알림함에는 남는지로 확인한다.

- [ ] **Step 8: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add jdi-portal/supabase jdi-portal/scripts/work-directives.test.mjs
git commit -m "기능: 업무지시 알림(104 재촉 cron + 밤 시간 푸시 차단)"
```

---

### Task 7: 마무리 — 문서 갱신과 최종 검증

**Files:**
- Modify: `CLAUDE.md` (저장소 루트)
- Modify: `docs/superpowers/specs/2026-07-24-work-directives-design.md` (상태 표시)

**Interfaces:**
- Consumes: Task 1~6의 결과 전부
- Produces: 없음 (문서/검증만)

- [ ] **Step 1: 루트 `CLAUDE.md`의 최신 마이그레이션 번호 갱신**

"마이그레이션" 문단에서 다음 문장을 찾는다:

```
현재 최신은 **`102_dashboard_task_summary_project.sql`** — 기존 파일 수정 대신 다음 번호로 **추가**합니다.
```

다음으로 바꾼다:

```
현재 최신은 **`104_work_directive_reminder.sql`** — 기존 파일 수정 대신 다음 번호로 **추가**합니다.
```

- [ ] **Step 2: 도메인 목록에 `directives` 추가**

같은 파일의 도메인 목록 문장에서 `` `notifications`(알림) `` 앞에 `` `directives`(업무지시), `` 를 끼워 넣는다.

- [ ] **Step 3: 설계 문서 상태를 승인됨으로**

`docs/superpowers/specs/2026-07-24-work-directives-design.md`의 머리말에서

```
- 상태: 사용자 승인 대기
```

를 다음으로 바꾼다:

```
- 상태: 승인됨 · 구현 완료 (계획: docs/superpowers/plans/2026-07-24-work-directives.md)
```

- [ ] **Step 4: 최종 전체 검증**

```bash
cd jdi-portal && npx tsc --noEmit && npm run lint && npm run test:performance && npm run build
```

기대: `tsc` 출력 없음, lint 오류 없음, 테스트 `fail 0`, 빌드 성공.

- [ ] **Step 5: 초기 JS 예산 확인**

```bash
cd jdi-portal && npm run perf:audit
```

기대: 대시보드 라우트의 초기 JS 예산 초과 경고가 없다. 초과하면 `MemberWorkPanel`을 `next/dynamic`으로 지연 로드한다(팝업은 클릭 전에는 필요 없다):

```tsx
const MemberWorkPanel = dynamic(() => import("./MemberWorkPanel"), { ssr: false });
```

- [ ] **Step 6: 커밋**

```bash
cd "C:/Users/jdico/Desktop/웹사이트 개발 코드/jdicompany"
git add CLAUDE.md jdi-portal/docs/superpowers/specs/2026-07-24-work-directives-design.md
git commit -m "문서: 업무지시 기능 반영(마이그레이션 번호·도메인 목록·설계 상태)"
```

---

## 검증 요약

| 무엇 | 명령 / 방법 | Task |
|---|---|---|
| DB 구조·RLS·RPC 정적 검사 | `node --test scripts/work-directives.test.mjs` | 1 |
| 이중 경로 누락 방지 (성능 불변조건 3) | 같은 테스트 파일의 대시보드 검사 | 3 |
| 속도 회귀 | `npm run test:performance` | 1·3·5·6 |
| 초기 JS 예산 | `npm run perf:audit` | 7 |
| 타입·린트·빌드 | `npx tsc --noEmit` / `npm run lint` / `npm run build` | 7 |
| 권한 (남이 대신 수락 불가) | 다른 계정으로 `accept_work_directive` 호출 → 실패 확인 | 1 |
| `kind` 위조 방지 | 비관리자 계정으로 등록한 지시의 `kind`가 `요청`인지 확인 | 1 |
| 밤 시간 푸시 차단 | 22시 이후 등록 → 푸시 없음, 인앱 알림은 있음 | 6 |
| 재촉 하루 1회 | 같은 날 함수 두 번 실행 → 알림 1건만 증가 | 6 |
| 전체 흐름 | 두 계정으로 등록 → 출근 → 수락 → 할일 완료 → 보낸 쪽 완료 표시 | 5 |

## 이번에 만들지 않는 것 (설계 문서와 동일)

지시 수정, 지시 댓글/대화, 지시 첨부파일, 잔디 메시지 붙여넣기 파싱, 보낸 지시 전체 목록 화면·사이드바 메뉴, 반복 지시·예약 발송.
