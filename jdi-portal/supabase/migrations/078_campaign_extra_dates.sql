-- 078_campaign_extra_dates.sql
-- 캠페인에 2개 일정 컬럼 추가:
--   contract_date     : 계약 진행 (계약서 전달~싸인 완료 목표일)
--   content_deadline  : 콘텐츠 제작 마감일

ALTER TABLE public.influencer_campaigns
  ADD COLUMN IF NOT EXISTS contract_date    date,
  ADD COLUMN IF NOT EXISTS content_deadline date;
