import type {
  AdminUser,
  AuditLogEntry,
  DailyMetric,
  Permission,
  Role,
  StorageBucket,
  SystemHealth,
  SystemSettings,
  WorkspaceStats,
} from "@/types";
import { users } from "./users";

const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/* -------------------------------------------------------------------------- */
/*  Permissions and roles                                                     */
/* -------------------------------------------------------------------------- */

export const permissions: Permission[] = [
  { id: "p_msg_send", group: "Messaging", label: "Send messages", description: "Post in channels they belong to." },
  { id: "p_msg_edit_own", group: "Messaging", label: "Edit own messages", description: "Change their own messages after posting." },
  { id: "p_msg_delete_own", group: "Messaging", label: "Delete own messages", description: "Remove their own messages." },
  { id: "p_msg_delete_any", group: "Messaging", label: "Delete any message", description: "Remove anyone's message in the workspace." },
  { id: "p_msg_pin", group: "Messaging", label: "Pin messages", description: "Pin and unpin messages in a channel." },
  { id: "p_file_upload", group: "Files", label: "Upload files", description: "Attach files to messages." },
  { id: "p_file_delete_any", group: "Files", label: "Delete any file", description: "Remove files uploaded by anyone." },
  { id: "p_ch_create_public", group: "Channels", label: "Create public channels", description: "Start channels anyone can join." },
  { id: "p_ch_create_private", group: "Channels", label: "Create private channels", description: "Start invite-only channels." },
  { id: "p_ch_archive", group: "Channels", label: "Archive channels", description: "Close a channel to new messages." },
  { id: "p_ch_manage_members", group: "Channels", label: "Manage channel members", description: "Add and remove people from channels." },
  { id: "p_user_invite", group: "People", label: "Invite people", description: "Send workspace invitations." },
  { id: "p_user_deactivate", group: "People", label: "Deactivate accounts", description: "Revoke workspace access." },
  { id: "p_user_manage_roles", group: "People", label: "Assign roles", description: "Change what other people can do." },
  { id: "p_admin_settings", group: "Administration", label: "Manage workspace settings", description: "Change org-wide configuration." },
  { id: "p_admin_auth", group: "Administration", label: "Manage authentication", description: "Configure SSO, SCIM and password policy." },
  { id: "p_admin_audit", group: "Administration", label: "View audit logs", description: "Read the workspace audit trail." },
  { id: "p_admin_billing", group: "Administration", label: "Manage billing", description: "Change the plan and payment details." },
];

const ALL = permissions.map((permission) => permission.id);
const MEMBER_PERMS = [
  "p_msg_send", "p_msg_edit_own", "p_msg_delete_own", "p_msg_pin",
  "p_file_upload", "p_ch_create_public", "p_ch_create_private", "p_ch_manage_members",
];

export const roles: Role[] = [
  {
    id: "role_owner",
    name: "Owner",
    description: "Full control, including billing and workspace deletion.",
    isSystem: true,
    memberCount: 2,
    permissionIds: ALL,
  },
  {
    id: "role_admin",
    name: "Administrator",
    description: "Manages people, channels and configuration. No billing access.",
    isSystem: true,
    memberCount: 6,
    permissionIds: ALL.filter((id) => id !== "p_admin_billing"),
  },
  {
    id: "role_moderator",
    name: "Moderator",
    description: "Keeps channels tidy — can remove messages and archive channels.",
    isSystem: false,
    memberCount: 11,
    permissionIds: [...MEMBER_PERMS, "p_msg_delete_any", "p_ch_archive", "p_file_delete_any"],
  },
  {
    id: "role_member",
    name: "Member",
    description: "The default role for everyone in the workspace.",
    isSystem: true,
    memberCount: 381,
    permissionIds: MEMBER_PERMS,
  },
  {
    id: "role_guest",
    name: "Guest",
    description: "Limited to the channels they are invited to.",
    isSystem: true,
    memberCount: 28,
    permissionIds: ["p_msg_send", "p_msg_edit_own", "p_msg_delete_own", "p_file_upload"],
  },
];

/* -------------------------------------------------------------------------- */
/*  Directory                                                                 */
/* -------------------------------------------------------------------------- */

