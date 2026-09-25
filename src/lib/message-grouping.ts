import type { ID, Message } from "@/types";
import { isSameDay } from "./format";

/** Consecutive messages from one author inside this window render as one block. */
const GROUP_WINDOW_MS = 5 * 60_000;

export type MessageRow =
  | { type: "day"; key: string; timestamp: string }
  | { type: "unread"; key: string; count: number }
  | {
      type: "message";
      key: string;
      message: Message;
      /** First message of a visual block — shows avatar, name and timestamp. */
      isGroupStart: boolean;
      /** Last of a block — carries the bottom spacing. */
      isGroupEnd: boolean;
    };

function canGroup(previous: Message | null, current: Message): boolean {
  if (!previous) return false;
  if (previous.kind !== "text" || current.kind !== "text") return false;
  if (previous.authorId !== current.authorId) return false;
  if (!isSameDay(previous.createdAt, current.createdAt)) return false;
  // A message with replies closes its block so the thread affordance has room.
  if (previous.replyCount > 0) return false;
  return Date.parse(current.createdAt) - Date.parse(previous.createdAt) <= GROUP_WINDOW_MS;
}

/**
 * Flattens a chronological message list into render rows, inserting day
 * dividers and an unread marker. Pure, so it memoises cleanly.
 */
export function buildMessageRows(
  messages: Message[],
  options: { firstUnreadId?: ID | null; unreadCount?: number; groupConsecutive?: boolean } = {},
): MessageRow[] {
  const grouping = options.groupConsecutive ?? true;
  const rows: MessageRow[] = [];
  let previous: Message | null = null;

  messages.forEach((message, index) => {
    if (!previous || !isSameDay(previous.createdAt, message.createdAt)) {
      rows.push({ type: "day", key: `day-${message.createdAt}`, timestamp: message.createdAt });
      previous = null;
    }

    if (options.firstUnreadId && message.id === options.firstUnreadId && options.unreadCount) {
      rows.push({ type: "unread", key: `unread-${message.id}`, count: options.unreadCount });
      previous = null;
    }

    const isGroupStart = !grouping || !canGroup(previous, message);
    const next = messages[index + 1] ?? null;
    const isGroupEnd =
      !grouping || !next || !canGroup(message, next) || !isSameDay(message.createdAt, next.createdAt);

    rows.push({ type: "message", key: message.id, message, isGroupStart, isGroupEnd });
    previous = message;
  });

  return rows;
}
