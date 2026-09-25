import type { Metadata } from "next";
import { SystemAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "System settings" };

export default function SystemAdminPage() {
  return <SystemAdmin />;
}
