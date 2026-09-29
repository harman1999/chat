/**
 * Holding any of these is what makes someone an administrator: it is what
 * opens the Administration area, and what puts it in their menu. Shared by the
 * server (which refuses the page) and the client (which hides the link), so the
 * two cannot disagree about who counts.
 *
 * Deliberately not p_user_invite: inviting people has its own menu item and
 * needs no access to the rest of the area.
 */
export const ADMIN_PERMISSIONS = [
  "p_admin_settings",
  "p_admin_auth",
  "p_admin_audit",
  "p_admin_billing",
  "p_user_manage_roles",
  "p_user_deactivate",
  "p_team_manage",
] as const;
