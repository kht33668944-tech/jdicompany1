"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/auth";
import { encryptSecret, decryptSecret, signUnlock, verifyUnlockToken } from "./crypto";
import { VAULT_BUCKET, VAULT_UNLOCK_COOKIE, VAULT_UNLOCK_TTL_SEC } from "./constants";
import { getDocumentVersions, getProfileNameMap } from "./queries";
import type {
  AccountInput,
  DocumentMetaInput,
  UploadedFileMeta,
  VaultAccount,
  VaultDocumentVersion,
  AccountSecretHistoryItem,
} from "./types";

async function requireAuth() {
  const auth = await getAuthUser();
  if (!auth) throw new Error("로그인이 필요합니다.");
  return auth;
}

function requireAdmin(role: string) {
  if (role !== "admin") throw new Error("관리자만 할 수 있는 작업입니다.");
}

/** 계정 탭 잠금 해제 상태 확인. 미해제면 throw. */
async function requireUnlock(userId: string) {
  const store = await cookies();
  const token = store.get(VAULT_UNLOCK_COOKIE)?.value;
  if (!verifyUnlockToken(token, userId)) {
    throw new Error("잠금이 필요합니다. 2차 비밀번호를 입력해주세요.");
  }
}

// ============================================================
// 법인(폴더)
// ============================================================
export async function createCorporation(name: string) {
  const { supabase, user } = await requireAuth();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("법인 이름을 입력해주세요.");
  const { error } = await supabase
    .from("vault_corporations")
    .insert({ name: trimmed, created_by: user.id });
  if (error) throw new Error(`법인 추가에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/vault");
}

export async function renameCorporation(id: string, name: string) {
  const { supabase } = await requireAuth();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("법인 이름을 입력해주세요.");
  const { error } = await supabase.from("vault_corporations").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(`법인 이름 변경에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/vault");
}

export async function deleteCorporation(id: string) {
  const { supabase, profile } = await requireAuth();
  requireAdmin(profile.role);
  // 법인에 남은 서류가 있으면 삭제 막기(실수 방지)
  const { count, error: cErr } = await supabase
    .from("vault_documents")
    .select("id", { count: "exact", head: true })
    .eq("corporation_id", id);
  if (cErr) throw new Error(`법인 확인에 실패했습니다: ${cErr.message}`);
  if ((count ?? 0) > 0) throw new Error("이 법인에 서류가 남아 있어 삭제할 수 없습니다. 서류를 먼저 정리해주세요.");
  const { error } = await supabase.from("vault_corporations").delete().eq("id", id);
  if (error) throw new Error(`법인 삭제에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/vault");
}

// ============================================================
// 서류
// ============================================================
export async function createDocument(meta: DocumentMetaInput, file: UploadedFileMeta): Promise<string> {
  const { supabase, user } = await requireAuth();
  const title = meta.title.trim();
  if (!title) throw new Error("서류 제목을 입력해주세요.");
  if (!meta.corporationId) throw new Error("법인을 선택해주세요.");

  const { data: doc, error: docErr } = await supabase
    .from("vault_documents")
    .insert({
      corporation_id: meta.corporationId,
      title,
      category: meta.category?.trim() || null,
      note: meta.note?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (docErr) throw new Error(`서류 저장에 실패했습니다: ${docErr.message}`);

  const { error: verErr } = await supabase.from("vault_document_versions").insert({
    document_id: doc.id,
    storage_path: file.storagePath,
    file_name: file.fileName,
    file_size: file.fileSize,
    mime_type: file.mimeType,
    version_no: 1,
    is_current: true,
    uploaded_by: user.id,
  });
  if (verErr) {
    // 버전 기록 실패 시 방금 만든 서류행 정리
    await supabase.from("vault_documents").delete().eq("id", doc.id);
    throw new Error(`서류 파일 기록에 실패했습니다: ${verErr.message}`);
  }
  revalidatePath("/dashboard/vault");
  return doc.id as string;
}

/** 파일 갈아끼우기 = 새 버전을 현재로, 이전은 이력으로 보관 */
export async function replaceDocument(documentId: string, file: UploadedFileMeta) {
  const { supabase, user } = await requireAuth();

  const { data: versions, error: vErr } = await supabase
    .from("vault_document_versions")
    .select("id, version_no")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false });
  if (vErr) throw new Error(`서류 조회에 실패했습니다: ${vErr.message}`);
  const nextNo = (versions?.[0]?.version_no ?? 0) + 1;

  // 기존 버전 전부 현재 해제
  const { error: clearErr } = await supabase
    .from("vault_document_versions")
    .update({ is_current: false })
    .eq("document_id", documentId);
  if (clearErr) throw new Error(`서류 최신화에 실패했습니다: ${clearErr.message}`);

  const { error: insErr } = await supabase.from("vault_document_versions").insert({
    document_id: documentId,
    storage_path: file.storagePath,
    file_name: file.fileName,
    file_size: file.fileSize,
    mime_type: file.mimeType,
    version_no: nextNo,
    is_current: true,
    uploaded_by: user.id,
  });
  if (insErr) throw new Error(`서류 최신화에 실패했습니다: ${insErr.message}`);

  await supabase.from("vault_documents").update({ updated_at: new Date().toISOString() }).eq("id", documentId);
  revalidatePath("/dashboard/vault");
}

export async function updateDocumentMeta(documentId: string, meta: Omit<DocumentMetaInput, "corporationId">) {
  const { supabase } = await requireAuth();
  const title = meta.title.trim();
  if (!title) throw new Error("서류 제목을 입력해주세요.");
  const { error } = await supabase
    .from("vault_documents")
    .update({
      title,
      category: meta.category?.trim() || null,
      note: meta.note?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) throw new Error(`서류 수정에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/vault");
}

/** 특정 이전 버전을 다시 현재로 되돌리기 */
export async function revertVersion(documentId: string, versionId: string) {
  const { supabase } = await requireAuth();
  const { error: clearErr } = await supabase
    .from("vault_document_versions")
    .update({ is_current: false })
    .eq("document_id", documentId);
  if (clearErr) throw new Error(`되돌리기에 실패했습니다: ${clearErr.message}`);
  const { error } = await supabase
    .from("vault_document_versions")
    .update({ is_current: true })
    .eq("id", versionId);
  if (error) throw new Error(`되돌리기에 실패했습니다: ${error.message}`);
  await supabase.from("vault_documents").update({ updated_at: new Date().toISOString() }).eq("id", documentId);
  revalidatePath("/dashboard/vault");
}

export async function listDocumentVersions(documentId: string): Promise<VaultDocumentVersion[]> {
  const { supabase } = await requireAuth();
  return getDocumentVersions(supabase, documentId);
}

export async function deleteDocument(documentId: string) {
  const { supabase, profile } = await requireAuth();
  requireAdmin(profile.role);
  const { data: versions, error: vErr } = await supabase
    .from("vault_document_versions")
    .select("storage_path")
    .eq("document_id", documentId);
  if (vErr) throw new Error(`서류 조회에 실패했습니다: ${vErr.message}`);

  const paths = (versions ?? []).map((v) => v.storage_path as string).filter(Boolean);
  if (paths.length > 0) {
    await supabase.storage.from(VAULT_BUCKET).remove(paths).catch(() => {});
  }
  const { error } = await supabase.from("vault_documents").delete().eq("id", documentId);
  if (error) throw new Error(`서류 삭제에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/vault");
}

// ============================================================
// 2차 비밀번호 게이트
// ============================================================
export async function unlockVault(password: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireAuth();
  const { data, error } = await supabase.rpc("verify_vault_gate", { p_password: password });
  if (error) throw new Error(`잠금 해제에 실패했습니다: ${error.message}`);
  if (data !== true) return { ok: false };

  const expEpochSec = Math.floor(Date.now() / 1000) + VAULT_UNLOCK_TTL_SEC;
  const token = signUnlock(user.id, expEpochSec);
  const store = await cookies();
  store.set(VAULT_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: VAULT_UNLOCK_TTL_SEC,
  });
  return { ok: true };
}

export async function lockVault() {
  const store = await cookies();
  store.delete(VAULT_UNLOCK_COOKIE);
}

export async function setGatePassword(password: string) {
  const { supabase, profile } = await requireAuth();
  requireAdmin(profile.role);
  if (!password || password.trim().length < 4) throw new Error("2차 비밀번호는 4자 이상이어야 합니다.");
  const { error } = await supabase.rpc("set_vault_gate", { p_password: password });
  if (error) throw new Error(`2차 비밀번호 설정에 실패했습니다: ${error.message}`);
  revalidatePath("/dashboard/vault");
}

// ============================================================
// 계정 (모두 잠금 해제 필요)
// ============================================================
export async function listAccounts(): Promise<VaultAccount[]> {
  const { supabase, user } = await requireAuth();
  await requireUnlock(user.id);

  const [accRes, histRes] = await Promise.all([
    supabase
      .from("vault_accounts")
      .select("id, service_name, username, url, note, tags, password_enc, secondary_enc, updated_at")
      .order("service_name", { ascending: true }),
    supabase.from("vault_account_secret_history").select("account_id"),
  ]);
  if (accRes.error) throw new Error(`계정을 불러오지 못했습니다: ${accRes.error.message}`);
  if (histRes.error) throw new Error(`계정을 불러오지 못했습니다: ${histRes.error.message}`);

  const histCount = new Map<string, number>();
  for (const h of histRes.data ?? []) {
    const key = h.account_id as string;
    histCount.set(key, (histCount.get(key) ?? 0) + 1);
  }

  return (accRes.data ?? []).map((a): VaultAccount => ({
    id: a.id,
    service_name: a.service_name,
    username: a.username,
    url: a.url,
    note: a.note,
    tags: (a.tags as string[]) ?? [],
    password: decryptSecret(a.password_enc),
    secondary: decryptSecret(a.secondary_enc),
    updated_at: a.updated_at,
    history_count: histCount.get(a.id as string) ?? 0,
  }));
}

export async function createAccount(input: AccountInput) {
  const { supabase, user } = await requireAuth();
  await requireUnlock(user.id);
  const service = input.service_name.trim();
  if (!service) throw new Error("서비스명을 입력해주세요.");
  const { error } = await supabase.from("vault_accounts").insert({
    service_name: service,
    username: input.username.trim() || null,
    url: input.url.trim() || null,
    note: input.note.trim() || null,
    tags: input.tags.map((t) => t.trim()).filter(Boolean),
    password_enc: encryptSecret(input.password),
    secondary_enc: encryptSecret(input.secondary),
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) throw new Error(`계정 추가에 실패했습니다: ${error.message}`);
}

export async function updateAccount(id: string, input: AccountInput) {
  const { supabase, user } = await requireAuth();
  await requireUnlock(user.id);
  const service = input.service_name.trim();
  if (!service) throw new Error("서비스명을 입력해주세요.");

  const { data: prev, error: prevErr } = await supabase
    .from("vault_accounts")
    .select("password_enc, secondary_enc")
    .eq("id", id)
    .single();
  if (prevErr) throw new Error(`계정 조회에 실패했습니다: ${prevErr.message}`);

  // 비밀번호/2차 비밀번호가 실제로 바뀌면 옛 값을 이력으로 보관
  const prevPassword = decryptSecret(prev?.password_enc ?? null);
  const prevSecondary = decryptSecret(prev?.secondary_enc ?? null);
  const historyRows: { account_id: string; field: string; old_value_enc: string; changed_by: string }[] = [];
  if (prevPassword && prevPassword !== input.password) {
    historyRows.push({ account_id: id, field: "password", old_value_enc: prev!.password_enc as string, changed_by: user.id });
  }
  if (prevSecondary && prevSecondary !== input.secondary) {
    historyRows.push({ account_id: id, field: "secondary", old_value_enc: prev!.secondary_enc as string, changed_by: user.id });
  }

  const { error } = await supabase
    .from("vault_accounts")
    .update({
      service_name: service,
      username: input.username.trim() || null,
      url: input.url.trim() || null,
      note: input.note.trim() || null,
      tags: input.tags.map((t) => t.trim()).filter(Boolean),
      password_enc: encryptSecret(input.password),
      secondary_enc: encryptSecret(input.secondary),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(`계정 수정에 실패했습니다: ${error.message}`);

  if (historyRows.length > 0) {
    await supabase.from("vault_account_secret_history").insert(historyRows);
  }
}

export async function deleteAccount(id: string) {
  const { supabase, user } = await requireAuth();
  await requireUnlock(user.id);
  const { error } = await supabase.from("vault_accounts").delete().eq("id", id);
  if (error) throw new Error(`계정 삭제에 실패했습니다: ${error.message}`);
}

export async function getAccountHistory(accountId: string): Promise<AccountSecretHistoryItem[]> {
  const { supabase, user } = await requireAuth();
  await requireUnlock(user.id);

  const [histRes, nameMap] = await Promise.all([
    supabase
      .from("vault_account_secret_history")
      .select("id, field, old_value_enc, changed_by, changed_at")
      .eq("account_id", accountId)
      .order("changed_at", { ascending: false }),
    getProfileNameMap(supabase),
  ]);
  if (histRes.error) throw new Error(`이력을 불러오지 못했습니다: ${histRes.error.message}`);

  return (histRes.data ?? []).map((h): AccountSecretHistoryItem => ({
    id: h.id,
    field: h.field as "password" | "secondary",
    value: decryptSecret(h.old_value_enc),
    changed_by_name: h.changed_by ? nameMap.get(h.changed_by) ?? null : null,
    changed_at: h.changed_at,
  }));
}
