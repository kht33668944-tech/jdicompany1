# 인플루언서 시딩 업무 흐름 구현 계획

> **에이전트용:** 필수 하위 스킬 — `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans` 로 태스크 단위 실행. 체크박스(`- [ ]`)로 진행 추적.

**Goal:** 인플루언서 시딩 1건(섭외 → 서류 → 발송 → 게시 → 성과 → 정산)을 카카오톡·엑셀 없이 사이트 안에서 끝낸다.

**Architecture:** 기존 `influencer` 도메인에 3개 축을 더한다 — (1) 인플루언서에 딸린 **연락처·서류**, (2) 캠페인에 딸린 **협의 이력·배송·지급**, (3) 이미 `influencer_posts` 에 쌓여 있는 수치를 캠페인으로 **복사·집계**. 서류 잠금은 보관함(vault)의 2차 비밀번호를 재사용하되, 쿠키만으로는 우회 가능하므로 **DB 잠금 세션 + RLS** 로 서버가 강제한다.

**Tech Stack:** Next.js 16 App Router / React 19 / TypeScript strict / Supabase (Postgres + RLS + Storage) / Tailwind 4 / `node:test` 정적 검사

**설계서:** `jdi-portal/docs/superpowers/specs/2026-07-28-influencer-seeding-workflow-design.md`
**작업 브랜치:** `worktree-influencer-seeding-workflow-spec` (PR #3)

> **구현 완료 (2026-07-28).** 실제 코드와 다른 점 3가지는 설계서에 반영해 두었다.
>
> 1. **서류 업로드는 브라우저에서** 하고 서버 액션은 메타데이터만 받는다. 계획서에는 `file: File` 을 서버로 넘기는 것처럼 적혀 있었으나, 보관함(`vault/storage.ts`)이 이미 브라우저 업로드 방식이라 그대로 따랐다. Next 서버 액션의 본문 크기 제한도 피할 수 있다.
> 2. **`get_influencer_seeding_history` RPC 를 만들지 않았다.** 상세 패널이 캠페인 전체를 이미 받아오므로 화면에서 합산하면 되고, RPC 를 두면 왕복만 늘어난다. `SeedingHistoryCard.tsx` 가 계산하고, 정적 검사가 별도 조회를 하지 않는지 확인한다.
> 3. **지급 RPC(`mark_campaign_paid`)를 `111` 에 넣었다.** 아직 운영 DB 에 적용 전이라 `113` 을 새로 만들 필요가 없었다.
>
> **운영 DB 적용은 아직 하지 않았다.** 코드와 마이그레이션이 반드시 함께 올라가야 한다(§ 배포 주의).

---

## Context

JDI는 자사 제품을 인플루언서에게 보내 게시물을 얻는다(시딩). 상대는 광고주가 아니라 인플루언서 본인이고, 직원은 4명이다.

현재 사이트는 인플루언서 **발굴·분석**만 잘 갖췄고 그 뒤가 비어 있어 실무가 밖으로 샌다. 코드에서 확인한 사실:

- `influencers` 에 **연락처·주소 컬럼이 없다** — 제품 발송에 필수인데 저장할 자리가 없어 카톡을 봐야 한다
- 계약서·신분증 사본·통장 사본을 **인플루언서에 붙일 구조가 전혀 없다** (보관함은 `corporation_id NOT NULL` 이라 법인 전용)
- `influencer_campaigns` 에 `post_url` 문자열만 있고 성과 수치가 없다. `get_influencer_kpi_cards()` 는 인원수·건수·비용만 센다
- `cost` 는 있으나 지급 여부가 없고 `expenses` 와 끊겨 있다
- 협의 내용은 `notes` 한 칸

**핵심 발견:** `influencer-extract` 가 이미 `influencer_posts` 에 `likes`/`comments`/`view_count` 를 저장한다. 성과 집계에 **새 외부 수집이 필요 없고**, 캠페인과 연결만 하면 된다.

## Global Constraints

- 마이그레이션은 기존 파일 수정 금지, 다음 번호로 **추가**. 현재 최신 `110` → 이번에 `111`, `112`
- SQL에서 날짜를 뽑을 때 `CURRENT_DATE`/`NOW()::date` 금지. `(NOW() AT TIME ZONE 'Asia/Seoul')::DATE` 사용 (시각 비교용 `now()` 는 허용)
- 사용자 데이터 테이블은 RLS 활성 + `public.is_approved_user()` 반영. `SECURITY DEFINER` 함수는 내부에서 권한 재검증 + `SET search_path` 고정
- Supabase 응답의 `error` 를 무시하고 `data` 만 쓰지 않는다
- 서버 전용 키를 클라이언트에 노출하지 않는다. **`SUPABASE_SERVICE_ROLE_KEY` 를 Next 앱에 도입하지 않는다** (보안 경계를 RLS 하나로 유지)
- 오류 메시지는 한국어. 기존 `throw new Error("…에 실패했습니다: " + error.message)` 형식을 따른다
- 공용 유틸 우선: 날짜 `src/lib/utils/date.ts`, 업로드 검증 `src/lib/utils/upload.ts`(`validateFile`, 10MB)
- **성능 불변조건**: KPI는 단일 RPC 왕복 유지, 인플루언서 목록에 성과 컬럼 추가 금지(N+1), 무거운 라이브러리 추가 금지
- 각 태스크 끝에 커밋. `git push` 는 사용자 요청 시에만

---

## File Structure

**신규 SQL**
- `supabase/migrations/111_influencer_seeding_workflow.sql` — 연락처·서류·이력 테이블, 잠금 세션, 캠페인 컬럼, 버킷·정책, 지출 카테고리
- `supabase/migrations/112_influencer_campaign_results.sql` — 성과 컬럼, `normalize_post_url`, KPI/실적 RPC

**신규 서버 모듈** (`actions.ts` 가 이미 400줄대라 분리)
- `src/lib/vault/gate.ts` — `requireUnlock()` 공유 (vault/actions.ts 에서 이동)
- `src/lib/influencer/contact-actions.ts` — 연락처·배송·지급
- `src/lib/influencer/document-actions.ts` — 서류 CRUD·서명 URL
- `src/lib/influencer/document-storage.ts` — 브라우저 업로드 (vault/storage.ts 패턴)
- `src/lib/influencer/result-actions.ts` — 성과 복사·갱신
- `src/lib/influencer/contact-types.ts` — 연락처·서류·이력 타입

**신규 UI** (`InfluencerDetailPanel.tsx` 가 1100줄이라 하위 컴포넌트로만 추가)
- `src/components/dashboard/influencer/contact/InfluencerContactSection.tsx`
- `src/components/dashboard/influencer/contact/CampaignFulfillmentFields.tsx`
- `src/components/dashboard/influencer/contact/PayoutConfirmDialog.tsx`
- `src/components/dashboard/influencer/documents/InfluencerDocumentSection.tsx`
- `src/components/dashboard/influencer/documents/DocumentUploadModal.tsx`
- `src/components/dashboard/influencer/events/CampaignEventTimeline.tsx`
- `src/components/dashboard/influencer/result/CampaignResultBadge.tsx`
- `src/components/dashboard/influencer/result/SeedingHistoryCard.tsx`

**수정**
- `src/lib/vault/actions.ts` — `requireUnlock` 제거 후 `gate.ts` import, `unlockVault`/`lockVault` 를 새 RPC 로 전환
- `src/lib/influencer/actions.ts` — `linkPostToCampaign` 에 성과 복사 추가
- `src/lib/influencer/queries.ts` — 상세 조회에 연락처·서류·이력 합류
- `src/lib/influencer/types.ts` — 캠페인 타입에 신규 컬럼
- `src/components/dashboard/influencer/InfluencerDetailPanel.tsx` — 신규 섹션 배치 (`{/* 캠페인 */}` 앞, 현재 917행 부근)
- `src/components/dashboard/influencer/KpiCards.tsx` — 카드 2장 추가
- `package.json` — 새 테스트를 `test:security` 에 등록

**신규 테스트**
- `scripts/influencer-seeding-workflow.test.mjs` — 마이그·액션 정적 검사
- `scripts/influencer-post-url.test.mjs` — URL 정규화 단위 테스트

---

## Task 1: 마이그레이션 111 — 데이터 기반

**Files:**
- Create: `supabase/migrations/111_influencer_seeding_workflow.sql`
- Create: `scripts/influencer-seeding-workflow.test.mjs`
- Modify: `package.json` (test:security 에 새 파일 추가)

**Interfaces:**
- Produces: 테이블 `influencer_contacts`, `influencer_documents`, `influencer_document_versions`, `influencer_document_cleanup_queue`, `influencer_campaign_events`, `vault_unlock_sessions` / 함수 `public.has_vault_unlock()`, `public.vault_unlock(text)`, `public.vault_lock()` / 버킷 `influencer-documents`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/influencer-seeding-workflow.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p) => existsSync(join(process.cwd(), p));
const MIG_111 = "supabase/migrations/111_influencer_seeding_workflow.sql";

