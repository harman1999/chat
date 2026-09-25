import { z } from "zod";

/**
 * Request schemas for every endpoint that takes a body.
 *
 * Kept together so the shape of the API's input surface is reviewable in one
 * place, and so length caps are applied consistently rather than per-route.
 */

const shortText = z.string().trim().min(1).max(200);
const id = z.string().min(1).max(200);

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  // Not `.min()`: the sign-in path must not disclose the password policy.
  password: z.string().min(1).max(512),
});

export const messageBodySchema = z.object({
  body: z.string().max(12_000).optional().default(""),
  threadRootId: id.nullish(),
  attachmentIds: z.array(id).max(10).optional(),
});

export const messageEditSchema = z.object({
  body: z.string().trim().min(1).max(12_000),
});

export const reactionSchema = z.object({
  // A single grapheme cluster, so the column cannot become a text dump.
  emoji: z.string().min(1).max(16),
  name: z.string().trim().min(1).max(64).optional(),
});

export const presenceSchema = z.object({
  status: z.enum(["online", "away", "dnd", "offline"]),
});

export const customStatusSchema = z
  .object({
    emoji: z.string().max(16).optional(),
    text: z.string().trim().max(100).optional(),
    expiresAt: z.iso.datetime().nullish(),
  })
  .nullable();

export const profileSchema = z.object({
  displayName: shortText.max(64).optional(),
  fullName: shortText.max(96).optional(),
  title: z.string().trim().max(96).optional(),
  department: z.string().trim().max(96).optional(),
  timezone: z.string().trim().max(64).optional(),
});

export const emailSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(512),
  newPassword: z.string().min(12, "Passwords must be at least 12 characters").max(512),
});

export const uploadTicketSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative().max(50 * 1024 * 1024),
  mimeType: z.string().trim().max(255).optional(),
});

/** A plain boolean flag, used by favourite / pin / save / follow. */
export const flagSchema = (key: string) => z.object({ [key]: z.boolean() });

export const roleAssignmentSchema = z.object({ roleId: id });
export const accountStatusSchema = z.object({
  status: z.enum(["active", "invited", "deactivated"]),
});

/* -------------------------------------------------------------------------- */
/*  jsonb documents                                                           */
/* -------------------------------------------------------------------------- */

const notificationLevel = z.enum(["all", "mentions", "none"]);

/**
 * Preferences are merged into a jsonb column with `||`. Without a closed schema
 * a client could write arbitrary keys and grow the document without bound, so
 * every field is enumerated and unknown keys are stripped.
 */
export const preferencesSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]),
    density: z.enum(["comfortable", "compact"]),
    language: z.string().trim().max(32),
    timezone: z.string().trim().max(64),
    messages: z.object({
      sendBehavior: z.enum(["enter", "mod_enter"]),
      use24HourTime: z.boolean(),
      showTypingIndicators: z.boolean(),
      showLinkPreviews: z.boolean(),
      groupConsecutive: z.boolean(),
    }),
    notifications: z.object({
      desktopEnabled: z.boolean(),
      playSound: z.boolean(),
      channelLevel: notificationLevel,
      directMessages: notificationLevel,
      threadReplies: z.boolean(),
      keywords: z.array(z.string().trim().min(1).max(64)).max(50),
      emailDigest: z.enum(["never", "daily", "weekly"]),
      doNotDisturb: z.object({
        enabled: z.boolean(),
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    }),
  })
  .partial();

/** Same reasoning as preferences: a closed set of keys for the settings blob. */
export const systemSettingsSchema = z
  .object({
    workspaceName: shortText.max(120),
    workspaceUrl: z.string().trim().max(253),
    defaultChannelIds: z.array(id).max(20),
    allowGuestAccounts: z.boolean(),
    allowPublicInvites: z.boolean(),
    restrictSignupDomain: z.boolean(),
    signupDomains: z.array(z.string().trim().min(1).max(253)).max(50),
    messageRetentionDays: z.number().int().min(0).max(36_500).nullable(),
    fileRetentionDays: z.number().int().min(0).max(36_500).nullable(),
    maxUploadMb: z.number().int().min(1).max(5_000),
    requireTwoFactor: z.boolean(),
    sessionTimeoutHours: z.number().int().min(1).max(8_760),
  })
  .partial();

