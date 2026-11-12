/** Shared by the two halves of a single sign-on attempt (start and callback). */
export const SSO_COOKIE = "helix_sso";
export const SSO_STATE_TTL_SECONDS = 600;
export const ssoStateKey = (state: string) => `sso:state:${state}`;
