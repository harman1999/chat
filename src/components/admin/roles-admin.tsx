"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import type { Role } from "@/types";
import { AdminPage } from "./admin-page";
import { CreateRoleDialog } from "./create-role-dialog";

export function RolesAdmin() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

  const askToDelete = (role: Role) =>
    setConfirm({
      title: `Delete ${role.name}?`,
      destructive: true,
      confirmLabel: "Yes, delete",
      cancelLabel: "No, keep it",
      // Says what actually happens to people, not just "are you sure".
      description:
        role.memberCount > 0 ? (
          <>
            <strong className="font-medium text-fg">
              {role.memberCount.toLocaleString()} {role.memberCount === 1 ? "person" : "people"}
            </strong>{" "}
            will be moved to <strong className="font-medium text-fg">Member</strong> and lose
            any permissions only this role gave them. This cannot be undone.
          </>
        ) : (
          <>Nobody has this role, so no one is affected. This cannot be undone.</>
        ),
      onConfirm: async () => {
        try {
          const result = await adminService.deleteRole(role.id);
          await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
          await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
          toast.success("Role deleted", {
            description:
              result.movedMembers > 0
                ? `${result.movedMembers} moved to Member`
                : role.name,
          });
        } catch (error) {
          toast.error("Could not delete the role", {
            description: isApiError(error) ? error.message : undefined,
          });
          // Rethrown so the dialog stays open on failure: closing it would read
          // as success.
          throw error;
        }
      },
    });

  const rolesQuery = useQuery({ queryKey: ["admin-roles"], queryFn: () => adminService.listRoles() });
  const permissionsQuery = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => adminService.listPermissions(),
  });

  const totalPermissions = permissionsQuery.data?.length ?? 0;

  return (
    <AdminPage
      title="Roles"
      description="Roles bundle permissions. Everyone in the workspace has exactly one."
      actions={
        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus />
          Create role
        </Button>
      }
    >
      <CreateRoleDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        roles={rolesQuery.data ?? []}
      />
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />

      {rolesQuery.isPending ? (
        <div className="space-y-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rolesQuery.data?.map((role) => {
            const granted = role.permissionIds.length;
            const ratio = totalPermissions ? Math.round((granted / totalPermissions) * 100) : 0;

            return (
              <article key={role.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface-subtle text-fg-muted">
                    <ShieldCheck className="size-4" aria-hidden />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-fg">{role.name}</h2>
                      {role.isSystem && (
                        <Badge variant="outline" size="sm" className="gap-1">
                          <Lock className="size-2.5" aria-hidden />
                          System
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{role.description}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <span className="flex items-center gap-1.5 text-2xs text-fg-muted">
                        <Users className="size-3.5 text-fg-subtle" aria-hidden />
                        {role.memberCount.toLocaleString()} members
                      </span>
                      <span className="flex min-w-40 items-center gap-2 text-2xs text-fg-muted">
                        {granted} of {totalPermissions} permissions
                        <span
                          className="h-1 flex-1 overflow-hidden rounded-full bg-surface-active"
                          role="img"
                          aria-label={`${ratio}% of permissions granted`}
                        >
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${ratio}%` }}
                          />
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button variant="secondary" size="sm" asChild>
                      <a href="/admin/permissions">Edit permissions</a>
                    </Button>
                    {/* Built-in roles are what the rest of the product assumes
                        exists, so they are not offered for deletion at all
                        rather than offered and then refused. */}
                    {!role.isSystem && (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        aria-label={`Delete ${role.name}`}
                        onClick={() => askToDelete(role)}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
