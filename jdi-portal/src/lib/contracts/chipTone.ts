// 서명 화면에서 "채워야 할 칸"의 색 규칙 — 한 곳에서만 정한다.
// 계약관리 본문(ContractDocViewV2)과 TMA 서명 정보 표(TmaSignerBlock)가 같은 규칙을 쓴다.
//
//   노란 칸 = 아직 안 채움 (필수면 테두리를 두껍게)
//   흰 칸   = 채움 — 값이 그 자리에 박히고, 다시 눌러 고칠 수 있다
//   파란 칸 = 지금 입력 중
//
// 규칙이 두 화면에서 갈리면 서명자가 "같은 노란색인데 왜 다르지?" 하고 헷갈린다.

export function fieldChipTone(o: { active: boolean; filled: boolean; required: boolean }): string {
  if (o.active) return "border-solid border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200";
  if (o.filled) {
    return "border-solid border-slate-200 bg-white font-bold text-slate-800 hover:border-blue-300";
  }
  return `border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 ${
    o.required ? "border-2" : ""
  }`;
}
