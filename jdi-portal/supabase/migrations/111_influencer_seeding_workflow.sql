-- 111_influencer_seeding_workflow.sql
-- 인플루언서 시딩 업무 흐름: 연락처 / 서류 / 협의 이력 / 배송·지급
--
-- 배경: 자사 제품 시딩에서 인플루언서에게 제품을 보내려면 주소가 필요하고,
--       정산하려면 계약서·신분증 사본이 필요한데 저장할 자리가 없어 실무가
--       카카오톡·엑셀로 빠져나가고 있었다.
--
-- 설계서: docs/superpowers/specs/2026-07-28-influencer-seeding-workflow-design.md

-- ============================================================
-- 1) 연락처 (배송 + 정산)
-- ============================================================
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
  ON public.influencer_contacts FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create influencer_contacts"
  ON public.influencer_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
CREATE POLICY "Approved users can update influencer_contacts"
  ON public.influencer_contacts FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Approved users can delete influencer_contacts"
  ON public.influencer_contacts FOR DELETE TO authenticated
  USING (public.is_approved_user());

-- ============================================================
-- 2) 2차 비밀번호 잠금 세션
--    보관함(106)의 잠금은 서명 쿠키만 봤기 때문에, 쿠키를 우회하면
--    Storage 에 직접 접근할 수 있었다. 잠금 상태를 DB 에 두고 Storage
--    RLS 가 이를 참조하게 해서 서버가 실제로 막도록 한다.
--
--    ⚠️ 이 표에는 INSERT/UPDATE/DELETE 정책을 두지 않는다.
--       정책을 열면 사용자가 스스로 잠금을 풀 수 있어 의미가 없어진다.
--       기록은 아래 SECURITY DEFINER 함수로만 이뤄진다.
-- ============================================================
CREATE TABLE public.vault_unlock_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.vault_unlock_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own unlock session"
  ON public.vault_unlock_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 현재 사용자의 잠금이 유효한지. Storage 정책에서 호출한다.
CREATE OR REPLACE FUNCTION public.has_vault_unlock()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vault_unlock_sessions
     WHERE user_id = auth.uid() AND expires_at > now()
  );
$$;

-- 비밀번호 검증 + 잠금 세션 생성(20분). 앱의 VAULT_UNLOCK_TTL_SEC 과 맞춘다.
CREATE OR REPLACE FUNCTION public.vault_unlock(p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_ok boolean;
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
  ON CONFLICT (user_id) DO UPDATE
    SET unlocked_at = now(),
        expires_at = now() + interval '20 minutes';

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.vault_lock()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.vault_unlock_sessions WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.has_vault_unlock() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_unlock(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_lock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_vault_unlock() TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_unlock(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.vault_lock() TO authenticated;

-- ============================================================
-- 3) 서류 (계약서 / 신분증 사본 / 통장 사본)
--    구조는 보관함(vault_documents)과 같지만, 보관함은 corporation_id 가
--    NOT NULL 이라 인플루언서에 붙일 수 없어 별도 표로 만든다.
-- ============================================================
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

-- 신분증·통장은 반드시 민감으로 표시된다. 클라이언트가 값을 낮춰 보내도 무시.
CREATE OR REPLACE FUNCTION public.force_influencer_document_sensitive()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.is_sensitive := NEW.kind IN ('id_card', 'bankbook');
  RETURN NEW;
END;
$$;

CREATE TRIGGER influencer_documents_force_sensitive
  BEFORE INSERT OR UPDATE ON public.influencer_documents
  FOR EACH ROW EXECUTE FUNCTION public.force_influencer_document_sensitive();

CREATE POLICY "Approved users can view influencer_documents"
  ON public.influencer_documents FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create influencer_documents"
  ON public.influencer_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
CREATE POLICY "Approved users can update influencer_documents"
  ON public.influencer_documents FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Admins can delete influencer_documents"
  ON public.influencer_documents FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 버전: 재계약 시 이전 계약서가 사라지지 않게 한다.
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

CREATE POLICY "Approved users can view influencer_document_versions"
  ON public.influencer_document_versions FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create influencer_document_versions"
  ON public.influencer_document_versions FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND uploaded_by = auth.uid());
CREATE POLICY "Approved users can update influencer_document_versions"
  ON public.influencer_document_versions FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Admins can delete influencer_document_versions"
  ON public.influencer_document_versions FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 서류 삭제 뒤 Storage 에 남는 고아 파일 정리용 (098 패턴).
CREATE TABLE public.influencer_document_cleanup_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path text NOT NULL UNIQUE,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_document_cleanup_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_document_cleanup_queue"
  ON public.influencer_document_cleanup_queue FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create influencer_document_cleanup_queue"
  ON public.influencer_document_cleanup_queue FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user());
