import { env } from "@server/env";
import { handler, json, parseBody, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { sendMail, mailEnabled } from "@server/lib/mail";
import { inviteEmail } from "@server/lib/mail-templates";
import { requirePermission } from "@server/lib/permissions";
import { INVITE_RULE } from "@server/lib/rate-limit";
import { createInviteSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";
import { invitesRepo } from "@server/repo/invites";
import { usersRepo } from "@server/repo/users";
import { workspacesRepo } from "@server/repo/workspaces";

// A person must be signed in to invite: an integration token handing out
// workspace access is not something anyone should discover after the fact.

export const GET = handler(async () => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_user_invite");
  return json(await invitesRepo.listActive(workspaceId));
});

export const POST = handler(async (request: Request) => {
  const { user, workspaceId } = await requireUserSession();
  await requirePermission(user.id, "p_user_invite");
  const body = await parseBody(request, createInviteSchema);

  // Asked before anything is created: a link nobody was told about, made by a
  // request that was supposed to email people, would be a confusing leftover.
  const wanted = [...new Set(body.emails.map((email) => email.toLowerCase()))];
  if (wanted.length > 0 && !mailEnabled()) {
    return problem(
      503,
      "mail_unavailable",
      "Email is not set up here, so the link cannot be sent. Create it without addresses and share it yourself.",
    );
  }

  const { link, token } = await invitesRepo.create({
    workspaceId,
    createdBy: user.id,
    expiresInDays: body.expiresInDays,
    maxUses: body.maxUses,
  });
  const url = `${env.publicUrl}/join/${token}`;

  // People who already have an account here cannot use the link, so they are
  // reported rather than emailed.
  const alreadyMembers: string[] = [];
  const recipients: string[] = [];
  for (const email of wanted) {
    ((await usersRepo.findByEmail(workspaceId, email)) ? alreadyMembers : recipients).push(email);
  }

  const workspaceName = (await workspacesRepo.name(workspaceId)) ?? "your workspace";
  const results = await Promise.all(
    recipients.map(async (email) => ({
      email,
      sent: await sendMail(
        inviteEmail({
          to: email,
          inviterName: user.displayName,
          workspaceName,
          url,
          days: body.expiresInDays,
        }),
      ),
    })),
  );
  const emailed = results.filter((result) => result.sent).map((result) => result.email);
  const failed = results.filter((result) => !result.sent).map((result) => result.email);

  await audit({
    actorId: user.id,
    action: "invite.link_created",
    category: "user",
    severity: "warning",
    target: `${link.tokenPrefix}… · ${body.expiresInDays}d · ${body.maxUses ?? "unlimited"} uses · ${emailed.length} emailed`,
    request,
  });

  // The only time the full URL exists anywhere.
  return json({ link, url, emailed, failed, alreadyMembers }, { status: 201 });
}, { rateLimit: INVITE_RULE });
