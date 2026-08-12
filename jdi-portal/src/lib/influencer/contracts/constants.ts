// TMA 계약 관리 상수 (클라이언트/서버 공용)

/** 신분증 파일 저장 버킷(비공개, 10MB 제한) — 마이그레이션 119 */
export const CONTRACT_DOCS_BUCKET = "influencer-contract-docs";

/** 현재 시즌 키. 내년 시즌 전환 시 여기만 바꾸면 된다(테이블에 season 컬럼 준비됨). */
export const CONTRACTS_SEASON = "2026-tma";

/** 시딩 스케줄에 자동 생성되는 캠페인 이름 */
export const TMA_CAMPAIGN_NAME = "2026 TMA 트리 협업";

/** 정산 완료 시 지출 자동 기록에 쓰는 분류/결제수단 */
export const EXPENSE_CATEGORY_NAME = "인플루언서 광고비";
export const EXPENSE_PAYMENT_METHOD = "계좌이체";

/**
 * 날짜 임박 기준(일) — 실무 날짜(발송/초안/게시 예정).
 * 마이그레이션 121의 아침 알림 SQL(`v_soon := 오늘 + N`)과 같아야 하며,
 * scripts/influencer-contracts.test.mjs 가 등가성을 검사한다.
 */
export const URGENT_SOON_DAYS = 3;

/** 서버 액션/페이지가 공유하는 UUID 형식 검사 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
