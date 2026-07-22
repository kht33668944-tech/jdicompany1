export const WORK_TIMELINE_BUCKET = "work-timeline";
export const WORK_TIMELINE_PAGE_SIZE = 15;
export const WORK_TIMELINE_MAX_TITLE_LENGTH = 120;
export const WORK_TIMELINE_MAX_DESCRIPTION_LENGTH = 5_000;
export const WORK_TIMELINE_MAX_ATTACHMENTS = 10;
export const WORK_TIMELINE_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// 사내 공유에서 실행/스크립트류는 차단한다. (다운로드만 가능하지만 확산 방지)
export const WORK_TIMELINE_BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "pif", "cpl", "jar",
  "js", "jse", "mjs", "cjs", "vbs", "vbe", "ws", "wsf", "wsh",
  "ps1", "psm1", "ps1xml", "sh", "bash", "zsh",
  "app", "deb", "rpm", "dll", "sys", "drv", "hta", "reg", "lnk",
  "gadget", "apk", "ipa", "vb", "vbscript",
]);
export const WORK_TIMELINE_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const WORK_TIMELINE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
