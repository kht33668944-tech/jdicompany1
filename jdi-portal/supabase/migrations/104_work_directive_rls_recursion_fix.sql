-- ============================================================
-- 104: 업무지시 RLS 상호 재귀 해소
--
-- 103 의 정책이 서로를 참조해 무한 재귀(42P17)가 발생했다.
--   work_directives      SELECT 정책 → work_directive_recipients 참조
--   work_directive_recipients 정책들 → work_directives 참조
-- 048_fix_schedule_participants_recursion 과 같은 방식으로,
-- RLS 를 우회하는 SECURITY DEFINER 헬퍼를 만들어 고리를 끊는다.
-- ============================================================

-- 헬퍼: 호출자가 해당 지시를 보낸 사람인지 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_work_directive_sender(p_directive_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_directives
     WHERE id = p_directive_id AND created_by = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_work_directive_sender(UUID) TO authenticated;

-- 헬퍼: 호출자가 해당 지시를 받은 사람인지 (RLS 우회)
CREATE OR REPLACE FUNCTION public.is_work_directive_recipient(p_directive_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_directive_recipients
     WHERE directive_id = p_directive_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_work_directive_recipient(UUID) TO authenticated;

-- 헬퍼: 호출자가 관리자인지 (profiles 는 재귀 대상이 아니지만 반복을 줄인다)
CREATE OR REPLACE FUNCTION public.is_work_directive_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_work_directive_admin() TO authenticated;

-- ---------- work_directives 정책 재작성 ----------
DROP POLICY IF EXISTS "지시: 보낸 사람·받는 사람·관리자만 조회" ON public.work_directives;
CREATE POLICY "지시: 보낸 사람·받는 사람·관리자만 조회"
  ON public.work_directives FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      created_by = auth.uid()
      OR public.is_work_directive_recipient(id)
      OR public.is_work_directive_admin()
    )
  );

DROP POLICY IF EXISTS "지시: 보낸 사람·관리자 삭제" ON public.work_directives;
CREATE POLICY "지시: 보낸 사람·관리자 삭제"
  ON public.work_directives FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_work_directive_admin());

-- ---------- work_directive_recipients 정책 재작성 ----------
DROP POLICY IF EXISTS "수신: 지시를 볼 수 있으면 조회" ON public.work_directive_recipients;
CREATE POLICY "수신: 지시를 볼 수 있으면 조회"
  ON public.work_directive_recipients FOR SELECT TO authenticated
  USING (
    public.is_approved_user()
    AND (
      user_id = auth.uid()
      OR public.is_work_directive_sender(directive_id)
      OR public.is_work_directive_admin()
    )
  );

DROP POLICY IF EXISTS "수신: 지시를 만든 사람만 추가" ON public.work_directive_recipients;
CREATE POLICY "수신: 지시를 만든 사람만 추가"
  ON public.work_directive_recipients FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user()
    AND public.is_work_directive_sender(directive_id)
  );

DROP POLICY IF EXISTS "수신: 보낸 사람·관리자 삭제" ON public.work_directive_recipients;
CREATE POLICY "수신: 보낸 사람·관리자 삭제"
  ON public.work_directive_recipients FOR DELETE TO authenticated
  USING (
    public.is_work_directive_sender(directive_id)
    OR public.is_work_directive_admin()
  );
