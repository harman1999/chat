import type { Metadata } from "next";
import { IntegrationsAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsAdminPage() {
  return <IntegrationsAdmin />;
}
