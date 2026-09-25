import type { Metadata } from "next";
import { AppearanceSettings } from "@/components/settings";

export const metadata: Metadata = { title: "Appearance settings" };

export default function AppearanceSettingsPage() {
  return <AppearanceSettings />;
}
