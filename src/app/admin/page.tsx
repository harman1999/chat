import type { Metadata } from "next";
import { DashboardAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function AdminDashboardPage() {
  return <DashboardAdmin />;
}
