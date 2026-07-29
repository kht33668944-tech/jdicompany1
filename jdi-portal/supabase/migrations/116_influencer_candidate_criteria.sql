-- 116_influencer_candidate_criteria.sql
-- 추천 후보 선정 기준 재정립 + 유사 계정(씨앗) 확장 풀
--
-- 배경 1 — 기준: 기존 하한 100명은 "팔로워 0~4명짜리 잡음"만 걸러내는 수준이었다.
--   업계 기준(마이크로 1만~10만이 시딩 주력, 릴스 조회수/팔로워 0.3배 미만은 도달 실패,
--   참여율은 팔로워 구간마다 합격선이 다름)에 맞춰 하한 7,000 / 상한 300,000 으로 다시 잡는다.
--
-- 배경 2 — 발굴 경로: 해시태그 "최신 게시물" 피드는 구조적으로 작은 계정이 대부분이다.
--   팔로워 많은 크리에이터는 해시태그에 의존하지 않기 때문. 그래서 상세 수집 응답에 이미
--   딸려오는 relatedProfiles(인스타가 보여주는 추천 계정)를 씨앗으로 모아 옆으로 뻗는다.
--   Apify 추가 호출이 없으므로 비용 증가는 없다.

-- ============================================================
-- 1. influencer_candidate_seeds (유사 계정 확장 풀)
-- ============================================================
-- 상세 수집 때 함께 받은 relatedProfiles 를 쌓아두고, 다음 실행에서 상세 수집 대상으로 꺼내 쓴다.
-- 후보 테이블과 마찬가지로 행은 지우지 않는다 — 지우면 같은 계정을 또 수집해 비용을 또 낸다.
CREATE TABLE public.influencer_candidate_seeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL DEFAULT 'instagram',
  username text NOT NULL,
  -- 어느 계정의 추천 목록에서 나왔는지 (발굴 경로 추적용)
  source_username text,
  full_name text,
  is_private boolean,
  is_verified boolean,
  -- 상세 수집에 실제로 투입된 시각. NULL 이면 아직 대기열에 있는 씨앗.
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (platform, username)
);

ALTER TABLE public.influencer_candidate_seeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved users can view influencer_candidate_seeds"
  ON public.influencer_candidate_seeds FOR SELECT TO authenticated
  USING (public.is_approved_user());

CREATE POLICY "Approved users can create influencer_candidate_seeds"
  ON public.influencer_candidate_seeds FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_user());

CREATE POLICY "Approved users can update influencer_candidate_seeds"
  ON public.influencer_candidate_seeds FOR UPDATE TO authenticated
  USING (public.is_approved_user())
  WITH CHECK (public.is_approved_user());

-- DELETE 정책 없음 (후보 테이블과 같은 이유).

-- 대기 중인 씨앗만 빠르게 꺼내기 위한 부분 인덱스
CREATE INDEX idx_influencer_candidate_seeds_pending
  ON public.influencer_candidate_seeds (platform, created_at)
  WHERE consumed_at IS NULL;

-- 유사 계정 경로로 발굴된 후보는 해시태그 출처가 없다. 대신 "누구의 추천 목록에서 나왔는지"를 남긴다.
ALTER TABLE public.influencer_candidates
  ADD COLUMN source_seed_username text;

COMMENT ON COLUMN public.influencer_candidates.source_seed_username IS
  '유사 계정 확장으로 발굴된 경우, 추천 목록을 제공한 원본 계정. 해시태그 발굴이면 NULL.';

-- ============================================================
-- 2. 실행 기록에 씨앗 사용량 컬럼 추가 (비용/성과 감사)
-- ============================================================
ALTER TABLE public.influencer_discovery_runs
  ADD COLUMN seed_used int NOT NULL DEFAULT 0,
  ADD COLUMN seed_harvested int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.influencer_discovery_runs.seed_used IS
  '이번 실행에서 유사 계정 풀에서 꺼내 상세 수집한 수';

COMMENT ON COLUMN public.influencer_discovery_runs.seed_harvested IS
  '이번 실행에서 새로 풀에 담은 유사 계정 수';

