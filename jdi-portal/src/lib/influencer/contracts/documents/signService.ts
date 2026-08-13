// 공개 전자서명 흐름의 서버 로직 — /sign/[token] 페이지와 /api/sign/[token] 라우트 전용.
//
// 인플루언서는 로그인이 없으므로 여기서만 service role(admin) 클라이언트를 쓴다.
// 모든 진입은 서명 토큰(256bit 랜덤, 만료 7일) 검증을 먼저 통과해야 한다.
// 개인정보는 encryptSecret(AES-256-GCM)으로 암호화해 정산 테이블에 저장한다 — 평문 저장 금지.

import { createHash, randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/vault/crypto";
import { CONTRACT_DOCS_BUCKET } from "@/lib/influencer/contracts/constants";
import { CONTRACT_STATUS_ORDER } from "@/lib/influencer/contracts/labels";
import {
  finishContractSave,
  LINK_COLUMNS,
  type ContractLinkRow,
} from "@/lib/influencer/contracts/linkSync";
import { renderSignedContractPdf } from "./pdf";
import type { DocContent, SignerInput, SignPageData } from "./types";

const TOKEN_RE = /^[A-Za-z0-9_-]{30,64}$/;
const PHONE_RE = /^[\d\s+-]{7,20}$/;
const ACCOUNT_RE = /^[\d-]{5,30}$/;
/** 서명 완료 후 인플루언서가 같은 링크로 사본을 받을 수 있는 기간 */
const COPY_DOWNLOAD_DAYS = 30;
/** 회사 도장 이미지 위치(비공개 버킷) */
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
  contract_id: string;
  content: DocContent;
  status: "draft" | "sent" | "signed" | "canceled";
  sign_token: string;
  token_expires_at: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_pdf_path: string | null;
  created_by: string;
}

async function getDocByToken(token: string): Promise<DocRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("influencer_contract_documents")
    .select(
      "id, contract_id, content, status, sign_token, token_expires_at, sent_at, viewed_at, signed_at, signed_pdf_path, created_by",
    )
    .eq("sign_token", token)
    .maybeSingle();
  if (error) {
    console.error("[sign] 문서 조회 실패:", error);
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
export async function getSignPageData(token: string): Promise<SignPageData | null> {
  const doc = await getDocByToken(token);
  if (!doc || doc.status === "draft" || doc.status === "canceled") return null;

  const admin = createAdminClient();
  const { data: contract } = await admin
    .from("influencer_contracts")
    .select("settlement_type")
    .eq("id", doc.contract_id)
    .maybeSingle();

  if (doc.status === "sent" && !doc.viewed_at) {
    await admin
      .from("influencer_contract_documents")
      .update({ viewed_at: new Date().toISOString() })
      .eq("id", doc.id)
      .is("viewed_at", null);
  }

  return {
    status: doc.status,
    content: doc.content,
    settlementType: (contract?.settlement_type as "business" | "individual" | null) ?? null,
    signedAt: doc.signed_at,
    expired: isExpired(doc),
  };
}

export interface SignSubmission {
  signer: SignerInput;
  signatureDataUrl: string;
  agreed: boolean;
  idCard: { bytes: Buffer; contentType: string; fileName: string } | null;
  ip: string;
  userAgent: string;
}

function validateSubmission(s: SignSubmission): void {
  const need = (v: string, msg: string) => {
    if (!v || !v.trim()) throw new Error(msg);
  };
  if (!s.agreed) throw new Error("계약 내용 동의에 체크해주세요.");
  need(s.signer.name, "성명(실명)을 입력해주세요.");
  need(s.signer.address, "주소를 입력해주세요.");
  need(s.signer.phone, "연락처를 입력해주세요.");
  need(s.signer.bankName, "은행명을 입력해주세요.");
  need(s.signer.bankAccount, "계좌번호를 입력해주세요.");
  need(s.signer.accountHolder, "예금주를 입력해주세요.");
  if (!PHONE_RE.test(s.signer.phone.trim())) throw new Error("연락처는 숫자와 - 만 입력해주세요.");
  if (!ACCOUNT_RE.test(s.signer.bankAccount.trim())) throw new Error("계좌번호는 숫자와 - 만 입력해주세요.");
  for (const [value, label] of [
    [s.signer.name, "성명"],
    [s.signer.channel, "채널명"],
    [s.signer.email, "이메일"],
    [s.signer.businessRegNo, "사업자등록번호"],
    [s.signer.bankName, "은행명"],
    [s.signer.accountHolder, "예금주"],
  ] as const) {
    if (value.length > 200) throw new Error(`${label}이(가) 너무 깁니다.`);
  }
  if (s.signer.address.length > 500) throw new Error("주소가 너무 깁니다.");

  if (!s.signatureDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("서명 이미지가 올바르지 않습니다.");
  }
  const sigBytes = Buffer.from(s.signatureDataUrl.split(",")[1] ?? "", "base64");
  if (sigBytes.length < 500) throw new Error("서명을 그려주세요.");
  if (sigBytes.length > 500_000) throw new Error("서명 이미지가 너무 큽니다.");

  if (s.idCard) {
    const okTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!okTypes.includes(s.idCard.contentType)) {
      throw new Error("신분증은 사진(JPG/PNG/WebP) 또는 PDF 파일만 올릴 수 있어요.");
    }
    if (s.idCard.bytes.length > 10 * 1024 * 1024) throw new Error("신분증 파일은 10MB 이하만 올릴 수 있어요.");
  }
}

