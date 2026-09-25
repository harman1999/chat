import type {
  AdminUser,
  AuditLogEntry,
  AuthProvider,
  Channel,
  DailyMetric,
  ID,
  Permission,
  Role,
  StorageBucket,
  BotAccount,
  IncomingWebhook,
  IntegrationToken,
  OAuthApp,
  OutgoingOAuthConnection,
  OutgoingWebhook,
  SlashCommand,
  SystemHealth,
  SystemSettings,
  WorkspaceStats,
} from "@/types";
import { authProviders } from "@/config";
import {
  adminUsers,
  auditLog,
  channels,
  dailyMetrics,
  permissions,
  roles,
  storageBuckets,
  systemHealth,
  systemSettings,
  workspaceStats,
} from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

/**
 * Administration endpoints.
 *
 * Kept separate from the product services because they sit behind a different
 * authorisation boundary — the API will gate this whole surface on the
 * `p_admin_*` permissions rather than channel membership.
 */
export const adminService = {
  async stats(): Promise<WorkspaceStats> {
    if (USE_MOCK_TRANSPORT) return mockResolve(workspaceStats, 260);
    return request<WorkspaceStats>("/admin/stats");
  },

  async activity(days = 30): Promise<DailyMetric[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(dailyMetrics.slice(-days), 300);
    return request<DailyMetric[]>(`/admin/activity?days=${days}`);
  },

  async listUsers(): Promise<AdminUser[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(adminUsers, 340);
    return request<AdminUser[]>("/admin/users");
  },

  async setUserRole(userId: ID, roleId: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 260);
    return request<void>(`/admin/users/${userId}/role`, { method: "PUT", body: { roleId } });
  },

  /**
   * Creates an account. Not an invitation — there is no mail transport, so the
   * administrator sets the first password and passes it on themselves.
   */
  async createUser(input: {
    email: string;
    fullName: string;
    password: string;
    username?: string;
    roleId?: string;
    title?: string;
    department?: string;
    channels?: string[];
  }): Promise<AdminUser> {
    if (USE_MOCK_TRANSPORT) return mockResolve(adminUsers[0], 320);
    return request<AdminUser>("/admin/users", { method: "POST", body: input });
  },

  async setUserStatus(userId: ID, status: AdminUser["status"]): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 260);
    return request<void>(`/admin/users/${userId}/status`, { method: "PUT", body: { status } });
  },

  async health(): Promise<SystemHealth> {
    if (USE_MOCK_TRANSPORT) return mockResolve(systemHealth, 200);
    return request<SystemHealth>("/admin/metrics");
  },

  /* ---------------------------------------------------------------------- */
  /*  Integrations                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * Every create here returns a secret exactly once. Nothing stores it, so the
   * caller must show it to the administrator before the response is discarded.
   */
  integrations: {
    listBots: () => request<BotAccount[]>("/admin/integrations/bots"),

    createBot: (input: { displayName: string; username: string; description?: string }) =>
      request<{ bot: BotAccount; token: string }>("/admin/integrations/bots", {
        method: "POST",
        body: input,
      }),

    setBotActive: (botId: ID, isActive: boolean) =>
      request<void>(`/admin/integrations/bots/${botId}`, { method: "PUT", body: { isActive } }),

    listTokens: (botId: ID) =>
      request<IntegrationToken[]>(`/admin/integrations/bots/${botId}/tokens`),

    issueToken: (botId: ID, name: string) =>
      request<{ token: string }>(`/admin/integrations/bots/${botId}/tokens`, {
        method: "POST",
        body: { name },
      }),

    revokeToken: (botId: ID, tokenId: ID) =>
      request<void>(`/admin/integrations/bots/${botId}/tokens/${tokenId}`, { method: "DELETE" }),

    listIncoming: () => request<IncomingWebhook[]>("/admin/integrations/incoming-webhooks"),

    createIncoming: (input: { name: string; channelId: ID; botUserId: ID }) =>
      request<{ id: ID; url: string }>("/admin/integrations/incoming-webhooks", {
        method: "POST",
        body: input,
      }),

    /** Disabling stops an integration working without discarding its history. */
    setEnabled: (
      kind: "incoming-webhooks" | "outgoing-webhooks" | "slash-commands" | "oauth-apps",
      id: ID,
      isEnabled: boolean,
    ) =>
      request<void>(`/admin/integrations/${kind}/${id}/enabled`, {
        method: "PUT",
        body: { isEnabled },
      }),

    deleteIncoming: (id: ID) =>
      request<void>(`/admin/integrations/incoming-webhooks/${id}`, { method: "DELETE" }),

    listOutgoing: () => request<OutgoingWebhook[]>("/admin/integrations/outgoing-webhooks"),

    createOutgoing: (input: {
      name: string;
      channelId: ID | null;
      targetUrl: string;
      triggerWords: string[];
      connectionId?: ID | null;
    }) =>
      request<{ id: ID; signingSecret: string }>("/admin/integrations/outgoing-webhooks", {
        method: "POST",
        body: input,
      }),

    deleteOutgoing: (id: ID) =>
      request<void>(`/admin/integrations/outgoing-webhooks/${id}`, { method: "DELETE" }),

    listCommands: () => request<SlashCommand[]>("/admin/integrations/slash-commands"),

    createCommand: (input: {
      command: string;
      name: string;
      description?: string;
      usageHint?: string;
      targetUrl: string;
      connectionId?: ID | null;
    }) =>
      request<{ id: ID; signingSecret: string }>("/admin/integrations/slash-commands", {
        method: "POST",
        body: input,
      }),

    deleteCommand: (id: ID) =>
      request<void>(`/admin/integrations/slash-commands/${id}`, { method: "DELETE" }),

    listApps: () => request<OAuthApp[]>("/admin/integrations/oauth-apps"),

    createApp: (input: {
      name: string;
      description?: string;
      redirectUris: string[];
      scopes?: string[];
    }) =>
      request<{ id: ID; clientId: string; clientSecret: string }>(
        "/admin/integrations/oauth-apps",
        { method: "POST", body: input },
      ),

    deleteApp: (id: ID) =>
      request<void>(`/admin/integrations/oauth-apps/${id}`, { method: "DELETE" }),

    listConnections: () =>
      request<OutgoingOAuthConnection[]>("/admin/integrations/oauth-connections"),

    createConnection: (input: {
      name: string;
      provider?: string;
      clientId: string;
      clientSecret: string;
      authorizeUrl: string;
      tokenUrl: string;
      scopes?: string[];
    }) =>
      request<{ id: ID }>("/admin/integrations/oauth-connections", { method: "POST", body: input }),

    authorizeUrlFor: (id: ID) =>
      request<{ authorizeUrl: string }>(`/admin/integrations/oauth-connections/${id}/authorize`),

    deleteConnection: (id: ID) =>
      request<void>(`/admin/integrations/oauth-connections/${id}`, { method: "DELETE" }),
  },

  async listChannels(): Promise<Channel[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(channels, 280);
    return request<Channel[]>("/admin/channels");
  },

  async listRoles(): Promise<Role[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(roles, 200);
    return request<Role[]>("/admin/roles");
  },

  async listPermissions(): Promise<Permission[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(permissions, 200);
    return request<Permission[]>("/admin/permissions");
  },

  async setRolePermission(roleId: ID, permissionId: ID, granted: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>(`/admin/roles/${roleId}/permissions/${permissionId}`, {
      method: granted ? "PUT" : "DELETE",
    });
  },

  async listAuthProviders(): Promise<AuthProvider[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(authProviders, 220);
    return request<AuthProvider[]>("/admin/auth/providers");
  },

  async setAuthProviderEnabled(id: ID, isEnabled: boolean): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 260);
    return request<void>(`/admin/auth/providers/${id}`, { method: "PATCH", body: { isEnabled } });
  },

  async storage(): Promise<StorageBucket[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(storageBuckets, 240);
    return request<StorageBucket[]>("/admin/storage");
  },

  async settings(): Promise<SystemSettings> {
    if (USE_MOCK_TRANSPORT) return mockResolve(systemSettings, 200);
    return request<SystemSettings>("/admin/settings");
  },

  async updateSettings(patch: Partial<SystemSettings>): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 300);
    return request<void>("/admin/settings", { method: "PATCH", body: patch });
  },

  async auditLog(): Promise<AuditLogEntry[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(auditLog, 320);
    return request<AuditLogEntry[]>("/admin/audit-log");
  },
};
