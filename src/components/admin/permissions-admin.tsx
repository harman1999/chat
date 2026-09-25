"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, Lock, Minus } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { cn } from "@/lib/utils";
import type { Permission } from "@/types";
import { AdminPage } from "./admin-page";

/**
 * Role × permission matrix.
 *
 * A grid rather than per-role checklists: the question administrators actually
 * ask is "who can delete messages?", which reads across a row.
 */
export function PermissionsAdmin() {
  const rolesQuery = useQuery({ queryKey: ["admin-roles"], queryFn: () => adminService.listRoles() });
  const permissionsQuery = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => adminService.listPermissions(),
  });

  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const permissionList = permissionsQuery.data;
  const groups = useMemo(() => {
    const byGroup = new Map<string, Permission[]>();
    for (const permission of permissionList ?? []) {
      const list = byGroup.get(permission.group) ?? [];
      list.push(permission);
      byGroup.set(permission.group, list);
    }
    return [...byGroup.entries()];
  }, [permissionList]);

  const isGranted = (roleId: string, permissionId: string, baseline: boolean) =>
    overrides[`${roleId}:${permissionId}`] ?? baseline;

  const toggle = async (
    roleId: string,
    permissionId: string,
    next: boolean,
    roleName: string,
    label: string,
  ) => {
    setOverrides((current) => ({ ...current, [`${roleId}:${permissionId}`]: next }));
    try {
      await adminService.setRolePermission(roleId, permissionId, next);
      toast.success(next ? "Permission granted" : "Permission revoked", {
        description: `${roleName} · ${label}`,
      });
    } catch {
      // Put the cell back, or the grid shows a change that never happened.
      setOverrides((current) => ({ ...current, [`${roleId}:${permissionId}`]: !next }));
      toast.error("Could not change permission", { description: `${roleName} · ${label}` });
    }
  };

  if (rolesQuery.isPending || permissionsQuery.isPending) {
    return (
      <AdminPage title="Permissions" description="What each role is allowed to do.">
        <Skeleton className="h-96 rounded-lg" />
      </AdminPage>
    );
  }

  const roles = rolesQuery.data ?? [];

  return (
    <AdminPage
      title="Permissions"
      description="What each role is allowed to do. System roles marked with a lock cannot be changed."
    >
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle"
                >
                  Permission
                </th>
                {roles.map((role) => (
                  <th
                    key={role.id}
                    scope="col"
                    className="px-2 py-2 text-center text-2xs font-semibold text-fg-muted"
                  >
                    <span className="flex items-center justify-center gap-1">
                      {role.name}
                      {role.isSystem && <Lock className="size-2.5 text-fg-subtle" aria-hidden />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {groups.map(([group, groupPermissions]) => (
                <Fragment key={group}>
                  <tr className="border-b border-border bg-surface-subtle">
                    <th
                      scope="colgroup"
                      colSpan={roles.length + 1}
                      className="px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle"
                    >
                      {group}
                    </th>
                  </tr>
                  {groupPermissions.map((permission) => (
                    <tr key={permission.id} className="border-b border-border last:border-b-0">
                      <th
                        scope="row"
                        className="sticky left-0 z-[1] bg-surface px-3 py-2 text-left font-normal"
                      >
                        <span className="block text-xs font-medium text-fg">{permission.label}</span>
                        <span className="block text-2xs text-fg-subtle">{permission.description}</span>
                      </th>

                      {roles.map((role) => {
                        const baseline = role.permissionIds.includes(permission.id);
                        const granted = isGranted(role.id, permission.id, baseline);
                        const locked = role.id === "role_owner";

                        return (
                          <td key={role.id} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={granted}
                              aria-label={`${permission.label} for ${role.name}`}
                              disabled={locked}
                              onClick={() =>
                                void toggle(role.id, permission.id, !granted, role.name, permission.label)
                              }
                              className={cn(
                                "grid size-6 place-items-center rounded-md border transition-colors",
                                granted
                                  ? "border-accent/45 bg-accent-subtle text-accent"
                                  : "border-border bg-surface-subtle text-fg-subtle",
                                locked
                                  ? "cursor-not-allowed opacity-60"
                                  : "hover:border-border-strong",
                              )}
                            >
                              {granted ? (
                                <Check className="size-3.5" aria-hidden />
                              ) : (
                                <Minus className="size-3.5" aria-hidden />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminPage>
  );
}
