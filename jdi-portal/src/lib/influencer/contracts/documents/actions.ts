"use server";

// 계약서 문서/양식 서버 액션 (직원용 — 공개 서명 흐름은 /api/sign 라우트가 담당).
// 오류는 throw new Error("한국어 문구") 관례 (호출부 getErrorMessage).

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CONTRACT_DOCS_BUCKET, UUID_RE } from "@/lib/influencer/contracts/constants";
import { CONTRACT_STATUS_ORDER } from "@/lib/influencer/contracts/labels";
import {
  CONTRACTS_PATH,
  finishContractSave,
  LINK_COLUMNS,
  type ContractLinkRow,
} from "@/lib/influencer/contracts/linkSync";
import type { InfluencerContract } from "@/lib/influencer/contracts/types";
import { buildDocContent } from "./build";
import { DEFAULT_TEMPLATES, TERMS_MARKER } from "./template";
import type {
  ContractDocument,
  DocContent,
  TemplateContent,
  TemplateKey,
} from "./types";

/** 서명 링크 유효기간(일) — 지나면 링크가 만료되고 재발송이 필요하다 */
const SIGN_TOKEN_DAYS = 7;

const DOC_COLUMNS =
  "id, contract_id, template_key, content, status, sign_token, token_expires_at, " +
  "sent_at, viewed_at, signed_at, signer_name, signed_pdf_path, pdf_sha256, created_at, updated_at";

async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: session.user.id };
}

function isTemplateKey(key: string): key is TemplateKey {
  return key === "paid" || key === "seeding";
}

// ============================================================
// 본문 검증 — 클라이언트가 보낸 편집 내용을 그대로 믿지 않는다
// ============================================================
function requireText(value: unknown, label: string, maxLen: number): string {
  if (typeof value !== "string") throw new Error(`${label} 형식이 잘못되었습니다.`);
  if (value.length > maxLen) throw new Error(`${label}이(가) 너무 깁니다.`);
  return value;
}

function validateTemplateContent(raw: TemplateContent): TemplateContent {
  const clauses = Array.isArray(raw.clauses) ? raw.clauses : null;
  if (!clauses || clauses.length === 0 || clauses.length > 40) {
    throw new Error("조항 목록이 잘못되었습니다.");
  }
  const validated = clauses.map((c, i) => ({
    heading: requireText(c?.heading, `${i + 1}번째 조항 제목`, 200).trim(),
    body: requireText(c?.body, `${i + 1}번째 조항 본문`, 8000),
  }));
  if (!validated.some((c) => c.body.trim() === TERMS_MARKER)) {
    throw new Error("개별 조건표 자리 조항이 없습니다. 조건표 조항은 삭제할 수 없어요.");
  }
  return {
    title: requireText(raw.title, "제목", 200).trim(),
    subtitle: requireText(raw.subtitle, "부제목", 200).trim(),
    intro: requireText(raw.intro, "전문", 4000),
    clauses: validated,
    importantNote: requireText(raw.importantNote, "강조 문구", 2000),
    closing: requireText(raw.closing, "서명 안내문", 1000),
    footnote: requireText(raw.footnote, "하단 문구", 1000),
  };
}

function validateDocContent(raw: DocContent): DocContent {
  const base = validateTemplateContent(raw);
  const terms = Array.isArray(raw.terms) ? raw.terms : null;
  if (!terms || terms.length === 0 || terms.length > 80) {
    throw new Error("개별 조건표가 잘못되었습니다.");
  }
  return {
    ...base,
    headerMeta: {
      partyB: requireText(raw.headerMeta?.partyB, "을 표기", 200).trim(),
      contractTypeLabel: requireText(raw.headerMeta?.contractTypeLabel, "계약 구분", 100).trim(),
      campaign: requireText(raw.headerMeta?.campaign, "캠페인", 200).trim(),
    },
    terms: terms.map((t, i) => ({
      section: requireText(t?.section, `조건표 ${i + 1}행 항목`, 100).trim(),
      label: requireText(t?.label, `조건표 ${i + 1}행 이름`, 100).trim(),
      value: requireText(t?.value, `조건표 ${i + 1}행 내용`, 1000),
    })),
    company: {
      name: requireText(raw.company?.name, "회사명", 100).trim(),
      ceo: requireText(raw.company?.ceo, "대표자", 100).trim(),
      address: requireText(raw.company?.address, "회사 주소", 300).trim(),
      manager: requireText(raw.company?.manager, "담당자", 100).trim(),
      managerContact: requireText(raw.company?.managerContact, "담당자 연락처", 200).trim(),
    },
  };
}

