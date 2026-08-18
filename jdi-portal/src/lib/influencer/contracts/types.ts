// TMA 계약 관리 도메인 타입 (테이블: influencer_contracts, influencer_contract_settlements — 마이그레이션 119)

export type ContractStatus =
  | "candidate"
  | "dm_sent"
  | "negotiating"
  | "contract_sent"
  | "signed"
  | "product_shipped"
  | "draft_received"
  | "posted"
  | "settled"
  | "canceled";

export type CollabType = "paid" | "seeding";
export type ContractProduct = "tree_150" | "tree_180";
export type SettlementType = "business" | "individual";
export type SecondaryUsage = "free" | "paid" | "not_allowed";
export type RawFootage = "free" | "paid" | "not_provided";
export type RequiredFilesStatus = "none" | "partial" | "complete";

/** 계약 1건 (목록/상세 공용 — created_by/season/is_deleted 는 화면에 안 쓰므로 조회하지 않음) */
export interface InfluencerContract {
  id: string;
  /** 리스트(influencers) 연결 — 자동완성으로 고르거나 인스타 계정으로 자동 매칭 (마이그 120) */
  influencer_id: string | null;
  /** 시딩 스케줄(influencer_campaigns) 연결 — 서버가 자동 생성·동기화, 폼 입력 아님 */
  campaign_id: string | null;
  /** 정산 완료 시 자동 기록된 지출(expenses) 연결 — 중복 기록 방지 (마이그 121) */
  expense_id: string | null;
  name: string;
  instagram_handle: string;
  collab_type: CollabType;
  product: ContractProduct;
  product_detail: string | null;
  retail_price: number | null;
  agreed_value: number | null;
  ad_fee_total: number | null;
  ad_fee_vat_included: boolean;
  settlement_type: SettlementType | null;
  business_reg_no: string | null;
  secondary_usage: SecondaryUsage;
  secondary_usage_fee: number | null;
  secondary_usage_start: string | null;
  secondary_usage_end: string | null;
  allow_jdi_sns: boolean;
  allow_meta_ads: boolean;
  allow_edit: boolean;
  partnership_ad_access: boolean;
  raw_footage: RawFootage;
  raw_footage_fee: number | null;
  raw_footage_scope: string | null;
  raw_footage_due: string | null;
  product_ship_date: string | null;
  draft_due_date: string | null;
  post_planned_date: string | null;
  post_actual_date: string | null;
  required_files_status: RequiredFilesStatus;
  contract_status: ContractStatus;
  modusign_url: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 리스트 탭이 쓰는 계약 요약.
 * 리스트에서도 계약 상태(10단계)를 그대로 보여주고 바로 바꾸기 위해 필요하다.
 * 금액·정산 개인정보는 담지 않는다(계약 탭에서만 다룬다).
 */
export interface ContractListSummary {
  contract_id: string;
  influencer_id: string;
  campaign_id: string | null;
  contract_status: ContractStatus;
  /** 정산 정보가 등록되어 있는가 — 리스트 아이콘 표시에만 쓴다(내용은 담지 않음) */
  has_settlement: boolean;
}

/**
 * 계약과 연결되지 않은 시딩건 — 계약 탭 상단 경고에만 쓴다.
 * 시딩 1건 = 계약 1건이 규칙이라 정상 운영에서는 항상 빈 배열이다.
 */
export interface UnlinkedSeeding {
  campaign_id: string;
  influencer_id: string;
  username: string;
  display_name: string | null;
}

/** 추가/수정 폼 입력 (서버가 채우는 필드 제외 — campaign_id/expense_id 는 서버 전용) */
export type ContractInput = Omit<
  InfluencerContract,
  "id" | "campaign_id" | "expense_id" | "created_at" | "updated_at"
>;

/** 계약 저장 결과 — 연동 상황을 화면 안내에 쓴다 */
export interface ContractSaveResult {
  id: string;
  /** 시딩 스케줄에 캠페인이 연결되어 있는가 */
  scheduled: boolean;
  /** 이번 저장에서 리스트에 새로 자동 등록됐는가 */
  addedToList: boolean;
  /** 이번 저장에서 지출관리에 자동 기록된 금액(원, 없으면 0) */
  expenseAmount: number;
}

/**
 * 정산 자료 내보내기 1행 — 잠금 해제 후 서버 액션이 복호화해 반환.
 * 신분증 임시 링크는 만료(2분)가 짧아 미리 발급하지 않고,
 * ZIP 다운로드 시점에 getIdCardUrlsForExport 로 따로 받는다.
 */
export type SettlementExportRow = ContractSettlement;

/**
 * 정산 정보 — 서버 액션이 2차 비밀번호 잠금 확인 후 복호화해서 반환하는 평문.
 * DB에는 암호문(*_enc)만 저장된다. 목록 화면에는 절대 내려보내지 않는다.
 */
export interface ContractSettlement {
  contract_id: string;
  phone: string;
  address: string;
  bank_name: string;
  bank_account: string;
  account_holder: string;
  id_card_path: string | null;
  id_card_name: string | null;
}

/** 정산 정보 입력 (신분증 파일은 업로드 후 경로/이름으로 전달) */
export type SettlementInput = Omit<ContractSettlement, "contract_id">;
