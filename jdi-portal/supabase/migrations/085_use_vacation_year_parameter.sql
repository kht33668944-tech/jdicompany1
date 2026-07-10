-- Keep the second argument for existing callers while documenting that the
-- current entitlement calculation intentionally uses actual KST tenure.
CREATE OR REPLACE FUNCTION public.calculate_vacation_days(
  p_hire_date DATE,
  p_year INTEGER DEFAULT NULL
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
  -- p_year is retained for backward compatibility with RPC and trigger calls.
  PERFORM p_year;

  IF p_hire_date IS NULL OR p_hire_date > v_today THEN
    RETURN 0;
  END IF;

  v_age := AGE(v_today, p_hire_date);
  v_years := EXTRACT(YEAR FROM v_age)::INTEGER;
  v_total_months := v_years * 12 + EXTRACT(MONTH FROM v_age)::INTEGER;

  IF v_years < 1 THEN
    RETURN LEAST(GREATEST(v_total_months, 0), 11);
  END IF;

  RETURN LEAST(15 + FLOOR((v_years - 1) / 2.0), 25);
END;
$$;
