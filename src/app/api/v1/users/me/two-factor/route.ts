import { handler, json } from "@server/lib/http";
import { requireUserSession } from "@server/lib/session";
import { twoFactorRepo } from "@server/repo/twoFactor";

/** Whether two-factor is on for the caller, how many recovery codes remain, and whether the workspace requires it. */
export const GET = handler(async () => {
  const { user, workspaceId } = await requireUserSession();
  const [enabled, recoveryCodesLeft, required] = await Promise.all([
    twoFactorRepo.isEnabled(user.id),
    twoFactorRepo.recoveryCodesLeft(user.id),
    twoFactorRepo.isRequired(workspaceId),
  ]);
  return json({ enabled, recoveryCodesLeft, required });
});
