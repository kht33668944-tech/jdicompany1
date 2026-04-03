-- ============================================================
-- 022: notifications INSERT RLS 정책 수정
-- 기존 정책 삭제 후 재생성 (다른 사용자에게 알림 생성 허용)
-- ============================================================

DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;

-- 인증된 사용자는 누구에게든 알림을 INSERT할 수 있음
CREATE POLICY "Anyone can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);
