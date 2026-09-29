import { handler, noContent, problem } from "@server/lib/http";
import { audit } from "@server/lib/audit";
import { publish } from "@server/lib/events";
import { requirePermission } from "@server/lib/permissions";
import { requireSession } from "@server/lib/session";
import { teamsRepo } from "@server/repo/teams";

/** Takes someone out of the team, and out of the channels it has. */
export const DELETE = handler(
  async (request: Request, ctx: { params: Promise<{ id: string; userId: string }> }) => {
    const { user, workspaceId } = await requireSession();
    await requirePermission(user.id, "p_team_manage");
    const { id, userId } = await ctx.params;

    if (!(await teamsRepo.removeMember(workspaceId, id, userId))) {
      return problem(404, "not_found", "That person is not in this team");
    }
    await publish("channel.membership", { teamId: id }, { userIds: [userId] });
    await audit({
      actorId: user.id,
      action: "team.member_removed",
      category: "user",
      severity: "warning",
      target: `${userId} from ${id}`,
      request,
    });
    return noContent();
  },
);
