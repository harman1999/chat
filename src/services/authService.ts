import type { User } from "@/types";
import { currentUser } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface Credentials {
  email: string;
  password: string;
  /** Workspace slug, when the email has accounts in more than one. */
  workspace?: string;
}

/** What sign-in answers when the email has accounts in several workspaces. */
export interface WorkspaceChoice {
  slug: string;
  name: string;
}

export interface SsoOptions {
  enabled: boolean;
  label: string;
  /** Passwords are switched off for everyone but the owner. */
  enforced: boolean;
}

export interface Session {
  user: User;
  expiresAt: string;
}

export const authService = {
  async signIn(credentials: Credentials): Promise<Session> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve({
        user: currentUser,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    }
    return request<Session>("/auth/login", { method: "POST", body: credentials });
  },

  async signOut(): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 80);
    return request<void>("/auth/logout", { method: "POST" });
  },

  /** Whether the sign-in page should offer single sign-on, and under what name. */
  async ssoOptions(workspace?: string): Promise<SsoOptions> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ enabled: false, label: "", enforced: false }, 80);
    return request<SsoOptions>(`/auth/sso/options${workspace ? `?workspace=${encodeURIComponent(workspace)}` : ""}`);
  },

  /** Emails a reset link. The answer is the same whether or not the address has an account. */
  async forgotPassword(email: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    await request<{ message: string }>("/auth/forgot-password", { method: "POST", body: { email } });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    if (USE_MOCK_TRANSPORT) return mockResolve(undefined, 200);
    return request<void>("/auth/reset-password", { method: "POST", body: { token, newPassword } });
  },

  async me(): Promise<User> {
    if (USE_MOCK_TRANSPORT) return mockResolve(currentUser, 80);
    return request<User>("/auth/me");
  },
};
