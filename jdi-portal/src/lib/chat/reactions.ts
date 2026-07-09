import type { MessageReaction } from "./types";

export interface ReactionRow {
  message_id: string;
  emoji: string;
  user_id: string;
}

export function summarizeReactionsByMessage(
  rows: ReactionRow[],
  currentUserId: string
): Record<string, MessageReaction[]> {
  const grouped = new Map<string, Map<string, { count: number; reacted: boolean }>>();

  for (const row of rows) {
    const perMessage = grouped.get(row.message_id) ?? new Map<string, { count: number; reacted: boolean }>();
    const summary = perMessage.get(row.emoji) ?? { count: 0, reacted: false };
    summary.count += 1;
    if (row.user_id === currentUserId) summary.reacted = true;
    perMessage.set(row.emoji, summary);
    grouped.set(row.message_id, perMessage);
  }

  const result: Record<string, MessageReaction[]> = {};
  for (const [messageId, reactions] of grouped) {
    result[messageId] = Array.from(reactions.entries()).map(([emoji, { count, reacted }]) => ({
      emoji,
      count,
      reacted,
    }));
  }
  return result;
}
