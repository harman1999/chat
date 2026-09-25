import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageComposer } from "@/components/chat/composer/message-composer";
import { commandService, messageService } from "@/services";
import { makeUser, renderWithProviders, resetMessageStore } from "./render";
import type { Channel, SlashCommand } from "@/types";

const me = makeUser({ id: "u_me", displayName: "Me Myself", username: "me" });

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
};

const command = (over: Partial<SlashCommand> = {}): SlashCommand => ({
  id: `cmd_${over.command ?? "weather"}`,
  command: "weather",
  name: "Weather",
  description: "Shows the forecast",
  usageHint: "[city]",
  targetUrl: "https://example.com/weather",
  connectionId: null,
  connectionName: null,
  isEnabled: true,
  createdAt: new Date().toISOString(),
  lastUsedAt: null,
  ...over,
});

const COMMANDS = [command(), command({ command: "giphy", name: "Giphy", description: "Finds a gif" })];

describe("slash command autocomplete", () => {
  beforeEach(() => {
    resetMessageStore();
    vi.restoreAllMocks();
    vi.spyOn(commandService, "list").mockResolvedValue(COMMANDS);
  });

  const setup = () =>
    renderWithProviders(<MessageComposer conversation={channel} />, {
      currentUser: me,
      users: [me],
    });

  const type = (value: string) => {
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value, selectionStart: value.length } });
    return box;
  };

  it("offers commands when the draft starts with a slash", async () => {
    setup();
    type("/");
    await waitFor(() => expect(screen.getByRole("listbox", { name: /run a command/i })).toBeInTheDocument());
    expect(screen.getByText("/weather")).toBeInTheDocument();
    expect(screen.getByText("/giphy")).toBeInTheDocument();
  });

  it("narrows the list as the command is typed", async () => {
    setup();
    type("/wea");
    await waitFor(() => expect(screen.getByText("/weather")).toBeInTheDocument());
    expect(screen.queryByText("/giphy")).not.toBeInTheDocument();
  });

  it("shows the usage hint and description, so the list is readable", async () => {
    setup();
    type("/weather");
    await waitFor(() => expect(screen.getByText("[city]")).toBeInTheDocument());
    expect(screen.getByText("Shows the forecast")).toBeInTheDocument();
  });

  it("does not open for a slash that is not at the start", async () => {
    setup();
    type("and/or");
    await waitFor(() => expect(commandService.list).toHaveBeenCalled());
    expect(screen.queryByRole("listbox", { name: /run a command/i })).not.toBeInTheDocument();
  });

  it("closes once the command is complete and an argument is being typed", async () => {
    setup();
    type("/weather London");
    await waitFor(() => expect(commandService.list).toHaveBeenCalled());
    expect(screen.queryByRole("listbox", { name: /run a command/i })).not.toBeInTheDocument();
  });

  it("completes the command on Enter without sending a message", async () => {
    const send = vi.spyOn(messageService, "send");
    setup();
    const box = type("/wea");
    await waitFor(() => expect(screen.getByText("/weather")).toBeInTheDocument());

    fireEvent.keyDown(box, { key: "Enter" });

    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe("/weather "));
    expect(send).not.toHaveBeenCalled();
  });

  it("moves the selection with the arrow keys", async () => {
    setup();
    const box = type("/");
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));

    expect(screen.getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("closes on Escape", async () => {
    setup();
    const box = type("/");
    await waitFor(() => expect(screen.getByRole("listbox", { name: /run a command/i })).toBeInTheDocument());

    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: /run a command/i })).not.toBeInTheDocument();
  });
});

describe("running a slash command", () => {
  beforeEach(() => {
    resetMessageStore();
    vi.restoreAllMocks();
    vi.spyOn(commandService, "list").mockResolvedValue(COMMANDS);
  });

  const setup = () =>
    renderWithProviders(<MessageComposer conversation={channel} />, {
      currentUser: me,
      users: [me],
    });

  const submit = async (value: string) => {
    const box = screen.getByRole("textbox");

    // Wait on the menu rather than on the request: the composer only treats a
    // draft as a command once the list has actually reached its state, and the
    // menu appearing is the first observable proof that it has.
    fireEvent.change(box, { target: { value: "/", selectionStart: 1 } });
    await waitFor(() =>
      expect(screen.getByRole("listbox", { name: /run a command/i })).toBeInTheDocument(),
    );

    fireEvent.change(box, { target: { value, selectionStart: value.length } });
    fireEvent.click(screen.getByRole("button", { name: /^send$/i }));
  };

  it("runs the command instead of posting it as a message", async () => {
    const run = vi
      .spyOn(commandService, "run")
      .mockResolvedValue({ responseType: "ephemeral", text: "It is raining." });
    const send = vi.spyOn(messageService, "send");

    setup();
    await submit("/weather London");

    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({
        channelId: "ch_test",
        command: "weather",
        text: "London",
      }),
    );
    // The point of the feature: "/weather London" must not become a message.
    expect(send).not.toHaveBeenCalled();
  });

  it("shows an ephemeral reply as private, not as a message", async () => {
    vi.spyOn(commandService, "run").mockResolvedValue({
      responseType: "ephemeral",
      text: "It is raining.",
    });
    setup();
    await submit("/weather London");

    await waitFor(() => expect(screen.getByText("It is raining.")).toBeInTheDocument());
    expect(screen.getByText(/only you/i)).toBeInTheDocument();
  });

  it("does not echo an in_channel reply — the server already posted it", async () => {
    vi.spyOn(commandService, "run").mockResolvedValue({
      responseType: "in_channel",
      text: "Posted for everyone",
    });
    setup();
    await submit("/weather London");

    await waitFor(() => expect(commandService.run).toHaveBeenCalled());
    expect(screen.queryByText(/only you/i)).not.toBeInTheDocument();
  });

  it("surfaces the server's refusal instead of failing silently", async () => {
    vi.spyOn(commandService, "run").mockRejectedValue({
      code: "command_failed",
      message: "The command did not respond",
      status: 502,
    });
    setup();
    await submit("/weather London");

    await waitFor(() =>
      expect(screen.getByText("The command did not respond")).toBeInTheDocument(),
    );
  });

  it("sends an unregistered slash word as an ordinary message", async () => {
    const run = vi.spyOn(commandService, "run");
    const send = vi.spyOn(messageService, "send").mockResolvedValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {} as any,
    );

    setup();
    await submit("/notacommand hello");

    await waitFor(() => expect(send).toHaveBeenCalled());
    expect(run).not.toHaveBeenCalled();
  });
});
