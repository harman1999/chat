import type { Metadata } from "next";
import { AuditLogAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Audit logs" };

export default function AuditLogAdminPage() {
  return <AuditLogAdmin />;
}
