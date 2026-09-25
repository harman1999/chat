/**
 * Domain model for the Helix workspace.
 *
 * These types are the contract between the UI and the data layer. The mock
 * data set in `src/data` and the future REST/WebSocket transport in
 * `src/services` both produce exactly these shapes, so swapping one for the
 * other requires no component changes.
 */

export type ID = string;

/* -------------------------------------------------------------------------- */
/*  Users & presence                                                          */
/* -------------------------------------------------------------------------- */

export type PresenceStatus = "online" | "away" | "dnd" | "offline";

export type UserRole = "owner" | "admin" | "member" | "guest";

export interface UserStatus {
  emoji: string;
  text: string;
  /** ISO timestamp; null means the status does not expire. */
  expiresAt: string | null;
}

export interface User {
  id: ID;
  username: string;
  displayName: string;
  fullName: string;
  email: string;
  title: string;
  department: string;
  timezone: string;
  avatarUrl: string | null;
  /** Deterministic accent index used to colour the initials fallback. */
  avatarColor: number;
  presence: PresenceStatus;
  customStatus: UserStatus | null;
  role: UserRole;
  isBot: boolean;
  lastActiveAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Preferences & sessions                                                    */
/* -------------------------------------------------------------------------- */

export type ThemePreference = "light" | "dark" | "system";
export type Density = "comfortable" | "compact";
export type SendBehavior = "enter" | "mod_enter";
export type NotificationLevel = "all" | "mentions" | "none";

export interface NotificationPreferences {
  desktopEnabled: boolean;
  playSound: boolean;
  /** Default level applied to channels without an override. */
  channelLevel: NotificationLevel;
  directMessages: NotificationLevel;
  threadReplies: boolean;
  /** Also notify when these words appear, not just @mentions. */
  keywords: string[];
  emailDigest: "never" | "daily" | "weekly";
  doNotDisturb: {
    enabled: boolean;
    /** 24-hour "HH:mm". */
    from: string;
    to: string;
  };
}

export interface MessagePreferences {
  sendBehavior: SendBehavior;
  use24HourTime: boolean;
  showTypingIndicators: boolean;
  /** Renders link previews inline under a message. */
  showLinkPreviews: boolean;
  /** Collapses consecutive messages from one author. */
  groupConsecutive: boolean;
}

export interface UserPreferences {
  theme: ThemePreference;
  density: Density;
  language: string;
  timezone: string;
  messages: MessagePreferences;
  notifications: NotificationPreferences;
}

export type SessionDeviceKind = "desktop" | "mobile" | "tablet" | "web";

export interface UserSession {
  id: ID;
  deviceKind: SessionDeviceKind;
  deviceLabel: string;
  browser: string;
  location: string;
  ipAddress: string;
  lastActiveAt: string;
  createdAt: string;
  isCurrent: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Workspaces                                                                */
/* -------------------------------------------------------------------------- */

export interface Workspace {
  id: ID;
  name: string;
  slug: string;
  /** Short mark shown in the workspace switcher. */
  initials: string;
  plan: "free" | "business" | "enterprise";
  memberCount: number;
  unreadCount: number;
  mentionCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Channels & conversations                                                  */
/* -------------------------------------------------------------------------- */

export type ChannelKind = "public" | "private" | "dm" | "group_dm";

export interface Channel {
  id: ID;
  workspaceId: ID;
  kind: ChannelKind;
  /** Slug for channels ("general"); undefined for DMs. */
  name: string;
  /** One-line purpose shown in the channel header. */
  purpose: string;
  /** Longer description shown in the details panel. */
  description: string;
  topic: string | null;
  memberIds: ID[];
  memberCount: number;
  unreadCount: number;
  mentionCount: number;
  isMuted: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  createdBy: ID;
  /** For DMs: the other participant(s). */
  participantIds?: ID[];
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

export interface Reaction {
  emoji: string;
  /** Shortcode used for tooltips and search, e.g. `thumbsup`. */
  name: string;
  userIds: ID[];
  count: number;
}

export type AttachmentKind = "image" | "video" | "audio" | "document" | "archive" | "code";

export interface Attachment {
  id: ID;
  name: string;
  kind: AttachmentKind;
  mimeType: string;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string | null;
  width?: number;
  height?: number;
  uploadedAt: string;
  uploadedBy: ID;
}

export type MessageKind = "text" | "system_join" | "system_leave" | "system_topic";

export type DeliveryState = "sent" | "pending" | "failed";

export interface Message {
  id: ID;
  channelId: ID;
  authorId: ID;
  kind: MessageKind;
  /** Raw markdown-ish body. Rendering happens in the message renderer. */
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  reactions: Reaction[];
  attachments: Attachment[];
  mentionedUserIds: ID[];
  /** Set when the message is a reply inside a thread. */
  threadRootId: ID | null;
  replyCount: number;
  replyParticipantIds: ID[];
  lastReplyAt: string | null;
  isPinned: boolean;
  isSaved: boolean;
  deliveryState: DeliveryState;
}

export interface Thread {
  rootId: ID;
  channelId: ID;
  replyCount: number;
  participantIds: ID[];
  lastReplyAt: string | null;
  isFollowing: boolean;
  unreadReplyCount: number;
}

/* -------------------------------------------------------------------------- */
/*  Notifications                                                             */
/* -------------------------------------------------------------------------- */

export type NotificationKind =
  | "mention"
  | "direct_message"
  | "thread_reply"
  | "channel_message"
  | "system";

export interface AppNotification {
  id: ID;
  kind: NotificationKind;
  actorId: ID;
  channelId: ID | null;
  messageId: ID | null;
  title: string;
  preview: string;
  createdAt: string;
  isRead: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Search                                                                    */
/* -------------------------------------------------------------------------- */

export type SearchResultKind = "message" | "person" | "channel" | "file";

export interface SearchResult {
  id: ID;
  kind: SearchResultKind;
  title: string;
  snippet: string;
  contextLabel: string;
  timestamp: string | null;
  /** Message id, user id, channel id or attachment id, depending on `kind`. */
  refId: ID;
  /** Where to navigate for message and file results. */
  channelId?: ID;
  authorId?: ID;
}

export interface SearchResultGroup {
  kind: SearchResultKind;
  label: string;
  results: SearchResult[];
  /** Total matches, which can exceed the number returned. */
  total: number;
}

/* -------------------------------------------------------------------------- */
/*  Real-time transport                                                       */
/* -------------------------------------------------------------------------- */

export type RealtimeEventName =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "reaction.created"
  | "reaction.deleted"
  | "user.online"
  | "user.offline"
  | "typing.started"
  | "typing.stopped"
  | "notification.created"
  /** Channel membership changed — recipients must re-read their channel list. */
  | "channel.membership";

export interface RealtimeEnvelope<T = unknown> {
  event: RealtimeEventName;
  /** Server-assigned monotonic sequence, used for gap detection on reconnect. */
  seq: number;
  emittedAt: string;
  payload: T;
}

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

/* -------------------------------------------------------------------------- */
/*  Transport primitives                                                      */
/* -------------------------------------------------------------------------- */

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}

/* -------------------------------------------------------------------------- */
/*  Administration                                                            */
/* -------------------------------------------------------------------------- */

export type AccountStatus = "active" | "invited" | "deactivated";

export interface AdminUser extends User {
  status: AccountStatus;
  roleId: ID;
  lastSignInAt: string | null;
  twoFactorEnabled: boolean;
  createdAt: string;
  messageCount: number;
}

export interface Permission {
  id: ID;
  group: string;
  label: string;
  description: string;
}

export interface Role {
  id: ID;
  name: string;
  description: string;
  /** System roles cannot be renamed or deleted. */
  isSystem: boolean;
  memberCount: number;
  permissionIds: ID[];
}

export type AuditCategory = "auth" | "user" | "channel" | "role" | "system" | "file";
export type AuditSeverity = "info" | "warning" | "critical";

export interface AuditLogEntry {
  id: ID;
  actorId: ID;
  action: string;
  category: AuditCategory;
  target: string;
  ipAddress: string;
  createdAt: string;
  severity: AuditSeverity;
}

export type AuthProviderKind = "password" | "saml" | "oidc" | "oauth" | "scim";

export interface AuthProvider {
  id: ID;
  name: string;
  kind: AuthProviderKind;
  description: string;
  isEnabled: boolean;
  isConfigured: boolean;
  lastSyncAt: string | null;
}

export interface StorageBucket {
  key: string;
  label: string;
  bytes: number;
  fileCount: number;
}

/** One operational counter from the API process. */
export interface SystemCounter {
  name: string;
  /** Distinguishes series within a metric — a rate-limit rule, an audit action. */
  label: string;
  count: number;
  firstAt: string;
  lastAt: string;
}

/**
 * Operational health of the API process.
 *
 * Counters are per-process and reset on restart, so `startedAt` is part of the
 * reading rather than decoration — a small number since a recent restart means
 * something different from the same number over a week.
 */
export interface SystemHealth {
  startedAt: string;
  uptimeSeconds: number;
  counters: SystemCounter[];
  redisReachable: boolean;
  /** From the audit table, so it survives a restart. */
  lastAuditAt: string | null;
  /** False whenever Redis has been unreachable — limits then fail open. */
  rateLimitingEffective: boolean;
}

export interface WorkspaceStats {
  totalUsers: number;
  activeUsers7d: number;
  newUsers30d: number;
  pendingInvites: number;
  guests: number;
  totalChannels: number;
  publicChannels: number;
  privateChannels: number;
  archivedChannels: number;
  messages24h: number;
  messages30d: number;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  // No uptimePercent: this application does not measure uptime. The field was a
  // hardcoded 99.98 that the dashboard rendered as though it were observed.
}

/** One point in the admin activity series. */
export interface DailyMetric {
  date: string;
  messages: number;
  activeUsers: number;
}

export interface SystemSettings {
  workspaceName: string;
  workspaceUrl: string;
  defaultChannelIds: ID[];
  allowGuestAccounts: boolean;
  allowPublicInvites: boolean;
  restrictSignupDomain: boolean;
  signupDomains: string[];
  messageRetentionDays: number | null;
  fileRetentionDays: number | null;
  maxUploadMb: number;
  requireTwoFactor: boolean;
  sessionTimeoutHours: number;
}

/* -------------------------------------------------------------------------- */
/*  Integrations                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A bot is a `users` row with `is_bot`, so it has channel memberships, an
 * avatar and an author identity like anyone else. These shapes describe the
 * administrative view of one, not the chat view — the chat view is `User`.
 */
export interface BotAccount {
  id: ID;
  username: string;
  displayName: string;
  description: string;
  avatarColor: number;
  isActive: boolean;
  createdAt: string;
  tokenCount: number;
  lastUsedAt: string | null;
}

export interface IntegrationToken {
  id: ID;
  name: string;
  /** The leading characters only; the token itself is shown once at creation. */
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  isRevoked: boolean;
}

export interface IncomingWebhook {
  id: ID;
  name: string;
  channelId: ID;
  channelName: string;
  botUserId: ID;
  botName: string;
  secretPrefix: string;
  isEnabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  postCount: number;
}

export interface OutgoingWebhook {
  id: ID;
  name: string;
  /** null means every channel in the workspace. */
  channelId: ID | null;
  channelName: string | null;
  targetUrl: string;
  /** Empty means every message in scope. */
  triggerWords: string[];
  /** An outgoing OAuth connection authenticating the delivery, if any. */
  connectionId: ID | null;
  connectionName: string | null;
  isEnabled: boolean;
  createdAt: string;
  lastAttemptAt: string | null;
  lastStatus: number | null;
  lastError: string | null;
  failureCount: number;
}

export interface SlashCommand {
  id: ID;
  /** Stored without the leading slash. */
  command: string;
  name: string;
  description: string;
  usageHint: string;
  targetUrl: string;
  connectionId: ID | null;
  connectionName: string | null;
  isEnabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface OAuthApp {
  id: ID;
  name: string;
  description: string;
  clientId: string;
  clientSecretPrefix: string;
  redirectUris: string[];
  scopes: string[];
  isEnabled: boolean;
  createdAt: string;
  authorisedUsers: number;
}

export interface OutgoingOAuthConnection {
  id: ID;
  name: string;
  provider: string;
  clientId: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  status: "disconnected" | "connected" | "error";
  lastError: string | null;
  createdAt: string;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
}

/** The reply an external service may send to a slash command. */
export interface SlashCommandResult {
  /** "ephemeral" is shown only to the caller; "in_channel" is posted. */
  responseType: "ephemeral" | "in_channel";
  text: string;
}
