"use server";

// 계약관리(범용 계약서) 서버 액션 — 직원용. 공개 서명 흐름은 /api/sign/c 라우트(signService)가 담당.
// 오류는 throw new Error("한국어 문구") 관례 (호출부 getErrorMessage).
// TMA(documents/actions.ts)와 병렬 구조 — 그쪽 파일은 수정하지 않는다.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireVaultUnlock } from "@/lib/vault/unlock";
import {
  COMPANY_CONTRACT_DOCS_BUCKET,
  COMPANY_CONTRACTS_PATH,
  SIGN_TOKEN_DAYS,
  TERMS_MARKER,
  UUID_RE,
  createEmptyContent,
} from "./constants";
import { collectFieldKeys } from "./tokens";
import type {
  CompanyContractDocument,
  CompanyTemplateRow,
  CompanyVaultRow,
  ContentV2,
  CounterpartyKind,
  FieldDef,
  FieldType,
} from "./types";

// content 는 목록에서 빼고(용량), 편집 열람 시에만 가져온다. signer_fields_enc 는 어디서도 select 하지 않는다.
const LIST_COLUMNS =
  "id, template_id, title, counterparty_name, counterparty_company, counterparty_kind, status, " +
  "sign_token, token_expires_at, sent_at, viewed_at, signed_at, signer_name, signed_pdf_path, " +
  "pdf_sha256, created_by, created_at, updated_at";
const DOC_COLUMNS = `${LIST_COLUMNS}, content`;

const FIELD_TYPES: FieldType[] = [
  "text",
  "multiline",
  "number",
  "date",
  "phone",
  "email",
  "account",
  "bank",
];
const FIELD_KEY_RE = /^f\d+$/;

async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: session.user.id };
}

// ============================================================
// 본문 검증 — 클라이언트가 보낸 편집 내용을 그대로 믿지 않는다
// ============================================================
function requireText(value: unknown, label: string, maxLen: number): string {
  if (typeof value !== "string") throw new Error(`${label} 형식이 잘못되었습니다.`);
  if (value.length > maxLen) throw new Error(`${label}이(가) 너무 깁니다.`);
  return value;
}

