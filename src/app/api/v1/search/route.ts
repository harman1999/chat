import { handler, json } from "@server/lib/http";
import { SEARCH_RULE } from "@server/lib/rate-limit";
import { requireSession } from "@server/lib/session";
import { searchRepo } from "@server/repo/search";
import type { SearchResultKind } from "@/types";

export const GET = handler(async (request: Request) => {
  const { user, workspaceId } = await requireSession();
  const params = new URL(request.url).searchParams;
  const kinds = params.get("kinds")?.split(",").filter(Boolean) as SearchResultKind[] | undefined;

  return json(
    await searchRepo.search(params.get("q") ?? "", user.id, workspaceId, kinds),
  );
}, { rateLimit: SEARCH_RULE });
