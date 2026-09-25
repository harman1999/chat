"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: string;
  /** Rendered cell. */
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting and search; omit to make the column inert. */
  sortValue?: (row: T) => string | number;
  searchValue?: (row: T) => string;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right";
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  isPending?: boolean;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  /** Right-aligned controls in the toolbar, e.g. filters or an invite button. */
  toolbar?: React.ReactNode;
  onRowClick?: (row: T) => void;
}

/**
 * The one table every admin page uses: client-side search, sort and pagination
 * over an already-fetched list. When these lists grow past a few thousand rows
 * the same props move server-side without the call sites changing.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  isPending = false,
  searchPlaceholder = "Search",
  emptyTitle = "Nothing to show",
  emptyDescription,
  pageSize = 15,
  toolbar,
  onRowClick,
}: DataTableProps<T>) {
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<{ id: string; direction: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);

  // Reset to the first page whenever the result set changes underneath us.
  const resetKey = `${term}|${sort?.id}|${sort?.direction}|${rows.length}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPage(0);
  }

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return rows;
    const searchable = columns.filter((column) => column.searchValue);
    return rows.filter((row) =>
      searchable.some((column) => column.searchValue!(row).toLowerCase().includes(needle)),
    );
  }, [columns, rows, term]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const column = columns.find((item) => item.id === sort.id);
    if (!column?.sortValue) return filtered;

    return [...filtered].sort((a, b) => {
      const left = column.sortValue!(a);
      const right = column.sortValue!(b);
      const delta =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sort.direction === "asc" ? delta : -delta;
    });
  }, [columns, filtered, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (id: string) => {
    setSort((current) =>
      current?.id === id
        ? current.direction === "asc"
          ? { id, direction: "desc" }
          : null
        : { id, direction: "asc" },
    );
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2.5">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
        {toolbar}
      </div>

      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[42rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((column) => {
                const isSorted = sort?.id === column.id;
                const Icon = isSorted && sort.direction === "desc" ? ChevronDown : ChevronUp;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                    className={cn(
                      "px-3 py-2 text-left text-2xs font-semibold uppercase tracking-[0.06em] text-fg-subtle",
                      column.align === "right" && "text-right",
                      column.headerClassName,
                    )}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-fg",
                          isSorted && "text-fg",
                        )}
                      >
                        {column.header}
                        <Icon
                          className={cn("size-3 transition-opacity", isSorted ? "opacity-100" : "opacity-0")}
                          aria-hidden
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {isPending
              ? Array.from({ length: 6 }).map((_, index) => (
                  <tr key={index} className="border-b border-border last:border-b-0">
                    {columns.map((column) => (
                      <td key={column.id} className="px-3 py-2.5">
                        <Skeleton className="h-2.5 w-full max-w-32 rounded-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((row) => (
                  <tr
                    key={rowKey(row)}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-border transition-colors last:border-b-0",
                      onRowClick ? "cursor-pointer hover:bg-surface-hover" : "hover:bg-surface-subtle",
                    )}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "px-3 py-2.5 align-middle",
                          column.align === "right" && "text-right",
                          column.className,
                        )}
                      >
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {!isPending && visible.length === 0 && (
        <EmptyState
          icon={SearchX}
          title={term ? `No matches for “${term}”` : emptyTitle}
          description={term ? "Try a different search term." : emptyDescription}
          compact
        />
      )}

      {sorted.length > pageSize && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2">
          <p className="text-2xs text-fg-subtle">
            {safePage * pageSize + 1}–{Math.min(sorted.length, (safePage + 1) * pageSize)} of{" "}
            {sorted.length.toLocaleString()}
          </p>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous page"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft />
            </Button>
            <span className="text-2xs tabular-nums text-fg-muted">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next page"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
