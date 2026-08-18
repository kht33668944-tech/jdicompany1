// 자주 쓰는 채움 칸 프리셋 — 편집기에서 원클릭으로 넣는다.
// 계약서마다 매번 같은 칸(주소·연락처·계좌 등)을 손으로 만드는 수고를 없앤다.

import type { FieldKind, FieldType } from "./types";

/** 칸 종류 표시 이름 — 편집기 툴바와 왼쪽 목록이 함께 쓴다(새 종류를 늘릴 때 여기만 고친다) */
export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: "짧은 글",
  multiline: "긴 글",
  number: "숫자",
  date: "날짜",
  phone: "연락처",
  email: "이메일",
  account: "계좌번호",
  bank: "은행",
  checkbox: "체크박스",
  select: "드롭다운(고르기)",
};

export interface FieldPreset {
  label: string;
  type: FieldType;
  kind: FieldKind;
  /** 목록에 보여줄 아이콘 */
  icon: string;
}

/** 상대방이 서명할 때 채우는 칸 (노란 칸) */
export const PARTY_PRESETS: FieldPreset[] = [
  { label: "주소", type: "text", kind: "party", icon: "🏠" },
  { label: "연락처", type: "phone", kind: "party", icon: "📞" },
  { label: "이메일", type: "email", kind: "party", icon: "✉️" },
  // 은행·계좌번호·예금주는 셋을 같이 받아야 실제로 입금할 수 있다.
  // (은행 칸이 없으면 서명자가 예금주 칸에 은행 이름을 적는 일이 생긴다 — 실제 발생)
  { label: "은행", type: "bank", kind: "party", icon: "🏦" },
  { label: "계좌번호", type: "account", kind: "party", icon: "💳" },
  { label: "예금주", type: "text", kind: "party", icon: "👤" },
  { label: "사업자등록번호", type: "text", kind: "party", icon: "🏢" },
  // 체크는 "동의합니다 ☑" 같은 자리에 쓴다. 보기를 고르는 칸은 보기 목록이 계약서마다
  // 달라서 프리셋으로 두지 않고, 칸을 만든 뒤 종류를 「드롭다운」으로 바꿔 쓴다.
  { label: "동의 체크", type: "checkbox", kind: "party", icon: "☑️" },
];

/** 직원이 계약서를 만들 때 채우는 칸 (파란 칸) */
export const STAFF_PRESETS: FieldPreset[] = [
  { label: "계약금액(원)", type: "number", kind: "staff", icon: "💰" },
  { label: "계약 시작일", type: "date", kind: "staff", icon: "📅" },
  { label: "계약 종료일", type: "date", kind: "staff", icon: "📅" },
  { label: "업무 범위", type: "multiline", kind: "staff", icon: "📋" },
  { label: "지급 조건", type: "text", kind: "staff", icon: "💳" },
];
