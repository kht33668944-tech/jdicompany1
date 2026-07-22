import { addDays } from "@/lib/utils/date";
import {
  WORK_TIMELINE_BLOCKED_EXTENSIONS,
  WORK_TIMELINE_IMAGE_MIME_TYPES,
  WORK_TIMELINE_MAX_DESCRIPTION_LENGTH,
  WORK_TIMELINE_MAX_FILE_SIZE,
  WORK_TIMELINE_MAX_TITLE_LENGTH,
} from "./constants";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_IMAGE_TYPES = new Set<string>(WORK_TIMELINE_IMAGE_MIME_TYPES);

export function validateWorkTimelineInput(input: {
  title: string;
  description?: string | null;
  completedAt?: string | null;
}): { title: string; description: string | null; completedAt: string } {
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  if (!title) throw new Error("업무 제목을 입력해 주세요.");
  if (title.length > WORK_TIMELINE_MAX_TITLE_LENGTH) {
    throw new Error(`업무 제목은 ${WORK_TIMELINE_MAX_TITLE_LENGTH}자 이하로 입력해 주세요.`);
  }
  if (description && description.length > WORK_TIMELINE_MAX_DESCRIPTION_LENGTH) {
    throw new Error(`업무 설명은 ${WORK_TIMELINE_MAX_DESCRIPTION_LENGTH.toLocaleString()}자 이하로 입력해 주세요.`);
  }

  const completedAt = input.completedAt || new Date().toISOString();
  if (Number.isNaN(Date.parse(completedAt))) throw new Error("완료 시간이 올바르지 않습니다.");
  return { title, description, completedAt: new Date(completedAt).toISOString() };
}

export function validateWorkTimelineImage(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("JPG, PNG, WebP, GIF 이미지만 첨부할 수 있습니다.");
  }
  if (file.size > WORK_TIMELINE_MAX_IMAGE_SIZE) {
    throw new Error("이미지는 파일당 10MB 이하만 첨부할 수 있습니다.");
  }
  if (file.size <= 0) throw new Error("내용이 없는 이미지는 첨부할 수 없습니다.");
}

export function isWorkTimelineImage(mimeType: string): boolean {
  return (WORK_TIMELINE_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** 차단 확장자면 그 확장자를, 아니면 null. 확장자 없으면 빈 문자열("")을 반환해 거부 유도. */
export function getBlockedExtension(fileName: string): string | null {
  const parts = fileName.split(".");
  if (parts.length < 2) return ""; // 확장자 없음 → 거부
  const ext = parts.pop()!.toLowerCase();
  if (!ext) return "";
  return WORK_TIMELINE_BLOCKED_EXTENSIONS.has(ext) ? ext : null;
}

export function validateWorkTimelineFile(file: File): void {
  if (file.size <= 0) throw new Error("내용이 없는 파일은 첨부할 수 없습니다.");
  if (file.size > WORK_TIMELINE_MAX_FILE_SIZE) {
    throw new Error("파일은 개당 50MB 이하만 첨부할 수 있습니다.");
  }
  const blocked = getBlockedExtension(file.name);
  if (blocked === "") throw new Error("확장자가 없는 파일은 첨부할 수 없습니다.");
  if (blocked) throw new Error(`보안상 '.${blocked}' 형식의 파일은 첨부할 수 없습니다.`);
}

export function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} 값이 올바르지 않습니다.`);
}

export function getKstDayRange(date: string): { start: string; end: string } {
  if (!DATE_PATTERN.test(date)) throw new Error("날짜 형식이 올바르지 않습니다.");
  const [year, month, day] = date.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    throw new Error("존재하지 않는 날짜입니다.");
  }
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(`${addDays(date, 1)}T00:00:00+09:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("날짜 형식이 올바르지 않습니다.");
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

export function escapePostgrestIlike(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/"/g, '\\"');
  return `"%${escaped}%"`;
}

export function getFileExtension(file: File): string {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return byMime[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "bin";
}

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505",
  );
}
