import { handler, json, parseBody } from "@server/lib/http";
import { UPLOAD_RULE } from "@server/lib/rate-limit";
import { query } from "@server/db/client";
import { uploadTicketSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { newAttachmentId, storageKeyFor } from "@server/lib/storage";

function kindFor(name: string, mime: string): string {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/\.(zip|tar|gz|rar)$/i.test(name)) return "archive";
  if (/\.(json|ts|tsx|js|jsx|sql|sh|ya?ml)$/i.test(name)) return "code";
  return "document";
}

/**
 * Reserves an attachment row and hands back where to PUT the bytes.
 *
 * The same two-step shape a presigned S3 upload uses, so moving to object
 * storage changes only the returned URL.
 */
export const POST = handler(async (request: Request) => {
  const { user } = await requireSession();
  const body = await parseBody(request, uploadTicketSchema);

  const attachmentId = newAttachmentId();
  const mimeType = body.mimeType || "application/octet-stream";
  const storageKey = storageKeyFor(attachmentId, body.fileName);

  await query(
    `INSERT INTO attachments (id, uploaded_by, name, kind, mime_type, size_bytes, storage_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [attachmentId, user.id, body.fileName, kindFor(body.fileName, mimeType), mimeType, body.sizeBytes, storageKey],
  );

  return json({ attachmentId, uploadUrl: `/api/v1/files/${attachmentId}/content` });
}, { rateLimit: UPLOAD_RULE });
