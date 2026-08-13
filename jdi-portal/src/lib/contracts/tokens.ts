// 본문 표기 처리 — 순수 함수만. React 렌더러(ContractDocViewV2)와
// PDF 렌더러(pdf.ts), 그리고 문서형 편집기(richdoc.ts)가 같은 분해 결과를 쓰도록 한 곳에 둔다.
//
// 본문에 들어가는 표기는 두 가지뿐이다.
//   {{fN}}     — 채움 칸(필드) 자리
//   **굵게**    — 굵은 글씨 (편집기 툴바의 "굵게" 버튼이 넣는다)
// 이 둘만 쓰는 이유: 본문을 평범한 문자열로 저장해야 PDF·HTML·편집기 세 곳이
// 같은 데이터를 공유하고, 기존에 저장된 계약서와도 호환되기 때문이다.

import type { ContentV2 } from "./types";

export const FIELD_TOKEN_RE = /\{\{(f\d+)\}\}/g;
export const BOLD_TOKEN_RE = /\*\*([^*]+)\*\*/g;

export type TokenRun =
  | { type: "text"; text: string; bold?: boolean }
  | { type: "field"; key: string };

/** 굵게 표기만 분해 (필드 토큰이 없는 조각에 적용) */
function splitBold(text: string): TokenRun[] {
  const runs: TokenRun[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD_TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) runs.push({ type: "text", text: text.slice(last, idx) });
    runs.push({ type: "text", text: m[1], bold: true });
    last = idx + m[0].length;
  }
  if (last < text.length) runs.push({ type: "text", text: text.slice(last) });
  return runs;
}

/** 한 문단(개행 없는 문자열) → 런 배열. 표기가 없으면 text 런 하나. */
export function tokenizeParagraph(paragraph: string): TokenRun[] {
  const runs: TokenRun[] = [];
  let last = 0;
  for (const m of paragraph.matchAll(FIELD_TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) runs.push(...splitBold(paragraph.slice(last, idx)));
    runs.push({ type: "field", key: m[1] });
    last = idx + m[0].length;
  }
  if (last < paragraph.length) runs.push(...splitBold(paragraph.slice(last)));
  if (runs.length === 0) runs.push({ type: "text", text: "" });
  return runs;
}

/** 본문 전체 → 문단별 런 배열 (\n 분리, 공백 문단 제거) */
export function tokenizeBody(body: string): TokenRun[][] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(tokenizeParagraph);
}

/** 본문(서문·조항·맺음말)에 등장하는 필드 key 집합 — 삭제 차단·검증용 */
export function collectFieldKeys(content: ContentV2): Set<string> {
  const keys = new Set<string>();
  const scan = (text: string) => {
    for (const m of text.matchAll(FIELD_TOKEN_RE)) keys.add(m[1]);
  };
  scan(content.intro);
  for (const clause of content.clauses) scan(clause.body);
  scan(content.closing);
  return keys;
}

/** 본문 → 값 치환된 문단 문자열 배열. 값이 없는 키는 토큰 리터럴을 그대로 둔다. */
export function resolveParagraphs(body: string, values: Map<string, string>): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.replace(FIELD_TOKEN_RE, (token, key: string) => values.get(key) ?? token),
    );
}

/** staff 필드의 value + 상대방 입력값을 합친 치환 맵 */
export function buildValueMap(
  content: ContentV2,
  partyValues: Record<string, string> = {},
): Map<string, string> {
  const map = new Map<string, string>();
  for (const field of content.fields) {
    if (field.kind === "staff" && field.value?.trim()) map.set(field.key, field.value.trim());
  }
  for (const [key, value] of Object.entries(partyValues)) {
    if (value.trim()) map.set(key, value.trim());
  }
  return map;
}

/** 다음 필드 key 발번 — 기존 최댓값 + 1 (삭제된 번호는 재사용하지 않는다) */
export function nextFieldKey(content: ContentV2): string {
  let max = 0;
  for (const field of content.fields) {
    const m = /^f(\d+)$/.exec(field.key);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `f${max + 1}`;
}
