import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env";
import { increment } from "./metrics";

/**
 * Outgoing email.
 *
 * One transport per process, cached on globalThis so a dev hot-reload does not
 * leave a pool of idle connections behind (the same reason as the database pool).
 */
const globalForMail = globalThis as unknown as { helixMailer?: Transporter };

/** Whether this install can send mail at all. */
export function mailEnabled(): boolean {
  return Boolean(env.smtpHost);
}

function transport(): Transporter {
  globalForMail.helixMailer ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
    // A mail server that hangs must not hang the request that asked for the mail.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
  return globalForMail.helixMailer;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends one message. Never throws: a mail server being down must not turn a
 * successful action into a 500, and callers cannot do anything useful with the
 * error. It returns whether the server accepted the message, and counts both
 * outcomes so a broken mail setup shows up in the metrics rather than silently.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  if (!mailEnabled()) return false;
  try {
    await transport().sendMail({ from: env.mailFrom, ...mail });
    increment("mail.sent");
    return true;
  } catch (error) {
    increment("mail.failed");
    console.error("[mail] could not send:", String(error));
    return false;
  }
}
