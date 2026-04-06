-- 034_is_approved_remaining.sql
-- 보안 강화: 누락된 테이블들에 is_approved 체크 추가
-- 028_security_is_approved.sql의 public.is_approved_user() 함수 활용

-- ============================================================
-- 1. correction_requests RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Users can view own corrections" ON public.correction_requests;
CREATE POLICY "Approved users can view own corrections"
  ON public.correction_requests FOR SELECT TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all corrections" ON public.correction_requests;
CREATE POLICY "Approved admins can view all corrections"
  ON public.correction_requests FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can insert own corrections" ON public.correction_requests;
CREATE POLICY "Approved users can insert own corrections"
  ON public.correction_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can insert corrections for any user" ON public.correction_requests;
CREATE POLICY "Approved admins can insert corrections for any user"
  ON public.correction_requests FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update corrections" ON public.correction_requests;
CREATE POLICY "Approved admins can update corrections"
  ON public.correction_requests FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 2. schedules RLS 강화
-- ============================================================
-- 009에서 생성된 SELECT 정책은 012에서 이미 교체됨
-- 012에서 생성된 "View company or own or participant schedules" 정책 교체
DROP POLICY IF EXISTS "Authenticated can view schedules" ON public.schedules;
DROP POLICY IF EXISTS "View company or own or participant schedules" ON public.schedules;
CREATE POLICY "Approved users can view schedules"
  ON public.schedules FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND (
      visibility = 'company'
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.schedule_participants
        WHERE schedule_id = id AND user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Authenticated can create schedules" ON public.schedules;
CREATE POLICY "Approved users can create schedules"
  ON public.schedules FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS "Creator or admin can update schedules" ON public.schedules;
CREATE POLICY "Approved creator or admin can update schedules"
  ON public.schedules FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Creator or admin can delete schedules" ON public.schedules;
CREATE POLICY "Approved creator or admin can delete schedules"
  ON public.schedules FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 3. schedule_participants RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view participants" ON public.schedule_participants;
CREATE POLICY "Approved users can view participants"
  ON public.schedule_participants FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Schedule creator or admin can manage participants" ON public.schedule_participants;
CREATE POLICY "Approved schedule creator or admin can manage participants"
  ON public.schedule_participants FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user() AND
    EXISTS (
      SELECT 1 FROM public.schedules
      WHERE id = schedule_id AND (created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

DROP POLICY IF EXISTS "Schedule creator or admin can delete participants" ON public.schedule_participants;
CREATE POLICY "Approved schedule creator or admin can delete participants"
  ON public.schedule_participants FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (
      SELECT 1 FROM public.schedules
      WHERE id = schedule_id AND (created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    )
  );

-- ============================================================
-- 4. vacation_balances RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Users can view own balance" ON public.vacation_balances;
CREATE POLICY "Approved users can view own balance"
  ON public.vacation_balances FOR SELECT TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all balances" ON public.vacation_balances;
CREATE POLICY "Approved admins can view all balances"
  ON public.vacation_balances FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can manage balances" ON public.vacation_balances;
CREATE POLICY "Approved admins can manage balances"
  ON public.vacation_balances FOR ALL TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 5. vacation_requests RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Users can view own requests" ON public.vacation_requests;
CREATE POLICY "Approved users can view own requests"
  ON public.vacation_requests FOR SELECT TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all requests" ON public.vacation_requests;
CREATE POLICY "Approved admins can view all requests"
  ON public.vacation_requests FOR SELECT TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Users can insert own requests" ON public.vacation_requests;
CREATE POLICY "Approved users can insert own requests"
  ON public.vacation_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Users can cancel pending" ON public.vacation_requests;
CREATE POLICY "Approved users can cancel pending"
  ON public.vacation_requests FOR UPDATE TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid() AND status = '대기중');

DROP POLICY IF EXISTS "Admins can update any request" ON public.vacation_requests;
CREATE POLICY "Approved admins can update any request"
  ON public.vacation_requests FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 6. task_assignees RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view assignees" ON public.task_assignees;
CREATE POLICY "Approved users can view assignees"
  ON public.task_assignees FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Task creator or admin can add assignees" ON public.task_assignees;
CREATE POLICY "Approved task creator or admin can add assignees"
  ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user() AND (
      EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Task creator or admin can remove assignees" ON public.task_assignees;
CREATE POLICY "Approved task creator or admin can remove assignees"
  ON public.task_assignees FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.created_by = auth.uid())
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 7. task_checklist_items RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view checklist" ON public.task_checklist_items;
CREATE POLICY "Approved users can view checklist"
  ON public.task_checklist_items FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Task participants can add checklist items" ON public.task_checklist_items;
CREATE POLICY "Approved task participants can add checklist items"
  ON public.task_checklist_items FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user() AND (
      EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))
      )
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Task participants can update checklist items" ON public.task_checklist_items;
CREATE POLICY "Approved task participants can update checklist items"
  ON public.task_checklist_items FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND (
      EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))
      )
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Task participants can delete checklist items" ON public.task_checklist_items;
CREATE POLICY "Approved task participants can delete checklist items"
  ON public.task_checklist_items FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_id
        AND (t.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = auth.uid()))
      )
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 8. task_attachments RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view attachments" ON public.task_attachments;
CREATE POLICY "Approved users can view attachments"
  ON public.task_attachments FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Authenticated can upload attachments" ON public.task_attachments;
