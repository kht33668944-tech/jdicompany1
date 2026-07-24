import type { SupabaseClient } from "@supabase/supabase-js";
import type { Corporation, VaultDocument, VaultDocumentVersion } from "./types";

/** 법인(폴더) 목록 */
export async function getCorporations(supabase: SupabaseClient): Promise<Corporation[]> {
  const { data, error } = await supabase
    .from("vault_corporations")
    .select("id, name, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Corporation[];
}

/** id → full_name 매핑 */
async function getProfileNameMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("profiles").select("id, full_name");
  if (error) throw error;
  const map = new Map<string, string>();
  for (const p of data ?? []) map.set(p.id as string, p.full_name as string);
  return map;
}

interface VersionRow {
  id: string;
  document_id: string;
  version_no: number;
  is_current: boolean;
  storage_path: string;
  file_name: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

/** 전체 서류 + 현재 버전 요약. 클라이언트에서 법인/검색 필터링. */
export async function getDocuments(supabase: SupabaseClient): Promise<VaultDocument[]> {
  const [docsRes, versionsRes, nameMap] = await Promise.all([
    supabase
      .from("vault_documents")
      .select("id, corporation_id, title, category, note, created_by, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("vault_document_versions")
      .select("id, document_id, version_no, is_current, storage_path, file_name, file_size, uploaded_by, uploaded_at"),
    getProfileNameMap(supabase),
  ]);
  if (docsRes.error) throw docsRes.error;
  if (versionsRes.error) throw versionsRes.error;

  const versionsByDoc = new Map<string, VersionRow[]>();
  for (const v of (versionsRes.data ?? []) as VersionRow[]) {
    const list = versionsByDoc.get(v.document_id) ?? [];
    list.push(v);
    versionsByDoc.set(v.document_id, list);
  }

  return (docsRes.data ?? []).map((d): VaultDocument => {
    const versions = versionsByDoc.get(d.id as string) ?? [];
    const current =
      versions.find((v) => v.is_current) ??
      versions.slice().sort((a, b) => b.version_no - a.version_no)[0] ??
      null;
    return {
      id: d.id,
      corporation_id: d.corporation_id,
      title: d.title,
      category: d.category,
      note: d.note,
      created_by: d.created_by,
      created_at: d.created_at,
      updated_at: d.updated_at,
      current_version_id: current?.id ?? null,
      current_version_no: current?.version_no ?? null,
      current_storage_path: current?.storage_path ?? null,
      file_name: current?.file_name ?? null,
      file_size: current?.file_size ?? null,
      updated_by_name: current?.uploaded_by ? nameMap.get(current.uploaded_by) ?? null : null,
      version_count: versions.length,
    };
  });
}

/** 특정 서류의 전체 버전(최신 우선) */
export async function getDocumentVersions(
  supabase: SupabaseClient,
  documentId: string,
): Promise<VaultDocumentVersion[]> {
  const [versRes, nameMap] = await Promise.all([
    supabase
      .from("vault_document_versions")
      .select("id, document_id, storage_path, file_name, file_size, mime_type, version_no, is_current, uploaded_by, uploaded_at")
      .eq("document_id", documentId)
      .order("version_no", { ascending: false }),
    getProfileNameMap(supabase),
  ]);
  if (versRes.error) throw versRes.error;
  return (versRes.data ?? []).map((v): VaultDocumentVersion => ({
    id: v.id,
    document_id: v.document_id,
    storage_path: v.storage_path,
    file_name: v.file_name,
    file_size: v.file_size,
    mime_type: v.mime_type,
    version_no: v.version_no,
    is_current: v.is_current,
    uploaded_at: v.uploaded_at,
    uploaded_by_name: v.uploaded_by ? nameMap.get(v.uploaded_by) ?? null : null,
  }));
}

/** 2차 비밀번호(게이트)가 설정돼 있는지 */
export async function isGateConfigured(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("vault_gate_configured");
  if (error) throw error;
  return data === true;
}
