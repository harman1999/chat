import { handler, noContent, parseBody, problem } from "@server/lib/http";
import { query } from "@server/db/client";
import { emailSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";

export const PUT = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const { email } = await parseBody(request, emailSchema);

  // In production this would send a confirmation link and only write on
  // confirmation; the endpoint shape is the same either way.
  const rows = await query<{ id: string }>(
    `UPDATE users SET email = $2 WHERE id = $1
       AND NOT EXISTS (SELECT 1 FROM users o WHERE o.workspace_id = (SELECT workspace_id FROM users WHERE id = $1)
                        AND lower(o.email) = lower($2) AND o.id <> $1)
     RETURNING id`,
    [user.id, email],
  );
  if (rows.length === 0) return problem(409, "email_taken", "That email is already in use");
  return noContent();
});
