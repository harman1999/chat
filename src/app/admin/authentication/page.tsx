import type { Metadata } from "next";
import { AuthenticationAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Authentication" };

export default function AuthenticationAdminPage() {
  return <AuthenticationAdmin />;
}
