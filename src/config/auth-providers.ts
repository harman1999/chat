import type { AuthProvider } from "@/types";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/**
 * Identity-provider configuration.
 *
 * Not in Postgres by design: this belongs in secret storage alongside the
 * signing keys, so it is served from config until that lands.
 */
export const authProviders: AuthProvider[] = [
  {
    id: "auth_password",
    name: "Email and password",
    kind: "password",
    description: "Built-in sign-in with an email address and password.",
    isEnabled: true,
    isConfigured: true,
    lastSyncAt: null,
  },
  {
    id: "auth_okta",
    name: "Okta (SAML 2.0)",
    kind: "saml",
    description: "Single sign-on through your identity provider.",
    isEnabled: true,
    isConfigured: true,
    lastSyncAt: minutesAgo(18),
  },
  {
    id: "auth_scim",
    name: "SCIM provisioning",
    kind: "scim",
    description: "Create and deactivate accounts automatically from Okta.",
    isEnabled: true,
    isConfigured: true,
    lastSyncAt: minutesAgo(42),
  },
  {
    id: "auth_google",
    name: "Google Workspace",
    kind: "oauth",
    description: "Sign in with a Google Workspace account.",
    isEnabled: false,
    isConfigured: true,
    lastSyncAt: null,
  },
  {
    id: "auth_oidc",
    name: "Generic OIDC",
    kind: "oidc",
    description: "Connect any OpenID Connect provider.",
    isEnabled: false,
    isConfigured: false,
    lastSyncAt: null,
  },
];
