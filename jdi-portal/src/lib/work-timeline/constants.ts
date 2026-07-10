export const WORK_TIMELINE_BUCKET = "work-timeline";
export const WORK_TIMELINE_PAGE_SIZE = 15;
export const WORK_TIMELINE_MAX_TITLE_LENGTH = 120;
export const WORK_TIMELINE_MAX_DESCRIPTION_LENGTH = 5_000;
export const WORK_TIMELINE_MAX_IMAGES = 5;
export const WORK_TIMELINE_MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const WORK_TIMELINE_SIGNED_URL_TTL_SECONDS = 60 * 60;

export const WORK_TIMELINE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
