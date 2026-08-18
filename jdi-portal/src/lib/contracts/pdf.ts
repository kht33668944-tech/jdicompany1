// 계약관리(범용) 서명 완료 PDF 렌더링 — 서버 전용(pdfmake + Pretendard OTF).
//
// ⚠️ 클라이언트 번들에 절대 포함하지 않는다. signService(→ /api/sign/c 라우트)에서만 import 한다.
// TMA(documents/pdf.ts)의 구조를 그대로 복제했다 — 공용 추출을 하지 않는 것은 의도다:
// 이미 서명된 법적 문서의 렌더러(TMA)가 이후 계약관리 스타일 변경에 끌려가지 않게 격리한다.
// 다른 점: 조항 문단이 {{fN}} 토큰을 인지해 채움 칸 값을 본문 해당 위치에 인쇄한다.

import path from "node:path";
import pdfmakeModule from "pdfmake";
import type { Content, TDocumentDefinitions, TableCell, TFontDictionary } from "pdfmake/interfaces";

// @types/pdfmake 는 브라우저 API 만 선언한다. Node(main: src/printer.js)는
// "폰트 사전을 받는 PdfPrinter 클래스"가 기본 export 라 여기서 직접 타입을 입힌다.
interface PdfKitDocLike {
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  end(): void;
}
const PdfPrinter = pdfmakeModule as unknown as new (fonts: TFontDictionary) => {
  createPdfKitDocument(dd: TDocumentDefinitions): PdfKitDocLike;
};
import { PDF_CHECK_OFF, PDF_CHECK_ON, TERMS_MARKER } from "./constants";
import { buildValueMap, tokenizeBody, tokenizeParagraph, type TokenRun } from "./tokens";
import type { ContentV2, CounterpartyKind, FieldDef, TermRow } from "./types";

export interface CompanySignedPdfInput {
  content: ContentV2;
  /** 상대방 입력값(필드 key → 값) — 본문 토큰 자리와 서명란 요약에 인쇄된다 */
  partyValues: Record<string, string>;
  counterpartyName: string;
  counterpartyCompany: string | null;
  counterpartyKind: CounterpartyKind;
  /** 법인일 때만 (개인은 "") */
  businessRegNo: string;
  signerName: string;
  /** 서명 이미지 dataURL — 손서명 PNG 또는 업로드된 법인 도장(PNG/JPEG). 미리보기면 null */
  signatureDataUrl: string | null;
  /** true 면 업로드된 도장 이미지(정방형으로 작게 인쇄) */
  signatureIsStamp: boolean;
  /** 갑(회사) 도장 PNG (dataURL, 없으면 생략) */
  stampDataUrl: string | null;
  /** KST 표기 문자열들 */
  signedAtKst: string;
  sentAtKst: string;
  viewedAtKst: string;
  docId: string;
  /** 본문+서명자 입력의 SHA-256 (문서 지문 — 확인서 페이지에 인쇄) */
  contentSha256: string;
  ip: string;
  userAgent: string;
  /**
   * 발송 전 미리보기 — 직원이 "보내기 전에 진짜 PDF 모양"을 확인하는 용도.
   * 모든 쪽에 워터마크를 깔고, 서명란은 비우고, **전자서명 확인서를 붙이지 않는다.**
   * 확인서는 체결 사실을 증명하는 법적 기록이라 서명 전에 만들어 두면 안 된다.
   */
  preview?: boolean;
}

const INK = "#1e293b";
const MUTED = "#64748b";
const LINE = "#cbd5e1";
const HEAD_FILL = "#f1f5f9";

/**
 * 채움 칸 값을 종이에 찍을 글자로.
 * 체크박스만 모양이 다르다 — 값이 있으면 [✓], 없으면 빈 네모.
 * (☑ 글자는 Pretendard 에 없어서 못 쓴다 — constants.ts 주석 참고)
 */
