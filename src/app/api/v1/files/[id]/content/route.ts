import { handler, noContent, problem } from "@server/lib/http";
import { UPLOAD_RULE } from "@server/lib/rate-limit";
import { query, queryOne } from "@server/db/client";
import { requireSession } from "@server/lib/session";
import { storage } from "@server/lib/storage";

interface AttachmentRow {
  storage_key: string;
  mime_type: string;
  name: string;
  uploaded_by: string;
  channel_id: string | null;
  size_bytes: string;
}

/** Hard ceiling, independent of what the ticket declared. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

async function load(id: string) {
  return queryOne<AttachmentRow>(
    `SELECT storage_key, mime_type, name, uploaded_by, channel_id, size_bytes
     FROM attachments WHERE id = $1`,
    [id],
  );
}

export const PUT = handler(async (request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;

  const attachment = await load(id);
  if (!attachment) return problem(404, "not_found", "Attachment not found");
  if (attachment.uploaded_by !== user.id) {
    return problem(403, "forbidden", "This upload belongs to someone else");
  }

  // The 50 MB cap at ticket time applies to a client-*declared* size. Nothing
  // previously checked the bytes actually sent, so reject on the declared
  // length before buffering, then reconcile against the reservation after.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return problem(413, "file_too_large", "Files must be 50 MB or smaller");
  }

  const data = Buffer.from(await request.arrayBuffer());
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    return problem(413, "file_too_large", "Files must be 50 MB or smaller");
  }
  if (data.byteLength > Number(attachment.size_bytes)) {
    return problem(413, "size_mismatch", "Upload is larger than the reserved size");
  }

  await storage.put(attachment.storage_key, data);
  // Record what actually landed, so storage totals reflect bytes on disk.
  await query(`UPDATE attachments SET size_bytes = $2 WHERE id = $1`, [id, data.byteLength]);
  return noContent();
}, { rateLimit: UPLOAD_RULE });

export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;

  const attachment = await load(id);
  if (!attachment) return problem(404, "not_found", "Attachment not found");

  // An attachment attached to a channel is readable only by its members.
  if (attachment.channel_id) {
    const member = await queryOne<{ ok: boolean }>(
      `SELECT true AS ok FROM channel_members WHERE channel_id = $1 AND user_id = $2`,
      [attachment.channel_id, user.id],
    );
    if (!member) return problem(403, "forbidden", "You cannot access this file");
  } else if (attachment.uploaded_by !== user.id) {
    return problem(403, "forbidden", "You cannot access this file");
  }

  if (!(await storage.exists(attachment.storage_key))) {
    return problem(404, "not_found", "File contents are missing");
  }

  const data = await storage.get(attachment.storage_key);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.name)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
