import type { SlashCommand, SlashCommandResult } from "@/types";
import { request } from "./http";

/**
 * Slash commands.
 *
 * No mock branch: a command's whole behaviour is an external endpoint the
 * server calls, and a fixture would be pretending to be one. In mock mode the
 * list simply comes back empty and the composer offers nothing — honest,
 * rather than a menu of commands that cannot run.
 */
export const commandService = {
  /** The enabled commands this workspace offers. */
  list(): Promise<SlashCommand[]> {
    return request<SlashCommand[]>("/commands");
  },

  run(input: { channelId: string; command: string; text: string }): Promise<SlashCommandResult> {
    return request<SlashCommandResult>("/commands/run", { method: "POST", body: input });
  },
};
