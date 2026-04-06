-- 026_work_schedule.sql
-- 개인별 고정 근무시간 설정 (출근/퇴근 기준 시간)

ALTER TABLE public.profiles
  ADD COLUMN work_start_time TIME DEFAULT NULL,
  ADD COLUMN work_end_time TIME DEFAULT NULL;

COMMENT ON COLUMN public.profiles.work_start_time IS '고정 출근 시간 (NULL이면 09:00 기준)';
COMMENT ON COLUMN public.profiles.work_end_time IS '고정 퇴근 시간 (NULL이면 18:00 기준)';