function fieldText(def: FieldDef | undefined, value: string, blank: string): string {
  if (def?.type === "checkbox") return value.trim() ? PDF_CHECK_ON : PDF_CHECK_OFF;
  return value.trim() || blank;
}

/**
 * 한 줄(런 배열) → pdfmake 조각들.
 * {{fN}} 자리에는 채움 칸 값을, **굵게** 표기에는 굵은 글씨를 적용한다.
 * 조항 제목 줄과 본문 문단이 함께 쓴다.
 */
function runsToText(
  runs: TokenRun[],
  values: Map<string, string>,
  fields: Map<string, FieldDef>,
): Content[] {
  return runs.map((run) =>
    run.type === "text"
      ? { text: run.text, ...(run.bold ? { bold: true } : {}) }
      : {
          text: fieldText(fields.get(run.key), values.get(run.key) ?? "", "＿＿＿"),
          bold: true,
        },
  );
}

/** 조항 body → 문단 목록 */
function clauseParagraphs(
  body: string,
  values: Map<string, string>,
  fields: Map<string, FieldDef>,
): Content[] {
  return tokenizeBody(body).map((runs) => ({
    text: runsToText(runs, values, fields),
    margin: [0, 2, 0, 2] as [number, number, number, number],
  }));
}

/** 개별 조건표 — 같은 항목(section)은 첫 행에만 표기 */
function termsTable(terms: TermRow[]): Content {
  const body: TableCell[][] = [
    [
      { text: "항목", style: "th" },
      { text: "입력 항목", style: "th" },
      { text: "합의 내용", style: "th" },
    ],
  ];
  let prevSection = "";
  for (const row of terms) {
    body.push([
      { text: row.section === prevSection ? "" : row.section, style: "tdSection" },
      { text: row.label, style: "tdLabel" },
      { text: row.value.trim() || "—", style: "td" },
    ]);
    prevSection = row.section;
  }
  return {
    table: { headerRows: 1, widths: [72, 110, "*"], body },
    layout: {
      hLineColor: () => LINE,
      vLineColor: () => LINE,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 7,
      paddingRight: () => 7,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? HEAD_FILL : null),
    },
    margin: [0, 6, 0, 6],
  };
}

/** 서명란의 "이름: 값" 한 줄 */
function field(label: string, value: string): Content {
  return {
    text: [
      { text: `${label}: `, color: MUTED },
      { text: value.trim() || "—", color: INK },
    ],
    margin: [0, 2.5, 0, 2.5],
  };
}

function signatureSection(input: CompanySignedPdfInput): Content {
  const { content } = input;
  const c = content.company;
  const isCorp = input.counterpartyKind === "corp";

  const companyCell: Content[] = [
    field("상호", c.name),
    field("대표자", c.ceo),
    field("주소", c.address),
    field("담당자", c.manager),
    field("연락처/이메일", c.managerContact),
    field("서명일", input.signedAtKst),
    {
      columns: [
        { text: "서명 또는 인:", color: MUTED, width: "auto", margin: [0, 14, 8, 0] },
        input.stampDataUrl
          ? { image: input.stampDataUrl, width: 52, height: 52 }
          : { text: "(인)", color: MUTED, margin: [0, 14, 0, 0] },
      ],
      margin: [0, 4, 0, 0],
    },
  ];

  // 상대방이 입력한 모든 채움 칸을 요약해 남긴다 — 본문 배치를 잊어도 입력값이 PDF에 남는다
  const partyFieldRows: Content[] = content.fields
    .filter((f) => f.kind === "party")
    .map((f) => field(f.label, fieldText(f, input.partyValues[f.key] ?? "", "")));

  const signerCell: Content[] = [
    ...(isCorp ? [field("법인명", input.counterpartyCompany ?? input.counterpartyName)] : []),
    field(isCorp ? "대표자/서명자" : "성명", input.signerName),
    ...(isCorp ? [field("사업자등록번호", input.businessRegNo)] : []),
    ...partyFieldRows,
    field("서명일", input.signedAtKst),
    {
      columns: [
        { text: "서명 또는 인:", color: MUTED, width: "auto", margin: [0, 14, 8, 0] },
        // 미리보기에는 서명 이미지가 아직 없다 — 자리만 비워 둔다
        input.signatureDataUrl === null
          ? { text: "(서명 전)", color: MUTED, margin: [0, 14, 0, 0] }
          : input.signatureIsStamp
            ? { image: input.signatureDataUrl, width: 52, height: 52 }
            : { image: input.signatureDataUrl, width: 110, height: 44 },
      ],
      margin: [0, 4, 0, 0],
    },
  ];

  const partyBTitle = isCorp
    ? `을 · ${input.counterpartyCompany ?? input.counterpartyName}`
    : `을 · ${input.counterpartyName}`;

  return {
    table: {
      widths: ["*", "*"],
      body: [
        [
          { text: `갑 · ${c.name}`, style: "th", alignment: "center" },
          { text: partyBTitle, style: "th", alignment: "center" },
        ],
        [
          { stack: companyCell, margin: [4, 6, 4, 6] },
          { stack: signerCell, margin: [4, 6, 4, 6] },
        ],
      ],
    },
    layout: {
      hLineColor: () => LINE,
      vLineColor: () => LINE,
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      fillColor: (rowIndex: number) => (rowIndex === 0 ? HEAD_FILL : null),
    },
    margin: [0, 8, 0, 0],
  };
}

