/**
 * Turns off someone's two-factor sign-in from the command line.
 *
 * For the one case the app cannot handle itself: the workspace Owner has lost their
 * phone and their recovery codes, and there is no one above them to reset it in
 * Admin → Users. It ends their sessions too, so run it only once you are sure the
 * request is genuine — it has the same effect as an administrator's reset.
 *
 *   npm run reset-two-factor -- --email owner@example.com
 *
 * Optional: --workspace <id> when the email has accounts in several workspaces.
 */
import { config } from "dotenv";
import { query } from "../server/db/client";
import { revokeAllSessions } from "../server/lib/session";
import { twoFactorRepo } from "../server/repo/twoFactor";

config({ path: ".env.local", quiet: true });

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

async function main() {
  const email = arg("email");
  if (!email) fail("Required: --email <address>");
  const workspace = arg("workspace");

  const rows = await query<{ id: string; workspace_id: string; email: string }>(
    `SELECT id, workspace_id, email FROM users WHERE lower(email) = lower($1) AND ($2::text IS NULL OR workspace_id = $2)`,
    [email, workspace ?? null],
  );
  if (rows.length === 0) fail(`No account with that email${workspace ? " in that workspace" : ""}.`);
  if (rows.length > 1) fail("That email has accounts in several workspaces. Add --workspace <id>.");

  const [user] = rows;
  if (!(await twoFactorRepo.isEnabled(user.id))) fail(`${user.email} has not set up two-factor.`);

  await twoFactorRepo.disable(user.id);
  const signedOut = await revokeAllSessions(user.id);
  console.log(`\n  Two-factor turned off for ${user.email}. ${signedOut} session(s) ended.\n`);
  process.exit(0);
}

void main();