function validateContentV2(raw: ContentV2): ContentV2 {
  const clauses = Array.isArray(raw.clauses) ? raw.clauses : null;
  if (!clauses || clauses.length === 0 || clauses.length > 60) {
    throw new Error("조항 목록이 잘못되었습니다.");
  }
  const validClauses = clauses.map((c, i) => ({
    heading: requireText(c?.heading, `${i + 1}번째 조항 제목`, 200).trim(),
    body: requireText(c?.body, `${i + 1}번째 조항 본문`, 8000),
  }));

  const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
  if (rawFields.length > 40) throw new Error("채움 칸은 40개까지 만들 수 있어요.");
  const seenKeys = new Set<string>();
  const validFields: FieldDef[] = rawFields.map((f, i) => {
    const key = requireText(f?.key, `${i + 1}번째 채움 칸 key`, 10).trim();
    if (!FIELD_KEY_RE.test(key)) throw new Error("채움 칸 key 형식이 잘못되었습니다.");
    if (seenKeys.has(key)) throw new Error("채움 칸 key 가 중복되었습니다.");
    seenKeys.add(key);
    const kind = f?.kind === "party" ? "party" : "staff";
    const type = FIELD_TYPES.includes(f?.type as FieldType) ? (f.type as FieldType) : "text";
    const label = requireText(f?.label, `${i + 1}번째 채움 칸 이름`, 100).trim();
    if (!label) throw new Error(`${i + 1}번째 채움 칸의 이름을 입력해주세요.`);
    return {
      key,
      kind,
      label,
      type,
      required: f?.required !== false,
      // 상대방 입력값은 본문 스냅샷에 절대 저장하지 않는다(개인정보) — staff 값만 유지
      ...(kind === "staff"
        ? { value: requireText(f?.value ?? "", `채움 칸 「${label}」 값`, 1000) }
        : {}),
    };
  });

  const validated: ContentV2 = {
    version: 2,
    title: requireText(raw.title, "제목", 200).trim(),
    intro: requireText(raw.intro, "서문", 4000),
    clauses: validClauses,
    fields: validFields,
    company: {
      name: requireText(raw.company?.name, "회사명", 100).trim(),
      ceo: requireText(raw.company?.ceo, "대표자", 100).trim(),
      address: requireText(raw.company?.address, "회사 주소", 300).trim(),
      manager: requireText(raw.company?.manager, "담당자", 100).trim(),
      managerContact: requireText(raw.company?.managerContact, "담당자 연락처", 200).trim(),
    },
    closing: requireText(raw.closing, "맺음말", 1000),
    footnote: requireText(raw.footnote, "하단 문구", 1000),
  };

  // 조건표: 있으면 자리({{TERMS}}) 조항이 있어야 하고, 자리만 있고 내용이 없으면 안내
  const hasTermsClause = validClauses.some((c) => c.body.trim() === TERMS_MARKER);
  const terms = Array.isArray(raw.terms) ? raw.terms : [];
  if (terms.length > 80) throw new Error("조건표는 80행까지 가능해요.");
  if (terms.length > 0) {
    if (!hasTermsClause) {
      throw new Error("조건표 내용이 있는데 조건표 자리({{TERMS}}) 조항이 없어요.");
    }
    validated.terms = terms.map((t, i) => ({
      section: requireText(t?.section, `조건표 ${i + 1}행 항목`, 100).trim(),
      label: requireText(t?.label, `조건표 ${i + 1}행 이름`, 100).trim(),
      value: requireText(t?.value, `조건표 ${i + 1}행 내용`, 1000),
    }));
  } else if (hasTermsClause) {
    throw new Error("조건표 자리 조항이 있는데 조건표 내용이 비어 있어요. 행을 추가해주세요.");
  }

  // 본문에 심어진 토큰은 전부 정의된 채움 칸이어야 한다
  for (const key of collectFieldKeys(validated)) {
    if (!seenKeys.has(key)) {
      throw new Error(`본문에 있는 채움 칸 {{${key}}} 의 정의가 없어요. 필드를 확인해주세요.`);
    }
  }
  return validated;
}

function validateCounterpartyKind(kind: string): CounterpartyKind {
  return kind === "corp" ? "corp" : "individual";
}

// ============================================================
// 양식 (무제한)
// ============================================================
export async function listCompanyTemplates(): Promise<CompanyTemplateRow[]> {
  const { supabase } = await getSessionUser();
  const { data, error } = await supabase
    .from("company_contract_templates")
    .select("id, title, content, created_at, updated_at")
    .eq("is_deleted", false)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`양식 목록을 불러오지 못했습니다: ${error.message}`);
  return (data ?? []) as unknown as CompanyTemplateRow[];
}

export async function createCompanyTemplate(
  title: string,
  content: ContentV2,
): Promise<CompanyTemplateRow> {
  const { supabase, userId } = await getSessionUser();
  const validTitle = requireText(title, "양식 이름", 200).trim();
  if (!validTitle) throw new Error("양식 이름을 입력해주세요.");
  const valid = validateContentV2(content);

  const { data, error } = await supabase
    .from("company_contract_templates")
    .insert({ title: validTitle, content: valid, created_by: userId, updated_by: userId })
    .select("id, title, content, created_at, updated_at")
    .single();
  if (error) throw new Error(`양식 저장에 실패했습니다: ${error.message}`);
  revalidatePath(`${COMPANY_CONTRACTS_PATH}/templates`);
  return data as unknown as CompanyTemplateRow;
}

