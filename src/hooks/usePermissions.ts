import { useQuery } from "@tanstack/react-query";
import { request } from "@/services/http";

/**
 * Whether the signed-in person holds a permission.
 *
 * Used only to decide what to *offer* — a control someone cannot use is left
 * out rather than shown and refused. The server still checks every action, so
 * a stale answer here can only hide a button, never grant anything.
 */
export function usePermission(permissionId: string): boolean {
  const { data } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => request<string[]>("/me/permissions"),
    staleTime: 60_000,
  });
  return Boolean(data?.includes(permissionId));
}
