import { randomUUID } from "node:crypto";
import { query } from "../db/client";
import { increment } from "./metrics";
import type { AuditCategory, AuditSeverity } from "../../src/types";

export interface AuditEntry {
  actorId: string;
  action: string;
  category: AuditCategory;
  severity?: AuditSeverity;
  target?: string;
  request?: Request;
}

/**
 * Appends to the audit trail.
 *
 * Deliberately never throws: an audit write failing must not roll back the
 * action it describes, and a 500 on a successful role change would be worse
 * than a missing log line. Failures are logged for the operator instead.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  const ip =
    entry.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    entry.request?.headers.get("x-real-ip") ??
    null;

  try {
    // The workspace is taken from the actor's own row rather than from
    // configuration: an entry recorded against the wrong workspace is worse
    // than a missing one, and a caller cannot get this wrong if it never
    // supplies it.
    const written = await query<{ id: string }>(
      `INSERT INTO audit_log (id, workspace_id, actor_id, action, category, severity, target, ip_address)
       SELECT $1, u.workspace_id, u.id, $3, $4, $5, $6, $7
       FROM users u WHERE u.id = $2
       RETURNING id`,
      [
        `audit_${randomUUID()}`,
        entry.actorId,
        entry.action,
        entry.category,
        entry.severity ?? "info",
        entry.target ?? "",
        ip,
      ],
    );

    // An unknown actor inserts nothing. That is a silent gap in the trail
    // unless it is counted, so it is treated as a failure rather than a no-op.
    if (written.length === 0) {
      increment("audit.failed", entry.action);
      console.error("[audit] no such actor", entry.actorId, entry.action);
      return;
    }
    increment("audit.written", entry.action);
  } catch (error) {
    // Swallowed so the action itself still succeeds — but a silent swallow
    // leaves the trail with holes nobody can see. The counter makes the gap
    // visible even though the log line has scrolled away.
    increment("audit.failed", entry.action);
    console.error("[audit] failed to record", entry.action, error);
  }
}
