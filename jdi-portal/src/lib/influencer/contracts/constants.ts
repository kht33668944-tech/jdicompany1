// TMA 계약 관리 상수 (클라이언트/서버 공용)

/** 신분증 파일 저장 버킷(비공개, 10MB 제한) — 마이그레이션 119 */
export const CONTRACT_DOCS_BUCKET = "influencer-contract-docs";

/** 현재 시즌 키. 내년 시즌 전환 시 여기만 바꾸면 된다(테이블에 season 컬럼 준비됨). */
export const CONTRACTS_SEASON = "2026-tma";

/** 시딩 스케줄에 자동 생성되는 캠페인 이름 */
export const TMA_CAMPAIGN_NAME = "2026 TMA 트리 협업";

/** 게시 유지 기간(개월) — 실제 게시일 기준 */
export const POST_RETENTION_MONTHS = 6;

/** 날짜 임박 기준(일) — 실무 날짜(발송/초안/게시 예정) */
export const URGENT_SOON_DAYS = 3;

/** 만료 임박 기준(일) — 권리 기간(2차 활용 종료/게시 유지 종료) */
export const EXPIRY_SOON_DAYS = 7;
