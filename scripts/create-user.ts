/**
 * Creates a workspace member from the command line.
 *
 * The same thing Admin → Users → Add member does, for when a shell is closer to
 * hand than a browser — or for the first administrator, before anyone can sign
 * in to use the form. Both go through `usersRepo.create`, so the validation and
 * the resulting row are identical either way.
 *
 *   npm run create-user -- \
 *     --email ada@northwind.io --name "Ada Lovelace" --password "s3cret!"
 *
 * Optional: --username --role --title --department --timezone --channels
 */
import { config } from "dotenv";
import { env } from "../server/env";
import { usersRepo } from "../server/repo/users";

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
  const fullName = arg("name");
  const password = arg("password");

  if (!email || !fullName || !password) {
    fail('Required: --email <address> --name "Full Name" --password <password>');
  }
  // Matched to the API's own minimum, so the two ways in cannot disagree.
  if (password.length < 12) fail("The password must be at least 12 characters.");

  const result = await usersRepo.create({
    // No session here either, so the same single-tenant default applies.
    workspaceId: env.defaultWorkspaceId,
    email,
    fullName,
    password,
    username: arg("username"),
    roleId: arg("role"),
    title: arg("title"),
    department: arg("department"),
    timezone: arg("timezone"),
    channels: (arg("channels") ?? "general").split(",").map((name) => name.trim()),
  });

  if (!result.ok) {
    switch (result.reason) {
      case "email_taken":
        fail(`${email} already has an account.`);
      case "username_taken":
        fail(`The username "${result.username}" is taken. Pass --username to choose another.`);
      case "unknown_role":
        fail(`Unknown role "${result.roleId}". Try role_member, role_admin or role_owner.`);
      case "unknown_channels":
        fail(`No public channel named: ${result.names.join(", ")}`);
    }
  }

  console.log(`
  Created ${result.user.displayName}
    id        ${result.user.id}
    username  ${result.user.username}
    email     ${result.user.email}
    channels  ${result.channels.map((channel) => `#${channel.name}`).join(", ") || "none"}

  They can sign in at /login with the password you supplied.
`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
