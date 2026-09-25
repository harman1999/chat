"use client";

import { useActiveConversation } from "@/hooks";
import { useUIStore } from "@/store";
import { AddPeopleDialog } from "./add-people-dialog";
import { CreateChannelDialog } from "./create-channel-dialog";

/**
 * Mounted once by the shell. Both dialogs are reachable from several places —
 * the sidebar, the channel header, the details panel and the admin tables — so
 * they live here rather than being duplicated at each trigger.
 */
export function ChannelDialogs() {
  const isCreateOpen = useUIStore((state) => state.isCreateChannelOpen);
  const setCreateOpen = useUIStore((state) => state.setCreateChannelOpen);
  const isAddPeopleOpen = useUIStore((state) => state.isAddPeopleOpen);
  const setAddPeopleOpen = useUIStore((state) => state.setAddPeopleOpen);
  const { data: conversation } = useActiveConversation();

  const isChannel = conversation?.kind === "public" || conversation?.kind === "private";

  return (
    <>
      <CreateChannelDialog open={isCreateOpen} onOpenChange={setCreateOpen} />
      {conversation && isChannel && (
        <AddPeopleDialog
          conversation={conversation}
          open={isAddPeopleOpen}
          onOpenChange={setAddPeopleOpen}
        />
      )}
    </>
  );
}
