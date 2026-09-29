/**
 * Uploaded images — workspace logos and profile photos.
 *
 * Formats an image may be. SVG is left out on purpose: it can carry script,
 * and these are shown to everyone in a workspace.
 */
export type ImageMime = "image/png" | "image/jpeg" | "image/webp";

export const MAX_LOGO_BYTES = 1024 * 1024;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Identifies an image by its first bytes, not by what the client says it is.
 * A declared Content-Type is only a claim; the bytes are what a browser will
 * actually interpret.
 */
export function sniffImage(data: Buffer): ImageMime | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/**
 * Reads an image upload's body within a byte limit: refused on the declared
 * length before buffering, then checked on what actually arrived.
 */
export async function readImage(
  request: Request,
  maxBytes: number,
): Promise<{ ok: true; data: Buffer; mime: ImageMime } | { ok: false; status: 400 | 413 | 415 }> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, status: 413 };
  const data = Buffer.from(await request.arrayBuffer());
  if (data.byteLength === 0) return { ok: false, status: 400 };
  if (data.byteLength > maxBytes) return { ok: false, status: 413 };
  const mime = sniffImage(data);
  return mime ? { ok: true, data, mime } : { ok: false, status: 415 };
}

/** Headers for serving a stored image: its sniffed type, and nothing else allowed. */
export function imageHeaders(mime: ImageMime): HeadersInit {
  return {
    "Content-Type": mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'",
    // URLs carry a version, so a changed image is a new URL.
    "Cache-Control": "private, max-age=31536000, immutable",
  };
}