CREATE POLICY "Approved users can upload attachments"
  ON public.task_attachments FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Uploader or admin can delete attachments" ON public.task_attachments;
CREATE POLICY "Approved uploader or admin can delete attachments"
  ON public.task_attachments FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 9. task_activities RLS 강화
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can view activities" ON public.task_activities;
CREATE POLICY "Approved users can view activities"
  ON public.task_activities FOR SELECT TO authenticated
  USING (public.is_approved_user());

DROP POLICY IF EXISTS "Authenticated can create activities" ON public.task_activities;
CREATE POLICY "Approved users can create activities"
  ON public.task_activities FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user() AND user_id = auth.uid());

DROP POLICY IF EXISTS "Creator or admin can delete activities" ON public.task_activities;
CREATE POLICY "Approved creator or admin can delete activities"
  ON public.task_activities FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND (
      user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================================
-- 10. reports UPDATE/DELETE RLS 강화
-- (025에서 생성, SELECT/INSERT는 028에서 이미 처리됨)
-- ============================================================
DROP POLICY IF EXISTS "Authors and admins can update reports" ON public.reports;
CREATE POLICY "Approved authors and admins can update reports"
  ON public.reports FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND (
      (user_id = auth.uid() AND status = 'submitted')
      OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

DROP POLICY IF EXISTS "Authors can delete own submitted reports" ON public.reports;
CREATE POLICY "Approved authors can delete own submitted reports"
  ON public.reports FOR DELETE TO authenticated
  USING (public.is_approved_user() AND user_id = auth.uid() AND status = 'submitted');

-- ============================================================
-- 11. report_attachments RLS 강화
-- (SELECT는 030_storage_policies_restrict.sql에서 이미 적용됨)
-- ============================================================
DROP POLICY IF EXISTS "Report authors can insert attachments" ON public.report_attachments;
CREATE POLICY "Approved report authors can insert attachments"
  ON public.report_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_user() AND
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Report authors can delete attachments" ON public.report_attachments;
CREATE POLICY "Approved report authors can delete attachments"
  ON public.report_attachments FOR DELETE TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (
      SELECT 1 FROM public.reports
      WHERE id = report_id AND user_id = auth.uid()
    )
  );

-- ============================================================
-- 12. profiles: 관리자가 다른 사용자 프로필 UPDATE 허용
-- (028의 self-update 정책과 별도 — OR 방식으로 평가)
-- ============================================================
CREATE POLICY "Approved admins can update any profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (true);
