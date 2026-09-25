import type { Metadata } from "next";
import { NotificationSettings } from "@/components/settings";

export const metadata: Metadata = { title: "Notifications settings" };

export default function NotificationSettingsPage() {
  return <NotificationSettings />;
}
