import type { Metadata } from "next";
import { RolesAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Roles" };

export default function RolesAdminPage() {
  return <RolesAdmin />;
}