test("111: 새 테이블 6종 + RLS", () => {
  assert.ok(exists(MIG_111), `${MIG_111} 이 없습니다`);
  const sql = read(MIG_111);
  for (const t of [
    "influencer_contacts",
    "influencer_documents",
    "influencer_document_versions",
    "influencer_document_cleanup_queue",
    "influencer_campaign_events",
    "vault_unlock_sessions",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE (IF NOT EXISTS )?public\\.${t}`), `${t} 테이블 없음`);
    assert.match(
      sql,
      new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`),
      `${t} RLS 미활성`
    );
  }
  assert.match(sql, /is_approved_user\(\)/);
  assert.doesNotMatch(sql, /CURRENT_DATE/);
});

test("111: 협의 이력은 수정 불가(UPDATE 정책 없음)", () => {
  const sql = read(MIG_111);
  const updatePolicies = sql.match(
    /CREATE POLICY[^;]*ON public\.influencer_campaign_events FOR UPDATE/g
  );
  assert.equal(updatePolicies, null, "협의 이력에 UPDATE 정책이 있으면 안 됩니다");
});

test("111: 잠금 세션은 직접 조작 불가 — 쓰기 정책 없음 + DEFINER 함수만", () => {
  const sql = read(MIG_111);
  for (const op of ["INSERT", "UPDATE", "DELETE"]) {
    const re = new RegExp(`ON public\\.vault_unlock_sessions FOR ${op}`);
    assert.doesNotMatch(sql, re, `잠금 세션에 ${op} 정책이 있으면 비밀번호를 우회할 수 있습니다`);
  }
  assert.match(sql, /FUNCTION public\.vault_unlock\(p_password TEXT\)[\s\S]*?SECURITY DEFINER/);
  assert.match(sql, /FUNCTION public\.has_vault_unlock\(\)[\s\S]*?SECURITY DEFINER/);
  assert.match(sql, /SET search_path/);
});

test("111: 민감 서류는 잠금 없이는 읽을 수 없다(스토리지 정책)", () => {
  const sql = read(MIG_111);
  assert.match(sql, /'influencer-documents', 'influencer-documents', FALSE/);
  // 경로 2번째 조각이 'sensitive' 면 잠금 필요
  assert.match(sql, /split_part\(name, '\/', 2\) <> 'sensitive'/);
  assert.match(sql, /public\.has_vault_unlock\(\)/);
});

test("111: 민감 종류는 트리거로 강제된다", () => {
  const sql = read(MIG_111);
  assert.match(sql, /kind IN \('contract', ?'id_card', ?'bankbook', ?'etc'\)/);
  assert.match(sql, /CREATE TRIGGER influencer_documents_force_sensitive/);
  assert.match(sql, /NEW\.is_sensitive := NEW\.kind IN \('id_card', ?'bankbook'\)/);
});

test("111: 지출 연동 준비 — seeding 소스 + 비민감 카테고리", () => {
  const sql = read(MIG_111);
  assert.match(sql, /expenses_source_check/);
  assert.match(sql, /'seeding'/);
  assert.match(sql, /'인플루언서 시딩'[\s\S]*?FALSE/);
});

test("111: 캠페인에 배송·지급 컬럼 추가", () => {
  const sql = read(MIG_111);
  for (const c of ["courier", "tracking_number", "payout_status", "paid_at", "expense_id"]) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`), `${c} 컬럼 없음`);
  }
  assert.match(sql, /payout_status[\s\S]*?CHECK[\s\S]*?'none'[\s\S]*?'pending'[\s\S]*?'paid'/);
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs
```
기대: 전부 FAIL — `111_influencer_seeding_workflow.sql 이 없습니다`

- [ ] **Step 3: 마이그레이션 작성**

`supabase/migrations/111_influencer_seeding_workflow.sql` 을 아래 순서로 작성한다.

**(1) 연락처**

```sql
CREATE TABLE public.influencer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL UNIQUE REFERENCES public.influencers(id) ON DELETE CASCADE,
  recipient_name text,
  phone text,
  postcode text,
  address1 text,
  address2 text,
  email text,
  bank_name text,
  account_number text,
  account_holder text,
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_contacts"
  ON public.influencer_contacts FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY "Approved users can create influencer_contacts"
  ON public.influencer_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
CREATE POLICY "Approved users can update influencer_contacts"
  ON public.influencer_contacts FOR UPDATE TO authenticated
  USING (public.is_approved_user()) WITH CHECK (public.is_approved_user());
CREATE POLICY "Approved users can delete influencer_contacts"
  ON public.influencer_contacts FOR DELETE TO authenticated USING (public.is_approved_user());
```

**(2) 잠금 세션 + 함수** — 쓰기 정책을 두지 않는 것이 핵심. 오직 `SECURITY DEFINER` 함수로만 기록된다.

```sql
CREATE TABLE public.vault_unlock_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.vault_unlock_sessions ENABLE ROW LEVEL SECURITY;

-- 본인 세션 조회만 허용. INSERT/UPDATE/DELETE 정책은 의도적으로 두지 않는다.
CREATE POLICY "Users can view own unlock session"
  ON public.vault_unlock_sessions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_vault_unlock()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vault_unlock_sessions
     WHERE user_id = auth.uid() AND expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.vault_unlock(p_password TEXT)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  IF NOT public.is_approved_user() THEN
    RAISE EXCEPTION '권한이 없습니다.';
  END IF;
  v_ok := public.verify_vault_gate(p_password);
  IF NOT COALESCE(v_ok, FALSE) THEN
    RETURN FALSE;
  END IF;
  INSERT INTO public.vault_unlock_sessions (user_id, unlocked_at, expires_at)
  VALUES (auth.uid(), now(), now() + interval '20 minutes')
  ON CONFLICT (user_id)
  DO UPDATE SET unlocked_at = now(), expires_at = now() + interval '20 minutes';
  RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.vault_lock()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.vault_unlock_sessions WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.vault_unlock(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_lock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_vault_unlock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_unlock(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_lock() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_vault_unlock() TO authenticated;
```

> `verify_vault_gate` 는 `106_vault.sql` 에 이미 있는 함수다. 비밀번호 해시 방식은 건드리지 않는다 — 기존 2차 비밀번호가 그대로 동작해야 한다.

**(3) 서류 + 버전 + 정리 큐**

```sql
CREATE TABLE public.influencer_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL REFERENCES public.influencers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('contract', 'id_card', 'bankbook', 'etc')),
  title text NOT NULL,
  note text,
  is_sensitive boolean NOT NULL DEFAULT FALSE,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_influencer_documents_influencer
  ON public.influencer_documents (influencer_id, kind);

-- 민감 종류는 클라이언트가 낮출 수 없게 서버에서 강제
CREATE OR REPLACE FUNCTION public.force_influencer_document_sensitive()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.is_sensitive := NEW.kind IN ('id_card', 'bankbook');
  RETURN NEW;
END; $$;

CREATE TRIGGER influencer_documents_force_sensitive
  BEFORE INSERT OR UPDATE ON public.influencer_documents
  FOR EACH ROW EXECUTE FUNCTION public.force_influencer_document_sensitive();

CREATE TABLE public.influencer_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.influencer_documents(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text,
  file_size bigint,
  mime_type text,
  version_no int NOT NULL,
  is_current boolean NOT NULL DEFAULT TRUE,
  uploaded_by uuid REFERENCES public.profiles(id),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_document_versions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_influencer_document_versions_doc
  ON public.influencer_document_versions (document_id, version_no DESC);

CREATE TABLE public.influencer_document_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_document_cleanup_queue ENABLE ROW LEVEL SECURITY;
```

RLS 정책(3개 표 공통 패턴, `vault_documents` 기준):
- `influencer_documents` / `influencer_document_versions`: SELECT·INSERT·UPDATE 는 `is_approved_user()`, DELETE 는 관리자만
- `influencer_document_cleanup_queue`: SELECT·INSERT 는 `is_approved_user()`, DELETE 는 관리자만

**(4) Storage 버킷 + 잠금 반영 정책** — 경로 규칙 `{influencer_id}/{general|sensitive}/{uuid}.{ext}`

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('influencer-documents', 'influencer-documents', FALSE, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Approved users can read influencer documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'influencer-documents'
    AND public.is_approved_user()
    AND (split_part(name, '/', 2) <> 'sensitive' OR public.has_vault_unlock())
  );

CREATE POLICY "Approved users can upload influencer documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'influencer-documents'
    AND public.is_approved_user()
    AND (split_part(name, '/', 2) <> 'sensitive' OR public.has_vault_unlock())
  );

CREATE POLICY "Admins can delete influencer documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'influencer-documents'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
```

**(5) 협의 이력 + 상태 변경 트리거**

```sql
CREATE TABLE public.influencer_campaign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.influencer_campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'status_change')),
  body text,
  from_status text,
  to_status text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_campaign_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_influencer_campaign_events_campaign
  ON public.influencer_campaign_events (campaign_id, created_at DESC);

