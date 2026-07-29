// 인플루언서 도메인 상수

/**
 * 인플루언서 1명을 Apify로 긁어올 때 드는 대략적인 비용(원).
 *
 * Apify는 "결과(dataset item) 1건" 단위로 과금하고, 프로필 전용 actor
 * (apify/instagram-profile-scraper)는 1명당 결과 1건만 쓴다.
 * 무료 플랜 단가 $2.60/1,000건 ≈ $0.0026 ≈ 4원.
 *
 * 정확한 청구액이 아니라 "전체 재동기화"처럼 여러 명을 한꺼번에 돌리기 전에
 * 대략적인 규모를 보여 주기 위한 값이다. 요금제나 환율이 바뀌면 여기만 고친다.
 */
export const APIFY_COST_PER_INFLUENCER_KRW = 4;