// ============================================================
// 양식 (기본값은 코드에 — DB 행이 있으면 편집본이 우선)
// ============================================================
export async function getTemplate(key: TemplateKey): Promise<TemplateContent> {
  const { supabase } = await getSessionUser();
  if (!isTemplateKey(key)) throw new Error("계약 유형이 잘못되었습니다.");

  const { data, error } = await supabase
    .from("influencer_contract_templates")
    .select("content")
    .eq("template_key", key)
    .maybeSingle();
  if (error) throw new Error(`양식을 불러오지 못했습니다: ${error.message}`);
  return data ? (data.content as TemplateContent) : DEFAULT_TEMPLATES[key];
}

export async function saveTemplate(key: TemplateKey, content: TemplateContent): Promise<void> {
  const { supabase, userId } = await getSessionUser();
  if (!isTemplateKey(key)) throw new Error("계약 유형이 잘못되었습니다.");
  const valid = validateTemplateContent(content);

  const { data: existing, error: findErr } = await supabase
    .from("influencer_contract_templates")
    .select("id")
    .eq("template_key", key)
    .maybeSingle();
  if (findErr) throw new Error(`양식 확인에 실패했습니다: ${findErr.message}`);

  if (existing) {
    const { error } = await supabase
      .from("influencer_contract_templates")
      .update({ content: valid, updated_by: userId })
      .eq("id", existing.id);
    if (error) throw new Error(`양식 저장에 실패했습니다: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("influencer_contract_templates")
      .insert({ template_key: key, content: valid, updated_by: userId });
    if (error) throw new Error(`양식 저장에 실패했습니다: ${error.message}`);
  }
  revalidatePath(`${CONTRACTS_PATH}/templates`);
}

// ============================================================
// 계약서 문서
// ============================================================
export async function getContractDocuments(contractId: string): Promise<ContractDocument[]> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(contractId)) throw new Error("계약 정보가 잘못되었습니다.");

  const { data, error } = await supabase
    .from("influencer_contract_documents")
    .select(DOC_COLUMNS)
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`계약서 목록을 불러오지 못했습니다: ${error.message}`);
  return (data ?? []) as unknown as ContractDocument[];
}

/**
 * 계약서 생성 — 계약 유형에 맞는 양식 + 현재 계약 데이터로 초안(draft)을 만든다.
 * 기존 초안이 있으면 새 초안으로 대체(취소)한다 — 유효한 초안은 계약당 1부.
 */
export async function createDocument(contractId: string): Promise<ContractDocument> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(contractId)) throw new Error("계약 정보가 잘못되었습니다.");

  const { data: contract, error: findErr } = await supabase
    .from("influencer_contracts")
    .select("*")
    .eq("id", contractId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (findErr) throw new Error(`계약 확인에 실패했습니다: ${findErr.message}`);
  if (!contract) throw new Error("계약을 찾을 수 없습니다.");

  const row = contract as unknown as InfluencerContract;
  const key: TemplateKey = row.collab_type === "paid" ? "paid" : "seeding";
  const template = await getTemplate(key);
  const content = buildDocContent(row, template, key);

  // 이전 초안은 자동 취소 — 최신 계약 데이터로 다시 만든 초안이 항상 하나만 남는다
  await supabase
    .from("influencer_contract_documents")
    .update({ status: "canceled" })
    .eq("contract_id", contractId)
    .eq("status", "draft");

  const { data, error } = await supabase
    .from("influencer_contract_documents")
    .insert({ contract_id: contractId, template_key: key, content, created_by: userId })
    .select(DOC_COLUMNS)
    .single();
  if (error) throw new Error(`계약서 생성에 실패했습니다: ${error.message}`);
  revalidatePath(CONTRACTS_PATH);
  return data as unknown as ContractDocument;
}

/** 초안 내용 수정 — draft 상태에서만. 보낸 문서(sent/signed)는 무결성을 위해 잠근다. */
export async function updateDocumentContent(docId: string, content: DocContent): Promise<void> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");
  const valid = validateDocContent(content);

  const { data, error } = await supabase
    .from("influencer_contract_documents")
    .update({ content: valid })
    .eq("id", docId)
    .eq("status", "draft")
    .select("id");
  if (error) throw new Error(`계약서 저장에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("이미 발송된 계약서는 수정할 수 없어요. 발송을 취소하고 새로 만들어주세요.");
  }
  revalidatePath(CONTRACTS_PATH);
}

/**
 * 서명 링크 발송 준비 — draft → sent, 토큰(256bit) 생성.
 * 같은 계약의 기존 sent 문서는 자동 취소(동시에 유효한 링크는 1개).
 * 링크 전달(DM/카톡)은 운영자가 직접 한다. 반환된 token 으로 화면이 링크를 조립한다.
 */
export async function sendDocument(
  docId: string,
): Promise<{ token: string; expiresAt: string }> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data: doc, error: findErr } = await supabase
    .from("influencer_contract_documents")
    .select("id, contract_id, status")
    .eq("id", docId)
    .maybeSingle();
  if (findErr) throw new Error(`계약서 확인에 실패했습니다: ${findErr.message}`);
  if (!doc) throw new Error("계약서를 찾을 수 없습니다.");
  if (doc.status !== "draft") throw new Error("초안 상태의 계약서만 발송할 수 있어요.");

  // 기존에 보낸 링크가 있으면 무효화
  await supabase
    .from("influencer_contract_documents")
    .update({ status: "canceled", sign_token: null })
    .eq("contract_id", doc.contract_id)
    .eq("status", "sent");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SIGN_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("influencer_contract_documents")
    .update({
      status: "sent",
      sign_token: token,
      token_expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })
    .eq("id", docId)
    .eq("status", "draft");
  if (error) throw new Error(`발송 처리에 실패했습니다: ${error.message}`);

  // 계약 상태가 아직 "계약 발송" 전이면 자동으로 전진시킨다 (연동 후처리 포함)
  const { data: updated } = await supabase
    .from("influencer_contracts")
    .update({ contract_status: "contract_sent" })
    .eq("id", doc.contract_id)
    .eq("is_deleted", false)
    .in(
      "contract_status",
      CONTRACT_STATUS_ORDER.slice(0, CONTRACT_STATUS_ORDER.indexOf("contract_sent")),
    )
    .select(LINK_COLUMNS)
    .maybeSingle();
  if (updated) {
    await finishContractSave(supabase, userId, updated as unknown as ContractLinkRow);
  }

  revalidatePath(CONTRACTS_PATH);
  return { token, expiresAt };
}

