"use client";

import Image from "next/image";
import {
  Download,
  FileArchive,
  FileAudio,
  FileCode2,
  FileText,
  FileVideo,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Attachment, AttachmentKind } from "@/types";

const KIND_ICON: Record<AttachmentKind, LucideIcon> = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  document: FileText,
  archive: FileArchive,
  code: FileCode2,
};

function FileCard({ attachment }: { attachment: Attachment }) {
  const Icon = KIND_ICON[attachment.kind];

  return (
    <div className="flex max-w-md items-center gap-2.5 rounded-md border border-border bg-surface-subtle p-2 transition-colors hover:border-border-strong">
      <span className="grid size-9 shrink-0 place-items-center rounded-md border border-border bg-surface text-fg-subtle">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">{attachment.name}</span>
        <span className="block text-2xs uppercase tracking-wide text-fg-subtle">
          {attachment.name.split(".").pop()} · {formatBytes(attachment.sizeBytes)}
        </span>
      </span>
      <Button variant="ghost" size="icon-sm" asChild>
        <a
          href={attachment.url}
          download={attachment.name}
          aria-label={`Download ${attachment.name}`}
        >
          <Download />
        </a>
      </Button>
    </div>
  );
}

function ImageCard({ attachment }: { attachment: Attachment }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const width = attachment.width ?? 640;
  const height = attachment.height ?? 360;

  return (
    <figure className="max-w-md">
      <div
        className="relative overflow-hidden rounded-md border border-border bg-surface-subtle"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {!isLoaded && <Skeleton className="absolute inset-0 rounded-none" />}
        <Image
          src={attachment.url}
          alt={attachment.name}
          width={width}
          height={height}
          onLoad={() => setIsLoaded(true)}
          // Mock assets are local SVGs; real uploads will come from object
          // storage through a configured loader.
          unoptimized
          className={cn(
            "size-full object-cover transition-opacity duration-200",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
        />
      </div>
      <figcaption className="mt-1 flex items-center gap-1.5 text-2xs text-fg-subtle">
        <span className="truncate">{attachment.name}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{formatBytes(attachment.sizeBytes)}</span>
      </figcaption>
    </figure>
  );
}

export function AttachmentList({
  attachments,
  className,
}: {
  attachments: Attachment[];
  className?: string;
}) {
  if (attachments.length === 0) return null;

  return (
    <div className={cn("mt-1.5 space-y-1.5", className)}>
      {attachments.map((attachment) =>
        attachment.kind === "image" ? (
          <ImageCard key={attachment.id} attachment={attachment} />
        ) : (
          <FileCard key={attachment.id} attachment={attachment} />
        ),
      )}
    </div>
  );
}
