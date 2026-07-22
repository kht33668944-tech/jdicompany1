import type { SelectOption } from "@/components/shared/Select";
import { PROJECT_UNCLASSIFIED } from "./constants";
import type { Project } from "./types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** URL의 project 파라미터 정규화: ""(전체) | "none"(미분류) | UUID 만 허용 */
export function normalizeProjectParam(raw: string | null | undefined): string {
  const value = raw?.trim() ?? "";
  return value === PROJECT_UNCLASSIFIED || UUID_PATTERN.test(value) ? value : "";
}

/** Postgres unique(23505) 위반 여부 */
export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error
      && (error as { code?: string }).code === "23505",
  );
}

/** 프로젝트 FK(23503) 위반: 선택한 프로젝트가 이미 삭제된 경우 */
export function isProjectFkViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message, details } = error as { code?: string; message?: string; details?: string };
  return code === "23503" && `${message ?? ""} ${details ?? ""}`.includes("project");
}

/** 편집 폼용 옵션: 미분류("") + 프로젝트(보관은 현재 선택된 것만 유지) */
export function toProjectEditOptions(projects: Project[], currentId: string): SelectOption[] {
  return [
    { value: "", label: "미분류" },
    ...projects
      .filter((project) => !project.is_archived || project.id === currentId)
      .map((project) => ({ value: project.id, label: project.name })),
  ];
}

/** 필터용 옵션: 전체("") + 프로젝트(보관은 현재 필터일 때만 유지) + 미분류("none") */
export function toProjectFilterOptions(projects: Project[], currentId: string): SelectOption[] {
  return [
    { value: "", label: "전체 프로젝트" },
    ...projects
      .filter((project) => !project.is_archived || project.id === currentId)
      .map((project) => ({ value: project.id, label: project.name })),
    { value: PROJECT_UNCLASSIFIED, label: "미분류" },
  ];
}