-- ============================================================
-- 3. 릴스 조회수 지표를 평균 → 중앙값으로 전환
-- ============================================================
-- 평균은 단발 바이럴 릴스 하나에 통째로 끌려간다(실제로 가구 매장 계정이 48배로 1위를 차지했다).
-- 업계 표준도 "최근 릴스들의 중앙값"이라 컬럼 의미 자체를 중앙값으로 바꾼다.
-- 기존에 저장된 값은 평균이지만, 다음 수집 때 같은 계정을 다시 받지 않으므로 소급 재계산은 불가능하다.
-- 어차피 위 소급 정리에서 대부분 제외되므로 남은 값은 곧 새 기준 데이터로 교체된다.
ALTER TABLE public.influencer_candidates
  RENAME COLUMN reels_avg_views TO reels_median_views;

COMMENT ON COLUMN public.influencer_candidates.reels_median_views IS
  '최근 릴스 중 조회수가 보이는 것들의 중앙값. 단발 바이럴에 흔들리지 않게 평균이 아닌 중앙값을 쓴다.';

-- ============================================================
-- 4. 소급 정리 — 새 기준으로 기존 'new' 후보 재판정
-- ============================================================
-- Edge Function 의 qualityVerdict() 와 같은 우선순위로 적용한다(먼저 걸린 사유가 남도록).
-- 이미 등록(registered)했거나 제외(rejected)한 행은 건드리지 않는다.

-- ① 팔로워 하한
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 팔로워 7,000명 미만', updated_at = now()
WHERE status = 'new' AND (followers IS NULL OR followers < 7000);

-- ② 팔로워 상한 (무료 시딩 수락률이 급락하는 구간)
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 팔로워 30만명 초과', updated_at = now()
WHERE status = 'new' AND followers > 300000;

-- ③ 릴스 비중 (영상 크리에이터 요건)
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 릴스 비중 30% 미만', updated_at = now()
WHERE status = 'new' AND (reels_ratio IS NULL OR reels_ratio < 0.3);

-- ④ 릴스 조회수를 확인할 수 없는 계정 (효율 판정 불가)
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 릴스 조회수 확인 불가', updated_at = now()
WHERE status = 'new' AND reels_efficiency IS NULL;

-- ⑤ 릴스 도달 실패 (조회수가 팔로워의 0.3배 미만 = 팔로워 밖으로 못 나감)
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 릴스 도달 부족(0.3배 미만)', updated_at = now()
WHERE status = 'new' AND reels_efficiency < 0.3;

-- ⑥ 참여율 이상치 (품앗이/소통계정 — 정상 계정에서 나올 수 없는 값)
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 참여율 이상치(30% 초과)', updated_at = now()
WHERE status = 'new' AND engagement_rate > 30;

-- ⑦ 참여율 구간별 하한 (팔로워가 클수록 합격선이 낮아진다)
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 참여율 부족', updated_at = now()
WHERE status = 'new'
  AND (
    engagement_rate IS NULL
    OR (followers < 10000  AND engagement_rate < 3)
    OR (followers >= 10000 AND followers < 100000 AND engagement_rate < 2)
    OR (followers >= 100000 AND engagement_rate < 1.5)
  );

-- ⑧ 활동 중단 (마지막 게시가 30일 초과)
-- 여기서는 의도적으로 KST 변환을 하지 않는다. "지금으로부터 30일 전"은 시점(instant) 간 뺄셈이라
-- 표시 시간대와 무관하게 같은 순간을 가리킨다. (NOW() AT TIME ZONE 'Asia/Seoul') 은 timestamptz 를
-- timestamp 로 바꿔버려 오히려 세션 시간대에 따라 결과가 흔들린다. 날짜 경계(달력 날짜)를 다룰 때만 KST 변환을 쓴다.
UPDATE public.influencer_candidates
SET status = 'rejected', filter_reason = '자동: 30일 이상 미게시', updated_at = now()
WHERE status = 'new'
  AND (
    last_post_at IS NULL
    OR last_post_at < now() - INTERVAL '30 days'
  );
