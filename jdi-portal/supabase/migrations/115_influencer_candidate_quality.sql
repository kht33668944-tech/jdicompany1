-- 115_influencer_candidate_quality.sql
-- 추천 후보 품질 필터: 자동 제외 사유와 판정 근거 컬럼 추가 + 기존 행 소급 정리
--
-- 배경: 해시태그로 모으면 크리에이터가 아니라 가구점·커튼집 같은 업체 계정이 다수 섞인다.
-- 걸러낸 계정도 행은 남겨야 한다 — 지우면 다음 실행 때 다시 수집되어 Apify 비용을 또 낸다.
-- 그래서 status='rejected' + filter_reason 으로 제외함에 보내고, 운영자가 되돌릴 수 있게 한다.

ALTER TABLE public.influencer_candidates
  ADD COLUMN filter_reason text,
  ADD COLUMN business_category text,
  ADD COLUMN is_business_account boolean,
  ADD COLUMN is_private boolean;

COMMENT ON COLUMN public.influencer_candidates.filter_reason IS
  '자동 제외 사유. NULL 이면 운영자가 직접 제외했거나 제외되지 않은 것.';

-- 제외함에서 자동 제외분만 빠르게 뽑기 위한 부분 인덱스
CREATE INDEX idx_influencer_candidates_filter_reason
  ON public.influencer_candidates (status, filter_reason)
  WHERE filter_reason IS NOT NULL;

-- ============================================================
-- 소급 정리: 이미 쌓인 후보 중 저장된 값만으로 판정 가능한 것들
-- ============================================================
-- 업종(business_category)은 기존 행에 없으므로 소급 적용할 수 없다.
-- 팔로워 수와 릴스 비중은 이미 저장돼 있어 지금 판정할 수 있다.

UPDATE public.influencer_candidates
SET status = 'rejected',
    filter_reason = '자동: 팔로워 100명 미만',
    updated_at = now()
WHERE status = 'new'
  AND (followers IS NULL OR followers < 100);

UPDATE public.influencer_candidates
SET status = 'rejected',
    filter_reason = '자동: 릴스 없음',
    updated_at = now()
WHERE status = 'new'
  AND (reels_ratio IS NULL OR reels_ratio = 0);
