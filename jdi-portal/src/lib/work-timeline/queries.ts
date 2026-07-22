import type { SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_UNCLASSIFIED } from "@/lib/projects/constants";
import { WORK_TIMELINE_BUCKET, WORK_TIMELINE_PAGE_SIZE, WORK_TIMELINE_SIGNED_URL_TTL_SECONDS } from "./constants";
import type {
  WorkTimelineAttachment,
  WorkTimelineEntryWithProfile,
  WorkTimelineFilters,
  WorkTimelineProfile,
} from "./types";
import { assertUuid, escapePostgrestIlike, getKstDayRange, isWorkTimelineImage } from "./utils";

const ENTRY_SELECT = `
  id, user_id, task_id, project_id, title, description, completed_at, created_at, updated_at,
  author_profile:profiles!work_timeline_entries_user_id_fkey(id, full_name, avatar_url),
  project:projects(id, name, color)
`;

type RawAttachment = Omit<WorkTimelineAttachment, "original_url" | "thumbnail_url">;

async function createSignedUrlMap(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Record<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (uniquePaths.length === 0) return {};
  const { data, error } = await supabase.storage
    .from(WORK_TIMELINE_BUCKET)
    .createSignedUrls(uniquePaths, WORK_TIMELINE_SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls[item.path] = item.signedUrl;
  }
  return urls;
}

export async function getWorkTimelineAttachments(
  supabase: SupabaseClient,
  entryIds: string | string[],
  options: { thumbnailOnly?: boolean } = {},
): Promise<WorkTimelineAttachment[]> {
  const ids = Array.isArray(entryIds) ? [...new Set(entryIds)] : [entryIds];
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("work_timeline_attachments")
    .select("id, entry_id, file_name, file_path, thumbnail_path, mime_type, file_size, position, created_at")
    .in("entry_id", ids)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as RawAttachment[];
  const signPaths = options.thumbnailOnly
    ? rows
        .filter((row) => isWorkTimelineImage(row.mime_type) && row.thumbnail_path)
        .map((row) => row.thumbnail_path as string)
    : rows.flatMap((row) => [row.file_path, row.thumbnail_path ?? ""]);
  const urls = await createSignedUrlMap(supabase, signPaths);
  return rows.map((row) => {
    const isImage = isWorkTimelineImage(row.mime_type);
    if (options.thumbnailOnly) {
      return {
        ...row,
        original_url: null,
        thumbnail_url: isImage && row.thumbnail_path ? urls[row.thumbnail_path] ?? null : null,
      };
    }
    return {
      ...row,
      original_url: urls[row.file_path] ?? null,
      thumbnail_url: row.thumbnail_path
        ? urls[row.thumbnail_path] ?? urls[row.file_path] ?? null
        : urls[row.file_path] ?? null,
    };
  });
}

export function groupAttachmentsByEntry(
  attachments: WorkTimelineAttachment[],
): Map<string, WorkTimelineAttachment[]> {
  const byEntry = new Map<string, WorkTimelineAttachment[]>();
  for (const attachment of attachments) {
    const current = byEntry.get(attachment.entry_id) ?? [];
    current.push(attachment);
    byEntry.set(attachment.entry_id, current);
  }
  return byEntry;
}

function attachFiles(
  rows: Record<string, unknown>[],
  attachments: WorkTimelineAttachment[],
): WorkTimelineEntryWithProfile[] {
  const byEntry = groupAttachmentsByEntry(attachments);
  return rows.map((row) => ({
    ...(row as unknown as Omit<WorkTimelineEntryWithProfile, "attachments">),
    attachments: byEntry.get(row.id as string) ?? [],
  }));
}

export async function getWorkTimelineEntries(
  supabase: SupabaseClient,
  filters: WorkTimelineFilters = {},
): Promise<WorkTimelineEntryWithProfile[]> {
  const limit = Math.min(Math.max(filters.limit ?? WORK_TIMELINE_PAGE_SIZE, 1), 50);
  const offset = Math.max(filters.offset ?? 0, 0);
  let request = supabase.from("work_timeline_entries").select(ENTRY_SELECT);

  if (filters.employeeId) request = request.eq("user_id", filters.employeeId);
  if (filters.projectId === PROJECT_UNCLASSIFIED) request = request.is("project_id", null);
  else if (filters.projectId) {
    assertUuid(filters.projectId, "프로젝트");
    request = request.eq("project_id", filters.projectId);
  }
  if (filters.cursor) {
    assertUuid(filters.cursor.id, "페이지 커서");
    const cursorDate = new Date(filters.cursor.completedAt);
    if (Number.isNaN(cursorDate.getTime())) throw new Error("페이지 커서 시간이 올바르지 않습니다.");
    const completedAt = cursorDate.toISOString();
    request = request.or(
      `completed_at.lt.${completedAt},and(completed_at.eq.${completedAt},id.lt.${filters.cursor.id})`,
    );
  }
  if (filters.date) {
    const range = getKstDayRange(filters.date);
    request = request.gte("completed_at", range.start).lt("completed_at", range.end);
  }
  const searchQuery = filters.query?.trim();
  if (searchQuery && searchQuery.length >= 2) {
    const pattern = escapePostgrestIlike(searchQuery);
    request = request.or(`title.ilike.${pattern},description.ilike.${pattern}`);
  }

  const { data, error } = await request
    .order("completed_at", { ascending: false })
    .order("id", { ascending: false })
    .range(filters.cursor ? 0 : offset, (filters.cursor ? 0 : offset) + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as Record<string, unknown>[];
  if (filters.includeAttachments === false) return attachFiles(rows, []);

  const attachments = await getWorkTimelineAttachments(
    supabase,
    rows.map((row) => row.id as string),
    { thumbnailOnly: true },
  );
  return attachFiles(rows, attachments);
}

export async function getWorkTimelineEntryById(
  supabase: SupabaseClient,
  id: string,
): Promise<WorkTimelineEntryWithProfile | null> {
  const [{ data, error }, attachments] = await Promise.all([
    supabase
      .from("work_timeline_entries")
      .select(ENTRY_SELECT)
      .eq("id", id)
      .maybeSingle(),
    getWorkTimelineAttachments(supabase, id),
  ]);
  if (error) throw error;
  if (!data) return null;
  return attachFiles([data as Record<string, unknown>], attachments)[0];
}

export async function getWorkTimelineProfiles(supabase: SupabaseClient): Promise<WorkTimelineProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .eq("is_approved", true)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as WorkTimelineProfile[];
}
