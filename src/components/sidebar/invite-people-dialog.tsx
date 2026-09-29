"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { inviteService } from "@/services";
import { isApiError } from "@/services/http";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InviteLink } from "@/types";

const EXPIRY = [
  { value: 1, label: "1 day" },
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
] as const;

const USES = [
  { value: 1, label: "1 person" },
  { value: 10, label: "10 people" },
  { value: null, label: "No limit" },
] as const;

function Choice<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-fg">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md border px-2 py-1.5 text-xs transition-colors",
              value === option.value
                ? "border-accent bg-accent-subtle font-medium text-accent-subtle-fg"
                : "border-border text-fg-muted hover:bg-surface-hover hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function describeUses(link: InviteLink): string {
  if (link.maxUses === null) return `${link.useCount} joined · no limit`;
  return `${link.useCount} of ${link.maxUses} used`;
}

/**
 * Invite people with a link.
 *
 * There is no mail transport, so this does not send anything: it makes a link
 * the inviter shares however they like, and the invitee chooses their own name
 * and password when they open it. The copy says so plainly rather than
 * implying an email goes out.
 */
export function InvitePeopleDialog({
  open,
  onOpenChange,
  workspaceName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceName: string;
}) {
  const queryClient = useQueryClient();
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [maxUses, setMaxUses] = useState<number | null>(10);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const { data: links, isPending } = useQuery({
    queryKey: ["invite-links"],
    queryFn: () => inviteService.listActive(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => inviteService.create({ expiresInDays, maxUses }),
    onSuccess: async (result) => {
      setUrl(result.url);
      setCopied(false);
      await queryClient.invalidateQueries({ queryKey: ["invite-links"] });
    },
    onError: (error) =>
      toast.error("Could not create the link", {
        description: isApiError(error) ? error.message : undefined,
      }),
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy", { description: "Select the link and copy it manually." });
    }
  };

  const askToRevoke = (link: InviteLink) =>
    setConfirm({
      title: "Turn off this invite link?",
      destructive: true,
      confirmLabel: "Yes, turn off",
      cancelLabel: "No",
      description: (
        <>
          Anyone who has it will no longer be able to join with it. People who already joined
          keep their accounts.
        </>
      ),
      onConfirm: async () => {
        try {
          await inviteService.revoke(link.id);
          await queryClient.invalidateQueries({ queryKey: ["invite-links"] });
          toast.success("Invite link turned off");
        } catch (error) {
          toast.error("Could not turn it off", {
            description: isApiError(error) ? error.message : undefined,
          });
          throw error;
        }
      },
    });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          // The URL is shown once; closing forgets it, as the server already has.
          if (!next) setUrl(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite people to {workspaceName}</DialogTitle>
            <DialogDescription>
              Create a link and share it however you like. Nothing is emailed — people who open it
              choose their own name and password, and join as a Member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <Choice label="Link expires after" options={EXPIRY} value={expiresInDays} onChange={setExpiresInDays} />
            <Choice label="Can be used by" options={USES} value={maxUses} onChange={setMaxUses} />

            {url ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-fg">Your invite link</p>
                <div className="flex gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-raised px-2.5 py-1.5 font-mono text-xs text-fg">
                    {url}
                  </code>
                  <Button variant="primary" size="sm" onClick={() => void copy()}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-2xs text-fg-subtle">
                  Copy it now — for security it is only shown this once.
                </p>
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                disabled={create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
                Create invite link
              </Button>
            )}

            <div className="space-y-1.5 border-t border-border pt-3">
              <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle">
                Active links
              </p>
              {isPending ? (
                <p className="py-2 text-xs text-fg-subtle">Loading…</p>
              ) : !links?.length ? (
                <p className="py-2 text-xs text-fg-subtle">No active invite links.</p>
              ) : (
                <ul className="max-h-40 divide-y divide-border overflow-y-auto scrollbar-thin">
                  {links.map((link) => (
                    <li key={link.id} className="flex items-center gap-2 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-2xs text-fg">{link.tokenPrefix}…</p>
                        <p className="truncate text-2xs text-fg-subtle">
                          {describeUses(link)} · expires {formatRelative(link.expiresAt)} · by{" "}
                          {link.createdByName}
                        </p>
                      </div>
                      <Button
                        variant="danger-ghost"
                        size="icon-sm"
                        aria-label="Turn off this invite link"
                        onClick={() => askToRevoke(link)}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
