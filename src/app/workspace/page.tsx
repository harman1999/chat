import type { Metadata } from "next";
import { requirePage } from "@server/lib/guard";
import { AppShell } from "@/components/layout";
import { WorkspaceContent } from "@/components/workspace/workspace-content";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  await requirePage();
  return (
    <AppShell>
      <WorkspaceContent />
    </AppShell>
  );
}
