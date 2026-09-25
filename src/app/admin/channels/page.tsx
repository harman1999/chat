import type { Metadata } from "next";
import { ChannelsAdmin } from "@/components/admin";

export const metadata: Metadata = { title: "Channels" };

export default function ChannelsAdminPage() {
  return <ChannelsAdmin />;
}
