CREATE OR REPLACE FUNCTION public.calculate_vacation_days(p_hire_date DATE, p_year INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  years_worked INTEGER;
  base_days NUMERIC;
BEGIN
  years_worked := p_year - EXTRACT(YEAR FROM p_hire_date);
  IF years_worked < 1 THEN
    base_days := LEAST(EXTRACT(MONTH FROM AGE(MAKE_DATE(p_year, 12, 31), p_hire_date)), 11);
  ELSE
    base_days := LEAST(15 + FLOOR((years_worked - 1) / 2.0), 25);
  END IF;
  RETURN base_days;
END;
$$ LANGUAGE plpgsql;
