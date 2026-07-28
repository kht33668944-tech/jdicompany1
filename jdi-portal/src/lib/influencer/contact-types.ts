// 인플루언서 시딩 실무용 타입 — 연락처 / 서류 / 협의 이력
// 서버 액션 파일("use server")에는 타입을 둘 수 없으므로 분리한다.

/** 배송 + 정산 연락처. 인플루언서 1명당 1행. */
export interface InfluencerContact {
  id: string;
  influencer_id: string;
  recipient_name: string | null;
  phone: string | null;
  postcode: string | null;
  address1: string | null;
  address2: string | null;
  email: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InfluencerContactInput = Omit<
  InfluencerContact,
  "id" | "influencer_id" | "created_by" | "created_at" | "updated_at"
>;

export const EMPTY_CONTACT_INPUT: InfluencerContactInput = {
  recipient_name: null,
  phone: null,
  postcode: null,
  address1: null,
  address2: null,
  email: null,
  bank_name: null,
  account_number: null,
  account_holder: null,
  note: null,
};

/** 서류 종류. id_card·bankbook 은 DB 트리거가 is_sensitive 를 강제한다. */
export type DocumentKind = "contract" | "id_card" | "bankbook" | "etc";

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  contract: "계약서",
  id_card: "신분증 사본",
  bankbook: "통장 사본",
  etc: "기타",
};

/** 잠금이 필요한 종류 — 화면 안내용. 실제 강제는 DB 트리거 + Storage 정책. */
export const SENSITIVE_KINDS: DocumentKind[] = ["id_card", "bankbook"];

export interface InfluencerDocumentVersion {
  id: string;
  document_id: string;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  version_no: number;
  is_current: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface InfluencerDocument {
  id: string;
  influencer_id: string;
  kind: DocumentKind;
  title: string;
  note: string | null;
  is_sensitive: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InfluencerDocumentWithVersions extends InfluencerDocument {
  versions: InfluencerDocumentVersion[];
}

/** 협의 이력. note 는 사람이 쓴 기록, status_change 는 트리거가 남긴 기록. */
export interface InfluencerCampaignEvent {
  id: string;
  campaign_id: string;
  kind: "note" | "status_change";
  body: string | null;
  from_status: string | null;
  to_status: string | null;
  created_by: string | null;
  created_at: string;
}

export type PayoutStatus = "none" | "pending" | "paid";
