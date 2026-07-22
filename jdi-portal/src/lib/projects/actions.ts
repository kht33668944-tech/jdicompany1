"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PROJECT_COLORS, PROJECT_NAME_MAX_LENGTH } from "./constants";
import type { Project } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const PROJECT_SELECT = "id, name, color, is_archived, created_by, created_at, updated_at";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

async function getAuthenticatedContext(): Promise<{ supabase: ServerClient; userId: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("로그인이 필요합니다.");
  return { supabase, userId: data.user.id };
}

function revalidateProjectViews(): void {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/work-timeline");
  revalidatePath("/dashboard/tasks");
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("프로젝트 이름을 입력해 주세요.");
  if (trimmed.length > PROJECT_NAME_MAX_LENGTH) {
    throw new Error(`프로젝트 이름은 ${PROJECT_NAME_MAX_LENGTH}자 이하로 입력해 주세요.`);
  }
  return trimmed;
}

function validateColor(color: string): string {
  if (!COLOR_PATTERN.test(color)) throw new Error("프로젝트 색상이 올바르지 않습니다.");
  return color.toLowerCase();
}

function assertProjectId(id: string): void {
  if (!UUID_PATTERN.test(id)) throw new Error("프로젝트 값이 올바르지 않습니다.");
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error
      && (error as { code?: string }).code === "23505",
  );
}

export async function createProject(name: string, color?: string): Promise<Project> {
  const { supabase, userId } = await getAuthenticatedContext();
  const result = await supabase
    .from("projects")
    .insert({
      name: validateName(name),
      color: validateColor(color || PROJECT_COLORS[0]),
      created_by: userId,
    })
    .select(PROJECT_SELECT)
    .single();
  if (result.error) {
    if (isUniqueViolation(result.error)) throw new Error("같은 이름의 프로젝트가 이미 있습니다.");
    throw result.error;
  }
  revalidateProjectViews();
  const data = result.data as Project;
  return data;
}

export async function updateProject(
  id: string,
  input: { name?: string; color?: string; isArchived?: boolean },
): Promise<Project> {
  assertProjectId(id);
  const { supabase } = await getAuthenticatedContext();
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = validateName(input.name);
  if (input.color !== undefined) payload.color = validateColor(input.color);
  if (input.isArchived !== undefined) payload.is_archived = input.isArchived;
  if (Object.keys(payload).length === 0) throw new Error("변경할 내용이 없습니다.");

  const result = await supabase
    .from("projects")
    .update(payload)
    .eq("id", id)
    .select(PROJECT_SELECT)
    .single();
  if (result.error) {
    if (isUniqueViolation(result.error)) throw new Error("같은 이름의 프로젝트가 이미 있습니다.");
    throw result.error;
  }
  revalidateProjectViews();
  const data = result.data as Project;
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  assertProjectId(id);
  const { supabase, userId } = await getAuthenticatedContext();
  // RLS가 최종 방어선이지만 서버에서도 admin을 재검증한다.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (profileError) throw profileError;
  if (profile.role !== "admin") throw new Error("프로젝트 삭제는 관리자만 할 수 있습니다.");

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
  revalidateProjectViews();
}
