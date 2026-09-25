"use client";

import { ConversationView } from "@/components/chat";
import { MentionsView } from "@/components/notifications";
import { DraftsView, SavedView } from "@/components/saved";
import { ThreadsInbox } from "@/components/threads";
import { useWorkspaceStore } from "@/store";

/** Chooses what fills the centre column for the selected sidebar section. */
export function WorkspaceContent() {
  const section = useWorkspaceStore((state) => state.activeNavSection);

  if (section === "threads") return <ThreadsInbox />;
  if (section === "mentions") return <MentionsView />;
  if (section === "saved") return <SavedView />;
  if (section === "drafts") return <DraftsView />;

  return <ConversationView />;
}
