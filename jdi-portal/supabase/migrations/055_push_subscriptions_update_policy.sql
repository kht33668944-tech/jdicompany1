-- 055_push_subscriptions_update_policy.sql
-- 픽스: push_subscriptions upsert가 동작하도록 UPDATE 정책 추가
-- 054에 UPDATE policy가 빠져 있어 supabase.upsert()가 기존 row 갱신 시
-- RLS 위반으로 실패하는 문제 수정 (last_used_at 자동 갱신용)

CREATE POLICY "Users update own push_subscriptions"
  ON public.push_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
