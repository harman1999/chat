"use client";

import {
  Bold,
  Code2,
  Italic,
  Link2,
  List,
  Loader2,
  Paperclip,
  SendHorizonal,
  SmilePlus,
  Type,
  X,
} from "lucide-react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Hint } from "@/components/ui/tooltip";
import { useCurrentUserId, useSlashCommands, useUsers } from "@/hooks";
import { commandService, fileService, messageService, realtimeClient } from "@/services";
import { isApiError } from "@/services/http";
import { createOptimisticMessage, useMessageStore, useSettingsStore } from "@/store";
import { cn } from "@/lib/utils";
import type { Attachment, Channel, ID, SlashCommand, User } from "@/types";
import { AttachmentChips } from "./attachment-chips";
import { CommandMenu } from "./command-menu";
import { MentionMenu } from "./mention-menu";

const MAX_HEIGHT = 200;

export interface MessageComposerProps {
  conversation: Channel;
  /** Set when composing inside a thread — replies attach to this root. */
  threadRootId?: ID;
  autoFocus?: boolean;
}

export function MessageComposer({ conversation, threadRootId, autoFocus }: MessageComposerProps) {
  const channelId = conversation.id;
  const isThread = Boolean(threadRootId);
  // Thread drafts are kept apart from the channel draft, so switching between
  // the two never loses either one.
  const draftKey = threadRootId ? `thread:${threadRootId}` : channelId;
  const draft = useMessageStore((state) => state.draftByChannel[draftKey] ?? "");
  const setDraft = useMessageStore((state) => state.setDraft);
  const upsert = useMessageStore((state) => state.upsert);
  const addReply = useMessageStore((state) => state.addReply);
  const replaceOptimistic = useMessageStore((state) => state.replaceOptimistic);
  const patch = useMessageStore((state) => state.patch);

  // The channel composer and a thread composer can be mounted at once, so ids
  // must be unique per instance.
  const inputId = useId();
  const hintId = `${inputId}-hint`;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [commandQuery, setCommandQuery] = useState<string | null>(null);
  /** Shared by both inline menus — only one can be open at a time. */
  const [menuIndex, setMenuIndex] = useState(0);
  /** A command reply only this person can see; not a message, so not stored. */
  const [ephemeral, setEphemeral] = useState<string | null>(null);
  const [isRunningCommand, setIsRunningCommand] = useState(false);
  const [alsoSendToChannel, setAlsoSendToChannel] = useState(false);

  const currentUserId = useCurrentUserId();
  const { data: directory } = useUsers();
  const slashCommands = useSlashCommands();
  const sendBehavior = useSettingsStore((state) => state.messages.sendBehavior);
  const showTypingIndicators = useSettingsStore((state) => state.messages.showTypingIndicators);

  const canSend =
    (draft.trim().length > 0 || attachments.length > 0) &&
    !isSending &&
    // A command is a round trip to someone else's server, so the button stays
    // disabled until it answers rather than letting it be fired twice.
    !isRunningCommand &&
    Boolean(currentUserId);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const needle = mentionQuery.toLowerCase();
    return (directory ?? [])
      .filter((user) => user.id !== currentUserId)
      .filter(
        (user) =>
          user.username.includes(needle) || user.displayName.toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [currentUserId, directory, mentionQuery]);

  const commandMatches = useMemo(() => {
    if (commandQuery === null) return [];
    const needle = commandQuery.toLowerCase();
    return slashCommands
      .filter((command) => command.command.startsWith(needle))
      .slice(0, 6);
  }, [commandQuery, slashCommands]);

  const resize = useCallback(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
  }, []);

  /** Emits typing.started, then a debounced typing.stopped. */
  const signalTyping = useCallback(() => {
    // Opting out of typing indicators also stops broadcasting your own.
    if (!showTypingIndicators) return;
    realtimeClient.send("typing.started", { channelId });
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      realtimeClient.send("typing.stopped", { channelId });
    }, 2500);
  }, [channelId, showTypingIndicators]);

  const updateMenuState = useCallback((value: string, caret: number) => {
    const upToCaret = value.slice(0, caret);

    const mention = /(?:^|\s)@([a-z0-9._-]*)$/i.exec(upToCaret);
    setMentionQuery(mention ? mention[1] : null);

    // Anchored to the very start: a slash mid-sentence is a slash, and "and/or"
    // should not open a command menu.
    const command = /^\/([a-z0-9-]*)$/i.exec(upToCaret);
    setCommandQuery(command ? command[1] : null);

    setMenuIndex(0);
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(draftKey, event.target.value);
      updateMenuState(event.target.value, event.target.selectionStart);
      resize();
      signalTyping();
    },
    [draftKey, resize, setDraft, signalTyping, updateMenuState],
  );

  /** Wraps the current selection, or inserts the markers at the caret. */
  const applyFormat = useCallback(
    (prefix: string, suffix = prefix, placeholder = "text") => {
      const node = textareaRef.current;
      if (!node) return;
      const { selectionStart, selectionEnd, value } = node;
      const selected = value.slice(selectionStart, selectionEnd) || placeholder;
      const next = `${value.slice(0, selectionStart)}${prefix}${selected}${suffix}${value.slice(selectionEnd)}`;

      setDraft(draftKey, next);
      requestAnimationFrame(() => {
        node.focus();
        node.setSelectionRange(selectionStart + prefix.length, selectionStart + prefix.length + selected.length);
        resize();
      });
    },
    [draftKey, resize, setDraft],
  );

  const insertMention = useCallback(
    (user: User) => {
      const node = textareaRef.current;
      if (!node) return;
      const caret = node.selectionStart;
      const before = node.value.slice(0, caret).replace(/@([a-z0-9._-]*)$/i, `@${user.username} `);
      const next = before + node.value.slice(caret);

      setDraft(draftKey, next);
      setMentionQuery(null);
      requestAnimationFrame(() => {
        node.focus();
        node.setSelectionRange(before.length, before.length);
        resize();
      });
    },
    [draftKey, resize, setDraft],
  );

  const insertCommand = useCallback(
    (command: SlashCommand) => {
      const node = textareaRef.current;
      if (!node) return;
      // The command always occupies the start of the draft, so the rest of the
      // line — anything already typed after it — is preserved as its argument.
      const rest = node.value.replace(/^\/[a-z0-9-]*/i, "");
      const next = `/${command.command} ${rest.trimStart()}`;

      setDraft(draftKey, next);
      setCommandQuery(null);
      const caret = command.command.length + 2;
      requestAnimationFrame(() => {
        node.focus();
        node.setSelectionRange(caret, caret);
        resize();
      });
    },
    [draftKey, resize, setDraft],
  );

  const attachFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const accepted: Attachment[] = [];

    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) {
        toast.error("File too large", { description: `${file.name} exceeds the 50 MB limit.` });
        continue;
      }
      try {
        accepted.push(await fileService.upload(file));
      } catch {
        toast.error("Upload failed", { description: file.name });
      }
    }

    setAttachments((current) => [...current, ...accepted]);
  }, []);

  /**
   * Runs the draft as a command when it is one.
   *
   * Returns true when it handled the draft, so `send` knows not to post it as a
   * message — offering a command in the menu and then posting "/weather London"
   * as plain text would be worse than not offering it.
   */
  const runCommandIfAny = useCallback(async (): Promise<boolean> => {
    const match = /^\/([a-z0-9-]+)(?:\s+([\s\S]*))?$/i.exec(draft.trim());
    if (!match) return false;

    const [, name, rest = ""] = match;
    // An unregistered slash word is just text; only a known command is run.
    if (!slashCommands.some((command) => command.command === name.toLowerCase())) return false;

    setIsRunningCommand(true);
    setEphemeral(null);
    try {
      const result = await commandService.run({
        channelId,
        command: name.toLowerCase(),
        text: rest.trim(),
      });
      setDraft(draftKey, "");
      requestAnimationFrame(resize);
      // "in_channel" was already posted by the server and arrives over the
      // socket, so only the private reply needs showing here.
      if (result.responseType === "ephemeral" && result.text) setEphemeral(result.text);
    } catch (error) {
      setEphemeral(
        isApiError(error) ? error.message : `/${name} could not be run.`,
      );
    } finally {
      setIsRunningCommand(false);
    }
    return true;
  }, [channelId, draft, draftKey, resize, setDraft, slashCommands]);

  const send = useCallback(async () => {
    if (!canSend || !currentUserId) return;
    if (await runCommandIfAny()) return;
    const body = draft.trim();
    const mentionedUserIds = (directory ?? [])
      .filter((user) => new RegExp(`@${user.username}\\b`, "i").test(body))
      .map((user) => user.id);

    const optimistic = createOptimisticMessage({
      channelId,
      authorId: currentUserId,
      body,
      attachments,
      mentionedUserIds,
      threadRootId: threadRootId ?? null,
    });

    if (threadRootId) addReply(threadRootId, optimistic);
    else upsert(optimistic);

    // "Also send to channel" posts a second, top-level copy of the reply.
    const broadcast =
      threadRootId && alsoSendToChannel
        ? createOptimisticMessage({ channelId, authorId: currentUserId, body, mentionedUserIds })
        : null;
    if (broadcast) upsert(broadcast);

    setDraft(draftKey, "");
    setAttachments([]);
    setMentionQuery(null);
    setAlsoSendToChannel(false);
    setIsSending(true);
    requestAnimationFrame(resize);

    try {
      const saved = await messageService.send({
        channelId,
        body,
        threadRootId: threadRootId ?? null,
        attachmentIds: attachments.map((a) => a.id),
      });

      // The server assigns the real id. Without swapping it in, the optimistic
      // copy stays alongside the one that arrives over the socket and the
      // message renders twice. (In mock mode `send` returns null, so the
      // optimistic message simply is the message.)
      if (saved) replaceOptimistic(optimistic.id, saved);
      else patch(optimistic.id, { deliveryState: "sent" });

      if (broadcast) patch(broadcast.id, { deliveryState: "sent" });
    } catch {
      patch(optimistic.id, { deliveryState: "failed" });
      if (broadcast) patch(broadcast.id, { deliveryState: "failed" });
      toast.error("Message not sent", { description: "Check your connection and retry." });
    } finally {
      setIsSending(false);
      realtimeClient.send("typing.stopped", { channelId });
    }
  }, [
    addReply,
    alsoSendToChannel,
    attachments,
    canSend,
    channelId,
    currentUserId,
    directory,
    draft,
    draftKey,
    patch,
    replaceOptimistic,
    resize,
    runCommandIfAny,
    setDraft,
    threadRootId,
    upsert,
  ]);

  /**
   * Whichever inline menu is open.
   *
   * The two are mutually exclusive by construction — a mention needs an `@`
   * and a command needs a `/` in the first position — so one shape lets the
   * arrow, Enter, Tab and Escape handling be written once instead of twice.
   */
  const openMenu = useMemo(() => {
    if (mentionQuery !== null && mentionMatches.length > 0) {
      return {
        length: mentionMatches.length,
        choose: (index: number) => insertMention(mentionMatches[index]),
        close: () => setMentionQuery(null),
      };
    }
    if (commandQuery !== null && commandMatches.length > 0) {
      return {
        length: commandMatches.length,
        choose: (index: number) => insertCommand(commandMatches[index]),
        close: () => setCommandQuery(null),
      };
    }
    return null;
  }, [commandMatches, commandQuery, insertCommand, insertMention, mentionMatches, mentionQuery]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (openMenu) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setMenuIndex((index) => (index + 1) % openMenu.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setMenuIndex((index) => (index - 1 + openMenu.length) % openMenu.length);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          // Clamped: the list can shrink under the cursor as the query narrows.
          openMenu.choose(Math.min(menuIndex, openMenu.length - 1));
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          openMenu.close();
          return;
        }
      }

      if (event.key !== "Enter") return;

      const hasMod = event.metaKey || event.ctrlKey;
      const shouldSend =
        sendBehavior === "enter" ? !event.shiftKey && !hasMod : hasMod;

      if (shouldSend) {
        event.preventDefault();
        void send();
      }
    },
    [menuIndex, openMenu, send, sendBehavior],
  );

  const conversationLabel =
    conversation.kind === "dm" || conversation.kind === "group_dm"
      ? conversation.name
      : `#${conversation.name}`;
  const placeholder = isThread ? "Reply to thread..." : `Message ${conversationLabel}`;

  return (
    <div className="relative px-3 pb-3 sm:px-4">
      {/* Only one can be open: a mention needs an @, a command needs a leading /. */}
      {mentionQuery !== null && (
        <div className="relative">
          <MentionMenu
            users={mentionMatches}
            activeIndex={Math.min(menuIndex, Math.max(mentionMatches.length - 1, 0))}
            onSelect={insertMention}
          />
        </div>
      )}

      {commandQuery !== null && (
        <div className="relative">
          <CommandMenu
            commands={commandMatches}
            activeIndex={Math.min(menuIndex, Math.max(commandMatches.length - 1, 0))}
            onSelect={insertCommand}
          />
        </div>
      )}

      {/* A command's private reply. Not a message, so it is never stored or
          sent — it belongs to this composer and disappears with it. */}
      {ephemeral && (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 rounded-lg border border-border bg-surface-raised px-2.5 py-2"
        >
          <span className="mt-0.5 shrink-0 text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
            Only you
          </span>
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs text-fg">{ephemeral}</p>
          <button
            type="button"
            onClick={() => setEphemeral(null)}
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      <div
        className={cn(
          "rounded-lg border border-border bg-surface shadow-xs transition-[border-color,box-shadow]",
          "focus-within:border-accent focus-within:shadow-sm",
        )}
      >
        <AttachmentChips
          attachments={attachments}
          onRemove={(id) => setAttachments((current) => current.filter((item) => item.id !== id))}
        />

        {/* Formatting row */}
        <div className="flex items-center gap-0.5 border-b border-border px-1.5 py-1">
          <Hint label="Bold" shortcut="⌘B">
            <Button variant="ghost" size="icon-xs" aria-label="Bold" onClick={() => applyFormat("**")}>
              <Bold />
            </Button>
          </Hint>
          <Hint label="Italic" shortcut="⌘I">
            <Button variant="ghost" size="icon-xs" aria-label="Italic" onClick={() => applyFormat("*")}>
              <Italic />
            </Button>
          </Hint>
          <Hint label="Code">
            <Button variant="ghost" size="icon-xs" aria-label="Inline code" onClick={() => applyFormat("`")}>
              <Code2 />
            </Button>
          </Hint>
          <Hint label="Link">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Insert link"
              onClick={() => applyFormat("<https://", "|label>", "")}
            >
              <Link2 />
            </Button>
          </Hint>
          <Hint label="Bulleted list">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Bulleted list"
              onClick={() => applyFormat("\n- ", "", "item")}
            >
              <List />
            </Button>
          </Hint>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <Hint label="Code block">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Code block"
              onClick={() => applyFormat("```\n", "\n```", "code")}
            >
              <Type />
            </Button>
          </Hint>
        </div>

        <label htmlFor={inputId} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={inputId}
          ref={textareaRef}
          rows={1}
          value={draft}
          autoFocus={autoFocus}
          placeholder={isThread ? "Reply..." : "Type a message..."}
          aria-describedby={isThread ? undefined : hintId}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            setMentionQuery(null);
            setCommandQuery(null);
          }}
          onPaste={(event) => {
            if (event.clipboardData.files.length > 0) {
              event.preventDefault();
              void attachFiles(event.clipboardData.files);
            }
          }}
          className="scrollbar-thin block max-h-[200px] w-full resize-none bg-transparent px-2.5 py-2 text-base leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
        />

        {/* Action row */}
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(event) => {
              void attachFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <Hint label="Attach a file">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Attach a file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip />
            </Button>
          </Hint>

          <EmojiPicker
            side="top"
            onSelect={(emoji) => {
              setDraft(draftKey, draft + emoji);
              requestAnimationFrame(() => {
                textareaRef.current?.focus();
                resize();
              });
            }}
          >
            <Button variant="ghost" size="icon-sm" aria-label="Add emoji">
              <SmilePlus />
            </Button>
          </EmojiPicker>

          {/* The thread panel is too narrow for the hint at any viewport size. */}
          {!isThread && (
            <p id={hintId} className="ml-1 hidden items-center gap-1 text-2xs text-fg-subtle md:flex">
              {sendBehavior === "enter" ? (
                <>
                  <Kbd>Enter</Kbd> to send
                  <span className="mx-0.5" aria-hidden>
                    ·
                  </span>
                  <Kbd>⇧</Kbd>
                  <Kbd>Enter</Kbd> for a new line
                </>
              ) : (
                <>
                  <Kbd>⌘</Kbd>
                  <Kbd>Enter</Kbd> to send
                  <span className="mx-0.5" aria-hidden>
                    ·
                  </span>
                  <Kbd>Enter</Kbd> for a new line
                </>
              )}
            </p>
          )}

          <Button
            variant="primary"
            size="sm"
            className="ml-auto"
            disabled={!canSend}
            onClick={() => void send()}
          >
            {isRunningCommand ? <Loader2 className="animate-spin" /> : <SendHorizonal />}
            {isRunningCommand ? "Running" : isThread ? "Reply" : "Send"}
          </Button>
        </div>
      </div>

      {isThread && (
        <label className="mt-1.5 flex w-fit cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs text-fg-muted transition-colors hover:text-fg">
          <input
            type="checkbox"
            checked={alsoSendToChannel}
            onChange={(event) => setAlsoSendToChannel(event.target.checked)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Also send to {conversationLabel}
        </label>
      )}
    </div>
  );
}
