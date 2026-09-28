import { env } from "@server/env";
import { handler, json, parseBody } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { requirePermission } from "@server/lib/permissions";
import { createInviteSchema } from "@server/lib/schemas";
import { requireUserSession } from "@server/lib/session";
import { invitesRepo } from "@server/repo/invites";

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

  const { link, token } = await invitesRepo.create({
    workspaceId,
    createdBy: user.id,
    expiresInDays: body.expiresInDays,
    maxUses: body.maxUses,
  });

  await audit({
    actorId: user.id,
    action: "invite.link_created",
    category: "user",
    severity: "warning",
    target: `${link.tokenPrefix}… · ${body.expiresInDays}d · ${body.maxUses ?? "unlimited"} uses`,
    request,
  });

  // The only time the full URL exists anywhere.
  return json({ link, url: `${env.publicUrl}/join/${token}` }, { status: 201 });
});
