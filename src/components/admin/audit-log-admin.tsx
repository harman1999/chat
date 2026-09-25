"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUserMap } from "@/hooks";
import { adminService } from "@/services";
import { formatDayDivider, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AuditCategory, AuditLogEntry, AuditSeverity } from "@/types";
import { AdminPage } from "./admin-page";
import { DataTable, type Column } from "./data-table";

const SEVERITY_VARIANT: Record<AuditSeverity, "neutral" | "warning" | "danger"> = {
  info: "neutral",
  warning: "warning",
  critical: "danger",
};

const CATEGORIES: { value: AuditCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "auth", label: "Auth" },
  { value: "user", label: "Users" },
  { value: "channel", label: "Channels" },
  { value: "role", label: "Roles" },
  { value: "file", label: "Files" },
  { value: "system", label: "System" },
];

/**
 * Builds the CSV in the browser from the rows already loaded. A server-side
 * export would need a job runner; this covers the same need for the visible
 * page without pretending to do more.
 */
function exportCsv(rows: AuditLogEntry[], usersById: Record<string, { displayName: string }>) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["timestamp", "action", "category", "severity", "actor", "target", "ip"];

  const body = rows.map((entry) =>
    [
      entry.createdAt,
      entry.action,
      entry.category,
      entry.severity,
      usersById[entry.actorId]?.displayName ?? entry.actorId,
      entry.target,
      entry.ipAddress,
    ]
      .map((value) => escape(String(value)))
      .join(","),
  );

  const blob = new Blob([[header.join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `helix-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  toast.success("Audit log exported", { description: `${rows.length} events` });
}

export function AuditLogAdmin() {
  const [category, setCategory] = useState<AuditCategory | "all">("all");
  const usersById = useUserMap();
  const { data, isPending } = useQuery({
    queryKey: ["admin-audit-log"],
    queryFn: () => adminService.auditLog(),
  });

  const rows = useMemo(
    () => (data ?? []).filter((entry) => category === "all" || entry.category === category),
    [category, data],
  );

  const columns: Column<AuditLogEntry>[] = [
    {
      id: "action",
      header: "Event",
      sortValue: (row) => row.action,
      searchValue: (row) => `${row.action} ${row.target}`,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs text-fg">{row.action}</p>
          <p className="truncate text-2xs text-fg-subtle">{row.target}</p>
        </div>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      sortValue: (row) => usersById[row.actorId]?.displayName ?? "",
      searchValue: (row) => usersById[row.actorId]?.displayName ?? "",
      cell: (row) => {
        const actor = usersById[row.actorId];
        return (
          <span className="flex items-center gap-2">
            {actor && <UserAvatar user={actor} size="xs" />}
            <span className="truncate text-xs text-fg-muted">{actor?.displayName ?? "System"}</span>
          </span>
        );
      },
    },
    {
      id: "severity",
      header: "Severity",
      sortValue: (row) => row.severity,
      cell: (row) => (
        <Badge variant={SEVERITY_VARIANT[row.severity]} size="sm" className="capitalize">
          {row.severity}
        </Badge>
      ),
    },
    {
      id: "ip",
      header: "IP address",
      searchValue: (row) => row.ipAddress,
      cell: (row) => <span className="font-mono text-2xs text-fg-muted">{row.ipAddress}</span>,
    },
    {
      id: "when",
      header: "When",
      align: "right",
      sortValue: (row) => Date.parse(row.createdAt),
      cell: (row) => (
        <span className="whitespace-nowrap text-2xs text-fg-muted" title={formatDayDivider(row.createdAt)}>
          {formatRelative(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <AdminPage
      title="Audit logs"
      description="Every administrative and security-relevant action, retained for 12 months."
      actions={
        <Button
          variant="secondary"
          size="sm"
          disabled={rows.length === 0}
          onClick={() => exportCsv(rows, usersById)}
        >
          <Download />
          Export CSV
        </Button>
      }
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        isPending={isPending}
        pageSize={12}
        searchPlaceholder="Search by event, actor or IP"
        emptyTitle="No matching events"
        toolbar={
          <div className="flex flex-wrap items-center gap-1">
            {CATEGORIES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={category === option.value}
                onClick={() => setCategory(option.value)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  category === option.value
                    ? "bg-accent-subtle text-accent-subtle-fg"
                    : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />
    </AdminPage>
  );
}