/** 전자서명 확인서(감사 기록) — 마지막 페이지 */
function auditSection(input: CompanySignedPdfInput): Content[] {
  const rows: [string, string][] = [
    ["문서 번호", input.docId],
    ["문서 지문(SHA-256)", input.contentSha256],
    ["서명 요청(발송)", input.sentAtKst],
    ["최초 열람", input.viewedAtKst],
    ["전자서명 완료", input.signedAtKst],
    ["서명 방식", input.signatureIsStamp ? "법인 도장 이미지 업로드" : "직접 서명(그리기)"],
    ["서명자 접속 IP", input.ip],
    ["서명자 접속 기기", input.userAgent],
  ];
  return [
    { text: "전자서명 확인서", bold: true, fontSize: 14, alignment: "center", pageBreak: "before", margin: [0, 10, 0, 4] },
    {
      text: "본 확인서는 아래 문서가 JDI 포털 전자서명 시스템에서 체결되었음을 증명하기 위해 시스템이 자동 생성한 기록입니다.",
      color: MUTED,
      alignment: "center",
      margin: [0, 0, 0, 12],
    },
    {
      table: {
        widths: [130, "*"],
        body: rows.map(([k, v]) => [
          { text: k, style: "tdLabel" },
          { text: v || "—", style: "td" },
        ]),
      },
      layout: {
        hLineColor: () => LINE,
        vLineColor: () => LINE,
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        paddingTop: () => 6,
        paddingBottom: () => 6,
        paddingLeft: () => 8,
        paddingRight: () => 8,
      },
    },
    {
      text:
        "전자서명법에 따라 당사자 간 합의된 전자서명은 서면 서명과 동일한 효력을 가집니다. " +
        "문서 지문(SHA-256)은 본문과 서명 입력값으로 계산한 고유값으로, 문서가 서명 이후 변경되지 않았음을 검증하는 데 사용됩니다.",
      color: MUTED,
      fontSize: 8.5,
      margin: [0, 12, 0, 0],
    },
  ];
}

