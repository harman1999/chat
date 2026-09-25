import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder shaped like real message blocks, not generic bars. */
export function MessageListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="space-y-4 px-3 py-4 sm:px-4" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-2.5">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-2.5 w-24 rounded-full" />
              <Skeleton className="h-2 w-10 rounded-full" />
            </div>
            <Skeleton className="h-2.5 rounded-full" style={{ width: `${55 + ((index * 13) % 40)}%` }} />
            {index % 3 === 0 && (
              <Skeleton className="h-2.5 rounded-full" style={{ width: `${35 + ((index * 17) % 30)}%` }} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
