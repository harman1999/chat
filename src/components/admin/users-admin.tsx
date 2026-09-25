"use client";

import { useQuery } from "@tanstack/react-query";
import { Ban, Check, MoreHorizontal, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminService } from "@/services";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountStatus, AdminUser } from "@/types";
import { AddMemberDialog } from "./add-member-dialog";
import { AdminPage } from "./admin-page";
import { DataTable, type Column } from "./data-table";

const STATUS_VARIANT: Record<AccountStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  invited: "warning",
  deactivated: "neutral",
};

const STATUS_FILTERS: { value: AccountStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "deactivated", label: "Deactivated" },
];

export function UsersAdmin() {
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "all">("all");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const usersQuery = useQuery({ queryKey: ["admin-users"], queryFn: () => adminService.listUsers() });
  const rolesQuery = useQuery({ queryKey: ["admin-roles"], queryFn: () => adminService.listRoles() });

  const roleName = useMemo(() => {
    const map = new Map(rolesQuery.data?.map((role) => [role.id, role.name]));
    return (id: string) => map.get(id) ?? "Member";
  }, [rolesQuery.data]);

  const rows = useMemo(
    () =>
      (usersQuery.data ?? []).filter(
        (user) => statusFilter === "all" || user.status === statusFilter,
      ),
    [statusFilter, usersQuery.data],
  );

  const columns: Column<AdminUser>[] = [
    {
      id: "user",
      header: "Person",
      sortValue: (row) => row.displayName,
      searchValue: (row) => `${row.displayName} ${row.email} ${row.username}`,
      cell: (row) => (
        <div className="flex items-center gap-2.5">
          <UserAvatar user={row} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg">{row.displayName}</p>
            <p className="truncate text-2xs text-fg-subtle">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortValue: (row) => roleName(row.roleId),
      searchValue: (row) => roleName(row.roleId),
      cell: (row) => <span className="text-xs text-fg-muted">{roleName(row.roleId)}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortValue: (row) => row.status,
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status]} size="sm" className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      id: "twoFactor",
      header: "2FA",
      sortValue: (row) => (row.twoFactorEnabled ? 1 : 0),
      cell: (row) =>
        row.twoFactorEnabled ? (
          <span className="flex items-center gap-1 text-2xs text-success">
            <ShieldCheck className="size-3.5" aria-hidden />
            On
          </span>
        ) : (
          <span className="flex items-center gap-1 text-2xs text-fg-subtle">
            <ShieldOff className="size-3.5" aria-hidden />
            Off
          </span>
        ),
    },
    {
      id: "messages",
      header: "Messages",
      align: "right",
      sortValue: (row) => row.messageCount,
      cell: (row) => (
        <span className="text-xs tabular-nums text-fg-muted">
          {row.messageCount.toLocaleString()}
        </span>
      ),
    },
    {
      id: "lastSignIn",
      header: "Last sign-in",
      sortValue: (row) => (row.lastSignInAt ? Date.parse(row.lastSignInAt) : 0),
      cell: (row) => (
        <span className="text-2xs text-fg-muted">
          {row.lastSignInAt ? formatRelative(row.lastSignInAt) : "Never"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      headerClassName: "w-10",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.displayName}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ShieldCheck />
                Change role
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {(rolesQuery.data ?? []).map((role) => (
                  <DropdownMenuItem
                    key={role.id}
                    disabled={role.id === row.roleId}
                    onSelect={async () => {
                      try {
                        await adminService.setUserRole(row.id, role.id);
                        await usersQuery.refetch();
                        toast.success("Role updated", {
                          description: `${row.displayName} → ${role.name}`,
                        });
                      } catch {
                        toast.error("Could not change role", {
                          description: "You may not have permission.",
                        });
                      }
                    }}
                  >
                    {role.id === row.roleId && <Check />}
                    {role.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="danger"
              onSelect={async () => {
                try {
                  await adminService.setUserStatus(row.id, "deactivated");
                  await usersQuery.refetch();
                  toast.success("Account deactivated", { description: row.displayName });
                } catch {
                  toast.error("Could not deactivate account", {
                    description: "You may not have permission.",
                  });
                }
              }}
            >
              <Ban />
              Deactivate account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <AdminPage
      title="Users"
      description={`${(usersQuery.data?.length ?? 0).toLocaleString()} accounts in this workspace.`}
      actions={
        <Button variant="primary" size="sm" onClick={() => setIsAddOpen(true)}>
          <UserPlus />
          Add member
        </Button>
      }
    >
      <AddMemberDialog open={isAddOpen} onOpenChange={setIsAddOpen} />

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isPending={usersQuery.isPending}
        searchPlaceholder="Search by name, email or username"
        emptyTitle="No accounts match this filter"
        toolbar={
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={statusFilter === filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  statusFilter === filter.value
                    ? "bg-accent-subtle text-accent-subtle-fg"
                    : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        }
      />
    </AdminPage>
  );
}
