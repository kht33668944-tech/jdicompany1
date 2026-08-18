// 계약관리(범용) 공개 전자서명 흐름의 서버 로직 — /sign/c/[token] 페이지와 /api/sign/c/[token] 라우트 전용.
//
// 상대방은 로그인이 없으므로 여기서만 service role(admin) 클라이언트를 쓴다
// (TMA 의 documents/signService.ts 와 함께 admin import 허용 목록에 있는 파일 —
// scripts/contract-esign.test.mjs · company-contracts.test.mjs 가 고정).
// 모든 진입은 서명 토큰(256bit 랜덤, 만료 7일) 검증을 먼저 통과해야 한다.
// 상대방 입력값(개인정보)은 encryptSecret(AES-256-GCM)으로 통째 암호화해 저장한다 — 평문 저장 금지.

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/vault/crypto";
import {
  CHECKBOX_ON,
  COMPANY_CONTRACT_DOCS_BUCKET,
  COPY_DOWNLOAD_DAYS,
} from "./constants";
import { renderCompanySignedPdf } from "./pdf";
import type {
  CompanyDocStatus,
  CompanySignPageData,
  ContentV2,
  CounterpartyKind,
  FieldDef,
} from "./types";

const TOKEN_RE = /^[A-Za-z0-9_-]{30,64}$/;
const PHONE_RE = /^[\d\s+-]{7,20}$/;
const ACCOUNT_RE = /^[\d-]{5,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMBER_RE = /^[\d,.\s-]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BIZNO_RE = /^\d{3}-?\d{2}-?\d{5}$/;
/** 회사(갑) 도장 위치 — TMA 와 같은 원본을 읽는다(복사하지 않음, 교체 시 한 곳만 갈면 됨) */
const STAMP_BUCKET = "influencer-contract-docs";
const STAMP_PATH = "company/stamp.png";

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

/** ISO → "YYYY-MM-DD HH:mm (KST)" */
function toKstLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} (KST)`;
}

interface DocRow {
  id: string;
  title: string;
  counterparty_name: string;
  counterparty_company: string | null;
  counterparty_kind: CounterpartyKind;
  content: ContentV2;
  status: CompanyDocStatus;
  sign_token: string;
  token_expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_pdf_path: string | null;
  created_by: string;
}

// signer_fields_enc 는 절대 select 하지 않는다 — 페이지 데이터로 새어 나가지 않게.
async function getDocByToken(token: string): Promise<DocRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("company_contract_documents")
    .select(
      "id, title, counterparty_name, counterparty_company, counterparty_kind, content, status, " +
        "sign_token, token_expires_at, sent_at, viewed_at, signed_at, signed_pdf_path, created_by",
    )
    .eq("sign_token", token)
    .maybeSingle();
  if (error) {
    console.error("[sign/c] 문서 조회 실패:", error);
    return null;
  }
  return (data as unknown as DocRow) ?? null;
}

function isExpired(doc: DocRow): boolean {
  return (
    doc.status === "sent" &&
    Boolean(doc.token_expires_at) &&
    new Date(doc.token_expires_at as string).getTime() < Date.now()
  );
}

/** 서명 페이지 초기 데이터 — 처음 열람이면 열람 시각을 기록한다 */
export async function getCompanySignPageData(token: string): Promise<CompanySignPageData | null> {
  const doc = await getDocByToken(token);
  if (!doc || doc.status === "draft" || doc.status === "canceled") return null;

  if (doc.status === "sent" && !doc.viewed_at) {
    const admin = createAdminClient();
    await admin
      .from("company_contract_documents")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", doc.id)
      .is("viewed_at", null);
  }

  return {
    status: doc.status,
    content: doc.content,
    counterpartyKind: doc.counterparty_kind,
    counterpartyName: doc.counterparty_name,
    counterpartyCompany: doc.counterparty_company,
    signedAt: doc.signed_at,
    expired: isExpired(doc),
  };
}

export interface CompanySignSubmission {
  signerName: string;
  /** 필드 key → 상대방 입력값 (정의된 party 필드만 서버에서 채택) */
  partyValues: Record<string, string>;
  businessRegNo: string;
  agreed: boolean;
  signatureMode: "draw" | "stamp";
  /** draw 모드의 손서명 PNG dataURL */
  signatureDataUrl: string | null;
  /** stamp 모드의 법인 도장 이미지 파일 */
  stampFile: { bytes: Buffer; contentType: string } | null;
  ip: string;
  userAgent: string;
}

function validateFieldValue(fieldDef: FieldDef, value: string): void {
  const v = value.trim();
  if (!v) {
    if (fieldDef.required) {
      throw new Error(
        fieldDef.type === "checkbox"
          ? `「${fieldDef.label}」에 체크해주세요.`
          : `「${fieldDef.label}」을(를) 입력해주세요.`,
      );
    }
    return;
  }
  // 고르는 칸은 화면이 준 값을 그대로 믿지 않는다 — 정해진 값만 통과시킨다
  if (fieldDef.type === "checkbox" && v !== CHECKBOX_ON) {
    throw new Error(`「${fieldDef.label}」 체크 값이 올바르지 않습니다.`);
  }
  if (fieldDef.type === "select" && !(fieldDef.options ?? []).includes(v)) {
    throw new Error(`「${fieldDef.label}」은(는) 목록에서 골라주세요.`);
  }
  const maxLen = fieldDef.type === "multiline" ? 2000 : 500;
  if (v.length > maxLen) throw new Error(`「${fieldDef.label}」이(가) 너무 깁니다.`);
  if (fieldDef.type === "phone" && !PHONE_RE.test(v)) {
    throw new Error(`「${fieldDef.label}」은(는) 숫자와 - 만 입력해주세요.`);
  }
  if (fieldDef.type === "account" && !ACCOUNT_RE.test(v)) {
    throw new Error(`「${fieldDef.label}」은(는) 숫자와 - 만 입력해주세요.`);
  }
  if (fieldDef.type === "email" && !EMAIL_RE.test(v)) {
    throw new Error(`「${fieldDef.label}」 이메일 형식을 확인해주세요.`);
  }
  if (fieldDef.type === "number" && !NUMBER_RE.test(v)) {
    throw new Error(`「${fieldDef.label}」은(는) 숫자로 입력해주세요.`);
  }
  if (fieldDef.type === "date" && !DATE_RE.test(v)) {
    throw new Error(`「${fieldDef.label}」은(는) 날짜(YYYY-MM-DD)로 입력해주세요.`);
  }
}

/** 검증 + 정의된 party 필드만 남긴 입력값 반환 (모르는 key 는 버린다) */
function validateSubmission(doc: DocRow, s: CompanySignSubmission): Record<string, string> {
  if (!s.agreed) throw new Error("계약 내용 동의에 체크해주세요.");
  if (!s.signerName.trim()) throw new Error("서명자 성명을 입력해주세요.");
  if (s.signerName.length > 200) throw new Error("서명자 성명이 너무 깁니다.");

  const clean: Record<string, string> = {};
  for (const fieldDef of doc.content.fields ?? []) {
    if (fieldDef.kind !== "party") continue;
    const value = s.partyValues[fieldDef.key] ?? "";
    validateFieldValue(fieldDef, value);
    if (value.trim()) clean[fieldDef.key] = value.trim();
  }

  if (doc.counterparty_kind === "corp") {
    if (!s.businessRegNo.trim()) throw new Error("사업자등록번호를 입력해주세요.");
    if (!BIZNO_RE.test(s.businessRegNo.trim())) {
      throw new Error("사업자등록번호 형식을 확인해주세요. (예: 123-45-67890)");
    }
  }

  if (s.signatureMode === "stamp") {
    if (doc.counterparty_kind !== "corp") {
      throw new Error("도장 이미지 서명은 법인 계약에서만 사용할 수 있어요.");
    }
    if (!s.stampFile) throw new Error("도장 이미지를 올려주세요.");
    if (!["image/png", "image/jpeg"].includes(s.stampFile.contentType)) {
      throw new Error("도장 이미지는 PNG 또는 JPG 파일만 올릴 수 있어요.");
    }
    if (s.stampFile.bytes.length > 5 * 1024 * 1024) {
      throw new Error("도장 이미지는 5MB 이하만 올릴 수 있어요.");
    }
    if (s.stampFile.bytes.length < 100) throw new Error("도장 이미지가 올바르지 않습니다.");
  } else {
    if (!s.signatureDataUrl?.startsWith("data:image/png;base64,")) {
      throw new Error("서명 이미지가 올바르지 않습니다.");
    }
    const sigBytes = Buffer.from(s.signatureDataUrl.split(",")[1] ?? "", "base64");
    if (sigBytes.length < 500) throw new Error("서명을 그려주세요.");
    if (sigBytes.length > 500_000) throw new Error("서명 이미지가 너무 큽니다.");
  }
  return clean;
}

/**
 * 서명 제출 처리 — 검증 → 서명 이미지 업로드 → 입력값 암호화 저장 → 최종 PDF 생성·보관
 * → 문서 확정. TMA 와 달리 연동할 다른 엔티티가 없어 상태 전진 단계는 없다.
 */
export async function submitCompanySignature(
  token: string,
  s: CompanySignSubmission,
): Promise<void> {
  const doc = await getDocByToken(token);
  if (!doc || doc.status !== "sent") {
    throw new Error("이미 처리되었거나 유효하지 않은 서명 링크입니다.");
  }
  if (isExpired(doc)) {
    throw new Error("서명 링크의 유효기간이 지났습니다. 담당자에게 새 링크를 요청해주세요.");
  }
  const partyValues = validateSubmission(doc, s);

  const admin = createAdminClient();
  const signedAtIso = new Date().toISOString();
  const isStamp = s.signatureMode === "stamp";

  // 1) 서명 이미지(손서명 또는 법인 도장) 업로드
  let signatureBytes: Buffer;
  let signatureContentType: string;
  if (isStamp && s.stampFile) {
    signatureBytes = s.stampFile.bytes;
    signatureContentType = s.stampFile.contentType;
  } else {
    signatureBytes = Buffer.from((s.signatureDataUrl as string).split(",")[1], "base64");
    signatureContentType = "image/png";
  }
  const signatureExt = signatureContentType === "image/jpeg" ? "jpg" : "png";
  const signaturePath = `${doc.id}/signature.${signatureExt}`;
  {
    const { error } = await admin.storage
      .from(COMPANY_CONTRACT_DOCS_BUCKET)
      .upload(signaturePath, signatureBytes, { contentType: signatureContentType, upsert: true });
    if (error) throw new Error("서명 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
  const signatureDataUrl = `data:${signatureContentType};base64,${signatureBytes.toString("base64")}`;

  // 2) 회사(갑) 도장 — TMA 와 같은 원본을 service role 로 읽는다
  let stampDataUrl: string | null = null;
  {
    const { data } = await admin.storage.from(STAMP_BUCKET).download(STAMP_PATH);
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      stampDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    }
  }

  // 3) 최종 PDF 렌더링 — 본문 토큰 자리에 입력값 인쇄, 문서 지문 계산
  const contentSha256 = sha256(
    JSON.stringify({
      content: doc.content,
      partyValues,
      signerName: s.signerName.trim(),
      businessRegNo: s.businessRegNo.trim(),
      signedAt: signedAtIso,
    }),
  );
  const pdfBuffer = await renderCompanySignedPdf({
    content: doc.content,
    partyValues,
    counterpartyName: doc.counterparty_name,
    counterpartyCompany: doc.counterparty_company,
    counterpartyKind: doc.counterparty_kind,
    businessRegNo: s.businessRegNo.trim(),
    signerName: s.signerName.trim(),
    signatureDataUrl,
    signatureIsStamp: isStamp,
    stampDataUrl,
    signedAtKst: toKstLabel(signedAtIso),
    sentAtKst: toKstLabel(doc.sent_at),
    viewedAtKst: toKstLabel(doc.viewed_at ?? signedAtIso),
    docId: doc.id,
    contentSha256,
    ip: s.ip,
    userAgent: s.userAgent,
  });
  const pdfPath = `${doc.id}/signed.pdf`;
  {
    const { error } = await admin.storage
      .from(COMPANY_CONTRACT_DOCS_BUCKET)
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error("계약서 보관에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }

  // 4) 문서 확정 — 상대방 입력값은 통째 암호화, status 조건으로 이중 제출을 막는다
  const { data: updatedDoc, error: docErr } = await admin
    .from("company_contract_documents")
    .update({
      status: "signed",
      signed_at: signedAtIso,
      signer_name: s.signerName.trim(),
      signature_path: signaturePath,
      signed_pdf_path: pdfPath,
      pdf_sha256: sha256(pdfBuffer),
      signer_fields_enc: encryptSecret(
        JSON.stringify({
          values: partyValues,
          businessRegNo: s.businessRegNo.trim(),
          signerName: s.signerName.trim(),
        }),
      ),
      audit: {
        ip: s.ip,
        user_agent: s.userAgent,
        content_sha256: contentSha256,
        signature_mode: s.signatureMode,
      },
    })
    .eq("id", doc.id)
    .eq("status", "sent")
    .select("id");
  if (docErr) throw new Error("서명 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
  if (!updatedDoc || updatedDoc.length === 0) {
    throw new Error("이미 서명이 완료된 계약서입니다.");
  }
}

/** 서명 완료 후 상대방 사본 다운로드(같은 토큰, 서명일로부터 30일) — 임시 링크 반환 */
export async function getCompanySignedCopyUrl(token: string): Promise<string | null> {
  const doc = await getDocByToken(token);
  if (!doc || doc.status !== "signed" || !doc.signed_pdf_path || !doc.signed_at) return null;
  const ageMs = Date.now() - new Date(doc.signed_at).getTime();
  if (ageMs > COPY_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(COMPANY_CONTRACT_DOCS_BUCKET)
    .createSignedUrl(doc.signed_pdf_path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}
