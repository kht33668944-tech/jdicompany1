// 계약관리(범용 계약서) 타입 (테이블: company_contract_templates, company_contract_documents — 마이그레이션 123)
//
// TMA 전자서명(documents/types.ts)과 병렬 구조이되, 두 가지가 다르다.
//  1) 양식이 무제한이고 조건표({{TERMS}})가 선택 사항이다.
//  2) 모두싸인식 필드: 조항 본문에 {{fN}} 토큰을 심고 fields 정의로 의미를 준다.
//     - kind "staff": 직원이 계약서 만들 때 채우는 값(value 에 저장)
//     - kind "party": 상대방이 서명할 때 입력하는 값 — value 에 절대 저장하지 않는다.
//       (평문 개인정보는 DB의 content 에 남기지 않는다 — 암호화 컬럼과 PDF에만 존재)

export type CompanyDocStatus = "draft" | "sent" | "signed" | "canceled";
export type CounterpartyKind = "individual" | "corp";
export type FieldKind = "staff" | "party";
export type FieldType =
  | "text"
  | "multiline"
  | "number"
  | "date"
  | "phone"
  | "email"
  | "account";

/** 문서 안에 배치되는 채움 칸. 조항 본문의 {{key}} 자리에 값이 인쇄된다. */
export interface FieldDef {
  key: string; // /^f\d+$/ — 에디터가 자동 발번, 문서 내 유일
  kind: FieldKind;
  label: string; // 예: "계약금액(원)", "을 주소"
  type: FieldType;
  required: boolean; // party 필드의 서명 시 필수 여부(staff 는 발송 시 전부 필수)
  value?: string; // staff 전용 — 계약서 만들 때 채운 값
}

/** 개별 조건표 한 줄 — TMA TermRow 와 동일 모양 */
export interface TermRow {
  section: string;
  label: string;
  value: string;
}

/** 갑(회사) 서명란 정보 — TMA CompanyBlock 과 동일 필드 */
export interface CompanyBlockV2 {
  name: string;
  ceo: string;
  address: string;
  manager: string;
  managerContact: string;
}

export interface ContractClauseV2 {
  heading: string; // 예: "제1조 (목적)" — 붙여넣기 분리 시 매칭된 줄
  body: string; // {{fN}} 토큰·{{TERMS}} 마커 허용
}

/** 양식/계약서 본문 (DB content jsonb) */
export interface ContentV2 {
  version: 2;
  title: string;
  intro: string; // 서문("" 허용)
  clauses: ContractClauseV2[];
  fields: FieldDef[];
  terms?: TermRow[]; // {{TERMS}} 조항이 있을 때만 사용(선택)
  company: CompanyBlockV2;
  closing: string;
  footnote: string;
}

/** 양식 행 미러 */
export interface CompanyTemplateRow {
  id: string;
  title: string;
  content: ContentV2;
  created_at: string;
  updated_at: string;
}

/** 계약서 문서 행 미러 — signer_fields_enc 는 절대 여기 싣지 않는다 */
export interface CompanyContractDocument {
  id: string;
  template_id: string | null;
  title: string;
  counterparty_name: string;
  counterparty_company: string | null;
  counterparty_kind: CounterpartyKind;
  content: ContentV2;
  status: CompanyDocStatus;
  sign_token: string | null;
  token_expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signed_pdf_path: string | null;
  pdf_sha256: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/** 서명 페이지에서 상대방이 입력한 값 — 필드 key → 값 */
export type PartyValues = Record<string, string>;

/** 공개 서명 페이지가 받는 문서 정보(토큰으로 조회) — 개인정보 없음 */
export interface CompanySignPageData {
  status: CompanyDocStatus;
  content: ContentV2;
  counterpartyKind: CounterpartyKind;
  counterpartyName: string;
  counterpartyCompany: string | null;
  signedAt: string | null;
  expired: boolean;
}

/** 보관함 계약서 탭에 표시할 서명 완료 행 */
export interface CompanyVaultRow {
  doc_id: string;
  title: string;
  counterparty_name: string;
  counterparty_company: string | null;
  signer_name: string | null;
  signed_at: string | null;
}
