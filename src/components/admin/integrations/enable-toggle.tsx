"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Power } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { adminService } from "@/services";

type Kind = "incoming-webhooks" | "outgoing-webhooks" | "slash-commands" | "oauth-apps";

/**
 * Enable / disable, shared by every integration list.
 *
 * Disabling exists because deleting is not the same thing: a noisy webhook
 * should be silenceable without losing its history, its delivery record or the
 * secret the receiver already trusts.
 */
export function EnableToggle({
  kind,
  id,
  label,
  isEnabled,
  queryKey,
}: {
  kind: Kind;
  id: string;
  label: string;
  isEnabled: boolean;
  queryKey: string;
}) {
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: () => adminService.integrations.setEnabled(kind, id, !isEnabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast.success(isEnabled ? "Disabled" : "Enabled", { description: label });
    },
    onError: () => toast.error("Could not change it", { description: label }),
  });

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`${isEnabled ? "Disable" : "Enable"} ${label}`}
      title={isEnabled ? "Disable" : "Enable"}
      onClick={() => toggle.mutate()}
      disabled={toggle.isPending}
      className={isEnabled ? undefined : "text-fg-subtle"}
    >
      <Power />
    </Button>
  );
}