const FIRST_NAMES = [
  "Amara", "Nils", "Ingrid", "Rahul", "Yuki", "Diego", "Chloe", "Omar", "Freya", "Tomasz",
  "Nadia", "Kwame", "Elena", "Mateo", "Aisha", "Lukas", "Sofia", "Hiro", "Zara", "Pierre",
  "Anita", "Bjorn", "Mei", "Rafael", "Hannah", "Idris", "Clara", "Viktor", "Leila", "Sam",
  "Noor", "Kai", "Petra", "Andres", "Maya", "Tobias", "Ruth", "Jonas", "Amelia", "Karim",
  "Sinead", "Oscar", "Farida", "Emil", "Greta", "Dmitri", "Isla", "Paolo",
];
const LAST_NAMES = [
  "Okafor", "Berg", "Larsen", "Mehta", "Tanaka", "Ramos", "Dubois", "Haddad", "Olsen", "Kowalski",
  "Rahman", "Mensah", "Petrova", "Silva", "Khan", "Weber", "Rossi", "Sato", "Ahmed", "Moreau",
  "Desai", "Nilsson", "Chen", "Costa", "Fischer", "Bello", "Novak", "Ivanov", "Haddadi", "Wright",
  "Aziz", "Lim", "Novotny", "Garcia", "Singh", "Lindqvist", "Adeyemi", "Nyman", "Clarke", "Toure",
  "Byrne", "Lindgren", "Saleh", "Hansen", "Bauer", "Sokolov", "Murray", "Bianchi",
];
const TITLES = [
  "Software Engineer", "Senior Software Engineer", "Staff Engineer", "Product Manager",
  "Product Designer", "Data Analyst", "Site Reliability Engineer", "Support Specialist",
  "Engineering Manager", "QA Engineer", "Technical Writer", "Solutions Architect",
];
const DEPARTMENTS = ["Platform", "Product Engineering", "Infrastructure", "Data", "Design", "Security", "Customer Success", "Payments"];

/** Deterministic directory so the admin tables stay stable across reloads. */
function generateDirectory(): AdminUser[] {
  const base: AdminUser[] = users.map((user, index) => ({
    ...user,
    status: "active",
    roleId:
      user.role === "owner" ? "role_owner" : user.role === "admin" ? "role_admin" : user.isBot ? "role_guest" : "role_member",
    lastSignInAt: hoursAgo(index * 3),
    twoFactorEnabled: index % 3 !== 2,
    createdAt: daysAgo(400 - index * 17),
    messageCount: 2400 - index * 137,
  }));

  const generated: AdminUser[] = Array.from({ length: 48 }, (_, index) => {
    const first = FIRST_NAMES[index % FIRST_NAMES.length];
    const last = LAST_NAMES[(index * 7) % LAST_NAMES.length];
    const name = `${first} ${last}`;
    const username = `${first}.${last}`.toLowerCase();
    const status = index % 17 === 0 ? "invited" : index % 23 === 0 ? "deactivated" : "active";
    const roleId =
      index % 19 === 0 ? "role_moderator" : index % 13 === 0 ? "role_guest" : "role_member";

    return {
      id: `u_dir_${index}`,
      username,
      displayName: name,
      fullName: name,
      email: `${username}@northwind.io`,
      title: TITLES[index % TITLES.length],
      department: DEPARTMENTS[index % DEPARTMENTS.length],
      timezone: "UTC",
      avatarUrl: null,
      avatarColor: index % 8,
      presence: index % 5 === 0 ? "online" : index % 5 === 1 ? "away" : "offline",
      customStatus: null,
      role: roleId === "role_guest" ? "guest" : "member",
      isBot: false,
      lastActiveAt: hoursAgo(index * 2 + 1),
      status,
      roleId,
      lastSignInAt: status === "invited" ? null : daysAgo((index % 21) + 0.2),
      twoFactorEnabled: index % 4 !== 0,
      createdAt: daysAgo(360 - index * 6),
      messageCount: status === "invited" ? 0 : 40 + ((index * 53) % 900),
    };
  });

  return [...base, ...generated];
}

export const adminUsers: AdminUser[] = generateDirectory();

/* -------------------------------------------------------------------------- */
/*  Metrics                                                                   */
/* -------------------------------------------------------------------------- */

export const workspaceStats: WorkspaceStats = {
  totalUsers: 428,
  activeUsers7d: 361,
  newUsers30d: 24,
  pendingInvites: 7,
  guests: 28,
  totalChannels: 96,
  publicChannels: 71,
  privateChannels: 25,
  archivedChannels: 14,
  messages24h: 4_812,
  messages30d: 138_402,
  storageUsedBytes: 412 * 1024 * 1024 * 1024,
  storageQuotaBytes: 1024 * 1024 * 1024 * 1024,
};

