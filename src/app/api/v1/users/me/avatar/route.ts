import { handler, json, noContent, problem } from "@server/lib/http";
import { MAX_AVATAR_BYTES, readImage } from "@server/lib/images";
import { UPLOAD_RULE } from "@server/lib/rate-limit";
import { requireUserSession } from "@server/lib/session";
import { usersRepo } from "@server/repo/users";

const REFUSED = {
  400: ["empty_file", "Choose an image to upload"],
  413: ["file_too_large", "Photos must be 2 MB or smaller"],
  415: ["unsupported_image", "Use a PNG, JPEG or WebP image"],
} as const;

/** Replaces the caller's profile photo. The body is the image itself. */
export const PUT = handler(async (request: Request) => {
  const { user } = await requireUserSession();
  const image = await readImage(request, MAX_AVATAR_BYTES);
  if (!image.ok) {
    const [code, message] = REFUSED[image.status];
    return problem(image.status, code, message);
  }
  const avatarUrl = await usersRepo.setAvatar(user.id, image.data, image.mime);
  return json({ avatarUrl });
}, { rateLimit: UPLOAD_RULE });

/** Removes the photo; initials show instead. */
export const DELETE = handler(async () => {
  const { user } = await requireUserSession();
  await usersRepo.clearAvatar(user.id);
  return noContent();
});
