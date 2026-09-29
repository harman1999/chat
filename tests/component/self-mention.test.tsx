import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "@/components/chat/composer/message-composer";
import { commandService } from "@/services";
import { makeUser, renderWithProviders, resetMessageStore } from "./render";
import type { Channel } from "@/types";

const me = makeUser({ id: "u_me", displayName: "Harman Singh", username: "harman" });
const other = makeUser({ id: "u_other", displayName: "Bob Smith", username: "bob" });

const channel: Channel = {
  id: "ch_test",
  workspaceId: "ws_northwind",
  kind: "public",
  name: "general",
  purpose: "",
  description: "",
  topic: "",
  memberCount: 2,
  memberIds: [],
  isArchived: false,
  isMuted: false,
  isFavorite: false,
  unreadCount: 0,
  mentionCount: 0,
  lastMessageAt: null,
  createdBy: me.id,
  createdAt: new Date().toISOString(),
  teamId: null,
};

/**
 * The composer used to drop the current user from the @-mention list, so you
 * could only tag yourself by typing your username exactly. The server already
 * accepted it; only the autocomplete refused.
 */
describe("tagging yourself", () => {
  beforeEach(() => {
    resetMessageStore();
    vi.restoreAllMocks();
    vi.spyOn(commandService, "list").mockResolvedValue([]);
  });

  const setup = () =>
    renderWithProviders(<MessageComposer conversation={channel} />, {
      currentUser: me,
      users: [me, other],
    });

  const type = (value: string) =>
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value, selectionStart: value.length },
    });

  it("offers you in the mention list", async () => {
    setup();
    type("@har");
    await waitFor(() =>
      expect(screen.getByRole("listbox", { name: /mention a teammate/i })).toBeInTheDocument(),
    );
    expect(screen.getByText("Harman Singh")).toBeInTheDocument();
  });

  it("marks your own entry, so it is clearly you", async () => {
    setup();
    type("@har");
    await waitFor(() => expect(screen.getByText("(you)")).toBeInTheDocument());
  });

  it("finds you by typing @me", async () => {
    setup();
    type("@me");
    await waitFor(() => expect(screen.getByText("Harman Singh")).toBeInTheDocument());
  });

  it("inserts your username, which is what the server resolves", async () => {
    setup();
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    type("@har");
    await waitFor(() => expect(screen.getByText("Harman Singh")).toBeInTheDocument());

    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(box.value).toBe("@harman "));
  });

  it("still offers other people", async () => {
    setup();
    type("@bo");
    await waitFor(() => expect(screen.getByText("Bob Smith")).toBeInTheDocument());
  });
});
