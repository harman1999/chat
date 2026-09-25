import { handler, noContent, parseBody } from "@server/lib/http";
import { publish } from "@server/lib/events";
import { presenceKey, redis } from "@server/lib/redis";
import { presenceSchema } from "@server/lib/schemas";
import { requireSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

export const PUT = handler(async (request: Request) => {
  const { user } = await requireSession();
  // Validated against the enum before anything is written: previously an
  // arbitrary string reached both Postgres and Redis, and only the column's
  // CHECK constraint stopped it — as an opaque 500, after the Redis write.
  const { status } = await parseBody(request, presenceSchema);

  await usersRepo.setPresence(user.id, status);
  // Presence expires on its own, so a process that dies never strands a user
  // as permanently "online".
  await redis.set(presenceKey(user.id), status, "EX", 120);
  await publish(status === "offline" ? "user.offline" : "user.online", {
    userId: user.id,
    status,
  });
  return noContent();
});
