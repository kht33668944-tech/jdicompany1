// 계약관리 공용 상수 — 클라이언트에서도 안전(비밀 없음)

import type { CompanyBlockV2, ContentV2 } from "./types";

/** 서명 이미지·완료 PDF 저장 버킷(비공개, 10MB) — 마이그레이션 123 */
export const COMPANY_CONTRACT_DOCS_BUCKET = "company-contract-docs";

/** 조항 본문이 이 마커면 그 자리에 개별 조건표(표)가 렌더링된다 — TMA 와 동일 값 */
export const TERMS_MARKER = "{{TERMS}}";

/**
 * 체크박스 칸의 "체크함" 값. 체크 안 하면 빈 문자열이다.
 * 값 모델을 문자열로 유지하기 위한 약속 — 화면·서버·PDF 가 모두 이 상수를 본다.
 */
export const CHECKBOX_ON = "예";

/**
 * PDF 안에서 체크박스를 그리는 글자.
 * ⚠️ ☑(U+2611)·☐(U+2610)는 **Pretendard 에 없다**(fontkit 으로 확인). 쓰면 빈칸으로 찍힌다.
 *    ✓(U+2713)는 있어서 대괄호와 함께 쓴다.
 */
export const PDF_CHECK_ON = "[✓]";
export const PDF_CHECK_OFF = "[  ]";

/** 드롭다운 보기 제한 */
export const MAX_SELECT_OPTIONS = 20;
export const MAX_SELECT_OPTION_LEN = 50;

export const SIGN_TOKEN_DAYS = 7;
export const COPY_DOWNLOAD_DAYS = 30;

export const COMPANY_CONTRACTS_PATH = "/dashboard/contracts";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 갑(회사) 기본 정보 — 사업자등록증 기준. 담당자는 계약서별로 채운다. */
export const DEFAULT_COMPANY_BLOCK: CompanyBlockV2 = {
  name: "주식회사 제이디아이컴퍼니",
  ceo: "이지호",
  address:
    "서울특별시 성동구 성수일로8길 5, 에이동 18층 1802호 (성수동2가, 서울숲 SK V1 TOWER)",
  manager: "",
  managerContact: "",
};

/** 빈 문서에서 시작할 때의 초기 본문 */
export function createEmptyContent(): ContentV2 {
  return {
    version: 2,
    title: "",
    intro: "",
    clauses: [{ heading: "제1조 (목적)", body: "" }],
    fields: [],
    company: { ...DEFAULT_COMPANY_BLOCK },
    closing:
      "본 계약의 성립을 증명하기 위해 계약서를 전자문서로 작성하고, 갑과 을이 전자서명하여 각자 보관한다.",
    footnote: "",
  };
}