export async function updateCompanyTemplate(
  id: string,
  title: string,
  content: ContentV2,
): Promise<void> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(id)) throw new Error("양식 정보가 잘못되었습니다.");
  const validTitle = requireText(title, "양식 이름", 200).trim();
  if (!validTitle) throw new Error("양식 이름을 입력해주세요.");
  const valid = validateContentV2(content);

  const { data, error } = await supabase
    .from("company_contract_templates")
    .update({ title: validTitle, content: valid, updated_by: userId })
    .eq("id", id)
    .eq("is_deleted", false)
    .select("id");
  if (error) throw new Error(`양식 저장에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) throw new Error("양식을 찾을 수 없습니다.");
  revalidatePath(`${COMPANY_CONTRACTS_PATH}/templates`);
}

/** 양식 삭제 — 소프트 삭제(기존 계약서 문서는 스냅샷이라 영향 없음) */
export async function deleteCompanyTemplate(id: string): Promise<void> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(id)) throw new Error("양식 정보가 잘못되었습니다.");
  const { error } = await supabase
    .from("company_contract_templates")
    .update({ is_deleted: true, updated_by: userId })
    .eq("id", id);
  if (error) throw new Error(`양식 삭제에 실패했습니다: ${error.message}`);
  revalidatePath(`${COMPANY_CONTRACTS_PATH}/templates`);
}

export async function duplicateCompanyTemplate(id: string): Promise<CompanyTemplateRow> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(id)) throw new Error("양식 정보가 잘못되었습니다.");

  const { data: origin, error: findErr } = await supabase
    .from("company_contract_templates")
    .select("title, content")
    .eq("id", id)
    .maybeSingle();
  if (findErr) throw new Error(`양식 확인에 실패했습니다: ${findErr.message}`);
  if (!origin) throw new Error("양식을 찾을 수 없습니다.");

  const { data, error } = await supabase
    .from("company_contract_templates")
    .insert({
      title: `${origin.title} (복사)`.slice(0, 200),
      content: origin.content,
      created_by: userId,
      updated_by: userId,
    })
    .select("id, title, content, created_at, updated_at")
    .single();
  if (error) throw new Error(`양식 복제에 실패했습니다: ${error.message}`);
  revalidatePath(`${COMPANY_CONTRACTS_PATH}/templates`);
  return data as unknown as CompanyTemplateRow;
}

// ============================================================
// 계약서 문서
// ============================================================
export async function listCompanyDocuments(): Promise<CompanyContractDocument[]> {
  const { supabase } = await getSessionUser();
  const { data, error } = await supabase
    .from("company_contract_documents")
    .select(LIST_COLUMNS)
    .eq("is_deleted", false)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`계약서 목록을 불러오지 못했습니다: ${error.message}`);
  // 목록에는 content 를 싣지 않는다 — 편집/미리보기는 getCompanyDocument 로.
  return (data ?? []) as unknown as CompanyContractDocument[];
}

export async function getCompanyDocument(docId: string): Promise<CompanyContractDocument> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");
  const { data, error } = await supabase
    .from("company_contract_documents")
    .select(DOC_COLUMNS)
    .eq("id", docId)
    .maybeSingle();
  if (error) throw new Error(`계약서를 불러오지 못했습니다: ${error.message}`);
  if (!data) throw new Error("계약서를 찾을 수 없습니다.");
  return data as unknown as CompanyContractDocument;
}

export interface CreateCompanyDocumentInput {
  templateId: string | null; // null 이면 빈 문서
  title: string;
  counterpartyName: string;
  counterpartyCompany: string;
  counterpartyKind: CounterpartyKind;
}

export async function createCompanyDocument(
  input: CreateCompanyDocumentInput,
): Promise<CompanyContractDocument> {
  const { supabase, userId } = await getSessionUser();
  const title = requireText(input.title, "계약서 이름", 200).trim();
  if (!title) throw new Error("계약서 이름을 입력해주세요.");
  const counterpartyName = requireText(input.counterpartyName, "상대방 이름", 200).trim();
  if (!counterpartyName) throw new Error("상대방 이름을 입력해주세요.");
  const counterpartyCompany = requireText(input.counterpartyCompany, "상대방 회사명", 200).trim();
  const kind = validateCounterpartyKind(input.counterpartyKind);

  let content: ContentV2;
  if (input.templateId) {
    if (!UUID_RE.test(input.templateId)) throw new Error("양식 정보가 잘못되었습니다.");
    const { data: template, error: findErr } = await supabase
      .from("company_contract_templates")
      .select("content")
      .eq("id", input.templateId)
      .maybeSingle();
    if (findErr) throw new Error(`양식 확인에 실패했습니다: ${findErr.message}`);
    if (!template) throw new Error("양식을 찾을 수 없습니다.");
    content = template.content as ContentV2; // 스냅샷 — 이후 양식이 바뀌어도 이 문서는 그대로
  } else {
    content = createEmptyContent();
    content.title = title;
  }

  const { data, error } = await supabase
    .from("company_contract_documents")
    .insert({
      template_id: input.templateId,
      title,
      counterparty_name: counterpartyName,
      counterparty_company: counterpartyCompany || null,
      counterparty_kind: kind,
      content,
      created_by: userId,
    })
    .select(DOC_COLUMNS)
    .single();
  if (error) throw new Error(`계약서 생성에 실패했습니다: ${error.message}`);
  revalidatePath(COMPANY_CONTRACTS_PATH);
  return data as unknown as CompanyContractDocument;
}

export interface UpdateCompanyDocumentInput {
  title: string;
  counterpartyName: string;
  counterpartyCompany: string;
  counterpartyKind: CounterpartyKind;
  content: ContentV2;
}

/** 초안 수정 — draft 상태에서만. 보낸 문서(sent/signed)는 무결성을 위해 잠근다. */
export async function updateCompanyDocument(
  docId: string,
  input: UpdateCompanyDocumentInput,
): Promise<void> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");
  const title = requireText(input.title, "계약서 이름", 200).trim();
  if (!title) throw new Error("계약서 이름을 입력해주세요.");
  const counterpartyName = requireText(input.counterpartyName, "상대방 이름", 200).trim();
  if (!counterpartyName) throw new Error("상대방 이름을 입력해주세요.");
  const counterpartyCompany = requireText(input.counterpartyCompany, "상대방 회사명", 200).trim();
  const valid = validateContentV2(input.content);

  const { data, error } = await supabase
    .from("company_contract_documents")
    .update({
      title,
      counterparty_name: counterpartyName,
      counterparty_company: counterpartyCompany || null,
      counterparty_kind: validateCounterpartyKind(input.counterpartyKind),
      content: valid,
    })
    .eq("id", docId)
    .eq("status", "draft")
    .select("id");
  if (error) throw new Error(`계약서 저장에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("이미 발송된 계약서는 수정할 수 없어요. 발송을 취소하고 복제해서 고쳐주세요.");
  }
  revalidatePath(COMPANY_CONTRACTS_PATH);
}