export const createChannelSchema = z.object({
  // Channel names are referenced as #name, so the grammar is deliberately tight.
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use lowercase letters, numbers, hyphens and underscores"),
  purpose: z.string().trim().max(250).optional().default(""),
  kind: z.enum(["public", "private"]).default("public"),
  memberIds: z.array(id).max(200).optional(),
});

export const addMembersSchema = z.object({
  userIds: z.array(id).min(1).max(200),
});

export const archiveSchema = z.object({ isArchived: z.boolean() });

/**
 * Creating an account directly, rather than inviting one into existence.
 *
 * The password is set by the administrator because there is no mail transport
 * to send a set-your-own link through — so it has a real minimum rather than a
 * nominal one, and the response never echoes it back.
 */
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  fullName: z.string().trim().min(1).max(120),
  password: z.string().min(12).max(200),
  // Derived from the name when omitted; the grammar matches @mention parsing.
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use lowercase letters, numbers, dots, hyphens and underscores")
    .optional(),
  roleId: id.optional(),
  title: z.string().trim().max(120).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
  timezone: z.string().trim().max(64).optional().default("UTC"),
  /** Public channels to join, by name. */
  channels: z.array(z.string().trim().min(1).max(80)).max(50).optional(),
});

/* -------------------------------------------------------------------------- */
/*  Integrations                                                              */
/* -------------------------------------------------------------------------- */

/** Same grammar as a person's username — a bot is mentioned the same way. */
const handle = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Use lowercase letters, numbers, dots, hyphens and underscores");

/**
 * An outbound target.
 *
 * The URL shape is checked here; whether it resolves to a public address is
 * checked in `outbound.ts`, because that needs DNS and must be re-checked at
 * send time anyway.
 */
const targetUrl = z.string().trim().url().max(2_000);

export const createBotSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  username: handle,
  description: z.string().trim().max(200).optional().default(""),
});

export const issueTokenSchema = z.object({
  name: z.string().trim().min(1).max(80).optional().default("Token"),
});

export const createIncomingWebhookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  channelId: id,
  botUserId: id,
});

export const createOutgoingWebhookSchema = z.object({
  name: z.string().trim().min(1).max(80),
  channelId: id.nullable().optional().default(null),
  targetUrl,
  triggerWords: z
    .array(z.string().trim().toLowerCase().min(1).max(40))
    .max(20)
    .optional()
    .default([]),
  /** An outgoing OAuth connection whose token authenticates the delivery. */
  connectionId: id.nullable().optional().default(null),
});

export const createSlashCommandSchema = z.object({
  // Accepted with or without the leading slash; stored without.
  command: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.replace(/^\//, ""))
    .pipe(z.string().min(1).max(40).regex(/^[a-z0-9][a-z0-9-]*$/, "Use lowercase letters, numbers and hyphens")),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional().default(""),
  usageHint: z.string().trim().max(80).optional().default(""),
  targetUrl,
  connectionId: id.nullable().optional().default(null),
});

export const runSlashCommandSchema = z.object({
  channelId: id,
  command: z.string().trim().toLowerCase().max(40),
  text: z.string().max(2_000).optional().default(""),
});

export const createOAuthAppSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional().default(""),
  // Matched exactly at authorize and token time, so each must be a full URL.
  redirectUris: z.array(targetUrl).min(1).max(10),
  scopes: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
});

export const createOAuthConnectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  provider: z.string().trim().max(80).optional().default(""),
  clientId: z.string().trim().min(1).max(200),
  clientSecret: z.string().min(1).max(500),
  authorizeUrl: targetUrl,
  tokenUrl: targetUrl,
  scopes: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
});

/** The body an incoming webhook accepts, modelled on what senders already emit. */
export const incomingWebhookPayloadSchema = z.object({
  text: z.string().trim().min(1).max(4_000),
  /** Overrides the bot's name for this message only. */
  username: z.string().trim().max(80).optional(),
});
