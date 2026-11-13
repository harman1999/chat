import type { User } from "@/types";
import { currentUser } from "@/data";
import { mockResolve, request, USE_MOCK_TRANSPORT } from "./http";

export interface Credentials {
  email: string;
  password: string;
  /** Workspace slug, when the email has accounts in more than one. */
  workspace?: string;
  /** Stay signed in after the browser closes (default). */
  remember?: boolean;
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

/** The secret and QR code to add to an authenticator app. */
export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  /** A ready-to-show image (data URL). */
  qr: string;
}

export interface TwoFactorSignIn extends Session {
  /** Only when a recovery code was used. */
  usedRecoveryCode?: boolean;
  recoveryCodesLeft?: number;
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

  /** Second step of signing in: the challenge from `signIn`, and a code from the app or a recovery code. */
  async verifyTwoFactor(challenge: string, code: string): Promise<TwoFactorSignIn> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve({ user: currentUser, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    }
    return request<TwoFactorSignIn>("/auth/two-factor/verify", { method: "POST", body: { challenge, code } });
  },

  /** For a workspace that requires two-factor: a new secret to add before getting in. */
  async startTwoFactorEnrolment(challenge: string): Promise<TwoFactorSetup> {
    if (USE_MOCK_TRANSPORT) return mockResolve({ secret: "MOCKMOCKMOCKMOCK", otpauthUrl: "otpauth://totp/mock", qr: "" });
    return request<TwoFactorSetup>("/auth/two-factor/setup", { method: "POST", body: { challenge } });
  },

  /** Proves the new entry works, signs in, and returns the recovery codes (shown once). */
  async finishTwoFactorEnrolment(challenge: string, code: string): Promise<Session & { recoveryCodes: string[] }> {
    if (USE_MOCK_TRANSPORT) {
      return mockResolve({ user: currentUser, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), recoveryCodes: [] });
    }
    return request<Session & { recoveryCodes: string[] }>("/auth/two-factor/enrol", {
      method: "POST",
      body: { challenge, code },
    });
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
