import { NotFoundError } from "./http";
import { channelsRepo } from "../repo/channels";
import { messagesRepo } from "../repo/messages";

/**
 * The channel of a message the caller may see, or a 404.
 *
 * Anything addressed by message id — reading it, its thread, reacting, saving,
 * following — has to pass through here. Channel membership is the only thing
 * that makes a message visible, and it also keeps workspaces apart: nobody is
 * a member of a channel outside their own. 404 rather than 403, so a message
 * id alone does not reveal that the message exists.
 */
export async function requireMessageAccess(messageId: string, userId: string): Promise<string> {
  const channelId = await messagesRepo.channelOf(messageId);
  if (!channelId || !(await channelsRepo.isMember(channelId, userId))) {
    throw new NotFoundError("Message not found");
  }
  return channelId;
}
