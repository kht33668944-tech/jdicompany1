// 붙여넣기 → 조항 자동 분리 — 순수 함수.
// 워드·한글·기존 계약서에서 전체 복사해 붙여넣으면 "제N조" 제목 줄을 기준으로
// 조항을 나눈다. 제목 앞의 텍스트는 서문(intro)이 된다.

export interface ParsedPaste {
  intro: string;
  clauses: { heading: string; body: string }[];
}

/** 줄 단위(trim 후) 매칭 — "제1조", "제 1 조 (목적)" 등 공백 변형 허용 */
export const CLAUSE_HEADING_RE = /^제\s*\d+\s*조/;

export function parseContractText(raw: string): ParsedPaste {
  const trimmed = raw.trim();
  if (!trimmed) return { intro: "", clauses: [] };

  const lines = raw.split(/\r?\n/);
  const clauses: { heading: string; body: string }[] = [];
  const introLines: string[] = [];
  let current: { heading: string; bodyLines: string[] } | null = null;

  for (const line of lines) {
    const text = line.trim();
    if (CLAUSE_HEADING_RE.test(text)) {
      if (current) {
        clauses.push({ heading: current.heading, body: current.bodyLines.join("\n").trim() });
      }
      current = { heading: text, bodyLines: [] };
    } else if (current) {
      current.bodyLines.push(text);
    } else {
      introLines.push(text);
    }
  }
  if (current) {
    clauses.push({ heading: current.heading, body: current.bodyLines.join("\n").trim() });
  }

  // 제목 줄이 하나도 없으면 전체를 조항 1개로 (직접 나누도록)
  if (clauses.length === 0) {
    return { intro: "", clauses: [{ heading: "", body: trimmed }] };
  }
  return { intro: introLines.join("\n").trim(), clauses };
}
