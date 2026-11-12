import { sniffImage } from "@server/lib/images";
import { readBytes, handler, noContent, problem } from "@server/lib/http";
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

  // The 50 MB cap at ticket time applies to a client-*declared* size, so the
  // bytes actually sent are counted as they arrive (a chunked body declares no
  // length), then reconciled against the reservation.
  const data = await readBytes(request, Math.min(MAX_UPLOAD_BYTES, Number(attachment.size_bytes)));
  if (!data) return problem(413, "size_mismatch", "Upload is larger than the reserved size");
  if (data.byteLength > Number(attachment.size_bytes)) {
    return problem(413, "size_mismatch", "Upload is larger than the reserved size");
  }

  await storage.put(attachment.storage_key, data);
  // Record what actually landed, so storage totals reflect bytes on disk.
  await query(`UPDATE attachments SET size_bytes = $2 WHERE id = $1`, [id, data.byteLength]);
  return noContent();
}, { rateLimit: UPLOAD_RULE });

/** PNG, JPEG, WebP or GIF by their opening bytes — never by what the uploader said. */
function sniffServableImage(data: Buffer): string | null {
  const png = sniffImage(data);
  if (png) return png;
  const head = data.toString("latin1", 0, 6);
  return head === "GIF87a" || head === "GIF89a" ? "image/gif" : null;
}

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

  // The type the uploader *declared* is not trusted: an HTML or SVG file served
  // as such from this origin runs as the app, with the viewer's session — one
  // click on a shared file would be an account takeover. Only a file whose bytes
  // really are a raster image is shown in the page; everything else is sent as
  // an opaque download.
  const image = sniffServableImage(data);
  const name = attachment.name.replace(/[\u0000-\u001f\u007f"\\/]/g, "_").slice(0, 200) || "file";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": image ?? "application/octet-stream",
      "Content-Disposition": `${image ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
      // Belt and braces: even if something rendered it, nothing in it may run,
      // load, or reach the network.
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
