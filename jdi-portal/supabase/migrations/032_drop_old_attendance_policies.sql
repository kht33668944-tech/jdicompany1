-- 032_drop_old_attendance_policies.sql
-- 028에서 새 정책을 생성했으나 기존 넓은 정책 이름이 달라서 삭제되지 않았음
-- 기존 정책을 삭제하여 승인되지 않은 사용자의 접근을 완전히 차단

-- 기존 넓은 SELECT 정책 제거
DROP POLICY IF EXISTS "Users can view own" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins can view all attendance" ON public.attendance_records;

-- 기존 넓은 INSERT 정책 제거
DROP POLICY IF EXISTS "Users can insert own" ON public.attendance_records;

-- 기존 넓은 UPDATE 정책 제거
DROP POLICY IF EXISTS "Users can update own" ON public.attendance_records;
DROP POLICY IF EXISTS "Admins can update any attendance" ON public.attendance_records;

-- Admins UPDATE도 is_approved 체크 추가
CREATE POLICY "Approved admins can update any attendance"
  ON public.attendance_records FOR UPDATE TO authenticated
  USING (
    public.is_approved_user() AND
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
