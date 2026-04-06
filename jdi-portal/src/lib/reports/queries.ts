import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportWithProfile, ReportAttachment } from "./types";

export async function getReports(
  supabase: SupabaseClient,
  options?: { limit?: number; offset?: number }
): Promise<ReportWithProfile[]> {
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;

  const { data, error } = await supabase
    .from("reports")
    .select(`
      *,
      author_profile:profiles!reports_user_id_fkey(full_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  // Get attachment counts
  const reportIds = (data ?? []).map((r: any) => r.id as string);
  const attachmentCounts = await fetchAttachmentCounts(supabase, reportIds);

  return (data ?? []).map((r: any) => ({
    ...r,
    attachment_count: attachmentCounts.get(r.id) ?? 0,
  })) as ReportWithProfile[];
}

async function fetchAttachmentCounts(
  supabase: SupabaseClient,
  reportIds: string[]
): Promise<Map<string, number>> {
  if (reportIds.length === 0) return new Map();

  const { data } = await supabase
    .from("report_attachments")
    .select("report_id")
    .in("report_id", reportIds);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.report_id, (map.get(row.report_id) ?? 0) + 1);
  }
  return map;
}

export async function getReportById(
  supabase: SupabaseClient,
  id: string
): Promise<ReportWithProfile | null> {
  const { data, error } = await supabase
    .from("reports")
    .select(`
      *,
      author_profile:profiles!reports_user_id_fkey(full_name, avatar_url)
    `)
    .eq("id", id)
    .single();

  if (error) return null;

  const attachmentCounts = await fetchAttachmentCounts(supabase, [id]);

  return {
    ...data,
    attachment_count: attachmentCounts.get(id) ?? 0,
  } as ReportWithProfile;
}

export async function getReportAttachments(
  supabase: SupabaseClient,
  reportId: string
): Promise<ReportAttachment[]> {
  const { data, error } = await supabase
    .from("report_attachments")
    .select("*")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ReportAttachment[]) ?? [];
}
