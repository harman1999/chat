"use client";

import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingRow, SettingSection, SettingSelect } from "@/components/settings";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { adminService } from "@/services";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AdminPage } from "./admin-page";
import { StatTile } from "./stat-tile";

/**
 * Storage breakdown.
 *
 * A stacked bar rather than a pie: five categories with one dominant slice are
 * far easier to compare along a shared baseline, and it doubles as the quota
 * gauge.
 */
function StorageBar({
  buckets,
  quotaBytes,
}: {
  buckets: { key: string; label: string; bytes: number; fileCount: number }[];
  quotaBytes: number;
}) {
  const used = buckets.reduce((sum, bucket) => sum + bucket.bytes, 0);
  // Categorical slots, not a ramp: these categories have no natural order, and
  // shading by size would re-encode the length the bar already shows.
  const tones = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-fg">
          {formatBytes(used)}{" "}
          <span className="font-normal text-fg-muted">of {formatBytes(quotaBytes)} used</span>
        </p>
        <p className="text-2xs tabular-nums text-fg-subtle">
          {Math.round((used / quotaBytes) * 100)}%
        </p>
      </div>

      <div
        className="mt-2 flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full bg-surface-active"
        role="img"
        aria-label={`Storage used: ${buckets
          .map((bucket) => `${bucket.label} ${formatBytes(bucket.bytes)}`)
          .join(", ")}`}
      >
        {buckets.map((bucket, index) => (
          <span
            key={bucket.key}
            className={cn("first:rounded-l-full", tones[index % tones.length])}
            style={{ width: `calc(${(bucket.bytes / quotaBytes) * 100}% - 2px)` }}
          />
        ))}
      </div>

      <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {buckets.map((bucket, index) => (
          <li key={bucket.key} className="flex items-center gap-2 text-xs">
            <span className={`size-2.5 shrink-0 rounded-sm ${tones[index % tones.length]}`} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg">{bucket.label}</span>
            <span className="shrink-0 tabular-nums text-fg-muted">{formatBytes(bucket.bytes)}</span>
            <span className="w-20 shrink-0 text-right tabular-nums text-fg-subtle">
              {bucket.fileCount.toLocaleString()} files
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StorageAdmin() {
  const storageQuery = useQuery({ queryKey: ["admin-storage"], queryFn: () => adminService.storage() });
  const statsQuery = useQuery({ queryKey: ["admin-stats"], queryFn: () => adminService.stats() });

  const [maxUpload, setMaxUpload] = useState("50");
  const [retention, setRetention] = useState("730");
  const [blockExecutables, setBlockExecutables] = useState(true);
  const [scanUploads, setScanUploads] = useState(true);

  const used = storageQuery.data?.reduce((sum, bucket) => sum + bucket.bytes, 0) ?? 0;
  const files = storageQuery.data?.reduce((sum, bucket) => sum + bucket.fileCount, 0) ?? 0;
  const quota = statsQuery.data?.storageQuotaBytes ?? 0;

  return (
    <AdminPage
      title="File storage"
      description="What the workspace is storing, and the rules applied to new uploads."
    >
      <div className="space-y-8">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Used"
            value={formatBytes(used)}
            hint={quota ? `of ${formatBytes(quota)} quota` : undefined}
            icon={HardDrive}
            isPending={storageQuery.isPending}
          />
          <StatTile
            label="Files"
            value={files.toLocaleString()}
            hint="across all channels"
            isPending={storageQuery.isPending}
          />
          <StatTile
            label="Largest category"
            value={storageQuery.data?.[0]?.label ?? "—"}
            hint={storageQuery.data?.[0] ? formatBytes(storageQuery.data[0].bytes) : undefined}
            isPending={storageQuery.isPending}
          />
        </div>

        <SettingSection title="Usage by type" description="Totals across every channel and direct message.">
          <div className="p-4">
            {storageQuery.isPending || statsQuery.isPending ? (
              <div className="space-y-3" aria-hidden>
                <Skeleton className="h-4 w-48 rounded-full" />
                <Skeleton className="h-2.5 w-full rounded-full" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            ) : (
              <StorageBar buckets={storageQuery.data ?? []} quotaBytes={quota} />
            )}
          </div>
        </SettingSection>

        <SettingSection title="Upload rules" description="Applied to every new file.">
          <SettingRow
            label="Maximum file size"
            description="Larger uploads are rejected before they start."
            htmlFor="storage-max"
            control={
              <div className="flex items-center gap-1.5">
                <Input
                  id="storage-max"
                  type="number"
                  min={1}
                  max={5000}
                  value={maxUpload}
                  onChange={(event) => setMaxUpload(event.target.value)}
                  className="w-24"
                />
                <span className="text-xs text-fg-muted">MB</span>
              </div>
            }
          />
          <SettingRow
            label="File retention"
            description="Files older than this are deleted permanently."
            htmlFor="storage-retention"
            control={
              <SettingSelect
                id="storage-retention"
                value={retention}
                onChange={(event) => {
                  setRetention(event.target.value);
                  toast.success("Retention updated", {
                    description:
                      event.target.value === "0"
                        ? "Files are kept indefinitely."
                        : `Files are deleted after ${event.target.value} days.`,
                  });
                }}
              >
                <option value="0">Keep forever</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
                <option value="730">2 years</option>
              </SettingSelect>
            }
          />
          <SettingRow
            label="Block executable files"
            description="Rejects .exe, .bat, .sh and similar attachments."
            htmlFor="storage-exec"
            control={
              <Switch id="storage-exec" checked={blockExecutables} onCheckedChange={setBlockExecutables} />
            }
          />
          <SettingRow
            label="Scan uploads for malware"
            description="Files are quarantined until the scan completes."
            htmlFor="storage-scan"
            control={<Switch id="storage-scan" checked={scanUploads} onCheckedChange={setScanUploads} />}
          />
        </SettingSection>
      </div>
    </AdminPage>
  );
}