CREATE POLICY "Admins can delete influencer_document_cleanup_queue"
  ON public.influencer_document_cleanup_queue FOR DELETE TO authenticated
  USING (
    public.is_approved_user()
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 4) Storage: 비공개 서류 버킷 + 잠금을 반영한 정책
--    경로 규칙: {influencer_id}/{general|sensitive}/{uuid}.{ext}
--    2번째 조각이 'sensitive' 면 잠금이 풀려 있어야 읽고 쓸 수 있다.
-- ============================================================
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

-- ============================================================
-- 5) 협의 이력 (기록 불변 — UPDATE 정책을 두지 않는다)
-- ============================================================
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
  ON public.influencer_campaign_events FOR SELECT TO authenticated
  USING (public.is_approved_user());
CREATE POLICY "Approved users can create campaign events"
  ON public.influencer_campaign_events FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());
-- UPDATE 정책 없음 = 남긴 기록은 고칠 수 없다
CREATE POLICY "Authors can delete own campaign notes"
  ON public.influencer_campaign_events FOR DELETE TO authenticated
  USING (public.is_approved_user() AND kind = 'note' AND created_by = auth.uid());

-- 상태를 바꾸면 이력이 자동으로 남는다.
CREATE OR REPLACE FUNCTION public.log_campaign_status_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- 배치/마이그레이션(auth.uid() 없음)에서는 기록하지 않는다.
  IF NEW.status IS DISTINCT FROM OLD.status AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.influencer_campaign_events
      (campaign_id, kind, from_status, to_status, created_by)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER influencer_campaigns_log_status
  AFTER UPDATE OF status ON public.influencer_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.log_campaign_status_change();

-- ============================================================
-- 6) 캠페인: 배송·지급 컬럼
-- ============================================================
ALTER TABLE public.influencer_campaigns
  ADD COLUMN IF NOT EXISTS courier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'none'
    CHECK (payout_status IN ('none', 'pending', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL;

-- 인플루언서별 시딩 실적 조회용
CREATE INDEX IF NOT EXISTS idx_influencer_campaigns_influencer
  ON public.influencer_campaigns (influencer_id);

-- ============================================================
-- 7) 지출 연동 준비
-- ============================================================
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_source_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_source_check
  CHECK (source IN ('manual', 'recurring', 'import', 'seeding'));

-- 시딩비가 들어갈 분류. 민감 분류가 아니어야 직원 전원이 볼 수 있다.
INSERT INTO public.expense_categories (name, is_sensitive, sort_order, is_active)
VALUES ('인플루언서 시딩', FALSE, 100, TRUE)
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 8) 지급 처리: 지출 생성과 캠페인 갱신을 한 번에
--    따로 하면 지출만 생기고 캠페인이 안 바뀌는 부분 성공이 생긴다.
--    권한 상승이 필요 없으므로 SECURITY INVOKER(기본) — RLS 가 그대로 적용된다.
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_campaign_paid(
  p_campaign_id uuid,
  p_paid_at date,
  p_payment_method text
)
RETURNS uuid
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_camp  record;
  v_uname text;
  v_cat   uuid;
  v_exp   uuid;
BEGIN
  SELECT c.id, c.cost, c.product_name, c.expense_id, i.username
    INTO v_camp
    FROM public.influencer_campaigns c
    JOIN public.influencers i ON i.id = c.influencer_id
   WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '시딩을 찾을 수 없습니다.';
  END IF;

  v_uname := v_camp.username;
  v_exp := v_camp.expense_id;

  -- 무상 시딩(금액 없음)은 지출을 만들지 않는다.
  IF COALESCE(v_camp.cost, 0) > 0 THEN
    SELECT id INTO v_cat FROM public.expense_categories WHERE name = '인플루언서 시딩';
    IF v_cat IS NULL THEN
      RAISE EXCEPTION '지출 분류(인플루언서 시딩)가 없습니다.';
    END IF;

    IF v_exp IS NOT NULL THEN
      UPDATE public.expenses
         SET expense_date   = p_paid_at,
             amount_krw     = v_camp.cost,
             payment_method = p_payment_method,
             updated_by     = auth.uid(),
             updated_at     = now()
       WHERE id = v_exp;
    ELSE
      INSERT INTO public.expenses
        (expense_date, vendor, description, amount_krw, payment_method,
         category_id, source, created_by)
      VALUES
        (p_paid_at,
         v_uname,
         '인플루언서 시딩 - ' || v_uname ||
           COALESCE(' (' || v_camp.product_name || ')', ''),
         v_camp.cost,
         p_payment_method,
         v_cat,
         'seeding',
         auth.uid())
      RETURNING id INTO v_exp;
    END IF;
  END IF;

  UPDATE public.influencer_campaigns
     SET payout_status = 'paid',
         paid_at       = p_paid_at,
         expense_id    = v_exp,
         updated_at    = now()
   WHERE id = p_campaign_id;

  RETURN v_exp;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_campaign_paid(uuid, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_campaign_paid(uuid, date, text) TO authenticated;
