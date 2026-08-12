// TMA 계약 관리 라벨/순서/옵션 — 배지·필터·드롭다운이 같은 소스를 공유한다 (labels.ts 3종 세트 관례)

import type {
  CollabType,
  ContractProduct,
  ContractStatus,
  RawFootage,
  RequiredFilesStatus,
  SecondaryUsage,
  SettlementType,
} from "./types";

// ============================================================
// 계약 상태 (10단계)
// ============================================================
export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  candidate: "후보",
  dm_sent: "제안 DM",
  negotiating: "조건 협의",
  contract_sent: "계약 발송",
  signed: "서명 완료",
  product_shipped: "제품 발송",
  draft_received: "초안 수령",
  posted: "게시 완료",
  settled: "정산 완료",
  canceled: "취소",
};

/** 진행 순서. index 를 "단계 진행도"로 재사용한다(날짜 강조 억제 판정 등). canceled 는 맨 뒤. */
export const CONTRACT_STATUS_ORDER: ContractStatus[] = [
  "candidate",
  "dm_sent",
  "negotiating",
  "contract_sent",
  "signed",
  "product_shipped",
  "draft_received",
  "posted",
  "settled",
  "canceled",
];

export const CONTRACT_STATUS_OPTIONS: { value: ContractStatus; label: string }[] =
  CONTRACT_STATUS_ORDER.map((value) => ({ value, label: CONTRACT_STATUS_LABEL[value] }));

/** 상태 배지 색 — 준비(회색→파랑 심화) → 실행(청록→초록 완결감) → 취소(rose). Tailwind 리터럴만 사용. */
export const CONTRACT_STATUS_BADGE_CLASSES: Record<ContractStatus, string> = {
  candidate: "bg-slate-100 text-slate-600",
  dm_sent: "bg-sky-50 text-sky-700",
  negotiating: "bg-blue-50 text-blue-700",
  contract_sent: "bg-indigo-50 text-indigo-700",
  signed: "bg-violet-50 text-violet-700",
  product_shipped: "bg-teal-50 text-teal-700",
  draft_received: "bg-emerald-50 text-emerald-700",
  posted: "bg-green-50 text-green-700",
  settled: "bg-emerald-100 text-emerald-800",
  canceled: "bg-rose-50 text-rose-600",
};

/** 상태 점 색(Select dotClass 용) */
export const CONTRACT_STATUS_DOT_CLASSES: Record<ContractStatus, string> = {
  candidate: "bg-slate-400",
  dm_sent: "bg-sky-500",
  negotiating: "bg-blue-500",
  contract_sent: "bg-indigo-500",
  signed: "bg-violet-500",
  product_shipped: "bg-teal-500",
  draft_received: "bg-emerald-500",
  posted: "bg-green-500",
  settled: "bg-emerald-700",
  canceled: "bg-rose-500",
};

// ============================================================
// 협업 유형 / 제품 / 정산 구분
// ============================================================
export const COLLAB_TYPE_LABEL: Record<CollabType, string> = {
  paid: "광고비형",
  seeding: "순수협찬형",
};
export const COLLAB_TYPE_ORDER: CollabType[] = ["seeding", "paid"];
export const COLLAB_TYPE_OPTIONS: { value: CollabType; label: string }[] =
  COLLAB_TYPE_ORDER.map((value) => ({ value, label: COLLAB_TYPE_LABEL[value] }));

export const PRODUCT_LABEL: Record<ContractProduct, string> = {
  tree_150: "150cm 트리",
  tree_180: "180cm 트리",
};
export const PRODUCT_ORDER: ContractProduct[] = ["tree_150", "tree_180"];
export const PRODUCT_OPTIONS: { value: ContractProduct; label: string }[] =
  PRODUCT_ORDER.map((value) => ({ value, label: PRODUCT_LABEL[value] }));

export const SETTLEMENT_TYPE_LABEL: Record<SettlementType, string> = {
  business: "사업자",
  individual: "개인",
};
export const SETTLEMENT_TYPE_ORDER: SettlementType[] = ["business", "individual"];
export const SETTLEMENT_TYPE_OPTIONS: { value: SettlementType; label: string }[] =
  SETTLEMENT_TYPE_ORDER.map((value) => ({ value, label: SETTLEMENT_TYPE_LABEL[value] }));

// ============================================================
// 2차 활용 / 촬영 원본 / 필수 파일
// ============================================================
export const SECONDARY_USAGE_LABEL: Record<SecondaryUsage, string> = {
  free: "무상 허용",
  paid: "추가비용",
  not_allowed: "허용 안 함",
};
export const SECONDARY_USAGE_ORDER: SecondaryUsage[] = ["not_allowed", "free", "paid"];
export const SECONDARY_USAGE_OPTIONS: { value: SecondaryUsage; label: string }[] =
  SECONDARY_USAGE_ORDER.map((value) => ({ value, label: SECONDARY_USAGE_LABEL[value] }));

export const RAW_FOOTAGE_LABEL: Record<RawFootage, string> = {
  free: "무상 제공",
  paid: "추가비용",
  not_provided: "제공 안 함",
};
export const RAW_FOOTAGE_ORDER: RawFootage[] = ["not_provided", "free", "paid"];
export const RAW_FOOTAGE_OPTIONS: { value: RawFootage; label: string }[] =
  RAW_FOOTAGE_ORDER.map((value) => ({ value, label: RAW_FOOTAGE_LABEL[value] }));

export const REQUIRED_FILES_LABEL: Record<RequiredFilesStatus, string> = {
  none: "전달 전",
  partial: "일부 전달",
  complete: "전달 완료",
};
export const REQUIRED_FILES_ORDER: RequiredFilesStatus[] = ["none", "partial", "complete"];
export const REQUIRED_FILES_OPTIONS: { value: RequiredFilesStatus; label: string }[] =
  REQUIRED_FILES_ORDER.map((value) => ({ value, label: REQUIRED_FILES_LABEL[value] }));
