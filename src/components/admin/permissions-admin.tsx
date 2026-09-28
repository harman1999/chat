"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Minus, RotateCcw, Save } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { adminService } from "@/services";
import { isApiError } from "@/services/http";
import { cn } from "@/lib/utils";
import type { Permission, Role } from "@/types";
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

  const queryClient = useQueryClient();
  /**
   * Edits not yet saved: roleId:permissionId → the value it will become.
   *
   * Clicking a cell used to save immediately. Now edits collect here and apply
   * together on Save, after a confirmation listing exactly what changes — so
   * both granting and removing are confirmed, without a prompt on every click.
   */
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);

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

  const keyOf = (roleId: string, permissionId: string) => `${roleId}:${permissionId}`;
  const isGranted = (roleId: string, permissionId: string, baseline: boolean) =>
    pending[keyOf(roleId, permissionId)] ?? baseline;

  const edit = (roleId: string, permissionId: string, baseline: boolean) => {
    const key = keyOf(roleId, permissionId);
    setPending((current) => {
      const next = !(current[key] ?? baseline);
      const updated = { ...current };
      // Clicking a cell back to where it started is not a change.
      if (next === baseline) delete updated[key];
      else updated[key] = next;
      return updated;
    });
  };

  const changeCount = Object.keys(pending).length;

  // Leaving with unsaved edits would lose them silently otherwise.
  useEffect(() => {
    if (changeCount === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changeCount]);

  const reviewAndSave = (roles: Role[], permissions: Permission[]) => {
    const labelOf = new Map(permissions.map((permission) => [permission.id, permission.label]));
    const changes = Object.entries(pending).map(([key, granted]) => {
      const [roleId, permissionId] = key.split(":");
      return { roleId, permissionId, granted };
    });
    const removals = changes.filter((change) => !change.granted).length;

    // Grouped by role, because the question being answered is "what can each
    // role do after this?" — and each role says how many people it affects.
    const byRole = roles
      .map((role) => ({
        role,
        grants: changes.filter((c) => c.roleId === role.id && c.granted),
        removes: changes.filter((c) => c.roleId === role.id && !c.granted),
      }))
      .filter((entry) => entry.grants.length + entry.removes.length > 0);

    setConfirm({
      title: `Save ${changes.length} ${changes.length === 1 ? "change" : "changes"}?`,
      // Removing takes something away from people at once; that reads in red.
      destructive: removals > 0,
      confirmLabel: "Yes, save",
      cancelLabel: "No",
      description: (
        <div className="space-y-3">
          <p>These take effect for everyone with the role as soon as you save.</p>
          <ul className="max-h-64 space-y-2.5 overflow-y-auto scrollbar-thin">
            {byRole.map(({ role, grants, removes }) => (
              <li key={role.id}>
                <p className="text-xs font-semibold text-fg">
                  {role.name}
                  <span className="ml-1 font-normal text-fg-subtle">
                    · {role.memberCount.toLocaleString()}{" "}
                    {role.memberCount === 1 ? "person" : "people"}
                  </span>
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {grants.map((c) => (
                    <li key={c.permissionId} className="flex items-center gap-1.5">
                      <Check className="size-3 text-success" aria-hidden />
                      <span className="text-success">Grant</span>
                      <span className="text-fg">{labelOf.get(c.permissionId)}</span>
                    </li>
                  ))}
                  {removes.map((c) => (
                    <li key={c.permissionId} className="flex items-center gap-1.5">
                      <Minus className="size-3 text-danger" aria-hidden />
                      <span className="text-danger">Remove</span>
                      <span className="text-fg">{labelOf.get(c.permissionId)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ),
      onConfirm: async () => {
        try {
          const { applied } = await adminService.savePermissionChanges(changes);
          await queryClient.invalidateQueries({ queryKey: ["admin-roles"] });
          setPending({});
          toast.success(`Saved ${applied} ${applied === 1 ? "change" : "changes"}`);
        } catch (error) {
          // All or nothing: a failure means none applied, so the edits stay
          // pending for another try rather than being half-saved.
          toast.error("Nothing was saved", {
            description: isApiError(error) ? error.message : "Try again.",
          });
          throw error;
        }
      },
    });
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
      // Pinned below the admin bar, so Save and Discard stay reachable however
      // far down the grid you are.
      stickyHeader
      actions={
        <>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "flex items-center gap-1.5 self-center text-xs",
              changeCount > 0 ? "font-medium text-warning" : "text-fg-subtle",
            )}
          >
            <span
              className={cn(
                "size-2 rounded-full",
                changeCount > 0 ? "bg-warning" : "bg-success",
              )}
              aria-hidden
            />
            {changeCount > 0
              ? `${changeCount} unsaved ${changeCount === 1 ? "change" : "changes"}`
              : "All changes saved"}
          </span>
          {/* The same size and weight as Create role on the Roles page. Disabled
              rather than hidden when there is nothing to do, so they never move. */}
          <Button
            variant="secondary"
            size="sm"
            disabled={changeCount === 0}
            onClick={() => setPending({})}
          >
            <RotateCcw />
            Discard
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={changeCount === 0}
            onClick={() => reviewAndSave(roles, permissionList ?? [])}
          >
            <Save />
            Save changes
          </Button>
        </>
      }
    >
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />

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
                        const locked = role.kind === "owner";
                        const isUnsaved = keyOf(role.id, permission.id) in pending;

                        return (
                          <td key={role.id} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={granted}
                              aria-label={`${permission.label} for ${role.name}${isUnsaved ? ", unsaved" : ""}`}
                              disabled={locked}
                              onClick={() => edit(role.id, permission.id, baseline)}
                              className={cn(
                                "grid size-6 place-items-center rounded-md border transition-colors",
                                granted
                                  ? "border-accent/45 bg-accent-subtle text-accent"
                                  : "border-border bg-surface-subtle text-fg-subtle",
                                locked
                                  ? "cursor-not-allowed opacity-60"
                                  : "hover:border-border-strong",
                                // Dashed and amber until saved, so an edit is
                                // never mistaken for a change that has happened.
                                isUnsaved && "border-dashed border-warning",
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
