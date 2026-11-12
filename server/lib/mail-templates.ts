import type { Mail } from "./mail";

/** Names come from people, and the HTML part is rendered by mail clients. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One plain, table-free layout that reads the same in every mail client. */
function layout(heading: string, paragraphs: string[], action?: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${p}</p>`).join("");
  const button = action
    ? `<p style="margin:22px 0"><a href="${escapeHtml(action.url)}" style="background:#2f3fd1;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>
       <p style="margin:0 0 14px;color:#666;font-size:13px;line-height:1.5">If the button does not work, copy this address into your browser:<br><span style="word-break:break-all">${escapeHtml(action.url)}</span></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 18px">${escapeHtml(heading)}</h1>${body}${button}</div>`;
}

export function passwordResetEmail(input: {
  to: string;
  name: string;
  workspaceName: string;
  url: string;
  minutes: number;
}): Mail {
  const lead = `Someone asked to reset the password for your ${input.workspaceName} account.`;
  const expiry = `The link works once and expires in ${input.minutes} minutes.`;
  const ignore = "If this was not you, ignore this email — your password stays as it is.";
  return {
    to: input.to,
    subject: `Reset your ${input.workspaceName} password`,
    text: [`Hi ${input.name},`, "", lead, "", `Choose a new password: ${input.url}`, "", expiry, ignore].join("\n"),
    html: layout(
      "Reset your password",
      [`Hi ${escapeHtml(input.name)},`, escapeHtml(lead), escapeHtml(expiry), escapeHtml(ignore)],
      { label: "Choose a new password", url: input.url },
    ),
  };
}

export function inviteEmail(input: {
  to: string;
  inviterName: string;
  workspaceName: string;
  url: string;
  days: number;
}): Mail {
  const lead = `${input.inviterName} invited you to join ${input.workspaceName} on Helix.`;
  const how = "Open the link to choose your name and password.";
  const expiry = `The link expires in ${input.days} ${input.days === 1 ? "day" : "days"}.`;
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.workspaceName}`,
    text: ["Hello,", "", lead, "", `${how} ${input.url}`, "", expiry].join("\n"),
    html: layout(
      `Join ${input.workspaceName}`,
      ["Hello,", escapeHtml(lead), escapeHtml(`${how} ${expiry}`)],
      { label: "Accept the invitation", url: input.url },
    ),
  };
}

export function messageEmail(input: {
  to: string;
  name: string;
  actorName: string;
  /** "#general" for a channel, null for a direct message. */
  channelLabel: string | null;
  preview: string;
  url: string;
  settingsUrl: string;
}): Mail {
  const lead = input.channelLabel
    ? `${input.actorName} mentioned you in ${input.channelLabel}.`
    : `${input.actorName} sent you a direct message.`;
  const note = "You get these emails when you are away. You can turn them off in Settings → Notifications.";
  return {
    to: input.to,
    subject: input.channelLabel
      ? `${input.actorName} mentioned you in ${input.channelLabel}`
      : `${input.actorName} sent you a message`,
    text: [`Hi ${input.name},`, "", lead, "", `"${input.preview}"`, "", `Open Helix: ${input.url}`, "", note, input.settingsUrl].join("\n"),
    html: layout(
      lead.replace(/\.$/, ""),
      [
        `Hi ${escapeHtml(input.name)},`,
        `<span style="display:block;border-left:3px solid #c8ccd6;padding:2px 0 2px 12px;color:#444">${escapeHtml(input.preview)}</span>`,
        `<span style="color:#666;font-size:13px">${escapeHtml(note)} <a href="${escapeHtml(input.settingsUrl)}">Notification settings</a></span>`,
      ],
      { label: "Open Helix", url: input.url },
    ),
  };
}

export function passwordChangedEmail(input: { to: string; name: string; workspaceName: string }): Mail {
  const lead = `The password for your ${input.workspaceName} account was just changed, and you were signed out everywhere.`;
  const warn = "If you did not do this, ask a workspace administrator to reset your password straight away.";
  return {
    to: input.to,
    subject: `Your ${input.workspaceName} password was changed`,
    text: [`Hi ${input.name},`, "", lead, warn].join("\n"),
    html: layout("Your password was changed", [`Hi ${escapeHtml(input.name)},`, escapeHtml(lead), escapeHtml(warn)]),
  };
}
