import type { ID, SearchResult, SearchResultGroup, SearchResultKind } from "@/types";
import {
  allConversations,
  conversationsById,
  messagesByChannel,
  repliesByRootId,
  users,
  usersById,
} from "@/data";
import { toPlainText } from "@/lib/message-format";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface SearchQuery {
  term: string;
  kinds?: SearchResultKind[];
  /** Per-group cap. The UI shows a few and reports the true total. */
  limit?: number;
}

const DEFAULT_LIMIT = 6;

const GROUP_LABEL: Record<SearchResultKind, string> = {
  message: "Messages",
  person: "People",
  channel: "Channels",
  file: "Files",
};

/** Ordering used by both the dialog and the keyboard navigation. */
const GROUP_ORDER: SearchResultKind[] = ["message", "person", "channel", "file"];

function conversationLabel(id: ID): string {
  const conversation = conversationsById[id];
  if (!conversation) return "";
  return conversation.kind === "public" || conversation.kind === "private"
    ? `#${conversation.name}`
    : conversation.name;
}

/** Trims a body to a window around the first match so the term stays visible. */
function snippetAround(body: string, needle: string, radius = 70): string {
  const plain = toPlainText(body).replace(/\s+/g, " ");
  const index = plain.toLowerCase().indexOf(needle);
  if (index < 0) return plain.slice(0, radius * 2);

  const start = Math.max(0, index - radius);
  const end = Math.min(plain.length, index + needle.length + radius);
  return `${start > 0 ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`;
}

function searchMessages(needle: string, limit: number): SearchResultGroup {
  const matches: SearchResult[] = [];

  const scan = (list: typeof messagesByChannel[string]) => {
    for (const message of list) {
      if (message.kind !== "text") continue;
      if (!toPlainText(message.body).toLowerCase().includes(needle)) continue;
      matches.push({
        id: `sr_message_${message.id}`,
        kind: "message",
        title: usersById[message.authorId]?.displayName ?? "Unknown",
        snippet: snippetAround(message.body, needle),
        contextLabel: conversationLabel(message.channelId),
        timestamp: message.createdAt,
        refId: message.id,
        channelId: message.channelId,
        authorId: message.authorId,
      });
    }
  };

  for (const list of Object.values(messagesByChannel)) scan(list);
  for (const list of Object.values(repliesByRootId)) scan(list);

  // Collect everything before slicing — truncating per channel would surface
  // whichever channel happened to be scanned first, not the newest matches.
  matches.sort((a, b) => Date.parse(b.timestamp ?? "0") - Date.parse(a.timestamp ?? "0"));

  return {
    kind: "message",
    label: GROUP_LABEL.message,
    results: matches.slice(0, limit),
    total: matches.length,
  };
}

function searchPeople(needle: string, limit: number): SearchResultGroup {
  const matches = users.filter(
    (user) =>
      user.displayName.toLowerCase().includes(needle) ||
      user.username.includes(needle) ||
      user.title.toLowerCase().includes(needle) ||
      user.email.toLowerCase().includes(needle),
  );

  return {
    kind: "person",
    label: GROUP_LABEL.person,
    total: matches.length,
    results: matches.slice(0, limit).map((user) => ({
      id: `sr_person_${user.id}`,
      kind: "person" as const,
      title: user.displayName,
      snippet: user.title,
      contextLabel: user.presence === "online" ? "Online" : user.department,
      timestamp: null,
      refId: user.id,
    })),
  };
}

function searchChannels(needle: string, limit: number): SearchResultGroup {
  const matches = allConversations.filter(
    (conversation) =>
      conversation.name.toLowerCase().includes(needle) ||
      conversation.purpose.toLowerCase().includes(needle),
  );

  return {
    kind: "channel",
    label: GROUP_LABEL.channel,
    total: matches.length,
    results: matches.slice(0, limit).map((conversation) => ({
      id: `sr_channel_${conversation.id}`,
      kind: "channel" as const,
      title: conversationLabel(conversation.id),
      snippet: conversation.purpose || "Direct message",
      contextLabel: `${conversation.memberCount.toLocaleString()} members`,
      timestamp: conversation.lastMessageAt,
      refId: conversation.id,
      channelId: conversation.id,
    })),
  };
}

function searchFiles(needle: string, limit: number): SearchResultGroup {
  const matches: SearchResult[] = [];

  for (const list of Object.values(messagesByChannel)) {
    for (const message of list) {
      for (const attachment of message.attachments) {
        if (!attachment.name.toLowerCase().includes(needle)) continue;
        matches.push({
          id: `sr_file_${attachment.id}`,
          kind: "file",
          title: attachment.name,
          snippet: `Shared by ${usersById[attachment.uploadedBy]?.displayName ?? "a teammate"}`,
          contextLabel: conversationLabel(message.channelId),
          timestamp: attachment.uploadedAt,
          refId: attachment.id,
          channelId: message.channelId,
          authorId: attachment.uploadedBy,
        });
      }
    }
  }

  return { kind: "file", label: GROUP_LABEL.file, total: matches.length, results: matches.slice(0, limit) };
}

export const searchService = {
  /** Grouped results. Empty groups are dropped by the caller, not here. */
  async search({ term, kinds, limit = DEFAULT_LIMIT }: SearchQuery): Promise<SearchResultGroup[]> {
    if (!USE_MOCK_TRANSPORT) {
      const params = new URLSearchParams({ q: term });
      if (kinds) params.set("kinds", kinds.join(","));
      return request<SearchResultGroup[]>(`/search?${params.toString()}`);
    }

    const needle = term.trim().toLowerCase();
    if (needle.length === 0) return mockResolve([], 60);

    const wanted = (kind: SearchResultKind) => !kinds || kinds.length === 0 || kinds.includes(kind);
    const groups: SearchResultGroup[] = [];

    for (const kind of GROUP_ORDER) {
      if (!wanted(kind)) continue;
      if (kind === "message") groups.push(searchMessages(needle, limit));
      if (kind === "person") groups.push(searchPeople(needle, limit));
      if (kind === "channel") groups.push(searchChannels(needle, limit));
      if (kind === "file") groups.push(searchFiles(needle, limit));
    }

    return mockResolve(
      groups.filter((group) => group.results.length > 0),
      180,
    );
  },
};

export { GROUP_ORDER, GROUP_LABEL };