/** 30 days of activity. Deterministic, with a visible weekday/weekend rhythm. */
export const dailyMetrics: DailyMetric[] = Array.from({ length: 30 }, (_, index) => {
  const offset = 29 - index;
  const date = new Date(Date.now() - offset * DAY);
  const weekday = date.getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const wave = Math.sin(index / 3.1) * 340;

  return {
    date: date.toISOString().slice(0, 10),
    messages: Math.round((isWeekend ? 1_450 : 4_600) + wave + ((index * 271) % 520)),
    activeUsers: Math.round((isWeekend ? 96 : 348) + Math.sin(index / 2.4) * 22 + ((index * 13) % 18)),
  };
});

export const storageBuckets: StorageBucket[] = [
  { key: "image", label: "Images", bytes: 168 * 1024 ** 3, fileCount: 41_820 },
  { key: "document", label: "Documents", bytes: 121 * 1024 ** 3, fileCount: 18_304 },
  { key: "video", label: "Video", bytes: 78 * 1024 ** 3, fileCount: 1_942 },
  { key: "archive", label: "Archives", bytes: 31 * 1024 ** 3, fileCount: 3_610 },
  { key: "other", label: "Other", bytes: 14 * 1024 ** 3, fileCount: 7_128 },
];

/* -------------------------------------------------------------------------- */
/*  Authentication and system                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A healthy process, for mock mode. The real numbers come from the API's own
 * in-process counters, which no fixture can stand in for — this exists so the
 * panel has a shape to render, not to claim these figures.
 */
export const systemHealth: SystemHealth = {
  startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  uptimeSeconds: 6 * 60 * 60,
  redisReachable: true,
  rateLimitingEffective: true,
  lastAuditAt: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  counters: [
    { name: "audit.written", label: "admin.role_changed", count: 4, firstAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), lastAt: new Date(Date.now() - 18 * 60 * 1000).toISOString() },
    { name: "ratelimit.allowed", label: "default", count: 8_412, firstAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), lastAt: new Date().toISOString() },
    { name: "ratelimit.allowed", label: "search", count: 311, firstAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), lastAt: new Date().toISOString() },
    { name: "ratelimit.rejected", label: "login:account", count: 2, firstAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), lastAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
  ],
};

export const systemSettings: SystemSettings = {
  workspaceName: "Northwind Technologies",
  workspaceUrl: "northwind.helix.app",
  defaultChannelIds: ["ch_general", "ch_random"],
  allowGuestAccounts: true,
  allowPublicInvites: false,
  restrictSignupDomain: true,
  signupDomains: ["northwind.io", "northwind-labs.io"],
  messageRetentionDays: null,
  fileRetentionDays: 730,
  maxUploadMb: 50,
  requireTwoFactor: false,
  sessionTimeoutHours: 720,
};

/* -------------------------------------------------------------------------- */
/*  Audit log                                                                 */
/* -------------------------------------------------------------------------- */

const AUDIT_TEMPLATES: {
  action: string;
  category: AuditLogEntry["category"];
  severity: AuditLogEntry["severity"];
  target: string;
}[] = [
  { action: "user.role_changed", category: "role", severity: "warning", target: "priya.nair → Moderator" },
  { action: "auth.sso_login", category: "auth", severity: "info", target: "Okta SAML" },
  { action: "channel.archived", category: "channel", severity: "warning", target: "#q2-launch-planning" },
  { action: "user.deactivated", category: "user", severity: "warning", target: "oscar.lindgren" },
  { action: "system.retention_updated", category: "system", severity: "critical", target: "Files: 730 days" },
  { action: "auth.failed_login", category: "auth", severity: "warning", target: "5 attempts · 185.60.216.35" },
  { action: "file.deleted", category: "file", severity: "info", target: "q3-forecast.xlsx" },
  { action: "channel.created", category: "channel", severity: "info", target: "#platform-oncall" },
  { action: "user.invited", category: "user", severity: "info", target: "amara.okafor@northwind.io" },
  { action: "role.permission_granted", category: "role", severity: "critical", target: "Moderator + Delete any message" },
  { action: "auth.scim_sync", category: "auth", severity: "info", target: "12 created · 3 deactivated" },
  { action: "system.export_requested", category: "system", severity: "critical", target: "Full workspace export" },
];

const AUDIT_ACTORS = ["u_harman", "u_alice", "u_sarah", "u_priya", "u_deploybot"];

export const auditLog: AuditLogEntry[] = Array.from({ length: 64 }, (_, index) => {
  const template = AUDIT_TEMPLATES[index % AUDIT_TEMPLATES.length];
  return {
    id: `audit_${index}`,
    actorId: AUDIT_ACTORS[(index * 3) % AUDIT_ACTORS.length],
    action: template.action,
    category: template.category,
    severity: template.severity,
    target: template.target,
    ipAddress: `103.21.244.${18 + (index % 40)}`,
    createdAt: new Date(Date.now() - index * 47 * 60_000).toISOString(),
  };
});
