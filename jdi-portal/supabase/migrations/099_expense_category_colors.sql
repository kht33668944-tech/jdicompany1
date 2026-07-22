-- 099_expense_category_colors.sql
-- 분류별 색상 저장(color_key) + 기존 분류 backfill (src/lib/expenses/colors.ts 팔레트와 일치)

ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS color_key text;

-- 기존 분류 → 색키 매핑 (092 이후 이름 기준: '세금','공과금' 분리 반영)
UPDATE public.expense_categories SET color_key = 'rose'    WHERE name = '세금'         AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'amber'   WHERE name = '공과금'       AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'pink'    WHERE name = '급여'         AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'violet'  WHERE name = '임차료·관리비' AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'blue'    WHERE name = '구독·소프트웨어' AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'indigo'  WHERE name = '광고비'       AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'sky'     WHERE name = '물류·배송'    AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'teal'    WHERE name = '비품·소모품'  AND color_key IS NULL;
UPDATE public.expense_categories SET color_key = 'orange'  WHERE name = '식비·복리후생' AND color_key IS NULL;

-- '기타' 및 사용자가 이미 추가한 분류: 남은 팔레트 색을 순서대로 배정
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY sort_order, name) AS rn
  FROM public.expense_categories
  WHERE color_key IS NULL
),
palette AS (
  SELECT key, row_number() OVER () AS pn
  FROM unnest(ARRAY['emerald','cyan','lime','fuchsia','violet','blue','indigo','sky','teal','amber','orange','rose','pink']) AS key
)
UPDATE public.expense_categories c
SET color_key = p.key
FROM ordered o
JOIN palette p ON ((o.rn - 1) % (SELECT count(*) FROM palette)) + 1 = p.pn
WHERE c.id = o.id;
