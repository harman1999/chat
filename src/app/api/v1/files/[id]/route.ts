import { handler, noContent, problem } from "@server/lib/http";
import { query, queryOne } from "@server/db/client";
import { requireSession } from "@server/lib/session";
import { storage } from "@server/lib/storage";

export const DELETE = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { user } = await requireSession();
  const { id } = await ctx.params;

  const attachment = await queryOne<{ storage_key: string; uploaded_by: string }>(
    `SELECT storage_key, uploaded_by FROM attachments WHERE id = $1`,
    [id],
  );
  if (!attachment) return problem(404, "not_found", "Attachment not found");
  if (attachment.uploaded_by !== user.id) {
    return problem(403, "forbidden", "You can only delete your own files");
  }

  await storage.remove(attachment.storage_key);
  await query(`DELETE FROM attachments WHERE id = $1`, [id]);
  return noContent();
});
