import { handler, noContent, parseBody } from "@server/lib/http";
import { profileSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

export const PATCH = handler(async (request: Request) => {
  const { user } = await requireSession();
  const body = await parseBody(request, profileSchema);

  await usersRepo.updateProfile(user.id, {
    displayName: body.displayName ?? user.displayName,
    fullName: body.fullName ?? user.fullName,
    title: body.title ?? user.title,
    department: body.department ?? user.department,
    timezone: body.timezone ?? user.timezone,
  });
  return noContent();
});
