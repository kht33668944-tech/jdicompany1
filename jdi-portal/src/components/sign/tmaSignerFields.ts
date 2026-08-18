// TMA 서명 페이지에서 인플루언서가 채우는 칸 목록 — 순서·라벨·필수 여부의 유일한 출처.
//
// TMA 계약서 본문에는 채움 칸({{fN}})이 없다. 아래 값들은 전부 계약서 맨 끝
// 「서명 및 계약 정보」 표에 인쇄된다(lib/influencer/contracts/documents/pdf.ts 의 signatureSection).
// 그래서 화면에서도 그 표를 그려 두고, 인쇄될 자리에서 바로 채우게 한다.
//
// ⚠️ key 는 API(FormData)·SignerInput 의 이름과 **글자까지 같아야 한다.**
//    이름이 어긋나면 값이 조용히 사라진다 — scripts/contract-esign.test.mjs 가 고정한다.
//
// 계약관리(범용)의 FieldDef 모양을 그대로 쓴다. 입력창(SignFieldPrompt)이 이 모양을 받기 때문이며,
// 타입 전용 import 라 두 도메인이 런타임으로 엮이지는 않는다.

import type { FieldDef } from "@/lib/contracts/types";

/** 사업자 정산일 때만 보이는 칸 */
export const BUSINESS_ONLY_KEY = "businessRegNo";

export const TMA_SIGNER_FIELDS: FieldDef[] = [
  { key: "name", kind: "party", label: "성명(실명)", type: "text", required: true },
  { key: "channel", kind: "party", label: "채널명/계정", type: "text", required: false },
  { key: "address", kind: "party", label: "주소 (제품 수령지)", type: "text", required: true },
  { key: "phone", kind: "party", label: "연락처", type: "phone", required: true },
  { key: "email", kind: "party", label: "이메일", type: "email", required: false },
  // 화면에서는 사업자 정산일 때 필수로 다룬다(라벨에 * 가 붙어 있던 기존 표기와 맞춤).
  // 서버(documents/signService.ts)는 예전 그대로 강제하지 않는다 — 화면이 더 엄격한 쪽이라 안전하다.
  { key: BUSINESS_ONLY_KEY, kind: "party", label: "사업자등록번호", type: "text", required: true },
  { key: "bankName", kind: "party", label: "은행명", type: "bank", required: true },
  { key: "bankAccount", kind: "party", label: "계좌번호", type: "account", required: true },
  { key: "accountHolder", kind: "party", label: "예금주", type: "text", required: true },
];

/** 이 계약에서 실제로 보여줄 칸 */
export function visibleSignerFields(isBusiness: boolean): FieldDef[] {
  return isBusiness
    ? TMA_SIGNER_FIELDS
    : TMA_SIGNER_FIELDS.filter((f) => f.key !== BUSINESS_ONLY_KEY);
}
