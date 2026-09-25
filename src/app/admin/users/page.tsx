import type { Metadata } from "next";
import { UsersAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Users" };

export default function UsersAdminPage() {
  return <UsersAdmin />;
}
