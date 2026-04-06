import type { Message } from "./types";

/**
 * 파일/이미지 메시지 콘텐츠 파싱
 */
export function parseFileContent(content: string): { path: string; name: string; size: number; type: string } | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.path && parsed.name) return parsed;
  } catch { /* ignore */ }
  return null;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * 메시지 시간 포맷: 오늘이면 "오후 2:30", 이전이면 "4월 5일"
 */
export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, yesterday)) return "어제";

  return date.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/**
 * 날짜 구분선용 포맷: "2026년 4월 6일 월요일"
 */
export function formatDateDivider(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const toDateOnly = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const diff = toDateOnly(now) - toDateOnly(date);
  const oneDay = 86400000;

  if (diff === 0) return "오늘";
  if (diff === oneDay) return "어제";

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  }

  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

/**
 * 메시지를 날짜별로 그룹핑
 */
export function groupMessagesByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: Map<string, Message[]> = new Map();

  for (const msg of messages) {
    const dateKey = new Date(msg.created_at).toLocaleDateString("ko-KR");
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(msg);
    } else {
      groups.set(dateKey, [msg]);
    }
  }

  return Array.from(groups.entries()).map(([, msgs]) => ({
    date: msgs[0].created_at,
    messages: msgs,
  }));
}

/**
 * 채널 목록용 시간 포맷: 오늘이면 "오후 2:30", 이번주면 "월", 이전이면 "4/5"
 */
export function formatChannelTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString("ko-KR", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return date.toLocaleDateString("ko-KR", { weekday: "short" });
  }

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 이미지 파일 여부 판별
 */
export function isImageFile(fileType: string): boolean {
  return fileType.startsWith("image/");
}

/**
 * 파일 크기 포맷: "2.4 MB", "340 KB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