/**
 * 서명 링크 발송 준비 — draft → sent, 토큰(256bit) 생성.
 * 링크 전달(카톡/문자/메일)은 직원이 직접 한다. 반환된 token 으로 화면이 /sign/c/{token} 을 조립한다.
 */
export async function sendCompanyDocument(
  docId: string,
): Promise<{ token: string; expiresAt: string }> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data: doc, error: findErr } = await supabase
    .from("company_contract_documents")
    .select("id, status, content")
    .eq("id", docId)
    .maybeSingle();
  if (findErr) throw new Error(`계약서 확인에 실패했습니다: ${findErr.message}`);
  if (!doc) throw new Error("계약서를 찾을 수 없습니다.");
  if (doc.status !== "draft") throw new Error("초안 상태의 계약서만 발송할 수 있어요.");

  // 직원 채움 칸이 비어 있으면 발송 금지 — 빈칸 있는 계약서가 나가는 사고 방지
  const content = doc.content as ContentV2;
  const emptyStaff = (content.fields ?? []).filter(
    (f) => f.kind === "staff" && !f.value?.trim(),
  );
  if (emptyStaff.length > 0) {
    throw new Error(
      `아직 채우지 않은 칸이 있어요: ${emptyStaff.map((f) => f.label).join(", ")}`,
    );
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SIGN_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("company_contract_documents")
    .update({
      status: "sent",
      sign_token: token,
      token_expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })
    .eq("id", docId)
    .eq("status", "draft")
    .select("id");
  if (error) throw new Error(`발송 처리에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) throw new Error("발송할 수 있는 상태가 아니에요.");

  revalidatePath(COMPANY_CONTRACTS_PATH);
  return { token, expiresAt };
}

/** 발송 취소 / 초안 폐기 — 서명 완료본은 취소할 수 없다(증거 보존) */
export async function cancelCompanyDocument(docId: string): Promise<void> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data, error } = await supabase
    .from("company_contract_documents")
    .update({ status: "canceled", sign_token: null })
    .eq("id", docId)
    .in("status", ["draft", "sent"])
    .select("id");
  if (error) throw new Error(`취소에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) throw new Error("취소할 수 있는 상태가 아니에요.");
  revalidatePath(COMPANY_CONTRACTS_PATH);
}

