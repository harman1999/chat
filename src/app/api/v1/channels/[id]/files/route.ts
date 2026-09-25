import { handler, json } from "@server/lib/http";
import { query } from "@server/db/client";
import { ForbiddenError, requireSession } from "@server/lib/session";
import { channelsRepo } from "@server/repo/channels";
import type { Attachment } from "@/types";

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;
  if (!(await channelsRepo.isMember(id, user.id))) {
    throw new ForbiddenError("You are not a member of this channel");
  }

  const rows = await query<{
    id: string; name: string; kind: string; mime_type: string; size_bytes: string;
    storage_key: string; width: number | null; height: number | null;
    uploaded_at: Date; uploaded_by: string;
  }>(
    `SELECT id, name, kind, mime_type, size_bytes, storage_key, width, height, uploaded_at, uploaded_by
     FROM attachments WHERE channel_id = $1 ORDER BY uploaded_at DESC LIMIT 100`,
    [id],
  );

  return json(
    rows.map<Attachment>((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as Attachment["kind"],
      mimeType: row.mime_type,
      sizeBytes: Number(row.size_bytes),
      url: row.storage_key.startsWith("/") ? row.storage_key : `/api/v1/files/${row.id}/content`,
      thumbnailUrl: null,
      width: row.width ?? undefined,
      height: row.height ?? undefined,
      uploadedAt: row.uploaded_at.toISOString(),
      uploadedBy: row.uploaded_by,
    })),
  );
});
