// 서명 완료 계약서 PDF 렌더링 — 서버 전용(pdfmake + Pretendard OTF).
//
// ⚠️ 클라이언트 번들에 절대 포함하지 않는다. /api/sign 라우트에서만 import 한다.
// 폰트는 public/fonts/ 의 Pretendard(OFL 라이선스) — Dockerfile 이 public 을 복사하므로
// 운영 컨테이너에서도 같은 경로로 읽힌다.

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
import { TERMS_MARKER } from "./template";
import type { DocContent, SignerInput, TermRow } from "./types";

export interface SignedPdfInput {
  content: DocContent;
  signer: SignerInput;
  /** "사업자" | "개인" | "" */
  settlementTypeLabel: string;
  /** 손서명 PNG (dataURL) */
  signatureDataUrl: string;
  /** 회사 도장 PNG (dataURL, 없으면 생략) */
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
}

const INK = "#1e293b";
const MUTED = "#64748b";
const LINE = "#cbd5e1";
const HEAD_FILL = "#f1f5f9";

/** 조항 body("①... ②...", 줄바꿈 구분) → 문단 목록 */
function clauseParagraphs(body: string): Content[] {
  return body
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ text: p, margin: [0, 2, 0, 2] as [number, number, number, number] }));
}

/** 개별 조건표 — 같은 항목(section)은 첫 행에만 표기해 원본 계약서의 병합 느낌을 살린다 */
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

function signatureSection(input: SignedPdfInput): Content {
  const { content, signer, settlementTypeLabel } = input;
  const c = content.company;

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

  const signerCell: Content[] = [
    field("성명(실명)", signer.name),
    field("채널명/계정", signer.channel),
    field("주소", signer.address),
    field("연락처", signer.phone),
    field("이메일", signer.email),
    field("정산 구분", settlementTypeLabel),
    ...(settlementTypeLabel === "사업자" ? [field("사업자등록번호", signer.businessRegNo)] : []),
    field("은행/계좌/예금주", [signer.bankName, signer.bankAccount, signer.accountHolder].filter(Boolean).join(" / ")),
    field("서명일", input.signedAtKst),
    {
      columns: [
        { text: "서명 또는 인:", color: MUTED, width: "auto", margin: [0, 14, 8, 0] },
        { image: input.signatureDataUrl, width: 110, height: 44 },
      ],
      margin: [0, 4, 0, 0],
    },
  ];

  return {
    table: {
      widths: ["*", "*"],
      body: [
        [
          { text: `갑 · ${c.name}`, style: "th", alignment: "center" },
          { text: "을 · 콘텐츠 제작자", style: "th", alignment: "center" },
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
function auditSection(input: SignedPdfInput): Content[] {
  const rows: [string, string][] = [
    ["문서 번호", input.docId],
    ["문서 지문(SHA-256)", input.contentSha256],
    ["서명 요청(발송)", input.sentAtKst],
    ["최초 열람", input.viewedAtKst],
    ["전자서명 완료", input.signedAtKst],
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

export async function renderSignedContractPdf(input: SignedPdfInput): Promise<Buffer> {
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

  const clauseContents: Content[] = content.clauses.flatMap((clause): Content[] => [
    { text: clause.heading, bold: true, fontSize: 10.5, margin: [0, 10, 0, 3] },
    ...(clause.body.trim() === TERMS_MARKER
      ? [termsTable(content.terms)]
      : clauseParagraphs(clause.body)),
  ]);

  const dd: TDocumentDefinitions = {
    pageSize: "A4",
    pageMargins: [42, 48, 42, 52],
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
      { text: content.title, bold: true, fontSize: 16, alignment: "center", margin: [0, 0, 0, 4] },
      { text: content.subtitle, fontSize: 10.5, alignment: "center", color: MUTED, margin: [0, 0, 0, 12] },
      {
        table: {
          widths: ["auto", "*", "auto", "*"],
          body: [
            [
              { text: "갑", style: "th" },
              { text: content.company.name, style: "td" },
              { text: "을", style: "th" },
              { text: content.headerMeta.partyB, style: "td" },
            ],
            [
              { text: "계약 유형", style: "th" },
              { text: content.headerMeta.contractTypeLabel, style: "td" },
              { text: "캠페인", style: "th" },
              { text: content.headerMeta.campaign, style: "td" },
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
      { text: content.intro, margin: [0, 0, 0, 4] },
      ...clauseContents,
      {
        table: { widths: ["*"], body: [[{ text: content.importantNote, fontSize: 9, color: "#854d0e" }]] },
        layout: {
          hLineColor: () => "#fde68a",
          vLineColor: () => "#fde68a",
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          fillColor: () => "#fefce8",
          paddingTop: () => 7,
          paddingBottom: () => 7,
          paddingLeft: () => 9,
          paddingRight: () => 9,
        },
        margin: [0, 10, 0, 0],
      },
      { text: "서명 및 계약 정보", bold: true, fontSize: 13, alignment: "center", pageBreak: "before", margin: [0, 6, 0, 4] },
      { text: content.closing, alignment: "center", color: MUTED, margin: [0, 0, 0, 8] },
      signatureSection(input),
      { text: content.footnote, fontSize: 8.5, color: MUTED, alignment: "center", margin: [0, 14, 0, 0] },
      ...auditSection(input),
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
