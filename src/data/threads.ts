import type { Thread } from "@/types";

const DAY = 86_400_000;

function at(daysAgo: number, hour: number, minute: number): string {
  const date = new Date(Date.now() - daysAgo * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

/**
 * Thread index for the Threads inbox and the sidebar badge.
 *
 * Kept separate from the message dataset because the API will serve it the same
 * way — a per-user view of followed threads, not something derived by walking
 * every channel's history on the client.
 */
export const threads: Thread[] = [
  {
    rootId: "m_gen_6",
    channelId: "ch_general",
    replyCount: 3,
    participantIds: ["u_harman", "u_alice", "u_bob"],
    lastReplyAt: at(0, 9, 41),
    isFollowing: true,
    unreadReplyCount: 0,
  },
  {
    rootId: "m_dev_4",
    channelId: "ch_devops",
    replyCount: 2,
    participantIds: ["u_harman", "u_sarah"],
    lastReplyAt: at(0, 9, 38),
    isFollowing: true,
    unreadReplyCount: 2,
  },
  {
    rootId: "m_be_2",
    channelId: "ch_backend",
    replyCount: 4,
    participantIds: ["u_marco", "u_priya", "u_bob"],
    lastReplyAt: at(0, 10, 30),
    isFollowing: true,
    unreadReplyCount: 1,
  },
  {
    rootId: "m_sup_3",
    channelId: "ch_support",
    replyCount: 2,
    participantIds: ["u_tomas", "u_bob"],
    lastReplyAt: at(0, 11, 20),
    isFollowing: true,
    unreadReplyCount: 1,
  },
];

export const threadsByRootId: Record<string, Thread> = Object.fromEntries(
  threads.map((thread) => [thread.rootId, thread]),
);