CREATE POLICY "Approved users can view campaign events"
  ON public.influencer_campaign_events FOR SELECT TO authenticated USING (public.is_approved_user());
CREATE POLICY "Approved users can create campaign events"
  ON public.influencer_campaign_events FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
-- UPDATE 정책 없음 = 기록 불변
CREATE POLICY "Authors can delete own notes"
  ON public.influencer_campaign_events FOR DELETE TO authenticated
  USING (public.is_approved_user() AND kind = 'note' AND created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.log_campaign_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.influencer_campaign_events
      (campaign_id, kind, from_status, to_status, created_by)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER influencer_campaigns_log_status
  AFTER UPDATE OF status ON public.influencer_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.log_campaign_status_change();
```

**(6) 캠페인 컬럼 + 지출 연동 준비**

```sql
ALTER TABLE public.influencer_campaigns
  ADD COLUMN IF NOT EXISTS courier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'none'
    CHECK (payout_status IN ('none', 'pending', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_influencer_campaigns_influencer
  ON public.influencer_campaigns (influencer_id);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_source_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_source_check
  CHECK (source IN ('manual', 'recurring', 'import', 'seeding'));

INSERT INTO public.expense_categories (name, is_sensitive, sort_order, is_active)
VALUES ('인플루언서 시딩', FALSE, 100, TRUE)
ON CONFLICT (name) DO NOTHING;
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs
```
기대: PASS (7개 테스트)

- [ ] **Step 5: `package.json` 에 테스트 등록**

`test:security` 스크립트 끝에 `scripts/influencer-seeding-workflow.test.mjs` 를 추가한다.

- [ ] **Step 6: 운영 DB 적용 전 사용자 확인**

운영 DB 변경이므로 실행 전 사용자에게 알린다. 승인되면:

```bash
cd jdi-portal && npx supabase db push --linked
```

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/111_influencer_seeding_workflow.sql scripts/influencer-seeding-workflow.test.mjs package.json
git commit -m "기능: 인플루언서 연락처·서류·협의이력 데이터 기반 (마이그 111)"
```

---

## Task 2: 잠금 게이트 서버 강제

지금 `requireUnlock` 은 `vault/actions.ts` 안의 비공개 함수라 재사용할 수 없고, 쿠키만 본다. 공유 모듈로 빼고 DB 세션과 함께 쓰도록 바꾼다.

**Files:**
- Create: `src/lib/vault/gate.ts`
- Modify: `src/lib/vault/actions.ts:29-35`(제거), `:211-233`(RPC 전환)
- Modify: `scripts/influencer-seeding-workflow.test.mjs` (검사 추가)

**Interfaces:**
- Produces: `requireUnlock(userId: string): Promise<void>` — 잠금 안 됐으면 `Error("잠금이 필요합니다. 2차 비밀번호를 입력해주세요.")` throw

- [ ] **Step 1: 실패하는 테스트 추가**

`scripts/influencer-seeding-workflow.test.mjs` 끝에:

```js
test("게이트: requireUnlock 이 공유 모듈로 분리되고 중복 정의가 없다", () => {
  assert.ok(exists("src/lib/vault/gate.ts"), "src/lib/vault/gate.ts 가 없습니다");
  const gate = read("src/lib/vault/gate.ts");
  assert.match(gate, /export async function requireUnlock\(userId: string\)/);

  const actions = read("src/lib/vault/actions.ts");
  assert.doesNotMatch(
    actions,
    /^async function requireUnlock/m,
    "vault/actions.ts 에 requireUnlock 중복 정의가 남아 있습니다"
  );
  assert.match(actions, /from "\.\/gate"/);
});

test("게이트: 잠금 해제·잠금이 DB 세션 RPC 를 거친다", () => {
  const actions = read("src/lib/vault/actions.ts");
  assert.match(actions, /rpc\("vault_unlock"/, "unlockVault 가 vault_unlock RPC 를 써야 합니다");
  assert.match(actions, /rpc\("vault_lock"\)/, "lockVault 가 vault_lock RPC 를 써야 합니다");
  assert.doesNotMatch(
    actions,
    /rpc\("verify_vault_gate"/,
    "쿠키만 세우면 DB 세션이 없어 스토리지가 막힙니다"
  );
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs
```
기대: 새 테스트 2개 FAIL — `src/lib/vault/gate.ts 가 없습니다`

- [ ] **Step 3: `gate.ts` 생성**

```ts
import { cookies } from "next/headers";
import { verifyUnlockToken } from "./crypto";
import { VAULT_UNLOCK_COOKIE } from "./constants";

/**
 * 2차 비밀번호 잠금 해제 상태 확인. 미해제면 throw.
 *
 * 여기서 보는 쿠키는 **빠른 1차 확인**이다. 실제 방어선은 DB 의
 * vault_unlock_sessions 와 이를 참조하는 Storage RLS 정책이므로,
 * 쿠키를 위조해도 민감 서류 파일에는 접근할 수 없다.
 */
export async function requireUnlock(userId: string) {
  const store = await cookies();
  const token = store.get(VAULT_UNLOCK_COOKIE)?.value;
  if (!verifyUnlockToken(token, userId)) {
    throw new Error("잠금이 필요합니다. 2차 비밀번호를 입력해주세요.");
  }
}
```

- [ ] **Step 4: `vault/actions.ts` 수정**

1. 29~35행의 `requireUnlock` 정의를 지우고 상단에 `import { requireUnlock } from "./gate";` 추가
2. `unlockVault` 의 RPC 를 교체 — 쿠키는 그대로 두되 DB 세션도 만든다

```ts
export async function unlockVault(password: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireAuth();
  // vault_unlock: 비밀번호 검증 + DB 잠금 세션 생성(20분). Storage RLS 가 이 세션을 본다.
  const { data, error } = await supabase.rpc("vault_unlock", { p_password: password });
  if (error) throw new Error(`잠금 해제에 실패했습니다: ${error.message}`);
  if (data !== true) return { ok: false };

  const expEpochSec = Math.floor(Date.now() / 1000) + VAULT_UNLOCK_TTL_SEC;
  const token = signUnlock(user.id, expEpochSec);
  const store = await cookies();
  store.set(VAULT_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VAULT_UNLOCK_TTL_SEC,
  });
  return { ok: true };
}

export async function lockVault() {
  const { supabase } = await requireAuth();
  const { error } = await supabase.rpc("vault_lock");
  if (error) throw new Error(`잠금에 실패했습니다: ${error.message}`);
  const store = await cookies();
  store.delete(VAULT_UNLOCK_COOKIE);
}
```

3. `signUnlock` import 는 유지하고, 더 이상 쓰지 않는 `verifyUnlockToken` import 를 제거한다

- [ ] **Step 5: 테스트·빌드 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs && npm run lint && npm run build
```
기대: 전부 PASS

- [ ] **Step 6: 보관함 회귀 수동 확인**

`npm run dev` → `/dashboard/vault` → 계정 탭에서 2차 비밀번호 입력 → 계정 목록이 보이는지, 잠금 버튼이 동작하는지 확인. **기존 기능이 깨지면 안 된다.**

- [ ] **Step 7: 커밋**

```bash
git add src/lib/vault/gate.ts src/lib/vault/actions.ts scripts/influencer-seeding-workflow.test.mjs
git commit -m "보안: 2차 비밀번호 잠금을 DB 세션으로 서버 강제 + gate 모듈 분리"
```

---

## Task 3: 연락처 (배송·정산 정보)

**Files:**
- Create: `src/lib/influencer/contact-types.ts`, `src/lib/influencer/contact-actions.ts`
- Create: `src/components/dashboard/influencer/contact/InfluencerContactSection.tsx`
- Modify: `src/lib/influencer/queries.ts`, `src/components/dashboard/influencer/InfluencerDetailPanel.tsx`

**Interfaces:**
- Consumes: 테이블 `influencer_contacts` (Task 1)
- Produces:
  - `InfluencerContact` — 테이블 컬럼과 1:1 인터페이스
  - `InfluencerContactInput = Omit<InfluencerContact, "id"|"influencer_id"|"created_by"|"created_at"|"updated_at">`
  - `upsertInfluencerContact(influencerId: string, input: InfluencerContactInput): Promise<void>`
  - `getInfluencerContact(influencerId: string): Promise<InfluencerContact | null>` (queries.ts)

- [ ] **Step 1: 타입 정의**

`src/lib/influencer/contact-types.ts` 에 `InfluencerContact`, `InfluencerContactInput` 을 위 시그니처대로 정의한다. 모든 텍스트 필드는 `string | null`.

- [ ] **Step 2: 서버 액션 작성**

`src/lib/influencer/contact-actions.ts` — 파일 첫 줄 `"use server";`. 인증은 `getAuthUser()`(`@/lib/supabase/auth`) 를 쓴다.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/auth";
import type { InfluencerContactInput } from "./contact-types";

async function requireAuth() {
  const auth = await getAuthUser();
  if (!auth) throw new Error("로그인이 필요합니다.");
  return auth;
}

const trimOrNull = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function upsertInfluencerContact(
  influencerId: string,
  input: InfluencerContactInput
): Promise<void> {
  const { supabase, user } = await requireAuth();
  if (!influencerId) throw new Error("인플루언서를 찾을 수 없습니다.");

  const { error } = await supabase
    .from("influencer_contacts")
    .upsert(
      {
        influencer_id: influencerId,
        recipient_name: trimOrNull(input.recipient_name),
        phone: trimOrNull(input.phone),
        postcode: trimOrNull(input.postcode),
        address1: trimOrNull(input.address1),
        address2: trimOrNull(input.address2),
        email: trimOrNull(input.email),
        bank_name: trimOrNull(input.bank_name),
        account_number: trimOrNull(input.account_number),
        account_holder: trimOrNull(input.account_holder),
        note: trimOrNull(input.note),
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "influencer_id" }
    );
  if (error) throw new Error(`연락처 저장에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/influencer");
}
```

- [ ] **Step 3: 조회 함수 추가**

`src/lib/influencer/queries.ts` 에 `getInfluencerContact(influencerId)` 를 추가한다. 상세 패널이 이미 쓰는 조회 흐름에 합류시켜 **왕복 수를 늘리지 않는다** (기존 상세 로드 `Promise.all` 배열에 추가).

- [ ] **Step 4: UI 컴포넌트 작성**

`InfluencerContactSection.tsx` — `"use client"`. props: `{ influencerId: string; contact: InfluencerContact | null }`.

- 기본은 읽기 모드(라벨 + 값). 값이 없으면 "없음" 회색 표시
- `[수정]` 클릭 시 인라인 입력 폼으로 전환, `[저장]`/`[취소]`
- 저장 시 `upsertInfluencerContact` 호출, 성공하면 `toast.success("연락처를 저장했습니다.")`, 실패하면 `toast.error(err.message)` (`sonner` 사용 — 패널의 기존 방식과 동일)
- 주소는 `postcode` / `address1` / `address2` 3칸을 세로로 배치
- 입력 클래스는 `MODAL_INPUT_CLS` (`@/lib/vault/constants`) 재사용

- [ ] **Step 5: 상세 패널에 배치**

`InfluencerDetailPanel.tsx` 의 `{/* 캠페인 */}` 주석 바로 앞(현재 917행 부근)에 삽입한다. 패널 본문에는 컴포넌트 한 줄만 추가하고 로직은 넣지 않는다.

- [ ] **Step 6: 확인**

```bash
cd jdi-portal && npm run lint && npm run build
```
`npm run dev` → 인플루언서 클릭 → 배송·정산 정보에 주소를 넣고 저장 → 패널을 닫았다 열면 값이 남아 있는지 확인

- [ ] **Step 7: 커밋**

```bash
git add src/lib/influencer/contact-types.ts src/lib/influencer/contact-actions.ts src/lib/influencer/queries.ts src/components/dashboard/influencer/contact/ src/components/dashboard/influencer/InfluencerDetailPanel.tsx
git commit -m "기능: 인플루언서 배송·정산 연락처 저장"
```

---

## Task 4: 서류 보관 (계약서·신분증·통장)

**Files:**
- Create: `src/lib/influencer/document-storage.ts`, `src/lib/influencer/document-actions.ts`
- Create: `src/components/dashboard/influencer/documents/InfluencerDocumentSection.tsx`, `DocumentUploadModal.tsx`
- Modify: `src/lib/influencer/contact-types.ts`, `src/lib/influencer/queries.ts`, `InfluencerDetailPanel.tsx`
- Modify: `scripts/influencer-seeding-workflow.test.mjs`

**Interfaces:**
- Consumes: 테이블·버킷·`requireUnlock` (Task 1·2)
- Produces:
  - `DocumentKind = "contract" | "id_card" | "bankbook" | "etc"`
  - `uploadInfluencerDocumentFile(influencerId: string, kind: DocumentKind, file: File): Promise<UploadedFileMeta>` (브라우저)
  - `createInfluencerDocument(input: { influencerId: string; kind: DocumentKind; title: string; note?: string }, file: UploadedFileMeta): Promise<string>`
  - `addDocumentVersion(documentId: string, file: UploadedFileMeta): Promise<void>`
  - `getDocumentDownloadUrl(versionId: string): Promise<string>`
  - `deleteInfluencerDocument(documentId: string): Promise<void>`

> `UploadedFileMeta` 는 `@/lib/vault/types` 의 기존 타입(`{ storagePath, fileName, fileSize, mimeType }`)을 재사용한다.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test("서류 액션: 민감 서류 경로 전부가 잠금을 확인한다", () => {
  const p = "src/lib/influencer/document-actions.ts";
  assert.ok(exists(p), `${p} 가 없습니다`);
  const src = read(p);
  assert.match(src, /from "@\/lib\/vault\/gate"/);
  const unlockCalls = (src.match(/await requireUnlock\(/g) ?? []).length;
  assert.ok(
    unlockCalls >= 3,
    `업로드·다운로드·삭제 3곳에서 requireUnlock 이 필요합니다 (현재 ${unlockCalls})`
  );
  // 공개 URL 금지 — 서명 URL 만 허용
  assert.doesNotMatch(src, /getPublicUrl/);
  assert.match(src, /createSignedUrl\(/);
});

test("서류 업로드: 공용 검증 유틸을 쓰고 경로 규칙을 지킨다", () => {
  const p = "src/lib/influencer/document-storage.ts";
  assert.ok(exists(p), `${p} 가 없습니다`);
  const src = read(p);
  assert.match(src, /validateFile/);
  // 경로 2번째 조각이 general/sensitive 여야 스토리지 정책이 동작한다
  assert.match(src, /sensitive.*general|general.*sensitive/s);
  assert.match(src, /INFLUENCER_DOC_BUCKET|"influencer-documents"/);
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs
```
기대: 새 테스트 2개 FAIL

- [ ] **Step 3: 브라우저 업로드 모듈**

`src/lib/influencer/document-storage.ts` — `src/lib/vault/storage.ts` 와 같은 구조.

```ts
import { createClient } from "@/lib/supabase/client";
import { validateFile } from "@/lib/utils/upload";
import type { UploadedFileMeta } from "@/lib/vault/types";

export const INFLUENCER_DOC_BUCKET = "influencer-documents";

/** 신분증·통장은 민감 폴더에 넣는다. Storage 정책이 이 경로 조각을 보고 잠금을 요구한다. */
export function documentFolder(kind: string): "sensitive" | "general" {
  return kind === "id_card" || kind === "bankbook" ? "sensitive" : "general";
}

export async function uploadInfluencerDocumentFile(
  influencerId: string,
  kind: string,
  file: File
): Promise<UploadedFileMeta> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const storagePath = `${influencerId}/${documentFolder(kind)}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(INFLUENCER_DOC_BUCKET).upload(storagePath, file);
  if (error) throw new Error(`파일 업로드에 실패했습니다: ${error.message}`);

  return {
    storagePath,
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function removeInfluencerDocumentFile(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(INFLUENCER_DOC_BUCKET).remove([path]).catch(() => {});
}
```

- [ ] **Step 4: 서버 액션**

`src/lib/influencer/document-actions.ts` — `"use server";`. 핵심 규칙:

- 민감 종류(`id_card`/`bankbook`)면 **생성·다운로드·삭제 전에** `await requireUnlock(user.id)`
- 서명 URL 은 **60초**: `createSignedUrl(path, 60)`
- 삭제는 DB 행 제거 후 `influencer_document_cleanup_queue` 에 경로 삽입. Storage 삭제 실패가 DB 작업을 막지 않는다
- 버전 번호는 기존 최대값 + 1, 이전 버전의 `is_current` 를 `false` 로 내린다 (`vault/actions.ts` 의 `replaceDocument` 와 동일 절차)
- 버전 기록 실패 시 방금 만든 문서 행을 지운다 (`createDocument` 의 보상 삭제 패턴 그대로)

```ts
export async function getDocumentDownloadUrl(versionId: string): Promise<string> {
  const { supabase, user } = await requireAuth();

  const { data: version, error } = await supabase
    .from("influencer_document_versions")
    .select("storage_path, influencer_documents!inner(is_sensitive)")
    .eq("id", versionId)
    .single();
  if (error) throw new Error(`서류를 찾지 못했습니다: ${error.message}`);

  const isSensitive = (version.influencer_documents as unknown as { is_sensitive: boolean })
    .is_sensitive;
  if (isSensitive) await requireUnlock(user.id);

  const { data, error: urlErr } = await supabase.storage
    .from(INFLUENCER_DOC_BUCKET)
    .createSignedUrl(version.storage_path, 60);
  if (urlErr) throw new Error(`파일 주소를 만들지 못했습니다: ${urlErr.message}`);
  if (!data?.signedUrl) throw new Error("파일 주소를 만들지 못했습니다.");
  return data.signedUrl;
}
```

- [ ] **Step 5: UI**

`DocumentUploadModal.tsx` — 종류 선택(계약서/신분증 사본/통장 사본/기타), 제목, 메모, 파일 선택. `FILE_ACCEPT_ATTR`(`@/lib/utils/upload`) 를 `accept` 에 쓴다. 신분증·통장을 고르면 "이 서류는 2차 비밀번호를 풀어야 볼 수 있습니다" 안내를 띄운다.

`InfluencerDocumentSection.tsx` — 서류 목록. 민감 서류는 자물쇠 아이콘. `[보기]` 클릭 시 `getDocumentDownloadUrl` 호출 → 잠금 오류면 보관함과 동일한 2차 비밀번호 입력창을 띄우고, 해제 후 재시도. `[새 버전]` 으로 파일 교체. 버전이 2개 이상이면 이전 버전 목록을 접이식으로 보여준다.

- [ ] **Step 6: 상세 패널에 배치**

Task 3 의 연락처 섹션 바로 아래에 삽입한다.

- [ ] **Step 7: 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs && npm run lint && npm run build
```

수동 확인 4가지:
1. 계약서 업로드 → 잠금 없이 보기 가능
2. 신분증 사본 업로드 → 잠금 상태에서 `[보기]` 누르면 비밀번호 요구
3. 2차 비밀번호 해제 후 `[보기]` → 파일 열림
4. 같은 서류에 새 버전 업로드 → 이전 버전이 목록에 남아 있음

- [ ] **Step 8: 커밋**

```bash
git add src/lib/influencer/document-storage.ts src/lib/influencer/document-actions.ts src/components/dashboard/influencer/documents/ src/lib/influencer/queries.ts src/lib/influencer/contact-types.ts src/components/dashboard/influencer/InfluencerDetailPanel.tsx scripts/influencer-seeding-workflow.test.mjs
git commit -m "기능: 인플루언서 서류 보관(계약서·신분증·통장) + 버전 관리"
```

---

## Task 5: 협의 이력

**Files:**
- Create: `src/components/dashboard/influencer/events/CampaignEventTimeline.tsx`
- Modify: `src/lib/influencer/contact-actions.ts`, `src/lib/influencer/contact-types.ts`, `src/lib/influencer/queries.ts`

**Interfaces:**
- Consumes: 테이블 `influencer_campaign_events` + 상태 변경 트리거 (Task 1)
- Produces:
  - `InfluencerCampaignEvent = { id, campaign_id, kind: "note"|"status_change", body, from_status, to_status, created_by, created_at }`
  - `addCampaignEvent(campaignId: string, body: string): Promise<InfluencerCampaignEvent>`
  - `deleteCampaignEvent(eventId: string): Promise<void>`
  - `getCampaignEvents(campaignIds: string[]): Promise<Map<string, InfluencerCampaignEvent[]>>`

- [ ] **Step 1: 액션 작성**

`contact-actions.ts` 에 추가. `body.trim()` 이 비면 `throw new Error("내용을 입력해주세요.")`. 삽입 시 `created_by: user.id`, `kind: "note"`. 삽입 결과를 `.select().single()` 로 받아 반환한다.

- [ ] **Step 2: 조회 함수**

`getCampaignEvents(campaignIds)` — 캠페인 여러 건의 이력을 **한 번의 쿼리**로 가져와 `Map` 으로 묶는다. 캠페인마다 따로 부르면 N+1 이 된다.

- [ ] **Step 3: UI**

`CampaignEventTimeline.tsx` — props: `{ campaignId: string; events: InfluencerCampaignEvent[] }`.
- 최신순 목록. `kind === "status_change"` 는 "○○ → ○○ 로 변경" 형태로 회색 표시하고 삭제 버튼 없음
- `kind === "note"` 는 본문 표시 + 작성자 본인이면 삭제 버튼
- 날짜는 `src/lib/utils/date.ts` 유틸로 KST 표시
- 하단에 한 줄 입력 + `[기록 추가]`
- 상태 라벨은 기존 `src/lib/influencer/labels.ts` 를 재사용한다 (새로 만들지 않는다)

- [ ] **Step 4: 캠페인 카드에 배치**

`InfluencerDetailPanel.tsx` 의 캠페인 목록 각 항목 하단에 접이식으로 넣는다.

- [ ] **Step 5: 확인**

```bash
cd jdi-portal && npm run lint && npm run build
```
수동: 메모를 추가하면 목록에 뜨는지, 캠페인 상태를 바꾸면 "변경" 기록이 **자동으로** 생기는지 확인

- [ ] **Step 6: 커밋**

```bash
git add src/lib/influencer/ src/components/dashboard/influencer/events/ src/components/dashboard/influencer/InfluencerDetailPanel.tsx
git commit -m "기능: 시딩 협의 이력 기록 + 상태 변경 자동 기록"
```

---

## Task 6: 배송·지급 + 지출 자동 생성

**Files:**
- Create: `src/components/dashboard/influencer/contact/CampaignFulfillmentFields.tsx`, `PayoutConfirmDialog.tsx`
- Modify: `src/lib/influencer/contact-actions.ts`, `src/lib/influencer/types.ts`
- Modify: `supabase/migrations/111_influencer_seeding_workflow.sql` (지급 RPC 추가 — **아직 운영 적용 전이면 같은 파일에, 이미 적용했다면 `113` 로 새로 만든다**)

**Interfaces:**
- Consumes: 캠페인 신규 컬럼, `'인플루언서 시딩'` 카테고리 (Task 1)
- Produces:
  - `updateCampaignShipping(campaignId: string, input: { courier: string | null; tracking_number: string | null }): Promise<void>`
  - `markCampaignPaid(campaignId: string, input: { paidAt: string; paymentMethod: string }): Promise<void>`
  - `unmarkCampaignPaid(campaignId: string, deleteExpense: boolean): Promise<void>`

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test("지급: 지출 생성과 캠페인 갱신이 한 트랜잭션(RPC)이다", () => {
  const src = read("src/lib/influencer/contact-actions.ts");
  assert.match(
    src,
    /rpc\("mark_campaign_paid"/,
    "지출만 생기고 캠페인이 안 바뀌는 부분 성공을 막으려면 단일 RPC 여야 합니다"
  );
  assert.doesNotMatch(
    src,
    /from\("expenses"\)\s*\.insert/,
    "지출을 액션에서 직접 insert 하면 부분 성공이 생깁니다"
  );
});
```

- [ ] **Step 2: 실패 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs
```
기대: FAIL

- [ ] **Step 3: 지급 RPC 작성**

부분 성공을 막기 위해 지출 생성과 캠페인 갱신을 하나의 함수에 넣는다. 권한 상승이 필요 없으므로 `SECURITY INVOKER`(기본) 로 두고 RLS 에 맡긴다.

```sql
CREATE OR REPLACE FUNCTION public.mark_campaign_paid(
  p_campaign_id uuid,
  p_paid_at date,
  p_payment_method text
) RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_camp   record;
  v_uname  text;
  v_cat    uuid;
  v_exp    uuid;
BEGIN
  SELECT c.*, i.username INTO v_camp
    FROM public.influencer_campaigns c
    JOIN public.influencers i ON i.id = c.influencer_id
   WHERE c.id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '시딩을 찾을 수 없습니다.';
  END IF;

  v_uname := v_camp.username;

  -- 무상 시딩(금액 없음)은 지출을 만들지 않는다
  IF COALESCE(v_camp.cost, 0) > 0 THEN
    SELECT id INTO v_cat FROM public.expense_categories WHERE name = '인플루언서 시딩';
    IF v_cat IS NULL THEN
      RAISE EXCEPTION '지출 분류(인플루언서 시딩)가 없습니다.';
    END IF;

    IF v_camp.expense_id IS NOT NULL THEN
      UPDATE public.expenses
         SET expense_date   = p_paid_at,
             amount_krw     = v_camp.cost,
             payment_method = p_payment_method
       WHERE id = v_camp.expense_id
      RETURNING id INTO v_exp;
    ELSE
      INSERT INTO public.expenses
        (expense_date, vendor, description, amount_krw, payment_method,
         category_id, source, created_by)
      VALUES
        (p_paid_at, v_uname,
         '인플루언서 시딩 - ' || v_uname ||
           COALESCE(' (' || v_camp.product_name || ')', ''),
         v_camp.cost, p_payment_method, v_cat, 'seeding', auth.uid())
      RETURNING id INTO v_exp;
    END IF;
  END IF;

  UPDATE public.influencer_campaigns
     SET payout_status = 'paid', paid_at = p_paid_at, expense_id = v_exp
   WHERE id = p_campaign_id;

  RETURN v_exp;
END; $$;
```

> `expenses` 의 NOT NULL 컬럼은 `expense_date`, `description`, `amount_krw`, `currency`, `payment_method`, `category_id`, `source`, `created_by`, `amount_pending` 이다. 이 중 `currency`(기본 `'KRW'`), `source`, `amount_pending`(기본 `FALSE`) 은 기본값이 있으므로 위 INSERT 목록으로 충분하다. `created_by = auth.uid()` 는 RLS 의 `WITH CHECK` 조건이라 반드시 넣는다.

- [ ] **Step 4: 액션 작성**

`contact-actions.ts` 에 추가한다.

`markCampaignPaid(campaignId, { paidAt, paymentMethod })` 는 `supabase.rpc("mark_campaign_paid", { p_campaign_id, p_paid_at, p_payment_method })` **한 줄만** 호출한다. 지출을 액션에서 따로 insert 하면 부분 성공이 생기므로 하지 않는다.

`unmarkCampaignPaid(campaignId, deleteExpense)` 는 캠페인의 `expense_id` 를 읽어 `deleteExpense` 가 참이면 그 지출을 삭제하고, 어느 경우든 캠페인을 `payout_status='none', paid_at=null, expense_id=null` 로 되돌린다.

두 액션 모두 끝에 `revalidatePath("/dashboard/influencer")` 와 `revalidatePath("/dashboard/expenses")` 를 부른다.

- [ ] **Step 5: UI**

`CampaignFulfillmentFields.tsx` — 택배사·송장번호 입력(포커스 아웃 시 저장), 지급 체크박스.
`PayoutConfirmDialog.tsx` — 체크 시 뜨는 확인 창. 지급일(기본 오늘, `date.ts` 로 KST 오늘) + 결제수단 선택(`payment_methods` 목록). "지출관리에 자동으로 기록됩니다" 안내 문구. 해제 시에는 "연결된 지출도 삭제할까요?" 를 묻는다.

- [ ] **Step 6: 확인**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs && npm run lint && npm run build
```
수동: 금액 있는 시딩을 지급 완료 → `/dashboard/expenses` 에 "인플루언서 시딩 - {아이디}" 가 생기는지. 금액 없는 시딩은 지출이 안 생기는지. 해제 시 선택대로 동작하는지.

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations/ src/lib/influencer/ src/components/dashboard/influencer/contact/ scripts/influencer-seeding-workflow.test.mjs
git commit -m "기능: 시딩 배송·지급 관리 + 지출 자동 생성"
```

---

## Task 7: 마이그레이션 112 — 성과 복사

**Files:**
- Create: `supabase/migrations/112_influencer_campaign_results.sql`, `scripts/influencer-post-url.test.mjs`
- Create: `src/lib/influencer/result-actions.ts`
- Modify: `src/lib/influencer/url.ts`, `src/lib/influencer/actions.ts`(`linkPostToCampaign`), `src/lib/influencer/types.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `normalizePostUrl(url: string | null | undefined): string | null` (TS) / `public.normalize_post_url(text)` (SQL) — **같은 규칙**
  - `refreshCampaignResult(campaignId: string): Promise<{ likes: number|null; comments: number|null; views: number|null } | null>`
  - 캠페인 컬럼 `result_likes`, `result_comments`, `result_views`, `result_captured_at`

- [ ] **Step 1: URL 정규화 단위 테스트 작성**

`scripts/influencer-post-url.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizePostUrl } from "../src/lib/influencer/url.ts";

test("normalizePostUrl: 끝 슬래시·쿼리·www·대소문자·공백을 없앤다", () => {
  const expected = "https://instagram.com/p/ABC123";
  assert.equal(normalizePostUrl("https://www.instagram.com/p/ABC123/"), expected);
  assert.equal(normalizePostUrl("https://instagram.com/p/ABC123?igsh=xyz"), expected);
  assert.equal(normalizePostUrl("  https://WWW.Instagram.com/p/ABC123/  "), expected);
  assert.equal(normalizePostUrl("https://instagram.com/p/ABC123#comment"), expected);
});

test("normalizePostUrl: 빈 값은 null", () => {
  assert.equal(normalizePostUrl(null), null);
  assert.equal(normalizePostUrl(""), null);
  assert.equal(normalizePostUrl("   "), null);
});

test("normalizePostUrl: 게시물 아이디 대소문자는 보존한다", () => {
  assert.notEqual(normalizePostUrl("https://instagram.com/p/AbC"), "https://instagram.com/p/abc");
});
```

`package.json` 의 `test:performance` 나 `test:security` 중 하나에 이 파일을 등록한다(정적 검사가 아니라 단위 테스트이므로 `test:security` 권장). 실행에 `--experimental-strip-types` 가 필요하면 `test:expenses` 스크립트와 같은 방식으로 붙인다.

- [ ] **Step 2: 실패 확인**

```bash
cd jdi-portal && node --experimental-strip-types --test scripts/influencer-post-url.test.mjs
```
기대: FAIL — `normalizePostUrl` 없음

- [ ] **Step 3: TS 정규화 함수 작성**

`src/lib/influencer/url.ts` 에 추가. 파일 상단에 **동기 유지 주석**을 남긴다 (`post-utils.ts` 의 `SPONSORED_RE` 주석과 같은 방식).

```ts
// ⚠️ normalizePostUrl 은 supabase/migrations/112 의 public.normalize_post_url() 과 동기 유지
export function normalizePostUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${host}${path}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd jdi-portal && node --experimental-strip-types --test scripts/influencer-post-url.test.mjs
```
기대: PASS

- [ ] **Step 5: 마이그레이션 112 작성**

```sql
ALTER TABLE public.influencer_campaigns
  ADD COLUMN IF NOT EXISTS result_likes int,
  ADD COLUMN IF NOT EXISTS result_comments int,
  ADD COLUMN IF NOT EXISTS result_views int,
  ADD COLUMN IF NOT EXISTS result_captured_at timestamptz;

-- ⚠️ src/lib/influencer/url.ts 의 normalizePostUrl() 과 동기 유지
CREATE OR REPLACE FUNCTION public.normalize_post_url(p_url text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_url IS NULL OR btrim(p_url) = '' THEN NULL
    ELSE regexp_replace(
           regexp_replace(
             regexp_replace(btrim(p_url), '[?#].*$', ''),
             '^(https?://)www\.', '\1'
           ),
           '/+$', ''
         )
  END;
$$;

CREATE INDEX IF NOT EXISTS idx_influencer_posts_normalized_url
  ON public.influencer_posts (influencer_id, public.normalize_post_url(post_url));
```

> SQL 쪽은 호스트만 소문자로 낮추기가 번거로우므로 `www.` 제거와 쿼리·해시·끝슬래시 제거까지만 하고, **호스트 소문자화는 TS 에서만** 한다. 저장된 값이 항상 소문자 호스트이므로 매칭에 문제가 없다. 이 차이를 SQL 주석에 명시한다.

성과 갱신 RPC:

```sql
CREATE OR REPLACE FUNCTION public.refresh_campaign_result(p_campaign_id uuid)
RETURNS TABLE (likes int, comments int, views int) LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_camp record; v_post record;
BEGIN
  SELECT id, influencer_id, post_url INTO v_camp
    FROM public.influencer_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR v_camp.post_url IS NULL THEN RETURN; END IF;

  SELECT p.likes, p.comments, p.view_count INTO v_post
    FROM public.influencer_posts p
   WHERE p.influencer_id = v_camp.influencer_id
     AND public.normalize_post_url(p.post_url) = public.normalize_post_url(v_camp.post_url)
   LIMIT 1;
  -- 못 찾으면 기존 값을 지우지 않고 그대로 둔다
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.influencer_campaigns
     SET result_likes = v_post.likes,
         result_comments = v_post.comments,
         result_views = v_post.view_count,
         result_captured_at = now()
   WHERE id = p_campaign_id;

  likes := v_post.likes; comments := v_post.comments; views := v_post.view_count;
  RETURN NEXT;
END; $$;
```

- [ ] **Step 6: 액션 + 연결 시 자동 복사**

`src/lib/influencer/result-actions.ts` 를 만들고 `"use server";` 로 시작한다.

```ts
export async function refreshCampaignResult(campaignId: string) {
  const { supabase } = await requireAuth();
  const { data, error } = await supabase.rpc("refresh_campaign_result", {
    p_campaign_id: campaignId,
  });
  if (error) throw new Error(`성과를 갱신하지 못했습니다: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null; // 매칭 실패 — 기존 값은 그대로 둔다
  revalidatePath("/dashboard/influencer");
  return { likes: row.likes, comments: row.comments, views: row.views };
}
```

화면은 `null` 일 때 `toast.error("최근 게시물 목록에 없어 갱신하지 못했습니다. 먼저 인플루언서를 재동기화해 보세요.")` 를 띄운다.

`src/lib/influencer/actions.ts` 의 기존 `linkPostToCampaign` 끝(성공 후 `revalidatePath` 앞)에 같은 `refresh_campaign_result` RPC 호출을 추가해, 게시물을 연결하는 즉시 수치가 복사되게 한다. 이 호출이 실패해도 연결 자체는 성공으로 둔다.

- [ ] **Step 7: 마이그레이션 검사 테스트 추가**

`influencer-seeding-workflow.test.mjs` 에 `112` 검사(성과 컬럼 4개, `normalize_post_url` 존재, 양쪽 동기 유지 주석 존재)를 추가한다.

- [ ] **Step 8: 확인 + 적용**

```bash
cd jdi-portal && node --test scripts/influencer-seeding-workflow.test.mjs && node --experimental-strip-types --test scripts/influencer-post-url.test.mjs && npm run lint && npm run build
```
사용자 확인 후 `npx supabase db push --linked`

- [ ] **Step 9: 커밋**

```bash
git add supabase/migrations/112_influencer_campaign_results.sql src/lib/influencer/ scripts/ package.json
git commit -m "기능: 게시물 성과를 시딩 건에 복사·보관 (마이그 112)"
```

---

## Task 8: KPI 확장 + 시딩 실적

**Files:**
- Modify: `supabase/migrations/112_influencer_campaign_results.sql` (RPC 2개 추가)
- Create: `src/components/dashboard/influencer/result/CampaignResultBadge.tsx`, `SeedingHistoryCard.tsx`
- Modify: `src/components/dashboard/influencer/KpiCards.tsx`, `src/components/dashboard/influencer/SeedingCampaignBoard.tsx:124-136`, `src/lib/influencer/kpi.ts`, `src/lib/influencer/queries.ts`, `src/lib/influencer/types.ts`

> 숫자 표시는 `src/lib/influencer/format.ts` 의 기존 `formatNumber` / `formatCostShort` 를 재사용한다. 새 포맷 함수를 만들지 않는다.

**Interfaces:**
- Consumes: `result_*` 컬럼 (Task 7)
- Produces: `get_influencer_kpi_cards()` 반환에 `total_result_views`/`total_result_likes`/`total_result_comments`/`cost_per_10k_views` 추가, `get_influencer_seeding_history(uuid)` 신규

- [ ] **Step 1: KPI RPC 확장**

`082_influencer_kpi_rpc.sql` 의 `public.get_influencer_kpi_cards()` 를 `112` 안에서 `CREATE OR REPLACE` 한다. **기존 반환 필드는 그대로 두고 추가만 한다** (화면 호환). 현재 `SECURITY DEFINER` 가 아니므로 그대로 둔다. `influencer_campaigns` 집계 CTE 에 다음을 더한다:

```sql
COALESCE(SUM(result_views), 0)::BIGINT    AS total_result_views,
COALESCE(SUM(result_likes), 0)::BIGINT    AS total_result_likes,
COALESCE(SUM(result_comments), 0)::BIGINT AS total_result_comments
```

`cost_per_10k_views` 는 `CASE WHEN SUM(result_views) > 0 THEN SUM(cost) / (SUM(result_views) / 10000.0) ELSE NULL END`.

- [ ] **Step 2: 시딩 실적 RPC**

```sql
CREATE OR REPLACE FUNCTION public.get_influencer_seeding_history(p_influencer_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'campaign_count',    COUNT(*),
    'done_count',        COUNT(*) FILTER (WHERE status = 'done'),
    'total_cost',        COALESCE(SUM(cost), 0),
    'total_views',       COALESCE(SUM(result_views), 0),
    'total_likes',       COALESCE(SUM(result_likes), 0),
    'total_comments',    COALESCE(SUM(result_comments), 0),
    'avg_views',         AVG(result_views) FILTER (WHERE result_views IS NOT NULL),
    'cost_per_10k_views',
      CASE WHEN COALESCE(SUM(result_views), 0) > 0
           THEN COALESCE(SUM(cost), 0) / (SUM(result_views) / 10000.0)
           ELSE NULL END
  )
  FROM public.influencer_campaigns
  WHERE influencer_id = p_influencer_id;
$$;
```

`SECURITY INVOKER`(기본) 이므로 `influencer_campaigns` 의 RLS 가 그대로 적용된다.

- [ ] **Step 3: 타입·매핑 확장**

`src/lib/influencer/kpi.ts` 의 `KpiRpcResult` 와 `mapKpiRpcResult`, `src/lib/influencer/types.ts` 의 `KpiCards` 에 새 필드를 더한다. 기존 필드는 건드리지 않는다.

- [ ] **Step 4: UI**

`CampaignResultBadge.tsx` — 조회·좋아요·댓글 + `[성과 새로고침]` 버튼. `result_captured_at` 을 "○월 ○일 기준" 으로 KST 표시.
`SeedingHistoryCard.tsx` — 상세 패널 연락처 위쪽에 배치. "우리랑 시딩 N회 · 총 원가 · 총 조회 · 평균 조회 · 1만 조회당 ○원".
`KpiCards.tsx` — 카드 2장 추가. 6장이 되므로 좁은 화면에서 2열로 접히도록 그리드 조정.

- [ ] **Step 5: 시딩 보드 카드에 요약 표시**

`SeedingCampaignBoard.tsx` 의 카드는 이미 제품명·금액을 `metaParts` 배열로 이어 붙인다(현재 124~136행). 여기에 두 가지만 더한다. 보드가 무거워지지 않게 **배지 컴포넌트를 쓰지 않고 짧은 텍스트로만** 넣는다.

```tsx
if (campaign.result_views !== null) {
  metaParts.push(
    <span key="views" className="tabular-nums text-violet-600">
      조회 {formatNumber(campaign.result_views)}
    </span>
  );
}
if (campaign.payout_status === "paid") {
  metaParts.push(<span key="paid" className="text-emerald-600">지급완료</span>);
}
```

배송·협의 이력은 보드에 넣지 않는다(상세 패널 전용).

- [ ] **Step 6: 성능 회귀 검사 (필수)**

```bash
cd jdi-portal && npm run test:performance
```
기대: 64개 전부 PASS. 실패하면 KPI 왕복이 늘었거나 목록에 무거운 조회가 붙은 것이니 **되돌린다**.

- [ ] **Step 7: 전체 검증**

```bash
cd jdi-portal && npm run lint && npm run build && npm run test:security && npm run test:performance
```

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/112_influencer_campaign_results.sql src/lib/influencer/ src/components/dashboard/influencer/
git commit -m "기능: 시딩 성과 KPI + 인플루언서별 자사 실적"
```

---

## Task 9: 문서 동기화

- [ ] **Step 1: 설계서 갱신**

`docs/superpowers/specs/2026-07-28-influencer-seeding-workflow-design.md` 를 구현 결과에 맞춘다. 특히 브레인스토밍 이후 바뀐 3가지:
1. §4.5 — 업로드는 **브라우저에서** 하고 서버 액션은 메타데이터만 받는다 (`vault/storage.ts` 패턴)
2. §4.6 — 잠금은 쿠키만이 아니라 **DB 세션 + Storage RLS** 로 강제한다 (`vault_unlock_sessions`)
3. §3.1 — 서류 경로 규칙이 `{influencer_id}/{general|sensitive}/{uuid}.{ext}` 로 확정

- [ ] **Step 2: 계획서 보관**

이 계획서를 `docs/superpowers/plans/2026-07-28-influencer-seeding-workflow.md` 로 저장한다.

- [ ] **Step 3: CLAUDE.md 최신화**

루트 `CLAUDE.md` 의 "현재 최신은 `110_review_fixes.sql`" 문구를 `112_influencer_campaign_results.sql` 로 고친다.

- [ ] **Step 4: 커밋 + PR 갱신**

```bash
git add docs/ CLAUDE.md
git commit -m "문서: 시딩 업무 흐름 설계서·계획서 최신화"
git push origin worktree-influencer-seeding-workflow-spec
```

---

## Verification

**자동 검사** (`jdi-portal` 안에서)

```bash
npm run lint
npm run build
npm run test:security        # 새 정적 검사 포함
npm run test:performance     # 64개 — KPI 를 건드렸으므로 필수
node --experimental-strip-types --test scripts/influencer-post-url.test.mjs
```

**수동 시나리오** — `npm run dev` 후 `/dashboard/influencer` 에서 인플루언서 1명으로 처음부터 끝까지 한 번 돌린다.

1. 인플루언서 클릭 → **배송·정산 정보**에 받는사람·전화·주소·계좌 입력 후 저장 → 패널 닫았다 열어 값 유지 확인
2. **서류**에 계약서 업로드 → 잠금 없이 `[보기]` 가능
3. **신분증 사본** 업로드 → `[보기]` 누르면 2차 비밀번호 요구 → 해제 후 열림
4. 같은 계약서에 새 버전 업로드 → 이전 버전이 이력에 남음
5. 시딩 1건 추가 → **협의 이력**에 메모 남기기 → 상태를 `dm_sent` 로 변경 → 변경 기록이 **자동으로** 추가됨
6. 택배사·송장번호 입력 → 저장됨
7. 게시물 연결 → **성과 배지**에 조회·좋아요·댓글이 뜸 (뜨지 않으면 인플루언서 재동기화 후 `[성과 새로고침]`)
8. 지급 완료 체크 → 지급일·결제수단 확인 창 → `/dashboard/expenses` 에 "인플루언서 시딩 - {아이디}" 지출 생성 확인
9. 상단 **KPI 카드**에 총 성과와 1만 조회당 비용이 표시됨
10. 상세 패널 **자사 실적** 카드에 시딩 횟수·평균 조회가 표시됨

**보안 확인 (중요)**

11. 2차 비밀번호를 **잠근 상태**에서 브라우저 개발자 도구 콘솔로 민감 파일 직접 접근을 시도해 실패하는지 확인:

```js
// 잠금 상태에서 실행 → error 가 나와야 정상
const { data, error } = await window.__supabase__.storage
  .from('influencer-documents')
  .createSignedUrl('<신분증 파일 경로>', 60);
console.log(error);
```

전역 클라이언트가 없으면 대신 `/dashboard/vault` 에서 잠금 해제 → 인플루언서 신분증 `[보기]` 성공 → 보관함에서 잠금 → 다시 `[보기]` 실패, 순서로 확인한다.

**기존 기능 회귀**

12. `/dashboard/vault` 계정 탭에서 2차 비밀번호 해제 → 계정 목록 정상 표시 (Task 2 가 이 코드를 건드렸다)
13. `/dashboard` 대시보드와 `/dashboard/tasks` 로딩이 평소처럼 빠른지 (성능 불변조건)

---

## 남는 위험

- **신분증 사본의 보유기간·파기가 관리되지 않는다.** 사용자 결정으로 이번 범위에서 뺐다. 개인정보는 목적이 끝나면 파기해야 하며 사본이 무기한 쌓인다. 다음 단계 후보: 정산 완료 후 N개월 지난 민감 서류를 목록으로 보여주고 사람이 확인해 지우는 화면
- **잠금 쿠키를 보관함과 공유한다.** 보관함을 푼 사람은 인플루언서 민감 서류도 볼 수 있다. 4명 전원이 정산에 관여하므로 의도한 설계다
- **Task 2 가 운영 중인 보관함 코드를 건드린다.** 배포 전 수동 회귀(검증 12번)를 반드시 거친다
