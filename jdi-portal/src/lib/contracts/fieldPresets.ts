// 자주 쓰는 채움 칸 프리셋 — 편집기에서 원클릭으로 넣는다.
// 계약서마다 매번 같은 칸(주소·연락처·계좌 등)을 손으로 만드는 수고를 없앤다.

import type { FieldKind, FieldType } from "./types";

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
  { label: "계좌번호", type: "account", kind: "party", icon: "🏦" },
  { label: "예금주", type: "text", kind: "party", icon: "👤" },
  { label: "사업자등록번호", type: "text", kind: "party", icon: "🏢" },
];

/** 직원이 계약서를 만들 때 채우는 칸 (파란 칸) */
export const STAFF_PRESETS: FieldPreset[] = [
  { label: "계약금액(원)", type: "number", kind: "staff", icon: "💰" },
  { label: "계약 시작일", type: "date", kind: "staff", icon: "📅" },
  { label: "계약 종료일", type: "date", kind: "staff", icon: "📅" },
  { label: "업무 범위", type: "multiline", kind: "staff", icon: "📋" },
  { label: "지급 조건", type: "text", kind: "staff", icon: "💳" },
];
