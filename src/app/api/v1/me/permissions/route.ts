import { handler, json } from "@server/lib/http";
import { query } from "@server/db/client";
import { requireSession } from "@server/lib/session";

/**
 * The caller's own permissions.
 *
 * So the interface can leave out controls the person cannot use, rather than
 * showing them and refusing on click. The server still checks every action —
 * this only decides what is offered, never what is allowed.
 */
export const GET = handler(async () => {
  const { user } = await requireSession();
  const rows = await query<{ permission_id: string }>(
    // Same workspace join as hasPermission, so this never offers more than it allows.
    `SELECT rp.permission_id FROM users u
       JOIN roles r ON r.id = u.role_id AND r.workspace_id = u.workspace_id
       JOIN role_permissions rp ON rp.role_id = r.id
      WHERE u.id = $1`,
    [user.id],
  );
  return json(rows.map((row) => row.permission_id));
});
