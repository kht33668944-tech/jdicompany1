-- ============================================================
-- 연차(vacation_balance) 자동 초기화 + 입사일 변경 시 재계산
-- ============================================================
-- 문제:
-- 1) vacation_balances 레코드가 없으면 휴가 탭에서 "0일"로 표시됨
-- 2) 입사일이 변경되어도 총 연차가 자동으로 다시 계산되지 않음
--
-- 해결:
-- 1) ensure_vacation_balance RPC: 현재 년도 레코드가 없으면 프로필의
--    hire_date 를 바탕으로 법정 연차를 계산해 INSERT. 있으면 기존
--    used_days는 보존하면서 total_days만 최신 값으로 갱신.
-- 2) profiles.hire_date 변경 트리거: 자동으로 현재 년도 balance 재계산.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_vacation_balance(
  p_user_id UUID,
  p_year INTEGER DEFAULT EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER
)
RETURNS public.vacation_balances
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hire_date DATE;
  v_total NUMERIC(4,1);
  v_balance public.vacation_balances;
BEGIN
  -- 본인 또는 관리자만 허용
  IF p_user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT hire_date INTO v_hire_date FROM public.profiles WHERE id = p_user_id;
  IF v_hire_date IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_total := public.calculate_vacation_days(v_hire_date, p_year);

  INSERT INTO public.vacation_balances (user_id, year, total_days, used_days)
  VALUES (p_user_id, p_year, v_total, 0)
  ON CONFLICT (user_id, year) DO UPDATE
    SET total_days = EXCLUDED.total_days,
        updated_at = NOW()
  RETURNING * INTO v_balance;

  RETURN v_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_vacation_balance(UUID, INTEGER) TO authenticated;

-- ============================================================
-- 입사일 변경 시 자동 재계산 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_hire_date_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER;
BEGIN
  IF NEW.hire_date IS DISTINCT FROM OLD.hire_date THEN
    INSERT INTO public.vacation_balances (user_id, year, total_days, used_days)
    VALUES (NEW.id, v_year, public.calculate_vacation_days(NEW.hire_date, v_year), 0)
    ON CONFLICT (user_id, year) DO UPDATE
      SET total_days = public.calculate_vacation_days(NEW.hire_date, v_year),
          updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_hire_date_change ON public.profiles;
CREATE TRIGGER trg_profiles_hire_date_change
AFTER UPDATE OF hire_date ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.on_hire_date_change();

-- ============================================================
-- 기존 사용자 전원 현재 년도 balance 백필
-- ============================================================
DO $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER;
  r RECORD;
BEGIN
  FOR r IN SELECT id, hire_date FROM public.profiles WHERE hire_date IS NOT NULL LOOP
    INSERT INTO public.vacation_balances (user_id, year, total_days, used_days)
    VALUES (r.id, v_year, public.calculate_vacation_days(r.hire_date, v_year), 0)
    ON CONFLICT (user_id, year) DO UPDATE
      SET total_days = public.calculate_vacation_days(r.hire_date, v_year),
          updated_at = NOW();
  END LOOP;
END $$;
