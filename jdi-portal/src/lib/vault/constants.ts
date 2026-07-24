// 보관함 도메인 상수

/** 서류 파일 저장 버킷(비공개) */
export const VAULT_BUCKET = "vault-documents";

/** 2차 비밀번호 잠금 해제 쿠키명 */
export const VAULT_UNLOCK_COOKIE = "vault_unlock";

/** 잠금 유지 시간(초) — 20분 */
export const VAULT_UNLOCK_TTL_SEC = 20 * 60;

/** 보관함 모달 공용 입력/라벨 클래스 (모달 4종에서 공유) */
export const MODAL_INPUT_CLS =
  "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
export const MODAL_LABEL_CLS = "text-sm font-bold text-slate-700 ml-1 block mb-1.5";

/** 서류 종류(카테고리) 추천값 — 자유 입력도 허용 */
export const DOCUMENT_CATEGORY_SUGGESTIONS = [
  "사업자등록증",
  "통장사본",
  "법인인감증명서",
  "법인등기부등본",
  "통신판매업신고증",
  "임대차계약서",
  "재무제표",
  "기타",
] as const;