export async function renderCompanySignedPdf(input: CompanySignedPdfInput): Promise<Buffer> {
  const { content } = input;
  const fontsDir = path.join(process.cwd(), "public", "fonts");
  const printer = new PdfPrinter({
    Pretendard: {
      normal: path.join(fontsDir, "Pretendard-Regular.otf"),
      bold: path.join(fontsDir, "Pretendard-Bold.otf"),
      italics: path.join(fontsDir, "Pretendard-Regular.otf"),
      bolditalics: path.join(fontsDir, "Pretendard-Bold.otf"),
    },
  });

  const values = buildValueMap(content, input.partyValues);
  const fieldMap = new Map(content.fields.map((f) => [f.key, f]));
  const partyBDisplay =
    input.counterpartyKind === "corp"
      ? input.counterpartyCompany ?? input.counterpartyName
      : input.counterpartyName;

  const clauseContents: Content[] = content.clauses.flatMap((clause): Content[] => [
    ...(clause.heading.trim()
      ? [
          {
            text: runsToText(tokenizeParagraph(clause.heading), values, fieldMap),
            bold: true,
            fontSize: 10.5,
            margin: [0, 10, 0, 3],
          } as Content,
        ]
      : []),
    ...(clause.body.trim() === TERMS_MARKER
      ? [termsTable(content.terms ?? [])]
      : clauseParagraphs(clause.body, values, fieldMap)),
  ]);

  const dd: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 52],
    // 미리보기는 모든 쪽에 옅은 도장을 깐다 — 서명 안 된 PDF가 진짜 계약서처럼 돌아다니지 않게.
    ...(input.preview
      ? { watermark: { text: "미리보기", color: "#2563eb", opacity: 0.08, bold: true, angle: -22 } }
      : {}),
    defaultStyle: { font: "Pretendard", fontSize: 9.5, lineHeight: 1.4, color: INK },
    styles: {
      th: { bold: true, fontSize: 9, color: "#334155" },
      td: { fontSize: 9 },
      tdLabel: { fontSize: 9, bold: true, color: "#475569" },
      tdSection: { fontSize: 9, bold: true, color: "#334155" },
    },
    footer: (currentPage, pageCount) => ({
      text: `${content.company.name} | ${currentPage} / ${pageCount}`,
      alignment: "center",
      fontSize: 8,
      color: MUTED,
      margin: [0, 16, 0, 0],
    }),
    content: [
      ...(input.preview
        ? [
            {
              text: "미리보기 — 아직 서명되지 않은 문서입니다. 법적 효력이 없습니다.",
              alignment: "center",
              fontSize: 8.5,
              color: "#2563eb",
              margin: [0, 0, 0, 8],
            } as Content,
          ]
        : []),
      { text: content.title, bold: true, fontSize: 16, alignment: "center", margin: [0, 0, 0, 12] },
      {
        table: {
          widths: ["auto", "*", "auto", "*"],
          body: [
            [
              { text: "갑", style: "th" },
              { text: content.company.name, style: "td" },
              { text: "을", style: "th" },
              { text: partyBDisplay, style: "td" },
            ],
          ],
        },
        layout: {
          hLineColor: () => LINE,
          vLineColor: () => LINE,
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 5,
          paddingBottom: () => 5,
          paddingLeft: () => 7,
          paddingRight: () => 7,
        },
        margin: [0, 0, 0, 10],
      },
      ...(content.intro.trim() ? clauseParagraphs(content.intro, values, fieldMap) : []),
      ...clauseContents,
      { text: "서명 및 계약 정보", bold: true, fontSize: 13, alignment: "center", pageBreak: "before", margin: [0, 6, 0, 4] },
      ...(content.closing.trim()
        ? [{ text: content.closing, alignment: "center", color: MUTED, margin: [0, 0, 0, 8] } as Content]
        : []),
      signatureSection(input),
      ...(content.footnote.trim()
        ? [{ text: content.footnote, fontSize: 8.5, color: MUTED, alignment: "center", margin: [0, 14, 0, 0] } as Content]
        : []),
      // 전자서명 확인서는 "체결됐다"는 증명이므로 미리보기에는 붙이지 않는다
      ...(input.preview ? [] : auditSection(input)),
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(dd);
  const chunks: Buffer[] = [];
  pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));
  await new Promise<void>((resolve, reject) => {
    pdfDoc.on("end", () => resolve());
    pdfDoc.on("error", reject);
    pdfDoc.end();
  });
  return Buffer.concat(chunks);
}
