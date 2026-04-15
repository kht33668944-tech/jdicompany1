-- 점심시간 1시간 자동 공제
-- 정책: check_out - check_in > 240분(4시간)일 때만 60분 차감
-- GENERATED 컬럼이므로 기존 모든 행이 자동 재계산됨 (소급 적용)

BEGIN;

ALTER TABLE public.attendance_records
  DROP COLUMN total_minutes;

ALTER TABLE public.attendance_records
  ADD COLUMN total_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN check_in IS NOT NULL AND check_out IS NOT NULL THEN
        CASE
          WHEN EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60 > 240
          THEN (EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60) - 60
          ELSE  EXTRACT(EPOCH FROM (check_out - check_in))::INTEGER / 60
        END
      ELSE NULL
    END
  ) STORED;

COMMIT;
