const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "zip", "txt",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `파일 크기가 10MB를 초과합니다: ${file.name}`;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `허용되지 않는 파일 형식입니다: ${file.name}`;
  }
  return null; // 유효
}

/** 아바타 허용 MIME → 확장자 매핑 */
const AVATAR_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

/** 아바타 전용 검증: MIME 기반, jpg/png/webp만 허용 */
export function validateAvatarFile(file: File): { error: string } | { ext: string } {
  if (file.size > MAX_AVATAR_SIZE) {
    return { error: "파일 크기는 2MB 이하여야 합니다." };
  }
  const ext = AVATAR_MIME_TO_EXT[file.type];
  if (!ext) {
    return { error: "프로필 사진은 JPG, PNG, WebP만 허용됩니다." };
  }
  return { ext };
}
