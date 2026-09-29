import type {
  ID,
  PresenceStatus,
  User,
  UserPreferences,
  UserStatus,
} from "@/types";
import { defaultPreferences } from "@/config";
import { users, usersById } from "@/data";
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

  /** Takes effect at once; the current password confirms it. */
  async changeEmail(email: string, password: string): Promise<{ email: string }> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ email }, 400);
    return request<{ email: string }>("/users/me/email", { method: "PUT", body: { email, password } });
  },

  /** Replaces the profile photo. Resolves to its new URL. */
  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ avatarUrl: URL.createObjectURL(file) }, 300);
    return request<{ avatarUrl: string }>("/users/me/avatar", { method: "PUT", body: file });
  },

  async removeAvatar(): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>("/users/me/avatar", { method: "DELETE" });
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
};
