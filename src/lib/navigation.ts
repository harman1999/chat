/**
 * Leaves the current account: a full page load to `path`.
 *
 * Used whenever the signed-in account changes — sign-in, sign-out, switching
 * or creating a workspace. A client-side navigation would keep this tab's
 * query cache and its realtime socket, both belonging to the previous
 * account, which may be in another workspace. Reloading is the one way to be
 * sure none of it carries over.
 */
export function reloadAs(path: string): void {
  // Not router.push, which Next's lint rule suggests for internal pages:
  // keeping the page alive is exactly what must not happen here.
  window.location.assign(path);
}
