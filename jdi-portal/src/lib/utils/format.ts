/**
 * 파일 크기 포맷: "2.4 MB", "340 KB"
 * (채팅·보관함·업무 타임라인 등 앱 전체가 공유하는 표기)
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