/** 발송 취소 / 초안 폐기 — 서명 완료본은 취소할 수 없다(증거 보존) */
export async function cancelDocument(docId: string): Promise<void> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data, error } = await supabase
    .from("influencer_contract_documents")
    .update({ status: "canceled", sign_token: null })
    .eq("id", docId)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error) throw new Error(`취소에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) throw new Error("취소할 수 있는 상태가 아니에요.");
  revalidatePath(CONTRACTS_PATH);
}

/** 취소된 문서 내용 그대로 새 초안 복제 — "취소하고 고쳐서 재발송" 흐름용 */
export async function duplicateDocument(docId: string): Promise<ContractDocument> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data: doc, error: findErr } = await supabase
    .from("influencer_contract_documents")
    .select("contract_id, template_key, content")
    .eq("id", docId)
    .maybeSingle();
  if (findErr) throw new Error(`계약서 확인에 실패했습니다: ${findErr.message}`);
  if (!doc) throw new Error("계약서를 찾을 수 없습니다.");

  await supabase
    .from("influencer_contract_documents")
    .update({ status: "canceled" })
    .eq("contract_id", doc.contract_id)
    .eq("status", "draft");

  const { data, error } = await supabase
    .from("influencer_contract_documents")
    .insert({
      contract_id: doc.contract_id,
      template_key: doc.template_key,
      content: doc.content,
      created_by: userId,
    })
    .select(DOC_COLUMNS)
    .single();
  if (error) throw new Error(`복제에 실패했습니다: ${error.message}`);
  revalidatePath(CONTRACTS_PATH);
  return data as unknown as ContractDocument;
}

/** 서명 완료 PDF 열람용 임시 링크(120초) — 승인된 직원용 */
export async function getSignedPdfUrl(docId: string): Promise<string | null> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data, error } = await supabase
    .from("influencer_contract_documents")
    .select("signed_pdf_path")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw new Error(`계약서 확인에 실패했습니다: ${error.message}`);
  const path = data?.signed_pdf_path as string | null;
  if (!path) return null;

  const { data: signed, error: signErr } = await supabase.storage
    .from(CONTRACT_DOCS_BUCKET)
    .createSignedUrl(path, 120);
  if (signErr) throw new Error(`파일 주소를 만들지 못했습니다: ${signErr.message}`);
  return signed?.signedUrl ?? null;
}
