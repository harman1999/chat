import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet } from "jose";
import { safeFetch } from "./outbound";

/**
 * OpenID Connect, authorization-code flow with PKCE.
 *
 * Every request to the provider goes through `assertSafeUrl`, because the
 * provider's address is typed into a form: without it this would be a way to
 * make the server fetch internal URLs. The ID token is verified with `jose`
 * against the provider's published keys — signature, issuer, audience, expiry
 * and the nonce this login started with — and only asymmetric algorithms are
 * accepted, so a token cannot be "signed" with the public key as an HMAC secret
 * or sent unsigned.
 */

export class OidcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OidcError";
  }
}

export interface ProviderMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
}

export interface IdClaims {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

const TIMEOUT_MS = 5_000;
const MAX_BYTES = 256 * 1024;
const CACHE_MS = 10 * 60_000;
const ASYMMETRIC = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"];

const trimSlash = (value: string) => value.replace(/\/+$/, "");

async function request(rawUrl: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await safeFetch(rawUrl, {
      method: init.method,
      headers: { Accept: "application/json", ...(init.headers as Record<string, string> | undefined) },
      body: init.body as URLSearchParams | undefined,
      signal: controller.signal,
      maxBytes: MAX_BYTES,
    });
    const text = await response.text();
    if (text.length > MAX_BYTES) throw new OidcError("The provider's answer was too large");
    if (!response.ok) throw new OidcError(`The provider answered ${response.status}`);
    try {
      return JSON.parse(text);
    } catch {
      throw new OidcError("The provider did not answer with JSON");
    }
  } catch (error) {
    if (error instanceof OidcError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new OidcError(`No answer from the provider within ${TIMEOUT_MS / 1000}s`);
    }
    // Node reports a refused or unresolvable connection only as "fetch failed";
    // the reason is on the cause.
    console.error("[oidc] request failed:", rawUrl, error);
    const reason = (error as { cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
    let host = "the provider";
    try {
      host = new URL(rawUrl).host;
    } catch {
      /* keep the generic wording */
    }
    const hint =
      reason === "ENOTFOUND" || reason === "EAI_AGAIN"
        ? "the name could not be found — check the address for typos"
        : reason === "ECONNREFUSED"
          ? "nothing is listening there — check the address and port"
          : reason === "ETIMEDOUT" || reason === "UND_ERR_CONNECT_TIMEOUT"
            ? "it did not answer — a firewall may be blocking this server"
            : reason
              ? reason
              : "check the address, and that this server can reach it";
    throw new OidcError(`Could not reach ${host}: ${hint}.`);
  } finally {
    clearTimeout(timer);
  }
}

const globalForOidc = globalThis as unknown as {
  helixOidcMeta?: Map<string, { at: number; meta: ProviderMetadata }>;
  helixOidcKeys?: Map<string, { at: number; jwks: JSONWebKeySet }>;
};
const metaCache = (globalForOidc.helixOidcMeta ??= new Map());
const keyCache = (globalForOidc.helixOidcKeys ??= new Map());

/** Reads the provider's published settings and checks they are about this issuer. */
export async function discover(issuer: string, options: { fresh?: boolean } = {}): Promise<ProviderMetadata> {
  const cached = metaCache.get(issuer);
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.meta;

  const body = (await request(`${trimSlash(issuer)}/.well-known/openid-configuration`)) as Partial<ProviderMetadata>;
  // The document must say it is for the issuer it was fetched from; otherwise
  // one provider could vouch for another's tokens.
  if (typeof body.issuer !== "string" || trimSlash(body.issuer) !== trimSlash(issuer)) {
    throw new OidcError("The provider's issuer does not match the address you entered");
  }
  for (const key of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    if (typeof body[key] !== "string" || !/^https?:\/\//.test(body[key] as string)) {
      throw new OidcError(`The provider's settings are missing ${key.replace(/_/g, " ")}`);
    }
  }
  const meta = body as ProviderMetadata;
  metaCache.set(issuer, { at: Date.now(), meta });
  return meta;
}

/** Everything one sign-in attempt must remember between leaving and coming back. */
export function newLoginRequest() {
  const verifier = randomBytes(32).toString("base64url");
  return {
    state: randomBytes(24).toString("base64url"),
    nonce: randomBytes(24).toString("base64url"),
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
}

export function authorizationUrl(
  meta: ProviderMetadata,
  input: { clientId: string; redirectUri: string; state: string; nonce: string; challenge: string },
): string {
  const url = new URL(meta.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

/** Trades the one-time code for the ID token. */
export async function exchangeCode(
  meta: ProviderMetadata,
  input: { clientId: string; clientSecret: string | null; code: string; verifier: string; redirectUri: string },
): Promise<string> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

  const offered = meta.token_endpoint_auth_methods_supported;
  const useBody = input.clientSecret && offered && !offered.includes("client_secret_basic") && offered.includes("client_secret_post");
  if (input.clientSecret && !useBody) {
    // RFC 6749: both parts are form-encoded before being base64'd.
    const enc = (value: string) => encodeURIComponent(value).replace(/%20/g, "+");
    headers.Authorization = `Basic ${Buffer.from(`${enc(input.clientId)}:${enc(input.clientSecret)}`).toString("base64")}`;
  } else {
    form.set("client_id", input.clientId);
    if (input.clientSecret) form.set("client_secret", input.clientSecret);
  }

  const answer = (await request(meta.token_endpoint, { method: "POST", headers, body: form })) as { id_token?: unknown };
  if (typeof answer.id_token !== "string") throw new OidcError("The provider did not return an ID token");
  return answer.id_token;
}

async function keys(meta: ProviderMetadata, fresh: boolean): Promise<JSONWebKeySet> {
  const cached = keyCache.get(meta.jwks_uri);
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.jwks;
  const jwks = (await request(meta.jwks_uri)) as JSONWebKeySet;
  if (!Array.isArray(jwks?.keys)) throw new OidcError("The provider's signing keys could not be read");
  keyCache.set(meta.jwks_uri, { at: Date.now(), jwks });
  return jwks;
}

/** Checks the ID token and returns who it says the person is. */
export async function verifyIdToken(
  idToken: string,
  meta: ProviderMetadata,
  input: { clientId: string; nonce: string },
): Promise<IdClaims> {
  const check = async (fresh: boolean) =>
    jwtVerify(idToken, createLocalJWKSet(await keys(meta, fresh)), {
      issuer: meta.issuer,
      audience: input.clientId,
      algorithms: ASYMMETRIC,
      clockTolerance: 60,
    });

  let payload;
  try {
    try {
      ({ payload } = await check(false));
    } catch (error) {
      // The provider may have rotated its keys since they were cached.
      if (!(error instanceof errors.JWKSNoMatchingKey)) throw error;
      ({ payload } = await check(true));
    }
  } catch (error) {
    if (error instanceof OidcError) throw error;
    throw new OidcError("The ID token was not valid");
  }

  if (payload.nonce !== input.nonce) throw new OidcError("The ID token was not issued for this sign-in");
  if (typeof payload.sub !== "string" || !payload.sub) throw new OidcError("The ID token has no subject");

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email.trim().toLowerCase() : undefined,
    // Some providers send the string "true".
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name.trim() : undefined,
  };
}

/** Same-origin paths only: `next` rides through the provider and back. */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/workspace";
  return value;
}
