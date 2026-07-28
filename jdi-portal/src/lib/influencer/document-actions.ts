"use server";

// 인플루언서 서류(계약서·신분증 사본·통장 사본) 서버 액션
//
// 민감 서류(id_card/bankbook)는 생성·열람·삭제 전에 2차 비밀번호 잠금을 확인한다.
// 쿠키 확인(requireUnlock)은 1차 방어이고, 실제 강제는 마이그 111 의
// Storage RLS 정책(has_vault_unlock())이 한다.

import { revalidatePath } from "next/cache";
import { getAuthUser } from "@/lib/supabase/auth";
import { requireUnlock } from "@/lib/vault/gate";
import type { UploadedFileMeta } from "@/lib/vault/types";
import { SENSITIVE_KINDS, type DocumentKind } from "./contact-types";

const BUCKET = "influencer-documents";
/** 다운로드 링크 유효시간(초). 짧게 둬서 링크가 돌아다니지 않게 한다. */
const SIGNED_URL_TTL_SEC = 60;

async function requireAuth() {
  const auth = await getAuthUser();
  if (!auth) throw new Error("로그인이 필요합니다.");
  return auth;
}

function isSensitiveKind(kind: DocumentKind): boolean {
  return SENSITIVE_KINDS.includes(kind);
}

export async function createInfluencerDocument(
  input: { influencerId: string; kind: DocumentKind; title: string; note?: string },
  file: UploadedFileMeta
): Promise<string> {
  const { supabase, user } = await requireAuth();
  const title = input.title.trim();
  if (!title) throw new Error("서류 제목을 입력해주세요.");
  if (!input.influencerId) throw new Error("인플루언서를 찾을 수 없습니다.");
  if (isSensitiveKind(input.kind)) await requireUnlock(user.id);

  const { data: doc, error: docErr } = await supabase
    .from("influencer_documents")
    .insert({
      influencer_id: input.influencerId,
      kind: input.kind,
      title,
      note: input.note?.trim() || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (docErr) throw new Error(`서류 저장에 실패했습니다: ${docErr.message}`);

  const { error: verErr } = await supabase.from("influencer_document_versions").insert({
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
    // 버전 기록에 실패하면 방금 만든 서류행을 정리한다(빈 서류가 남지 않게).
    await supabase.from("influencer_documents").delete().eq("id", doc.id);
    throw new Error(`서류 파일 기록에 실패했습니다: ${verErr.message}`);
  }

  revalidatePath("/dashboard/influencer");
  return doc.id as string;
}

/** 파일 갈아끼우기 — 새 버전을 현재로, 이전 버전은 이력으로 남긴다. */
export async function addDocumentVersion(
  documentId: string,
  file: UploadedFileMeta
): Promise<void> {
  const { supabase, user } = await requireAuth();

  const { data: doc, error: docErr } = await supabase
    .from("influencer_documents")
    .select("id, is_sensitive")
    .eq("id", documentId)
    .single();
  if (docErr) throw new Error(`서류를 찾지 못했습니다: ${docErr.message}`);
  if (doc.is_sensitive) await requireUnlock(user.id);

  const { data: versions, error: vErr } = await supabase
    .from("influencer_document_versions")
    .select("version_no")
    .eq("document_id", documentId)
    .order("version_no", { ascending: false })
    .limit(1);
  if (vErr) throw new Error(`서류 이력을 읽지 못했습니다: ${vErr.message}`);

  const nextNo = (versions?.[0]?.version_no ?? 0) + 1;

  const { error: demoteErr } = await supabase
    .from("influencer_document_versions")
    .update({ is_current: false })
    .eq("document_id", documentId);
  if (demoteErr) throw new Error(`서류 이력 갱신에 실패했습니다: ${demoteErr.message}`);

  const { error: insErr } = await supabase.from("influencer_document_versions").insert({
    document_id: documentId,
    storage_path: file.storagePath,
    file_name: file.fileName,
    file_size: file.fileSize,
    mime_type: file.mimeType,
    version_no: nextNo,
    is_current: true,
    uploaded_by: user.id,
  });
  if (insErr) throw new Error(`새 버전 저장에 실패했습니다: ${insErr.message}`);

  revalidatePath("/dashboard/influencer");
}

/** 짧게 유효한 서명 URL 만 내준다. 저장 경로는 클라이언트에 노출하지 않는다. */
export async function getDocumentDownloadUrl(versionId: string): Promise<string> {
  const { supabase, user } = await requireAuth();

  const { data: version, error } = await supabase
    .from("influencer_document_versions")
    .select("storage_path, influencer_documents!inner(is_sensitive)")
    .eq("id", versionId)
    .single();
  if (error) throw new Error(`서류를 찾지 못했습니다: ${error.message}`);

  const parent = version.influencer_documents as unknown as { is_sensitive: boolean };
  if (parent?.is_sensitive) await requireUnlock(user.id);

  const { data, error: urlErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(version.storage_path, SIGNED_URL_TTL_SEC);
  if (urlErr) throw new Error(`파일 주소를 만들지 못했습니다: ${urlErr.message}`);
  if (!data?.signedUrl) throw new Error("파일 주소를 만들지 못했습니다.");

  return data.signedUrl;
}

export async function deleteInfluencerDocument(documentId: string): Promise<void> {
  const { supabase, user } = await requireAuth();

  const { data: doc, error: docErr } = await supabase
    .from("influencer_documents")
    .select("id, is_sensitive")
    .eq("id", documentId)
    .single();
  if (docErr) throw new Error(`서류를 찾지 못했습니다: ${docErr.message}`);
  if (doc.is_sensitive) await requireUnlock(user.id);

  const { data: versions, error: vErr } = await supabase
    .from("influencer_document_versions")
    .select("storage_path")
    .eq("document_id", documentId);
  if (vErr) throw new Error(`서류 이력을 읽지 못했습니다: ${vErr.message}`);

  // RLS 로 막히면 오류 없이 0건이 지워진다. 지워졌는지 확인해야 거짓 성공을 막는다.
  const { data: deleted, error: delErr } = await supabase
    .from("influencer_documents")
    .delete()
    .eq("id", documentId)
    .select("id");
  if (delErr) throw new Error(`서류 삭제에 실패했습니다: ${delErr.message}`);
  if (!deleted || deleted.length === 0) {
    throw new Error("서류를 삭제할 권한이 없습니다. 관리자에게 요청해주세요.");
  }

  // Storage 파일은 정리 큐에 맡긴다. 여기서 실패해도 DB 삭제를 되돌리지 않는다.
  const paths = (versions ?? []).map((v) => ({ path: v.storage_path as string }));
  if (paths.length > 0) {
    await supabase.from("influencer_document_cleanup_queue").insert(paths);
  }

  revalidatePath("/dashboard/influencer");
}
