import { lookup as lookupAsync } from "node:dns/promises";
import { lookup as lookupCallback, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { env } from "../env";
import { signPayload } from "./secrets";

/**
 * Outbound HTTP to administrator-supplied URLs.
 *
 * Outgoing webhooks, slash commands and OAuth token exchange all make the
 * server fetch a URL someone typed into a form. That is server-side request
 * forgery by construction: the request originates inside the network, so it
 * reaches anything the server can reach — a cloud metadata endpoint, an
 * unauthenticated admin port, a database. Every outbound call goes through
 * here, and here refuses anything that is not a public address.
 */

export class OutboundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboundError";
  }
}

/** Reserved ranges that must never be reachable from a configured URL. */
function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const value = address.toLowerCase();
  if (value === "::1" || value === "::") return true;
  if (value.startsWith("fe80")) return true; // link-local
  if (value.startsWith("fc") || value.startsWith("fd")) return true; // unique local
  // An IPv4-mapped address bypasses the v6 checks entirely unless unwrapped.
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

/**
 * Validates a URL an administrator is about to save.
 *
 * Checked at save time so a bad URL is refused in the form rather than failing
 * silently at delivery — but re-checked at send time too, because DNS can
 * change between the two.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OutboundError("That is not a valid URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new OutboundError("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new OutboundError("Credentials in the URL are not allowed");
  }

  // Resolve the name and check every address it answers with: a host that
  // returns one public and one private address would otherwise pass.
  let addresses: { address: string }[];
  try {
    addresses = await lookupAsync(url.hostname, { all: true });
  } catch {
    throw new OutboundError(`Could not resolve ${url.hostname}`);
  }
  if (addresses.length === 0) throw new OutboundError(`Could not resolve ${url.hostname}`);

  for (const { address } of addresses) {
    if (isPrivateAddress(address) && !env.allowPrivateOutbound) {
      throw new OutboundError(
        `${url.hostname} resolves to a private address (${address}), which cannot be reached from here`,
      );
    }
  }

  return url;
}

/**
 * A fetch that only ever connects to an address it has just checked.
 *
 * `assertSafeUrl` resolves the name and checks the answer, but a plain `fetch`
 * then resolves it again — and a DNS server the attacker controls can answer
 * "a public address" the first time and "127.0.0.1" the second (DNS rebinding),
 * walking straight past the check. Here the check happens inside the connection's
 * own name lookup, so the address that is dialled is the address that was judged.
 * The hostname is kept for TLS, so certificates are still verified against it.
 *
 * Redirects are never followed (a redirect is how a checked public URL becomes
 * an internal one), and the response is read up to a cap.
 */
export async function safeFetch(
  rawUrl: string | URL,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | URLSearchParams | Uint8Array;
    signal?: AbortSignal;
    maxBytes?: number;
  } = {},
): Promise<Response> {
  const url = await assertSafeUrl(String(rawUrl));
  const maxBytes = init.maxBytes ?? 1024 * 1024;
  const body = init.body instanceof URLSearchParams ? init.body.toString() : init.body;
  const lib = url.protocol === "https:" ? https : http;

  return new Promise<Response>((resolve, reject) => {
    const request = lib.request(
      url,
      {
        method: init.method ?? "GET",
        headers: {
          ...(init.headers ?? {}),
          ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
        },
        agent: false,
        lookup: (hostname, options, callback) => {
          lookupCallback(hostname, { ...options, all: true }, (error, addresses) => {
            if (error) return callback(error, "", 4);
            const list = addresses as LookupAddress[];
            const usable = list.filter((entry) => env.allowPrivateOutbound || !isPrivateAddress(entry.address));
            if (usable.length === 0) {
              return callback(new OutboundError(`${hostname} resolves to a private address`) as NodeJS.ErrnoException, "", 4);
            }
            // The wrapped signature depends on whether `all` was asked for.
            const wantsAll = (options as { all?: boolean }).all;
            return wantsAll
              ? (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, usable)
              : callback(null, usable[0].address, usable[0].family);
          });
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        let total = 0;
        response.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            request.destroy(new OutboundError("The response was too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          const headers = new Headers();
          for (const [key, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
            else if (value !== undefined) headers.set(key, value);
          }
          const bodyless = status === 204 || status === 205 || status === 304 || (status >= 100 && status < 200);
          resolve(new Response(bodyless ? null : new Uint8Array(Buffer.concat(chunks)), { status, headers }));
        });
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    if (init.signal) {
      if (init.signal.aborted) request.destroy(Object.assign(new Error("aborted"), { name: "AbortError" }));
      init.signal.addEventListener("abort", () => request.destroy(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
    }
    if (body !== undefined) request.write(body);
    request.end();
  });
}

export interface DeliveryResult {
  ok: boolean;
  status: number | null;
  /** The receiver's body, capped — some integrations reply with a message. */
  body: string;
  error: string | null;
  durationMs: number;
}

const TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

/**
 * Posts a signed JSON payload.
 *
 * Never throws for a delivery failure: a broken endpoint is data to record
 * against the webhook, not an exception that fails the message that triggered
 * it. The only throw is an unsafe URL, which is a configuration error.
 */
export async function deliver(
  rawUrl: string,
  secret: string,
  payload: unknown,
  /**
   * From an outgoing OAuth connection, when the integration is configured to
   * use one. The signature proves the delivery came from here; this proves to
   * the receiver *who* it is acting as.
   */
  bearerToken?: string | null,
): Promise<DeliveryResult> {
  const startedAt = Date.now();
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  let url: URL;
  try {
    // Re-validated here, not only at save time: DNS can be re-pointed at a
    // private address after the URL was accepted.
    url = await assertSafeUrl(rawUrl);
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: "",
      error: error instanceof Error ? error.message : "Unsafe URL",
      durationMs: Date.now() - startedAt,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await safeFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Helix-Integrations/1.0",
        "X-Helix-Timestamp": timestamp,
        "X-Helix-Signature": `v0=${signPayload(secret, timestamp, body)}`,
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
      body,
      signal: controller.signal,
      maxBytes: MAX_RESPONSE_BYTES,
    });

    const text = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
    return {
      ok: response.ok,
      status: response.status,
      body: text,
      error: response.ok ? null : `Endpoint answered ${response.status}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: null,
      body: "",
      error: aborted ? `No response within ${TIMEOUT_MS / 1000}s` : String(error),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}
