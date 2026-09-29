import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadCard } from "@/components/threads/thread-card";
import { makeMessage, makeUser, renderWithProviders, resetMessageStore } from "./render";
import type { ThreadInboxEntry } from "@/services";
import type { Channel } from "@/types";

const author = makeUser({ id: "u_author", displayName: "Bob Smith" });

const channel: Channel = {
  id: "ch_support",
  workspaceId: "ws_northwind",
  kind: "public",
  name: "support",
  purpose: "",
  description: "",
  topic: "",
  memberCount: 3,
  memberIds: [],
  isArchived: false,
  isMuted: false,
  isFavorite: false,
  unreadCount: 0,
  mentionCount: 0,
  lastMessageAt: null,
  createdBy: author.id,
  createdAt: new Date().toISOString(),
  teamId: null,
};

const entry: ThreadInboxEntry = {
  channel,
  root: makeMessage({ id: "m_root", channelId: channel.id, authorId: author.id, body: "The export is slow" }),
  recentReplies: [makeMessage({ id: "m_reply", channelId: channel.id, authorId: author.id, body: "Looking now" })],
  thread: {
    rootId: "m_root",
    channelId: channel.id,
    replyCount: 2,
    participantIds: [author.id],
    lastReplyAt: new Date().toISOString(),
    isFollowing: true,
    unreadReplyCount: 0,
  },
};

/**
 * Only a small "2 replies" link at the foot of each card used to open the
 * thread, so clicking the card itself — the obvious thing to do — appeared to
 * do nothing.
 */
describe("a card in the Threads list", () => {
  const onOpen = vi.fn();

  beforeEach(() => {
    resetMessageStore();
    onOpen.mockClear();
  });

  const show = () =>
    renderWithProviders(<ThreadCard entry={entry} onOpen={onOpen} />, { users: [author] });

  it("opens the thread when the card is clicked anywhere", () => {
    show();
    fireEvent.click(screen.getByText("The export is slow"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("Looking now"));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("opens it once — not twice — from the replies link", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /2 replies/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("does not open it when the click ends a text selection", () => {
    show();
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({ toString: () => "The export" } as Selection);
    fireEvent.click(screen.getByText("The export is slow"));
    expect(onOpen).not.toHaveBeenCalled();
    selection.mockRestore();
  });
});
