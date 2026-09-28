import { handler, problem } from "@server/lib/http";
import { requireSession } from "@server/lib/session";
import { storage } from "@server/lib/storage";
import { workspacesRepo } from "@server/repo/workspaces";

/**
 * The workspace logo, for its own members. Anyone else gets 404 rather than
 * 403, so the endpoint does not confirm which workspace ids exist.
 */
export const GET = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { workspaceId } = await requireSession();
  const { id } = await ctx.params;
  if (id !== workspaceId) return problem(404, "not_found", "No logo");

  const logo = await workspacesRepo.logo(id);
  if (!logo || !(await storage.exists(logo.key))) return problem(404, "not_found", "No logo");

  const data = await storage.get(logo.key);
  return new Response(new Uint8Array(data), {
    headers: {
      // The type was decided by sniffing at upload, and nosniff stops the
      // browser second-guessing it.
      "Content-Type": logo.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      // The URL carries a version, so a changed logo is a new URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
