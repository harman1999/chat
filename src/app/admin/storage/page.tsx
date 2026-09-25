import type { Metadata } from "next";
import { StorageAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "File storage" };

export default function StorageAdminPage() {
  return <StorageAdmin />;
}
