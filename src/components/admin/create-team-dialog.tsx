"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Loader2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { teamService } from "@/services";
import { isApiError } from "@/services/http";
import type { Team } from "@/types";

/** Creates an empty team. The caller then opens it to add people and channels. */
export function CreateTeamDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (team: Team) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const team = await teamService.create({ name: name.trim(), description: description.trim() });
      await queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team created", { description: team.name });
      onOpenChange(false);
      reset();
      onCreated(team);
    } catch (caught) {
      setError(isApiError(caught) ? caught.message : "Could not create the team. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isSaving) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Create a team</DialogTitle>
            <DialogDescription>
              A team is a group of people with channels of their own. Next you can add people to it —
              they join all of its channels.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                autoFocus
                value={name}
                maxLength={60}
                placeholder="e.g. Engineering"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-description">What is it for? (optional)</Label>
              <Input
                id="team-description"
                value={description}
                maxLength={250}
                placeholder="e.g. Everyone who builds the product"
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!name.trim() || isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : <UsersRound />}
              Create team
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
