"use client";

import { FileText, ImageIcon, X } from "lucide-react";
import Image from "next/image";
import { formatBytes } from "@/lib/format";
import type { Attachment } from "@/types";

/** Pending uploads shown above the input until the message is sent. */
export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}) {
  if (attachments.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2 border-b border-border px-2.5 py-2">
      {attachments.map((attachment) => (
        <li
          key={attachment.id}
          className="group/chip relative flex items-center gap-2 rounded-md border border-border bg-surface-subtle py-1 pl-1 pr-7"
        >
          <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-surface text-fg-subtle">
            {attachment.kind === "image" && attachment.thumbnailUrl ? (
              <Image
                src={attachment.thumbnailUrl}
                alt=""
                width={28}
                height={28}
                unoptimized
                className="size-full object-cover"
              />
            ) : attachment.kind === "image" ? (
              <ImageIcon className="size-3.5" aria-hidden />
            ) : (
              <FileText className="size-3.5" aria-hidden />
            )}
          </span>
          <span className="min-w-0">
            <span className="block max-w-40 truncate text-xs font-medium text-fg">
              {attachment.name}
            </span>
            <span className="block text-[0.625rem] text-fg-subtle">
              {formatBytes(attachment.sizeBytes)}
            </span>
          </span>
          <button
            type="button"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => onRemove(attachment.id)}
            className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-fg-subtle transition-colors hover:bg-surface-active hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}
