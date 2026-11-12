import { env } from "../env";

/**
 * The address a request really came from, as far as it can be known.
 *
 * X-Forwarded-For is a list each proxy appends to, and the client may have put
 * anything at the front of it, so the leftmost entry is attacker-chosen. Taking
 * it let one caller rotate made-up addresses to dodge every per-address limit
 * and to write false addresses into the audit log. The trustworthy entry is the
 * one the outermost proxy of ours added: counted from the right by the number of
 * proxies configured. With none configured the header is not used at all.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const hops = env.trustedProxyHops;
  if (hops === 0) return null;
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries[entries.length - hops] ?? null;
}
