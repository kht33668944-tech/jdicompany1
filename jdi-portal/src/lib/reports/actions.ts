import { createClient } from "@/lib/supabase/client";
import type { ReportType, ReportPage, ReportStatus, ReportAttachment } from "./types";
import { validateFile } from "@/lib/utils/upload";

function getSupabase() {
  return createClient();
}

export async function createReport(params: {
  type: ReportType;
  page: ReportPage;
  title: string;
  content: string;
  userId: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("reports")
    .insert({
      user_id: params.userId,
      type: params.type,
      page: params.page,
      title: params.title,
      content: params.content,
      status: "submitted",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateReport(
  reportId: string,
  params: {
    type?: ReportType;
    page?: ReportPage;
    title?: string;
    content?: string;
  }
) {
  const supabase = getSupabase();
  const updateData: Record<string, unknown> = {};

  if (params.type !== undefined) updateData.type = params.type;
  if (params.page !== undefined) updateData.page = params.page;
  if (params.title !== undefined) updateData.title = params.title;
  if (params.content !== undefined) updateData.content = params.content;
  updateData.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("reports")
    .update(updateData)
    .eq("id", reportId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateReportStatus(reportId: string, status: ReportStatus) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("reports")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", reportId);

  if (error) throw error;
}

export async function deleteReport(reportId: string) {
  const supabase = getSupabase();
  // 첨부 파일 경로 미리 수집 (DB 삭제 후에 best-effort 로 정리)
  const { data: attachments } = await supabase
    .from("report_attachments")
    .select("file_path")
    .eq("report_id", reportId);

  // DB 먼저 삭제 (report_attachments 는 FK CASCADE 로 함께 정리)
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw new Error(`보고서 삭제에 실패했습니다: ${error.message}`);

  // 스토리지는 best-effort — 실패해도 사용자 화면은 정상
  if (attachments && attachments.length > 0) {
    const { error: storageError } = await supabase.storage
      .from("reports")
      .remove(attachments.map((a) => a.file_path));
    if (storageError) {
      console.warn("보고서 스토리지 정리 실패 (DB 는 정리됨):", storageError);
    }
  }
}

export async function uploadReportAttachment(
  reportId: string,
  file: File
): Promise<ReportAttachment> {
  const validationError = validateFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = getSupabase();
  const ext = file.name.split(".").pop() ?? "bin";
  const filePath = `${reportId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("reports")
    .upload(filePath, file);

  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("report_attachments")
    .insert({
      report_id: reportId,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
    })
    .select()
    .single();

  if (error) {
    // 메타데이터 INSERT 실패 시 업로드된 파일 정리 (고아 방지)
    await supabase.storage.from("reports").remove([filePath]).catch(() => {});
    throw error;
  }
  return data as ReportAttachment;
}

export async function deleteReportAttachment(attachmentId: string, filePath: string) {
  const supabase = getSupabase();
  // DB 먼저 삭제 — 사용자 화면 진실을 우선
  const { error } = await supabase
    .from("report_attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) throw error;

  // 스토리지는 best-effort
  const { error: storageError } = await supabase.storage
    .from("reports")
    .remove([filePath]);
  if (storageError) {
    console.warn("보고서 첨부 스토리지 삭제 실패 (DB 는 정리됨):", storageError);
  }
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from("reports")
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
