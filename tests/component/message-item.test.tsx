import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { MessageActions } from "@/components/messages/message-actions";
import { MessageItem } from "@/components/messages/message-item";
import { makeMessage, makeUser, renderWithProviders, resetMessageStore } from "./render";

/**
 * These assertions were impossible before Phase 9: `isMine` and `mentionsMe`
 * compared against a module constant, so a test could only have asserted that
 * a constant equalled itself.
 */
describe("MessageItem identity", () => {
  const me = makeUser({ id: "u_me", displayName: "Me Myself", username: "me" });
  const other = makeUser({ id: "u_other", displayName: "Someone Else", username: "other" });

  beforeEach(resetMessageStore);

  const setup = (message = makeMessage({ authorId: other.id })) =>
    renderWithProviders(<MessageItem message={message} isGroupStart isGroupEnd />, {
      currentUser: me,
      users: [me, other],
    });

  it("renders the author from the directory, not a fixture map", () => {
    setup(makeMessage({ authorId: other.id }));
    expect(screen.getByText("Someone Else")).toBeInTheDocument();
  });

  it("renders my own message under my name", () => {
    setup(makeMessage({ authorId: me.id }));
    expect(screen.getByText("Me Myself")).toBeInTheDocument();
  });

  it("marks a message that mentions me", () => {
    const { container } = setup(
      makeMessage({ authorId: other.id, mentionedUserIds: [me.id] }),
    );
    const article = container.querySelector("article");
    expect(article?.className).toContain("bg-warning-subtle");
  });

  it("does not mark a message mentioning someone else", () => {
    const { container } = setup(
      makeMessage({ authorId: other.id, mentionedUserIds: ["u_nobody"] }),
    );
    const article = container.querySelector("article");
    expect(article?.className).not.toContain("bg-warning-subtle");
  });

  it("shows my own reaction as pressed and another's as not", () => {
    setup(
      makeMessage({
        authorId: other.id,
        reactions: [
          { emoji: "👍", name: "thumbsup", userIds: [me.id], count: 1 },
          { emoji: "🎉", name: "tada", userIds: [other.id], count: 1 },
        ],
      }),
    );

    const mine = screen.getByRole("button", { name: /You reacted with :thumbsup:/i });
    expect(mine).toHaveAttribute("aria-pressed", "true");

    const theirs = screen.getByRole("button", { name: /Someone Else reacted with :tada:/i });
    expect(theirs).toHaveAttribute("aria-pressed", "false");
  });

  it("renders an unknown author without crashing", () => {
    // The directory is authoritative but eventually consistent; a message can
    // arrive before its author does.
    setup(makeMessage({ authorId: "u_not_in_directory" }));
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });
});

describe("message action ownership", () => {
  const me = makeUser({ id: "u_me", displayName: "Me Myself", username: "me" });

  const noopHandlers = {
    onReact: () => {},
    onReply: () => {},
    onToggleSave: () => {},
    onCopyText: () => {},
    onCopyLink: () => {},
    onEdit: () => {},
    onDelete: () => {},
    onTogglePin: () => {},
    onMarkUnread: () => {},
  };

  /**
   * `isMenuOpen` is a controlled prop, so the menu can be rendered open
   * directly. That keeps the assertion on the authorisation logic rather than
   * on Radix's pointer handling, which jsdom emulates poorly.
   */
  const labelsFor = async (canManage: boolean) => {
    renderWithProviders(
      <MessageActions
        message={makeMessage({ authorId: canManage ? me.id : "u_other" })}
        canManage={canManage}
        isMenuOpen
        onMenuOpenChange={() => {}}
        handlers={noopHandlers}
      />,
      { currentUser: me, users: [me] },
    );

    const items = await screen.findAllByRole("menuitem", { hidden: true });
    return items.map((item) => item.textContent ?? "");
  };

  it("offers Edit and Delete when the message is mine", async () => {
    const labels = await labelsFor(true);
    expect(labels.some((label) => /Edit message/i.test(label))).toBe(true);
    expect(labels.some((label) => /Delete message/i.test(label))).toBe(true);
  });

  it("withholds Edit and Delete when it is not", async () => {
    const labels = await labelsFor(false);
    expect(labels.some((label) => /Edit message/i.test(label))).toBe(false);
    expect(labels.some((label) => /Delete message/i.test(label))).toBe(false);
    // The non-destructive actions are still offered.
    expect(labels.some((label) => /Copy link/i.test(label))).toBe(true);
  });
});
