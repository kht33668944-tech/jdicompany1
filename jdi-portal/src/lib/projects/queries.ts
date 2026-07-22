import type { SupabaseClient } from "@supabase/supabase-js";
import type { Project } from "./types";

export async function getProjects(
  supabase: SupabaseClient,
  options: { includeArchived?: boolean } = {},
): Promise<Project[]> {
  let request = supabase
    .from("projects")
    .select("id, name, color, is_archived, created_by, created_at, updated_at")
    .order("name", { ascending: true });
  if (!options.includeArchived) request = request.eq("is_archived", false);
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as Project[];
}
