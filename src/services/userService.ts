import type {
  ID,
  PresenceStatus,
  User,
  UserPreferences,
  UserSession,
  UserStatus,
} from "@/types";
import { defaultPreferences } from "@/config";
import { sessions, users, usersById } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface UpdateProfileInput {
  displayName: string;
  fullName: string;
  title: string;
  department: string;
  timezone: string;
}

export const userService = {
  async list(): Promise<User[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(users);
    return request<User[]>("/users");
  },

  async get(id: ID): Promise<User | null> {
    if (USE_MOCK_TRANSPORT) return mockResolve(usersById[id] ?? null);
    return request<User>(`/users/${id}`);
  },

  async setPresence(status: PresenceStatus): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 60);
    return request<void>("/users/me/presence", { method: "PUT", body: { status } });
  },

  async setCustomStatus(status: UserStatus | null): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 60);
    return request<void>("/users/me/status", { method: "PUT", body: status });
  },

  async updateProfile(input: UpdateProfileInput): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 400);
    return request<void>("/users/me", { method: "PATCH", body: input });
  },

  async changeEmail(email: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 400);
    return request<void>("/users/me/email", { method: "PUT", body: { email } });
  },

  async changePassword(current: string, next: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 500);
    return request<void>("/users/me/password", {
      method: "PUT",
      body: { currentPassword: current, newPassword: next },
    });
  },

  async getPreferences(): Promise<UserPreferences> {
    if (USE_MOCK_TRANSPORT) return mockResolve(defaultPreferences, 120);
    return request<UserPreferences>("/users/me/preferences");
  },

  /** Partial update — the server merges, so callers send only what changed. */
  async updatePreferences(patch: Partial<UserPreferences>): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 180);
    return request<void>("/users/me/preferences", { method: "PATCH", body: patch });
  },

  async listSessions(): Promise<UserSession[]> {
    if (USE_MOCK_TRANSPORT) return mockResolve(sessions, 260);
    return request<UserSession[]>("/users/me/sessions");
  },

  async revokeSession(id: ID): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 300);
    return request<void>(`/users/me/sessions/${id}`, { method: "DELETE" });
  },

  async revokeOtherSessions(): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 450);
    return request<void>("/users/me/sessions", { method: "DELETE" });
  },
};
