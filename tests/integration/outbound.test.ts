import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPrivateAddress, OutboundError } from "@server/lib/outbound";
import { decryptSecret, encryptSecret, generateSecret, secretMatches, signPayload } from "@server/lib/secrets";

/**
 * The address classifier is pure, so it is tested directly rather than through
 * the API — this environment runs with the private-address escape hatch on, so
 * an end-to-end test here would prove nothing about the guard.
 */
describe("outbound address guard", () => {
  it.each([
    ["127.0.0.1", "loopback"],
    ["10.1.2.3", "RFC1918"],
    ["172.16.0.1", "RFC1918"],
    ["172.31.255.254", "RFC1918 upper bound"],
    ["192.168.1.1", "RFC1918"],
    ["169.254.169.254", "cloud metadata"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["0.0.0.0", "this network"],
    ["224.0.0.1", "multicast"],
    ["::1", "IPv6 loopback"],
    ["fe80::1", "IPv6 link-local"],
    ["fd00::1", "IPv6 unique local"],
    ["::ffff:169.254.169.254", "IPv4-mapped metadata address"],
  ])("treats %s as private (%s)", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"])(
    "treats %s as public",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );

  it("treats anything unparseable as private", () => {
    // Failing closed: an address that cannot be classified must not be reached.
    expect(isPrivateAddress("not-an-address")).toBe(true);
    expect(isPrivateAddress("999.999.999.999")).toBe(true);
  });

  it("rejects a non-http scheme", async () => {
    await expect(assertSafeUrl("file:///etc/passwd")).rejects.toThrow(OutboundError);
    await expect(assertSafeUrl("gopher://example.com")).rejects.toThrow(OutboundError);
  });

  it("rejects credentials embedded in the URL", async () => {
    await expect(assertSafeUrl("https://user:pass@example.com/hook")).rejects.toThrow(
      /Credentials in the URL/,
    );
  });

  it("rejects something that is not a URL at all", async () => {
    await expect(assertSafeUrl("not a url")).rejects.toThrow(OutboundError);
  });
});

describe("integration secrets", () => {
  it("generates a prefixed token that verifies against its hash", () => {
    const secret = generateSecret("bot");
    expect(secret.plaintext).toMatch(/^hlx_bot_/);
    expect(secret.prefix).toHaveLength(12);
    expect(secretMatches(secret.plaintext, secret.hash)).toBe(true);
    expect(secretMatches(`${secret.plaintext}x`, secret.hash)).toBe(false);
  });

  it("never stores the plaintext in the hash or the prefix", () => {
    const secret = generateSecret("hook");
    expect(secret.hash).not.toContain(secret.plaintext);
    // The prefix is short enough to be useless as a credential.
    expect(secret.plaintext.startsWith(secret.prefix)).toBe(true);
    expect(secret.prefix.length).toBeLessThan(secret.plaintext.length / 3);
  });

  it("round-trips an encrypted secret", () => {
    const plaintext = "a-client-secret-that-must-be-readable-again";
    const stored = encryptSecret(plaintext);
    expect(stored).not.toContain(plaintext);
    expect(decryptSecret(stored)).toBe(plaintext);
  });

  it("produces a different ciphertext each time", () => {
    // A fresh IV per encryption; identical secrets must not look identical.
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses a tampered ciphertext rather than decrypting it", () => {
    const stored = encryptSecret("original");
    const [version, iv, tag, data] = stored.split(".");
    const flipped = Buffer.from(data, "base64url");
    flipped[0] ^= 0xff;
    expect(() =>
      decryptSecret([version, iv, tag, flipped.toString("base64url")].join(".")),
    ).toThrow();
  });

  it("signs with the timestamp inside the signed material", () => {
    const a = signPayload("secret", "1000", "{}");
    const b = signPayload("secret", "2000", "{}");
    // Otherwise a captured delivery replays forever with its own headers.
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
