import type { Attachment, ID, Message, Reaction } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const DAY = 86_400_000;

/** `at(0, 9, 12)` → today at 09:12; `at(1, …)` → yesterday. */
function at(daysAgo: number, hour: number, minute: number): string {
  const date = new Date(Date.now() - daysAgo * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function reaction(emoji: string, name: string, userIds: ID[]): Reaction {
  return { emoji, name, userIds, count: userIds.length };
}

function attachment(partial: Partial<Attachment> & Pick<Attachment, "id" | "name" | "kind">): Attachment {
  return {
    mimeType: "application/octet-stream",
    sizeBytes: 1024,
    url: "#",
    thumbnailUrl: null,
    uploadedAt: at(0, 10, 0),
    uploadedBy: "u_harman",
    ...partial,
  };
}

interface MessageSeed extends Partial<Message> {
  id: ID;
  authorId: ID;
  body: string;
  createdAt: string;
}

function build(channelId: ID, seeds: MessageSeed[]): Message[] {
  return seeds.map((seed) => ({
    channelId,
    kind: "text",
    editedAt: null,
    deletedAt: null,
    reactions: [],
    attachments: [],
    mentionedUserIds: [],
    threadRootId: null,
    replyCount: 0,
    replyParticipantIds: [],
    lastReplyAt: null,
    isPinned: false,
    isSaved: false,
    deliveryState: "sent" as const,
    ...seed,
  }));
}

/* -------------------------------------------------------------------------- */
/*  #general                                                                   */
/* -------------------------------------------------------------------------- */

const general = build("ch_general", [
  {
    id: "m_gen_1",
    authorId: "u_lena",
    kind: "system_join",
    body: "joined the channel",
    createdAt: at(1, 16, 40),
  },
  {
    id: "m_gen_2",
    authorId: "u_sarah",
    body: "Reminder: the Q3 all-hands is **Friday at 16:00 UTC**. Agenda and pre-read are in the calendar invite.",
    createdAt: at(1, 17, 5),
    isPinned: true,
    reactions: [reaction("👍", "thumbsup", ["u_harman", "u_alice", "u_david", "u_marco"])],
  },
  {
    id: "m_gen_3",
    authorId: "u_harman",
    body: "Good morning team! 👋",
    createdAt: at(0, 9, 12),
  },
  {
    id: "m_gen_4",
    authorId: "u_harman",
    body: "Please check the latest deployment on production. It was successful.",
    createdAt: at(0, 9, 13),
    isPinned: true,
    reactions: [
      reaction("👍", "thumbsup", ["u_alice", "u_bob", "u_sarah", "u_david"]),
      reaction("🚀", "rocket", ["u_priya", "u_marco", "u_lena"]),
    ],
  },
  {
    id: "m_gen_5",
    authorId: "u_alice",
    body: "Great! The monitoring looks good as well.",
    createdAt: at(0, 9, 18),
    reactions: [reaction("❤️", "heart", ["u_harman", "u_sarah"])],
  },
  {
    id: "m_gen_6",
    authorId: "u_bob",
    body: "We also fixed the issue with the payment service.",
    createdAt: at(0, 9, 24),
    replyCount: 3,
    replyParticipantIds: ["u_harman", "u_alice", "u_bob"],
    lastReplyAt: at(0, 9, 41),
    reactions: [reaction("🎉", "tada", ["u_tomas", "u_sarah"])],
  },
  {
    id: "m_gen_7",
    authorId: "u_sarah",
    body: "Thanks @bob! I'll check it now.",
    createdAt: at(0, 9, 27),
    mentionedUserIds: ["u_bob"],
  },
  {
    id: "m_gen_8",
    isSaved: true,
    authorId: "u_deploybot",
    body: "Release **v2024.9.3** promoted to production.\n```text\nservices   12 updated\nhealth     42/42 passing\nrollback   available for 24h\n```\nFull notes: <https://northwind.io/releases/v2024.9.3|release v2024.9.3>",
    createdAt: at(0, 9, 40),
  },
  {
    id: "m_gen_9",
    authorId: "u_lena",
    body: "Refreshed the latency dashboard with the new token palette — much easier to read on the wall display.",
    createdAt: at(0, 10, 2),
    attachments: [
      attachment({
        id: "att_dashboard",
        name: "latency-dashboard.svg",
        kind: "image",
        mimeType: "image/svg+xml",
        sizeBytes: 48_210,
        url: "/mock/dashboard-preview.svg",
        thumbnailUrl: "/mock/dashboard-preview.svg",
        width: 640,
        height: 360,
        uploadedBy: "u_lena",
      }),
    ],
    reactions: [reaction("🔥", "fire", ["u_harman", "u_david", "u_alice"])],
  },
  {
    id: "m_gen_10",
    authorId: "u_david",
    body: "Shipping the composer accessibility fixes today — focus order, `aria-live` for send errors, and visible focus on every control.",
    createdAt: at(0, 10, 15),
    editedAt: at(0, 10, 19),
  },
  {
    id: "m_gen_11",
    authorId: "u_priya",
    body: "Security review for the file-upload path is booked for Thursday. Adding #devops so on-call has context.",
    createdAt: at(0, 10, 31),
  },
  {
    id: "m_gen_12",
    authorId: "u_tomas",
    body: "Customer-facing summary of last week's incident, ready for review.",
    createdAt: at(0, 11, 5),
    attachments: [
      attachment({
        id: "att_postmortem",
        name: "incident-2024-09-postmortem.pdf",
        kind: "document",
        mimeType: "application/pdf",
        sizeBytes: 1_842_000,
        uploadedBy: "u_tomas",
      }),
    ],
  },
  {
    id: "m_gen_13",
    authorId: "u_marco",
    body: "> Rollback is available for 24h\n\nWorth noting the warehouse backfill takes ~6h, so a rollback after that window needs a manual replay.",
    createdAt: at(0, 11, 22),
  },
  {
    id: "m_gen_14",
    authorId: "u_alice",
    body: "🎉",
    createdAt: at(0, 11, 24),
  },
]);

/* -------------------------------------------------------------------------- */
/*  #devops                                                                    */
/* -------------------------------------------------------------------------- */

const devops = build("ch_devops", [
  {
    id: "m_dev_1",
    authorId: "u_alice",
    body: "Starting the production deploy window now. Holding merges to `main` until the health checks clear.",
    createdAt: at(0, 8, 55),
    isPinned: true,
  },
  {
    id: "m_dev_2",
    authorId: "u_deploybot",
    body: "Deploy `v2024.9.3` started — 12 services, canary at 5%.",
    createdAt: at(0, 9, 0),
  },
  {
    id: "m_dev_3",
    authorId: "u_deploybot",
    body: "Canary healthy for 10 minutes. Promoting to 100%.",
    createdAt: at(0, 9, 10),
    reactions: [reaction("✅", "white_check_mark", ["u_alice", "u_harman", "u_bob"])],
  },
  {
    id: "m_dev_4",
    authorId: "u_sarah",
    body: "@harman can you confirm the rollback window before we cut over?",
    createdAt: at(0, 9, 32),
    mentionedUserIds: ["u_harman"],
    replyCount: 2,
    replyParticipantIds: ["u_harman", "u_sarah"],
    lastReplyAt: at(0, 9, 38),
  },
  {
    id: "m_dev_5",
    isSaved: true,
    authorId: "u_marco",
    body: "p99 on the ingest path dropped from 840ms to 310ms after the pool change.\n```sql\nSELECT service, p99_ms\nFROM latency_rollup\nWHERE window = '15m'\nORDER BY p99_ms DESC\nLIMIT 5;\n```",
    createdAt: at(0, 9, 52),
    reactions: [reaction("📈", "chart_with_upwards_trend", ["u_alice", "u_harman"])],
  },
  {
    id: "m_dev_6",
    authorId: "u_priya",
    body: "Timeline from last week's incident, for the retro.",
    createdAt: at(0, 10, 12),
    attachments: [
      attachment({
        id: "att_timeline",
        name: "incident-timeline.svg",
        kind: "image",
        mimeType: "image/svg+xml",
        sizeBytes: 21_400,
        url: "/mock/incident-timeline.svg",
        thumbnailUrl: "/mock/incident-timeline.svg",
        width: 640,
        height: 300,
        uploadedBy: "u_priya",
      }),
    ],
  },
  {
    id: "m_dev_7",
    authorId: "u_alice",
    body: "Deploy window closed. `main` is open again — thanks all.",
    createdAt: at(0, 10, 40),
    reactions: [reaction("🙌", "raised_hands", ["u_bob", "u_marco", "u_david", "u_tomas", "u_lena"])],
  },
]);

/* -------------------------------------------------------------------------- */
/*  #backend, #frontend, #support, #random                                     */
/* -------------------------------------------------------------------------- */

const backend = build("ch_backend", [
  {
    id: "m_be_1",
    authorId: "u_bob",
    body: "RFC is up for the payment retry policy. Short version: cap at 3 attempts with jitter, then dead-letter.",
    createdAt: at(0, 8, 20),
  },
  {
    id: "m_be_2",
    authorId: "u_bob",
    body: "Payment service retries are capped at 3 now — metrics look stable.",
    createdAt: at(0, 9, 45),
    replyCount: 4,
    replyParticipantIds: ["u_marco", "u_priya", "u_bob"],
    lastReplyAt: at(0, 10, 30),
    reactions: [reaction("👍", "thumbsup", ["u_harman", "u_marco"])],
  },
  {
    id: "m_be_3",
    authorId: "u_marco",
    body: "Do we emit a metric when a payment lands in the dead-letter queue? I'd like an alert on that rather than a dashboard.",
    createdAt: at(0, 10, 5),
  },
  {
    id: "m_be_5",
    authorId: "u_priya",
    body: "@harman can you review the redaction change before it goes out? It touches the audit log path.",
    createdAt: at(0, 10, 42),
    mentionedUserIds: ["u_harman"],
  },
  {
    id: "m_be_4",
    isSaved: true,
    authorId: "u_priya",
    body: "Please make sure the dead-letter payload is redacted — it currently carries the full card token.",
    createdAt: at(0, 10, 28),
    reactions: [reaction("👀", "eyes", ["u_bob", "u_harman"])],
  },
]);

const frontend = build("ch_frontend", [
  {
    id: "m_fe_1",
    authorId: "u_lena",
    body: "Design review Wednesday 14:00. Bring the composer and thread panel states — especially empty and error.",
    createdAt: at(1, 11, 0),
  },
  {
    id: "m_fe_2",
    authorId: "u_david",
    body: "Message list is now keyboard navigable end to end. Next up: reaction picker focus trap.",
    createdAt: at(0, 7, 45),
    reactions: [reaction("♿", "accessibility", ["u_lena", "u_sarah"])],
  },
  {
    id: "m_fe_3",
    authorId: "u_sarah",
    body: "Nice. Can we get contrast numbers for the muted text on the dark sidebar before we ship?",
    createdAt: at(0, 8, 2),
  },
  {
    id: "m_fe_4",
    authorId: "u_lena",
    body: "@harman the composer spec is updated — attachment previews and the mention menu are both in there now.",
    createdAt: at(0, 9, 5),
    mentionedUserIds: ["u_harman"],
  },
]);

const support = build("ch_support", [
  {
    id: "m_sup_1",
    authorId: "u_tomas",
    body: "Escalation from Contoso — invoice export times out on accounts with more than 50k line items.",
    createdAt: at(0, 10, 50),
    mentionedUserIds: [],
  },
  {
    id: "m_sup_2",
    authorId: "u_tomas",
    body: "@harman this is their second report this month, so I've flagged it as a repeat.",
    createdAt: at(0, 10, 52),
    mentionedUserIds: ["u_harman"],
  },
  {
    id: "m_sup_3",
    authorId: "u_bob",
    body: "Looking now. The export runs synchronously — we should move it to the job queue and email a link.",
    createdAt: at(0, 11, 8),
    replyCount: 2,
    replyParticipantIds: ["u_tomas", "u_bob"],
    lastReplyAt: at(0, 11, 20),
  },
  {
    id: "m_sup_4",
    authorId: "u_sarah",
    body: "Agreed. Let's size it this sprint rather than patching the timeout again.",
    createdAt: at(0, 11, 25),
    reactions: [reaction("💯", "hundred", ["u_tomas", "u_bob"])],
  },
]);

const random = build("ch_random", [
  {
    id: "m_rnd_1",
    authorId: "u_lena",
    body: "Someone left an extremely good sourdough in the Amsterdam kitchen. No note. A mystery. 🍞",
    createdAt: at(0, 12, 10),
    reactions: [reaction("🍞", "bread", ["u_marco", "u_david", "u_alice", "u_harman"])],
  },
  {
    id: "m_rnd_2",
    authorId: "u_marco",
    body: "That was me. Recipe takes 36 hours, ask me anything.",
    createdAt: at(0, 12, 14),
    reactions: [reaction("😂", "joy", ["u_lena", "u_alice"])],
  },
  {
    id: "m_rnd_3",
    authorId: "u_alice",
    body: "@harman you owe Marco a loaf after last week's incident bridge.",
    createdAt: at(0, 12, 20),
    mentionedUserIds: ["u_harman"],
    reactions: [reaction("😂", "joy", ["u_marco", "u_lena", "u_david"])],
  },
]);

/* -------------------------------------------------------------------------- */
/*  Direct messages                                                            */
/* -------------------------------------------------------------------------- */

const dmAlice = build("dm_alice", [
  {
    id: "m_dm_alice_1",
    authorId: "u_harman",
    body: "Did the canary hold through the whole window?",
    createdAt: at(0, 9, 5),
  },
  {
    id: "m_dm_alice_2",
    authorId: "u_alice",
    body: "Monitoring dashboards are green across all three regions.",
    createdAt: at(0, 9, 20),
  },
  {
    id: "m_dm_alice_3",
    authorId: "u_alice",
    body: "One thing worth a look: eu-west error budget is at 71% for the month. Not urgent, but I'd rather not spend the rest on a risky migration.",
    createdAt: at(0, 9, 21),
  },
  {
    id: "m_dm_alice_4",
    authorId: "u_harman",
    body: "Agreed — let's push the schema migration to next week and keep this window for the retry fix.",
    createdAt: at(0, 9, 26),
    reactions: [reaction("👍", "thumbsup", ["u_alice"])],
  },
]);

const dmBob = build("dm_bob", [
  {
    id: "m_dm_bob_1",
    authorId: "u_bob",
    body: "Retry cap is merged. Want me to write up the RFC outcome in #backend or keep it in the thread?",
    createdAt: at(0, 7, 10),
  },
  {
    id: "m_dm_bob_2",
    authorId: "u_harman",
    body: "Channel please — easier to find in three months.",
    createdAt: at(0, 7, 18),
  },
]);

const dmSarah = build("dm_sarah", [
  {
    id: "m_dm_sarah_1",
    authorId: "u_sarah",
    body: "Can you take the platform section of the all-hands? 10 minutes, mostly the reliability numbers.",
    createdAt: at(0, 10, 45),
  },
]);

const dmDavid = build("dm_david", [
  {
    id: "m_dm_david_1",
    authorId: "u_david",
    body: "Pushed the focus-ring changes. The sidebar needed its own ring colour to stay visible on the dark surface.",
    createdAt: at(1, 15, 30),
  },
  {
    id: "m_dm_david_2",
    authorId: "u_harman",
    body: "Good catch. Add it to the design system page so it doesn't get lost.",
    createdAt: at(1, 15, 44),
  },
]);

const dmGroup = build("dm_ops_group", [
  {
    id: "m_dm_group_1",
    authorId: "u_priya",
    body: "Retro doc for last week's incident is ready — 20 minutes Thursday should be enough.",
    createdAt: at(2, 13, 15),
  },
  {
    id: "m_dm_group_2",
    authorId: "u_lena",
    body: "Works for me.",
    createdAt: at(2, 13, 22),
  },
]);

/* -------------------------------------------------------------------------- */
/*  Thread replies                                                             */
/* -------------------------------------------------------------------------- */

/** Keyed by thread root id. Consumed by the thread panel in Phase 3. */
export const repliesByRootId: Record<ID, Message[]> = {
  m_gen_6: build("ch_general", [
    {
      id: "m_gen_6_r1",
      authorId: "u_harman",
      body: "Great work!",
      createdAt: at(0, 9, 30),
      threadRootId: "m_gen_6",
      reactions: [reaction("🙏", "pray", ["u_bob"])],
    },
    {
      id: "m_gen_6_r2",
      authorId: "u_alice",
      body: "I'll verify it.",
      createdAt: at(0, 9, 34),
      threadRootId: "m_gen_6",
    },
    {
      id: "m_gen_6_r3",
      authorId: "u_bob",
      body: "Thanks both — dashboards should show the drop in failed charges within the hour.",
      createdAt: at(0, 9, 41),
      threadRootId: "m_gen_6",
    },
  ]),
  m_be_2: build("ch_backend", [
    {
      id: "m_be_2_r1",
      authorId: "u_marco",
      body: "Nice. Did the p99 move, or just the error rate?",
      createdAt: at(0, 9, 58),
      threadRootId: "m_be_2",
    },
    {
      id: "m_be_2_r2",
      authorId: "u_bob",
      body: "Both. p99 is down to 240ms because we stopped queueing behind the third attempt.",
      createdAt: at(0, 10, 4),
      threadRootId: "m_be_2",
      reactions: [reaction("📈", "chart_with_upwards_trend", ["u_marco", "u_harman"])],
    },
    {
      id: "m_be_2_r3",
      authorId: "u_priya",
      body: "Can we confirm the dead-letter payload is redacted before this goes to prod?",
      createdAt: at(0, 10, 22),
      threadRootId: "m_be_2",
    },
    {
      id: "m_be_2_r4",
      authorId: "u_bob",
      body: "Good catch — opening a follow-up. It currently carries the full card token.",
      createdAt: at(0, 10, 30),
      threadRootId: "m_be_2",
      reactions: [reaction("🙏", "pray", ["u_priya"])],
    },
  ]),
  m_sup_3: build("ch_support", [
    {
      id: "m_sup_3_r1",
      authorId: "u_tomas",
      body: "That works for Contoso — they only need the file within the hour, not instantly.",
      createdAt: at(0, 11, 14),
      threadRootId: "m_sup_3",
    },
    {
      id: "m_sup_3_r2",
      authorId: "u_bob",
      body: "Then the job queue is the right fix. I'll size it in the sprint planning.",
      createdAt: at(0, 11, 20),
      threadRootId: "m_sup_3",
    },
  ]),
  m_dev_4: build("ch_devops", [
    {
      id: "m_dev_4_r1",
      authorId: "u_harman",
      body: "24 hours, same as last release. After that the warehouse backfill makes it a manual replay.",
      createdAt: at(0, 9, 36),
      threadRootId: "m_dev_4",
    },
    {
      id: "m_dev_4_r2",
      authorId: "u_sarah",
      body: "Perfect, that's enough runway. Going ahead.",
      createdAt: at(0, 9, 38),
      threadRootId: "m_dev_4",
    },
  ]),
};

/* -------------------------------------------------------------------------- */
/*  Backfill                                                                   */
/* -------------------------------------------------------------------------- */

const BACKFILL_LINES = [
  "Bumped the client timeout to 30s for the export endpoint as a stopgap.",
  "Anyone else seeing flaky integration tests on the payments suite?",
  "Docs for the new webhook signature scheme are published.",
  "Moved the nightly reindex to 02:00 UTC so it stops overlapping the backup.",
  "Reminder: rotate your personal access tokens this week.",
  "The staging database was reseeded, so local snapshots are stale.",
  "Added a dashboard for queue depth per consumer group.",
  "Dropping the legacy `/v1/search` endpoint at the end of the quarter.",
  "Onboarding two engineers on Monday — buddy volunteers welcome.",
  "Cut the image build from 6 minutes to 90 seconds by reordering layers.",
];

const BACKFILL_AUTHORS = ["u_alice", "u_bob", "u_marco", "u_priya", "u_david", "u_lena", "u_tomas"];

/**
 * Older history so "load earlier messages" is exercised against a realistic
 * volume. Deterministic, so screenshots and tests stay stable.
 */
function backfill(channelId: ID, count: number): Message[] {
  return build(
    channelId,
    Array.from({ length: count }, (_, index) => {
      const age = count - index;
      const day = 2 + Math.floor(age / 8);
      const hour = 9 + (age % 8);
      return {
        id: `m_${channelId}_back_${index}`,
        authorId: BACKFILL_AUTHORS[(index * 3) % BACKFILL_AUTHORS.length],
        body: BACKFILL_LINES[index % BACKFILL_LINES.length],
        createdAt: at(day, hour, (index * 7) % 60),
        reactions:
          index % 9 === 0
            ? [reaction("👍", "thumbsup", ["u_harman", "u_sarah"].slice(0, (index % 2) + 1))]
            : [],
      };
    }),
  );
}

/* -------------------------------------------------------------------------- */
/*  Public dataset                                                             */
/* -------------------------------------------------------------------------- */

export const messagesByChannel: Record<ID, Message[]> = {
  ch_general: [...backfill("ch_general", 180), ...general],
  ch_devops: [...backfill("ch_devops", 120), ...devops],
  ch_backend: [...backfill("ch_backend", 60), ...backend],
  ch_frontend: [...backfill("ch_frontend", 24), ...frontend],
  ch_support: [...backfill("ch_support", 40), ...support],
  ch_random: [...backfill("ch_random", 30), ...random],
  dm_alice: dmAlice,
  dm_bob: dmBob,
  dm_sarah: dmSarah,
  dm_david: dmDavid,
  dm_ops_group: dmGroup,
};

export const pinnedMessageIds: Record<ID, ID[]> = {
  ch_general: ["m_gen_2", "m_gen_4"],
  ch_devops: ["m_dev_1"],
};
