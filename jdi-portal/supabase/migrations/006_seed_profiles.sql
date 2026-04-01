INSERT INTO public.profiles (id, full_name, email, role, hire_date)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
  email,
  'admin',
  CURRENT_DATE
FROM auth.users
ON CONFLICT (id) DO NOTHING;
