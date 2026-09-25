"use client";

import { useQuery } from "@tanstack/react-query";
import { Lock, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { AdminPage } from "./admin-page";

export function RolesAdmin() {
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

    >
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
