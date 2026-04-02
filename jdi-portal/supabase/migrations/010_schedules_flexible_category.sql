-- 카테고리 CHECK 제약 제거 → 자유 입력 허용
ALTER TABLE public.schedules DROP CONSTRAINT IF EXISTS schedules_category_check;
