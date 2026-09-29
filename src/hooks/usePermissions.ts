import { useQuery } from "@tanstack/react-query";
import { ADMIN_PERMISSIONS } from "@/lib/permissions";
import { request } from "@/services/http";

/**
 * Whether the signed-in person holds a permission.
 *
 * Used only to decide what to *offer* — a control someone cannot use is left
 * out rather than shown and refused. The server still checks every action, so
 * a stale answer here can only hide a button, never grant anything.
 */
export function usePermission(permissionId: string): boolean {
  return usePermissions().includes(permissionId);
}

/** Whether the person may open the Administration area at all. */
export function useCanAdminister(): boolean {
  const held = usePermissions();
  return ADMIN_PERMISSIONS.some((permission) => held.includes(permission));
}

function usePermissions(): string[] {
  const { data } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => request<string[]>("/me/permissions"),
    staleTime: 60_000,
  });
  return data ?? [];
}
