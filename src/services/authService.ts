import type { User } from "@/types";
import { currentUser } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface Credentials {
  email: string;
  password: string;
}

export interface Session {
  user: User;
  accessToken: string;
  expiresAt: string;
}

export const authService = {
  async signIn(credentials: Credentials): Promise<Session> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve({
        user: currentUser,
        accessToken: "mock-access-token",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    }
    return request<Session>("/auth/login", { method: "POST", body: credentials });
  },

  async signOut(): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 80);
    return request<void>("/auth/logout", { method: "POST" });
  },

  async me(): Promise<User> {
    if (USE_MOCK_TRANSPORT) return mockResolve(currentUser, 80);
    return request<User>("/auth/me");
  },
};
