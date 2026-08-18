// 문서형 편집기(TipTap) 문서 ↔ ContentV2 변환 — 순수 함수만(클라이언트 안전).
//
// 편집기는 "한 장의 문서"로 보이지만, 저장 형태는 기존 ContentV2 그대로다.
// 덕분에 PDF 렌더러·서명 페이지·이미 저장된 계약서를 하나도 건드리지 않는다.
//
// 대응 규칙
//   제목(h1)          ↔ content.title
//   첫 h2 앞의 문단    ↔ content.intro
//   조항 제목(h2)      ↔ clause.heading
//   그 아래 문단        ↔ clause.body (개행으로 이어붙임)
//   조건표 블록         ↔ body 가 "{{TERMS}}" 인 조항
//   필드 칩             ↔ 조항 제목·본문 속 "{{fN}}"
//   굵게                ↔ 본문 속 "**...**"

// 확장자를 명시하는 이유: 이 파일은 node --experimental-strip-types 로 직접 불러
// 단위 테스트(scripts/contract-content.test.mjs)를 돌린다. Node ESM 은 확장자 없는
// 상대 경로를 해석하지 못하므로 런타임 값 import 에는 .ts 를 붙인다.
import { TERMS_MARKER } from "./constants.ts";
import { tokenizeParagraph } from "./tokens.ts";
import type { ContentV2, ContractClauseV2 } from "./types";

/** TipTap JSON 최소 형태 — 라이브러리 타입을 끌어오지 않아 서버에서도 안전하다 */
export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  marks?: { type: string }[];
  text?: string;
}
export interface RichDoc {
  type: "doc";
  content: RichNode[];
}

export const FIELD_CHIP_NODE = "fieldChip";
export const TERMS_BLOCK_NODE = "termsBlock";

// ============================================================
// ContentV2 → 편집기 문서
// ============================================================

/** 한 문단 문자열 → 인라인 노드 배열 (필드 칩·굵게 복원) */
function paragraphToNodes(line: string): RichNode[] {
  const nodes: RichNode[] = [];
  for (const run of tokenizeParagraph(line)) {
    if (run.type === "field") {
      nodes.push({ type: FIELD_CHIP_NODE, attrs: { fieldKey: run.key } });
    } else if (run.text) {
      nodes.push({
        type: "text",
        text: run.text,
        ...(run.bold ? { marks: [{ type: "bold" }] } : {}),
      });
    }
  }
  return nodes;
}

/** 여러 줄 본문 → 문단 노드 배열 (빈 줄은 버린다) */
function bodyToParagraphs(body: string): RichNode[] {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [{ type: "paragraph" }];
  return lines.map((line) => {
    const content = paragraphToNodes(line);
    return content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" };
  });
}

export function contentToDoc(content: ContentV2): RichDoc {
  const nodes: RichNode[] = [
    {
      type: "heading",
      attrs: { level: 1 },
      content: content.title.trim()
        ? [{ type: "text", text: content.title }]
        : undefined,
    },
  ];

  if (content.intro.trim()) nodes.push(...bodyToParagraphs(content.intro));

  for (const clause of content.clauses) {
    if (clause.heading.trim()) {
      nodes.push({
        type: "heading",
        attrs: { level: 2 },
        // 제목에도 채움 칸을 넣을 수 있다 — 본문과 같은 방식으로 칩을 복원한다
        content: paragraphToNodes(clause.heading),
      });
    }
    if (clause.body.trim() === TERMS_MARKER) {
      nodes.push({ type: TERMS_BLOCK_NODE });
    } else {
      nodes.push(...bodyToParagraphs(clause.body));
    }
  }

  // 편집기는 최소 한 블록이 필요하다
  if (nodes.length === 1) nodes.push({ type: "paragraph" });
  return { type: "doc", content: nodes };
}

// ============================================================
// 편집기 문서 → ContentV2
// ============================================================