/** 문서 내용 그대로 새 초안 복제 — "취소하고 고쳐서 재발송" 흐름용 */
export async function duplicateCompanyDocument(docId: string): Promise<CompanyContractDocument> {
  const { supabase, userId } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data: doc, error: findErr } = await supabase
    .from("company_contract_documents")
    .select("template_id, title, counterparty_name, counterparty_company, counterparty_kind, content")
    .eq("id", docId)
    .maybeSingle();
  if (findErr) throw new Error(`계약서 확인에 실패했습니다: ${findErr.message}`);
  if (!doc) throw new Error("계약서를 찾을 수 없습니다.");

  const { data, error } = await supabase
    .from("company_contract_documents")
    .insert({
      template_id: doc.template_id,
      title: doc.title,
      counterparty_name: doc.counterparty_name,
      counterparty_company: doc.counterparty_company,
      counterparty_kind: doc.counterparty_kind,
      content: doc.content,
      created_by: userId,
    })
    .select(DOC_COLUMNS)
    .single();
  if (error) throw new Error(`복제에 실패했습니다: ${error.message}`);
  revalidatePath(COMPANY_CONTRACTS_PATH);
  return data as unknown as CompanyContractDocument;
}

/** 목록에서 숨기기 — 초안·취소본만. 서명 완료본은 증거라 숨길 수 없다. */
export async function hideCompanyDocument(docId: string): Promise<void> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data, error } = await supabase
    .from("company_contract_documents")
    .update({ is_deleted: true })
    .eq("id", docId)
    .in("status", ["draft", "canceled"])
    .select("id");
  if (error) throw new Error(`숨기기에 실패했습니다: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("초안·취소된 계약서만 숨길 수 있어요. 서명 완료본은 보존됩니다.");
  }
  revalidatePath(COMPANY_CONTRACTS_PATH);
}

/** 서명 완료 PDF 열람용 임시 링크(120초) — 승인된 직원용 */
export async function getCompanySignedPdfUrl(docId: string): Promise<string | null> {
  const { supabase } = await getSessionUser();
  if (!UUID_RE.test(docId)) throw new Error("문서 정보가 잘못되었습니다.");

  const { data, error } = await supabase
    .from("company_contract_documents")
    .select("signed_pdf_path")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw new Error(`계약서 확인에 실패했습니다: ${error.message}`);
  const path = data?.signed_pdf_path as string | null;
  if (!path) return null;

  const { data: signed, error: signErr } = await supabase.storage
    .from(COMPANY_CONTRACT_DOCS_BUCKET)
    .createSignedUrl(path, 120);
  if (signErr) throw new Error(`파일 주소를 만들지 못했습니다: ${signErr.message}`);
  return signed?.signedUrl ?? null;
}

/**
 * 보관함 계약서 탭 목록(일반 계약) — 계정 보관함과 같은 2차 비밀번호 잠금을 지나야 한다.
 * (계약서 PDF에는 주소·계좌 등 개인정보가 들어 있다.)
 */
export async function getSignedCompanyContractsForVault(): Promise<CompanyVaultRow[]> {
  const { supabase, userId } = await getSessionUser();
  await requireVaultUnlock(userId);

  const { data, error } = await supabase
    .from("company_contract_documents")
    .select("id, title, counterparty_name, counterparty_company, signer_name, signed_at")
    .eq("status", "signed")
    .order("signed_at", { ascending: false });
  if (error) throw new Error(`계약서 목록을 불러오지 못했습니다: ${error.message}`);

  return (data ?? []).map((row) => ({
    doc_id: row.id as string,
    title: (row.title as string) ?? "",
    counterparty_name: (row.counterparty_name as string) ?? "",
    counterparty_company: (row.counterparty_company as string | null) ?? null,
    signer_name: (row.signer_name as string | null) ?? null,
    signed_at: (row.signed_at as string | null) ?? null,
  }));
}
