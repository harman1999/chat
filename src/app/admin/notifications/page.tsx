import type { Metadata } from "next";
import { NotificationsAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsAdminPage() {
  return <NotificationsAdmin />;
}
