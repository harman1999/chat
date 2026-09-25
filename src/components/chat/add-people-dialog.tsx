"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUsers } from "@/hooks";
import { channelService } from "@/services";
import { cn } from "@/lib/utils";
import type { Channel } from "@/types";

export function AddPeopleDialog({
  conversation,
  open,
  onOpenChange,
}: {
  conversation: Channel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: directory } = useUsers();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Current members are fetched rather than taken from the channel row, which
  // caps its member list.
  const { data: members } = useQuery({
    queryKey: ["channel-members", conversation.id],
    queryFn: () => channelService.members(conversation.id),
    enabled: open,
  });

  const existing = useMemo(
    () => new Set((members ?? []).map((member) => member.id)),
    [members],
  );

  const candidates = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return (directory ?? [])
      .filter((user) => !existing.has(user.id))
      .filter(
        (user) =>
          !needle ||
          user.displayName.toLowerCase().includes(needle) ||
          user.username.includes(needle),
      )
      .slice(0, 50);
  }, [directory, existing, term]);

  const submit = async () => {
    if (selected.length === 0) return;
    setIsSaving(true);
    try {
      const { added } = await channelService.addMembers(conversation.id, selected);
      await queryClient.invalidateQueries({ queryKey: ["channel-members", conversation.id] });
      await queryClient.invalidateQueries({ queryKey: ["channels"] });
      toast.success(
        added.length === 1 ? "1 person added" : `${added.length} people added`,
        { description: `#${conversation.name}` },
      );
      onOpenChange(false);
      setSelected([]);
      setTerm("");
    } catch {
      toast.error("Could not add people", { description: "You may not have permission." });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add people to #{conversation.name}</DialogTitle>
          <DialogDescription>
            They will see the channel&apos;s full history.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
              aria-hidden
            />
            <Input
              autoFocus
              value={term}
              placeholder="Search people"
              aria-label="Search people"
              onChange={(event) => setTerm(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <ul className="max-h-64 overflow-y-auto scrollbar-thin px-3 py-2" role="listbox" aria-multiselectable>
          {candidates.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-fg-subtle">
              {term ? `Nobody matches “${term}”.` : "Everyone is already in this channel."}
            </li>
          )}
          {candidates.map((user) => {
            const isSelected = selected.includes(user.id);
            return (
              <li key={user.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() =>
                    setSelected((current) =>
                      isSelected
                        ? current.filter((id) => id !== user.id)
                        : [...current, user.id],
                    )
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    isSelected ? "bg-accent-subtle" : "hover:bg-surface-hover",
                  )}
                >
                  <UserAvatar user={user} size="sm" showPresence ringClassName="border-surface-raised" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-fg">
                      {user.displayName}
                    </span>
                    <span className="block truncate text-[0.625rem] text-fg-subtle">{user.title}</span>
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-accent" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <p className="mr-auto self-center text-2xs text-fg-subtle">
            {selected.length > 0 ? `${selected.length} selected` : "Select people to add"}
          </p>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={selected.length === 0 || isSaving}
            onClick={() => void submit()}
          >
            {isSaving && <Loader2 className="animate-spin" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
