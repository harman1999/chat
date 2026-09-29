import { handler, problem } from "@server/lib/http";
import { imageHeaders } from "@server/lib/images";
import { requireSession } from "@server/lib/session";
import { storage } from "@server/lib/storage";
import { usersRepo } from "@server/repo/users";

/**
 * Someone's profile photo, for people in their workspace. Anyone else gets
 * 404, the same as for a person with no photo, so it confirms nothing.
 */
export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { workspaceId } = await requireSession();
  const { id } = await ctx.params;
  const avatar = await usersRepo.avatarOf(id, workspaceId);
  if (!avatar || !(await storage.exists(avatar.key))) return problem(404, "not_found", "No photo");
  const data = await storage.get(avatar.key);
  return new Response(new Uint8Array(data), { headers: imageHeaders(avatar.mime) });
});
