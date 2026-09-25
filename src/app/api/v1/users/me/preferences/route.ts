import { handler, json, noContent, parseBody } from "@server/lib/http";
import { preferencesSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";
import { defaultPreferences } from "@/config";

export const GET = handler(async () => {
  const { user } = await requireSession();
  const stored = await usersRepo.getPreferences(user.id);
  // Merge over defaults so a preference added after the row was written is
  // never missing from the response.
  return json({ ...defaultPreferences, ...stored });
});

export const PATCH = handler(async (request: Request) => {
  const { user } = await requireSession();
  // A closed schema: the value is merged into jsonb with `||`, so unknown keys
  // would otherwise accumulate in the document unbounded.
  const patch = await parseBody(request, preferencesSchema);
  await usersRepo.mergePreferences(user.id, patch);
  return noContent();
});
