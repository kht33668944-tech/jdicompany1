import { createClient } from "@/lib/supabase/client";
import type { ReportType, ReportPage, ReportStatus, ReportAttachment } from "./types";

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
  // Delete attachments from storage first
  const { data: attachments } = await supabase
    .from("report_attachments")
    .select("file_path")
    .eq("report_id", reportId);

  if (attachments && attachments.length > 0) {
    await supabase.storage
      .from("reports")
      .remove(attachments.map((a) => a.file_path));
  }

  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw error;
}

export async function uploadReportAttachment(
  reportId: string,
  file: File
): Promise<ReportAttachment> {
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

  if (error) throw error;
  return data as ReportAttachment;
}

export async function deleteReportAttachment(attachmentId: string, filePath: string) {
  const supabase = getSupabase();
  await supabase.storage.from("reports").remove([filePath]);
  const { error } = await supabase
    .from("report_attachments")
    .delete()
    .eq("id", attachmentId);
  if (error) throw error;
}

export async function getAttachmentUrl(filePath: string): Promise<string> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from("reports")
    .createSignedUrl(filePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}
