import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportWithProfile, ReportAttachment } from "./types";

// 첨부 개수는 PostgREST 내장 집계(report_attachments(count))로 본문 쿼리에 합쳐
// 서버(싱가포르)↔DB(서울) 순차 왕복을 1회로 줄인다. (기존: 목록 1회 + 개수 1회)
const REPORT_SELECT = `
  *,
  author_profile:profiles!reports_user_id_fkey(full_name, avatar_url),
  attachment_rows:report_attachments(count)
`;

type AttachmentCountRow = { count: number };

function toReportWithProfile(row: Record<string, unknown>): ReportWithProfile {
  const { attachment_rows, ...rest } = row as Record<string, unknown> & {
    attachment_rows?: AttachmentCountRow[] | null;
  };
  return {
    ...rest,
    attachment_count: attachment_rows?.[0]?.count ?? 0,
  } as ReportWithProfile;
}

export async function getReports(
  supabase: SupabaseClient,
  options?: { limit?: number; offset?: number }
): Promise<ReportWithProfile[]> {
  const limit = options?.limit ?? 10;
  const offset = options?.offset ?? 0;

  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return (data ?? []).map((r) => toReportWithProfile(r as Record<string, unknown>));
}

export async function getReportById(
  supabase: SupabaseClient,
  id: string
): Promise<ReportWithProfile | null> {
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("id", id)
    .single();

  if (error) return null;

  return toReportWithProfile(data as Record<string, unknown>);
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
