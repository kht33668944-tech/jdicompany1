-- ============================================================
-- 연차 계산 버그 수정: 실제 근속 기간 기반으로 변경
-- ============================================================
-- 문제:
--   기존 calculate_vacation_days 는 (p_year - YEAR(hire_date)) 으로
--   연도 숫자만 빼서 계산 → 2025-06-23 입사한 사람이 2026년에
--   15일을 받는 버그. (실제는 아직 1년 미만 → 월 단위 적립)
--
-- 해결:
--   오늘(Asia/Seoul) 기준 실제 근속 기간(AGE)을 사용:
--     - 1년 미만: 완료된 개월 수, 최대 11일
--     - 1년 이상: 15 + floor((근속년수 - 1) / 2), 최대 25일
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_vacation_days(
  p_hire_date DATE,
  p_year INTEGER DEFAULT NULL  -- 호환용, 사용 안 함
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
  v_age INTERVAL;
  v_years INTEGER;
  v_total_months INTEGER;
BEGIN
  -- 미래 입사일이면 0일
  IF p_hire_date IS NULL OR p_hire_date > v_today THEN
    RETURN 0;
  END IF;

  v_age := AGE(v_today, p_hire_date);
  v_years := EXTRACT(YEAR FROM v_age)::INTEGER;
  v_total_months := v_years * 12 + EXTRACT(MONTH FROM v_age)::INTEGER;

  -- 1년 미만: 완료된 개월 수만큼 적립, 최대 11일
  IF v_years < 1 THEN
    RETURN LEAST(GREATEST(v_total_months, 0), 11);
  END IF;

  -- 1년 이상: 기본 15일 + 2년마다 1일, 최대 25일
  RETURN LEAST(15 + FLOOR((v_years - 1) / 2.0), 25);
END;
$$;

-- ============================================================
-- 기존 vacation_balances 재계산 (현재 년도)
-- ============================================================
DO $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER;
  r RECORD;
BEGIN
  FOR r IN SELECT id, hire_date FROM public.profiles WHERE hire_date IS NOT NULL LOOP
    UPDATE public.vacation_balances
       SET total_days = public.calculate_vacation_days(r.hire_date, v_year),
           updated_at = NOW()
     WHERE user_id = r.id AND year = v_year;
  END LOOP;
END $$;
