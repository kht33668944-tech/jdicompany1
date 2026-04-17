// 멘션 토큰 형식: @[이름|uuid]
const MENTION_TOKEN_RE = /@\[([^|\]]+)\|([0-9a-f-]{36})\]/g;

export interface MentionSegment {
  type: "mention";
  displayName: string;
  userId: string;
}
export interface TextSegment {
  type: "text";
  text: string;
}
export type MessageSegment = MentionSegment | TextSegment;

export function serializeMention(displayName: string, userId: string): string {
  const safe = displayName.replace(/[\]|]/g, "");
  return `@[${safe}|${userId}]`;
}

export function parseMessageContent(content: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let lastIndex = 0;
  for (const m of content.matchAll(MENTION_TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", text: content.slice(lastIndex, start) });
    }
    segments.push({ type: "mention", displayName: m[1], userId: m[2] });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", text: content.slice(lastIndex) });
  }
  return segments;
}

export function mentionPreview(content: string): string {
  return content.replace(MENTION_TOKEN_RE, (_, name) => `@${name}`);
}
