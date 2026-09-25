import type { Metadata } from "next";
import { PermissionsAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Permissions" };

export default function PermissionsAdminPage() {
  return <PermissionsAdmin />;
}
