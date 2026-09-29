import type { Metadata } from "next";
import { TeamsAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Teams" };

export default function TeamsAdminPage() {
  return <TeamsAdmin />;
}
