import { handler, noContent, parseBody } from "@server/lib/http";
import { customStatusSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

export const PUT = handler(async (request: Request) => {
  const { user } = await requireSession();
  const body = await parseBody(request, customStatusSchema);

  // A null body, or one with no text, clears the status.
  const text = body?.text?.trim();
  await usersRepo.setCustomStatus(
    user.id,
    text ? { emoji: body?.emoji ?? "💬", text, expiresAt: body?.expiresAt ?? null } : null,
  );
  return noContent();
});