/** 인라인 노드 배열 → 한 줄 문자열 (필드 칩·굵게를 표기로 되돌린다) */
function nodesToLine(nodes: RichNode[] | undefined): string {
  if (!nodes) return "";
  let out = "";
  let boldBuffer = "";
  const flushBold = () => {
    if (boldBuffer) {
      out += `**${boldBuffer}**`;
      boldBuffer = "";
    }
  };

  for (const node of nodes) {
    if (node.type === FIELD_CHIP_NODE) {
      flushBold();
      const key = node.attrs?.fieldKey;
      if (typeof key === "string") out += `{{${key}}}`;
      continue;
    }
    if (node.type !== "text" || !node.text) continue;
    // 표기 문자가 본문에 섞이면 파싱이 깨지므로 제거한다
    const text = node.text.replace(/\*\*/g, "");
    if (node.marks?.some((m) => m.type === "bold")) {
      boldBuffer += text; // 연속된 굵은 조각은 하나로 합친다
    } else {
      flushBold();
      out += text;
    }
  }
  flushBold();
  return out;
}

/** 목록 항목까지 펼쳐 문단 줄 목록으로 (편집기가 목록을 만들 수 있는 경우 대비) */
function blockToLines(node: RichNode): string[] {
  if (node.type === "paragraph") {
    const line = nodesToLine(node.content).trim();
    return line ? [line] : [];
  }
  if (node.content) return node.content.flatMap(blockToLines);
  return [];
}

export function docToContent(doc: RichDoc, base: ContentV2): ContentV2 {
  let title = "";
  const introLines: string[] = [];
  const clauses: ContractClauseV2[] = [];
  // 아직 닫히지 않은 조항 — 조항 제목(h2)을 만나거나 문서가 끝날 때 확정한다
  let openHeading: string | null = null;
  let openLines: string[] = [];

  const closeOpen = () => {
    if (openHeading === null && openLines.length === 0) return;
    clauses.push({ heading: openHeading ?? "", body: openLines.join("\n") });
    openHeading = null;
    openLines = [];
  };

  for (const node of doc.content ?? []) {
    if (node.type === "heading" && node.attrs?.level === 1) {
      if (!title) title = nodesToLine(node.content).trim();
      continue;
    }
    if (node.type === "heading") {
      closeOpen();
      openHeading = nodesToLine(node.content).trim();
      continue;
    }
    if (node.type === TERMS_BLOCK_NODE) {
      // 조건표는 조항 하나를 통째로 차지한다(본문이 "{{TERMS}}" 인 조항).
      // 앞에 글이 있었다면 그 글을 먼저 별도 조항으로 확정한 뒤 표 조항을 붙인다.
      if (openLines.length > 0) {
        closeOpen();
        clauses.push({ heading: "", body: TERMS_MARKER });
      } else {
        clauses.push({ heading: openHeading ?? "", body: TERMS_MARKER });
        openHeading = null;
      }
      continue;
    }

    const lines = blockToLines(node);
    if (lines.length === 0) continue;
    if (openHeading !== null || openLines.length > 0 || clauses.length > 0) openLines.push(...lines);
    else introLines.push(...lines);
  }
  closeOpen();

  // 조항이 하나도 없으면 서문을 조항 하나로 옮긴다(검증이 조항 1개 이상을 요구)
  let intro = introLines.join("\n");
  let finalClauses = clauses.filter((c) => c.heading.trim() || c.body.trim());
  if (finalClauses.length === 0) {
    finalClauses = [{ heading: "", body: intro }];
    intro = "";
  }

  return { ...base, title, intro, clauses: finalClauses };
}

/** 편집기가 조건표 블록을 갖고 있는지 */
export function docHasTermsBlock(doc: RichDoc): boolean {
  return (doc.content ?? []).some((n) => n.type === TERMS_BLOCK_NODE);
}

// ============================================================
// 조항 번호 다시 매기기
// ============================================================

/** "제12조 (목적)" 처럼 시작하는 조항 제목인지 */
export const CLAUSE_NO_RE = /^제\s*\d+\s*조/;

/**
 * 이미 "제N조"로 시작하는 제목만 순서대로 다시 번호를 매긴다.
 * (번호가 없는 제목은 사용자가 일부러 그렇게 쓴 것으로 보고 건드리지 않는다.)
 */
export function renumberHeading(heading: string, order: number): string {
  const text = heading.trim();
  if (!CLAUSE_NO_RE.test(text)) return heading;
  return text.replace(CLAUSE_NO_RE, `제${order}조`);
}
