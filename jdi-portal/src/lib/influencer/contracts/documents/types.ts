// 계약서 문서/양식 타입 (테이블: influencer_contract_templates, influencer_contract_documents — 마이그레이션 122)
//
// - TemplateContent: 계약 유형별 "양식" (조항 본문). 운영자가 자유 편집.
// - DocContent: 계약 1건에서 생성된 "계약서 1부"의 본문 스냅샷 (양식 + 조건표 값 + 회사 정보).
//   생성 후에는 원본 계약을 고쳐도 바뀌지 않는다 — 보낸 문서의 무결성이 우선.

export type TemplateKey = "paid" | "seeding";

/** 조항 하나. body 가 TERMS_MARKER 면 그 자리에 개별 조건표(표)가 렌더링된다. */
export interface ContractClause {
  heading: string;
  body: string;
}

/** 개별 조건표(제2조) 한 줄 — value 는 자유 문자열이라 건별로 마음대로 고칠 수 있다. */
export interface TermRow {
  section: string;
  label: string;
  value: string;
}

/** 갑(회사) 서명란 정보 — 담당자만 건별로 채우고 나머지는 고정 기본값 */
export interface CompanyBlock {
  name: string;
  ceo: string;
  address: string;
  manager: string;
  managerContact: string;
}

/** 계약 유형별 양식 (DB influencer_contract_templates.content) */
export interface TemplateContent {
  title: string;
  subtitle: string;
  intro: string;
  clauses: ContractClause[];
  importantNote: string;
  closing: string;
  footnote: string;
}

/** 계약서 1부의 본문 스냅샷 (DB influencer_contract_documents.content) */
export interface DocContent extends TemplateContent {
  headerMeta: {
    partyB: string; // 을 성명/채널명
    contractTypeLabel: string; // "광고비 지급형" / "순수 협찬형"
    campaign: string;
  };
  terms: TermRow[];
  company: CompanyBlock;
}

export type DocStatus = "draft" | "sent" | "signed" | "canceled";

export interface ContractDocument {
  id: string;
  contract_id: string;
  template_key: TemplateKey;
  content: DocContent;
  status: DocStatus;
  sign_token: string | null;
  token_expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signed_pdf_path: string | null;
  pdf_sha256: string | null;
  created_at: string;
  updated_at: string;
}

/** 서명 페이지에서 인플루언서가 입력하는 값 (전부 최종 PDF 서명란에 들어간다) */
export interface SignerInput {
  name: string; // 성명(실명) — 필수
  channel: string; // 채널명/계정
  address: string; // 주소 — 필수(제품 수령)
  phone: string; // 연락처 — 필수
  email: string;
  businessRegNo: string; // 정산 구분이 사업자일 때
  bankName: string; // 은행 — 필수
  bankAccount: string; // 계좌번호 — 필수
  accountHolder: string; // 예금주 — 필수
}

/** 공개 서명 페이지가 받는 문서 정보(토큰으로 조회) */
export interface SignPageData {
  status: DocStatus;
  content: DocContent;
  /** 계약의 정산 구분 — 사업자면 사업자등록번호 입력란을 보여준다 */
  settlementType: "business" | "individual" | null;
  signedAt: string | null;
  expired: boolean;
}
