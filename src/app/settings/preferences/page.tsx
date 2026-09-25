import type { Metadata } from "next";
import { PreferencesSettings } from "@/components/settings";

export const metadata: Metadata = { title: "Preferences settings" };

export default function PreferencesSettingsPage() {
  return <PreferencesSettings />;
}
