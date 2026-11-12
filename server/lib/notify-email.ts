import { defaultPreferences } from "../../src/config";
import { env } from "../env";
import { mailEnabled, sendMail } from "./mail";
import { messageEmail } from "./mail-templates";
import { redis } from "./redis";
import { notificationsRepo, type EmailTarget } from "../repo/notifications";

/** One email per person per conversation in this window; the rest are in the app. */
const THROTTLE_SECONDS = 600;

/** "HH:mm" as minutes since midnight. */
function minutes(value: string): number {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

/**
 * Whether it is inside the person's Do-not-disturb hours, in their own time
 * zone. A window like 20:00–08:00 runs across midnight.
 */
export function inQuietHours(
  dnd: { enabled: boolean; from: string; to: string } | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!dnd?.enabled) return false;
  let local: string;
  try {
    local = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now);
  } catch {
    return false; // an unknown time zone must not silence someone for good
  }
  const current = minutes(local);
  const from = minutes(dnd.from);
  const to = minutes(dnd.to);
  if (from === to) return false;
  return from < to ? current >= from && current < to : current >= from || current < to;
}

/**
 * Whether this person should be emailed about this kind of message right now.
 * Pure, so every rule can be read in one place:
 *  - they have not turned email off (on unless they said otherwise);
 *  - they are away or offline — not at the app, and not on Do not disturb;
 *  - it is not inside their quiet hours;
 *  - their level for this kind of conversation is not "Nothing" (and for a
 *    direct message, is "All messages").
 */
export function shouldEmail(
  target: EmailTarget,
  kind: "mention" | "direct",
  now: Date = new Date(),
): boolean {
  const prefs = target.notifications;
  if (!(prefs.emailNotifications ?? defaultPreferences.notifications.emailNotifications)) return false;
  if (target.presence === "online" || target.presence === "dnd") return false;
  if (inQuietHours(prefs.doNotDisturb ?? defaultPreferences.notifications.doNotDisturb, target.timezone, now)) {
    return false;
  }
  if (kind === "direct") {
    return (prefs.directMessages ?? defaultPreferences.notifications.directMessages) === "all";
  }
  return (prefs.channelLevel ?? defaultPreferences.notifications.channelLevel) !== "none";
}

/**
 * Emails the people a new message is for, when the rules above say to.
 * Detached by callers and never throws: a mail problem must not fail a send.
 */
export async function emailAboutMessage(input: {
  kind: "mention" | "direct";
  recipientIds: string[];
  actor: { id: string; displayName: string };
  channelId: string;
  /** "#general" for a mention; ignored for a direct message. */
  channelLabel: string;
  text: string;
}): Promise<void> {
  try {
    if (!mailEnabled()) return;
    const ids = input.recipientIds.filter((id) => id !== input.actor.id);
    for (const target of await notificationsRepo.emailTargets(ids, input.channelId)) {
      if (!shouldEmail(target, input.kind)) continue;
      // Claimed only once everything else says yes, so a skipped message does
      // not use up the window.
      const claimed = await redis.set(`mailnotify:${target.userId}:${input.channelId}`, "1", "EX", THROTTLE_SECONDS, "NX");
      if (claimed !== "OK") continue;
      await sendMail(
        messageEmail({
          to: target.email,
          name: target.name,
          actorName: input.actor.displayName,
          channelLabel: input.kind === "mention" ? input.channelLabel : null,
          preview: input.text.replace(/\s+/g, " ").trim().slice(0, 200),
          url: `${env.publicUrl}/workspace`,
          settingsUrl: `${env.publicUrl}/settings/notifications`,
        }),
      );
    }
  } catch (error) {
    console.error("[notify-email] could not send:", String(error));
  }
}
