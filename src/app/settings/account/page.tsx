import { redirect } from "next/navigation";

/** Account settings were merged into Profile; old links and bookmarks land there. */
export default function AccountSettingsPage() {
  redirect("/settings/profile");
}