/**
 * 서명 제출 처리 — 검증 → 파일 업로드 → 정산 정보 암호화 저장 → 최종 PDF 생성·보관
 * → 문서/계약 상태 전환. 성공 시 사본 다운로드 가능 여부를 반환한다.
 */
export async function submitSignature(token: string, s: SignSubmission): Promise<void> {
  const doc = await getDocByToken(token);
  if (!doc || doc.status !== "sent") {
    throw new Error("이미 처리되었거나 유효하지 않은 서명 링크입니다.");
  }
  if (isExpired(doc)) {
    throw new Error("서명 링크의 유효기간이 지났습니다. 담당자에게 새 링크를 요청해주세요.");
  }
  validateSubmission(s);

  const admin = createAdminClient();
  const signedAtIso = new Date().toISOString();

  // 1) 손서명 업로드
  const signatureBytes = Buffer.from(s.signatureDataUrl.split(",")[1], "base64");
  const signaturePath = `${doc.contract_id}/sign/${doc.id}-signature.png`;
  {
    const { error } = await admin.storage
      .from(CONTRACT_DOCS_BUCKET)
      .upload(signaturePath, signatureBytes, { contentType: "image/png", upsert: true });
    if (error) throw new Error("서명 저장에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }

  // 2) 신분증 업로드(선택)
  let idCardPath: string | null = null;
  if (s.idCard) {
    const ext = s.idCard.contentType === "application/pdf"
      ? "pdf"
      : s.idCard.contentType.split("/")[1];
    idCardPath = `${doc.contract_id}/id-card/${randomUUID()}.${ext}`;
    const { error } = await admin.storage
      .from(CONTRACT_DOCS_BUCKET)
      .upload(idCardPath, s.idCard.bytes, { contentType: s.idCard.contentType });
    if (error) throw new Error("신분증 업로드에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }

  // 3) 정산 정보 암호화 저장 (기존 행이 있으면 병합 — 신분증은 새로 온 경우만 교체)
  const { data: existing } = await admin
    .from("influencer_contract_settlements")
    .select("id, id_card_path")
    .eq("contract_id", doc.contract_id)
    .maybeSingle();
  const encrypted = {
    phone_enc: encryptSecret(s.signer.phone.trim()),
    address_enc: encryptSecret(s.signer.address.trim()),
    bank_name_enc: encryptSecret(s.signer.bankName.trim()),
    bank_account_enc: encryptSecret(s.signer.bankAccount.trim()),
    account_holder_enc: encryptSecret(s.signer.accountHolder.trim()),
    ...(idCardPath
      ? { id_card_path: idCardPath, id_card_name: s.idCard?.fileName ?? "신분증" }
      : {}),
    updated_by: doc.created_by,
  };
  if (existing) {
    const { error } = await admin
      .from("influencer_contract_settlements")
      .update(encrypted)
      .eq("id", existing.id);
    if (error) console.error("[sign] 정산 정보 저장 실패:", error);
  } else {
    const { error } = await admin
      .from("influencer_contract_settlements")
      .insert({ contract_id: doc.contract_id, created_by: doc.created_by, ...encrypted });
    if (error) console.error("[sign] 정산 정보 저장 실패:", error);
  }

  // 4) 계약의 정산 구분(사업자/개인) 라벨 — PDF 서명란 표기용
  const { data: contract } = await admin
    .from("influencer_contracts")
    .select("settlement_type")
    .eq("id", doc.contract_id)
    .maybeSingle();
  const settlementTypeLabel =
    contract?.settlement_type === "business" ? "사업자"
    : contract?.settlement_type === "individual" ? "개인"
    : "";

  // 5) 회사 도장(있으면) — 비공개 버킷에서 읽는다
  let stampDataUrl: string | null = null;
  {
    const { data } = await admin.storage.from(CONTRACT_DOCS_BUCKET).download(STAMP_PATH);
    if (data) {
      const buf = Buffer.from(await data.arrayBuffer());
      stampDataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    }
  }

  // 6) 최종 PDF — 조건표의 "을 연락처" 자리 표시 문구를 실제 연락처로 채워 렌더링
  const contentForPdf: DocContent = {
    ...doc.content,
    terms: doc.content.terms.map((t) =>
      t.label === "을 연락처" && t.value === "서명 시 을이 기재"
        ? { ...t, value: s.signer.phone.trim() }
        : t,
    ),
  };
  const contentSha256 = sha256(
    JSON.stringify({ content: contentForPdf, signer: s.signer, signedAt: signedAtIso }),
  );
  const pdfBuffer = await renderSignedContractPdf({
    content: contentForPdf,
    signer: s.signer,
    settlementTypeLabel,
    signatureDataUrl: s.signatureDataUrl,
    stampDataUrl,
    signedAtKst: toKstLabel(signedAtIso),
    sentAtKst: toKstLabel(doc.sent_at),
    viewedAtKst: toKstLabel(doc.viewed_at ?? signedAtIso),
    docId: doc.id,
    contentSha256,
    ip: s.ip,
    userAgent: s.userAgent,
  });
  const pdfPath = `${doc.contract_id}/sign/${doc.id}-signed.pdf`;
  {
    const { error } = await admin.storage
      .from(CONTRACT_DOCS_BUCKET)
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error("계약서 보관에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }

  // 7) 문서 확정 — status 조건으로 이중 제출을 막는다
  const { data: updatedDoc, error: docErr } = await admin
    .from("influencer_contract_documents")
    .update({
      status: "signed",
      signed_at: signedAtIso,
      signer_name: s.signer.name.trim(),
      signature_path: signaturePath,
      signed_pdf_path: pdfPath,
      pdf_sha256: sha256(pdfBuffer),
      audit: { ip: s.ip, user_agent: s.userAgent, content_sha256: contentSha256 },
    })
    .eq("id", doc.id)
    .eq("status", "sent")
    .select("id");
  if (docErr) throw new Error("서명 처리에 실패했습니다. 잠시 후 다시 시도해주세요.");
  if (!updatedDoc || updatedDoc.length === 0) {
    throw new Error("이미 서명이 완료된 계약서입니다.");
  }

  // 8) 계약 상태 자동 전진(서명 완료 전 단계였다면) + 시딩 스케줄 동기화
  const { data: advanced } = await admin
    .from("influencer_contracts")
    .update({ contract_status: "signed" })
    .eq("id", doc.contract_id)
    .eq("is_deleted", false)
    .in(
      "contract_status",
      CONTRACT_STATUS_ORDER.slice(0, CONTRACT_STATUS_ORDER.indexOf("signed")),
    )
    .select(LINK_COLUMNS)
    .maybeSingle();
  if (advanced) {
    await finishContractSave(admin, doc.created_by, advanced as unknown as ContractLinkRow);
  }
}

/** 서명 완료 후 인플루언서 사본 다운로드(같은 토큰, 서명일로부터 30일) — 임시 링크 반환 */
export async function getSignedCopyUrl(token: string): Promise<string | null> {
  const doc = await getDocByToken(token);
  if (!doc || doc.status !== "signed" || !doc.signed_pdf_path || !doc.signed_at) return null;
  const ageMs = Date.now() - new Date(doc.signed_at).getTime();
  if (ageMs > COPY_DOWNLOAD_DAYS * 24 * 60 * 60 * 1000) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(CONTRACT_DOCS_BUCKET)
    .createSignedUrl(doc.signed_pdf_path, 300);
  if (error) return null;
  return data?.signedUrl ?? null;
}
