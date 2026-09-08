import type { MailMessage } from "./mail.js";

/**
 * The messages themselves.
 *
 * Table layout and inline styles throughout, because an email is not a web
 * page: Outlook renders through Word, Gmail strips `<style>` blocks it does not
 * like, and flexbox does not exist in any of them. Nothing here is clever, and
 * that is the point.
 *
 * Colours are the hexadecimal spellings of the tokens in DESIGN.md §brand —
 * `oklch()` reaches roughly none of the clients we care about. The gradient rule
 * from that document holds here too: the orange→violet band is a brand moment,
 * so it appears once, as the rule across the top, and every call to action is a
 * solid `--primary` orange. `background-color` sits under `background-image` so
 * a client that drops gradients still gets the orange rather than nothing.
 */

const INK = "#3b3530";
const MUTED = "#7b736c";
const BORDER = "#e8e3da";
const GROUND = "#faf8f4";
const CARD = "#ffffff";
const ORANGE = "#fd6f29";
const VIOLET = "#9d6ee4";
/** The one ink that clears AA on both ends of the brand gradient. */
const ON_PRIMARY = "#201a16";

/**
 * The mark, as a hosted PNG.
 *
 * Absolute and pinned to the production origin rather than threaded through
 * from `APP_ORIGIN`: an email is opened days later, on a device that has never
 * heard of a preview deployment and cannot reach a localhost, and a broken
 * image in the header is worse than no image. SVG is not an option — Gmail and
 * every version of Outlook strip it — so this is a 96px PNG served at 24, and
 * the wordmark beside it stays live text so a client with images switched off
 * still shows the name rather than an empty box.
 */
const MARK_URL = "https://chatform.in/brand/email-mark.png";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The shell every message is poured into.
 *
 * `preheader` is the grey line a client shows next to the subject in the
 * inbox list. Left unset it fills itself with whatever text comes first,
 * which is usually a logo alt attribute — so it is a required argument.
 *
 * `brand: false` removes the header lockup entirely, for the auto-reply of a
 * customer who has paid to have our name off their mail. That flag already
 * governed the footer; the header was quietly ignoring it, and putting a logo
 * up there would have made a small inconsistency into a visible one.
 */
function layout(opts: { preheader: string; body: string; footer?: string; brand?: boolean }): string {
  const brand = opts.brand !== false;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>chatform</title>
</head>
<body style="margin:0;padding:0;background-color:${GROUND};">
<div style="display:none;font-size:1px;color:${GROUND};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${GROUND};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;background-color:${CARD};border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background-color:${ORANGE};background-image:linear-gradient(100deg, ${ORANGE}, ${VIOLET});">&nbsp;</td>
        </tr>
        ${
          brand
            ? `<tr>
          <td style="padding:32px 32px 8px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-right:8px;line-height:0;" valign="middle">
                  <img src="${MARK_URL}" width="24" height="24" alt="" style="display:block;width:24px;height:24px;border:0;outline:none;text-decoration:none;">
                </td>
                <td style="font-size:16px;font-weight:700;letter-spacing:-0.035em;color:${INK};" valign="middle">chatform</td>
              </tr>
            </table>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:${brand ? "8px" : "32px"} 32px 32px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK};">
${opts.body}
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;">
        <tr>
          <td style="padding:16px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
            ${opts.footer ?? "Sent by chatform."}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** A solid orange call to action, centred, with the ink that clears AA on it. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" style="border-radius:999px;background-color:${ORANGE};">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${ON_PRIMARY};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}

/**
 * The link, again, as text.
 *
 * Corporate mail scanners rewrite and sometimes break button hrefs, and a
 * respondent on a locked-down laptop is exactly the person who cannot ask for a
 * resend. The URL in full is the escape hatch.
 */
function fallbackLink(href: string): string {
  return `<p style="margin:24px 0 0 0;font-size:12px;line-height:1.6;color:${MUTED};">
  If the button does not work, paste this into your browser:<br>
  <a href="${escapeHtml(href)}" style="color:${MUTED};word-break:break-all;">${escapeHtml(href)}</a>
</p>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 16px 0;font-size:21px;line-height:1.3;font-weight:600;letter-spacing:-0.015em;color:${INK};">${escapeHtml(text)}</h1>`;
}

function p(html: string): string {
  return `<p style="margin:0 0 14px 0;font-size:15px;line-height:1.6;color:${INK};">${html}</p>`;
}

// ─────────────────────────── team invitation ───────────────────────────

export function invitationEmail(a: {
  organizationName: string;
  inviterName: string | null;
  inviterEmail: string | null;
  role: string;
  acceptUrl: string;
  expiresAt: number | null;
}): Omit<MailMessage, "to"> {
  const org = escapeHtml(a.organizationName);
  // "Someone" rather than an empty space: an invitation from nobody reads as
  // phishing, and the inviter's name is the single strongest signal that it is not.
  const who = a.inviterName?.trim() || a.inviterEmail?.trim() || "Someone";
  const roleLabel = ROLE_LABELS[a.role] ?? a.role;
  const expiry = a.expiresAt ? relativeExpiry(a.expiresAt) : null;

  const body = [
    h1(`Join ${a.organizationName} on chatform`),
    p(`<strong>${escapeHtml(who)}</strong> invited you to the <strong>${org}</strong> organization as ${escapeHtml(roleLabel)}.`),
    button(a.acceptUrl, "Accept invitation"),
    expiry ? p(`<span style="color:${MUTED};font-size:13px;">This invitation ${escapeHtml(expiry)}.</span>`) : "",
    fallbackLink(a.acceptUrl),
  ].join("\n");

  return {
    subject: `${who} invited you to ${a.organizationName} on chatform`,
    html: layout({
      preheader: `Join ${a.organizationName} as ${roleLabel}.`,
      body,
      footer: "You received this because someone entered your address when inviting a teammate. If you weren't expecting it, you can ignore this email.",
    }),
    text: [
      `${who} invited you to the ${a.organizationName} organization on chatform as ${roleLabel}.`,
      ``,
      `Accept: ${a.acceptUrl}`,
      expiry ? `\nThis invitation ${expiry}.` : ``,
      ``,
      `If you weren't expecting this, you can ignore this email.`,
    ].join("\n"),
  };
}

/**
 * The role names a person would recognise, which are not always the ones the
 * database stores.
 *
 * `member` is Better Auth's legacy default and is the reason this map exists.
 * It reads as a role and is not one — it is what `editor` was called before the
 * role list settled, and the database still holds it for anyone invited back
 * then. Saying "a member" tells the reader nothing about what they will be able
 * to do, so it is spelled as what it actually grants.
 *
 * The web app says the same thing from `lib/roles.ts`, which is the copy this
 * one has to agree with: the invitation email and `/accept-invitation` are two
 * halves of one moment, and an email promising "a member" above a page offering
 * "an editor" is the same invitation contradicting itself. Deliberately still
 * two copies — `apps/api` and `apps/web` cannot import from each other, and a
 * shared package for four strings costs more than it saves. If a fifth role
 * arrives, it arrives here and there.
 */
const ROLE_LABELS: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  editor: "an editor",
  viewer: "a viewer",
  member: "an editor",
};

/** "expires in 3 days" / "expires today" / "has expired". */
function relativeExpiry(at: number): string {
  const ms = at - Date.now();
  if (ms <= 0) return "has expired";
  const days = Math.round(ms / 86_400_000);
  if (days < 1) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

// ─────────────────────────── password reset ───────────────────────────

export function passwordResetEmail(a: { name: string | null; resetUrl: string }): Omit<MailMessage, "to"> {
  const greeting = a.name?.trim() ? `Hi ${escapeHtml(a.name.trim())},` : "Hi,";
  const body = [
    h1("Reset your password"),
    p(greeting),
    p("Use the button below to choose a new password. The link works once and expires in an hour."),
    button(a.resetUrl, "Reset password"),
    p(`<span style="color:${MUTED};font-size:13px;">Didn't ask for this? Ignore this email — your password stays as it is.</span>`),
    fallbackLink(a.resetUrl),
  ].join("\n");

  return {
    subject: "Reset your chatform password",
    html: layout({ preheader: "Choose a new password. The link expires in an hour.", body }),
    text: [
      greeting.replace(/<[^>]+>/g, ""),
      ``,
      `Use this link to choose a new password. It works once and expires in an hour.`,
      ``,
      a.resetUrl,
      ``,
      `Didn't ask for this? Ignore this email — your password stays as it is.`,
    ].join("\n"),
  };
}

// ─────────────────────────── one-time codes ───────────────────────────

/**
 * A six-digit code, and as little else as possible.
 *
 * The code is the message. It is set large and monospaced because most people
 * read it off a phone lock screen and type it on a laptop, and because a
 * proportional font makes `1` and `l` an unforced error. There is deliberately
 * no link and no button: a code email that also contains a clickable action is
 * a phishing template with our logo on it.
 */
export type OtpPurpose = "sign-in" | "email-verification" | "forget-password" | "change-email";

export function otpEmail(a: { code: string; purpose: OtpPurpose }): Omit<MailMessage, "to"> {
  const copy = OTP_COPY[a.purpose];
  const spaced = a.code.split("").join(" ");

  const body = [
    h1(copy.heading),
    p(escapeHtml(copy.lead)),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td align="center" style="padding:16px 28px;border:1px solid ${BORDER};border-radius:12px;background-color:${GROUND};font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:600;letter-spacing:0.22em;color:${INK};">${escapeHtml(a.code)}</td>
  </tr>
</table>`,
    p(`<span style="color:${MUTED};font-size:13px;">The code expires in 10 minutes and can only be used once.</span>`),
    p(`<span style="color:${MUTED};font-size:13px;">${escapeHtml(copy.disclaimer)}</span>`),
  ].join("\n");

  return {
    // The code in the subject line, so it can be read from the notification
    // without opening anything. Every provider that sends codes does this, and
    // it is the single biggest saving in the whole flow.
    subject: `${a.code} is your chatform code`,
    html: layout({ preheader: `${spaced} — ${copy.heading.toLowerCase()}`, body }),
    text: [copy.heading, ``, copy.lead, ``, a.code, ``, `Expires in 10 minutes.`, copy.disclaimer].join("\n"),
  };
}

const OTP_COPY: Record<OtpPurpose, { heading: string; lead: string; disclaimer: string }> = {
  "email-verification": {
    heading: "Confirm your email",
    lead: "Enter this code in chatform to finish setting up your account.",
    disclaimer: "Didn't sign up? Ignore this email — nothing happens without the code.",
  },
  "sign-in": {
    heading: "Your sign-in code",
    lead: "Enter this code in chatform to sign in.",
    disclaimer: "Didn't try to sign in? Ignore this email and change your password.",
  },
  "forget-password": {
    heading: "Reset your password",
    lead: "Enter this code in chatform to choose a new password.",
    disclaimer: "Didn't ask for this? Ignore this email — your password stays as it is.",
  },
  "change-email": {
    heading: "Confirm your email change",
    lead: "Enter this code in chatform to confirm the address on your account.",
    disclaimer: "Didn't ask for this? Ignore this email — your address stays as it is.",
  },
};

// ───────────────────── new response, to the form owner ─────────────────────

export interface AnswerLine {
  question: string;
  answer: string;
}

export function submissionNotificationEmail(a: {
  formTitle: string;
  responseUrl: string;
  answers: AnswerLine[];
  respondentEmail: string | null;
  submittedAt: number;
  /** True when a `*_test_` API key wrote the response. Says so, rather than lying. */
  isTest: boolean;
}): Omit<MailMessage, "to"> {
  const rows = a.answers
    .map(
      (l) => `<tr>
  <td style="padding:10px 0 2px 0;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};">${escapeHtml(l.question)}</td>
</tr>
<tr>
  <td style="padding:0 0 10px 0;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap;">${escapeHtml(l.answer)}</td>
</tr>`,
    )
    .join("\n");

  const body = [
    a.isTest
      ? `<p style="margin:0 0 14px 0;padding:8px 12px;border-radius:8px;background-color:#f4f0ff;font-size:13px;color:#5b3fa8;">Test response — written with a test API key, and excluded from your counts.</p>`
      : "",
    h1(`New response to ${a.formTitle}`),
    a.respondentEmail
      ? p(`From <a href="mailto:${escapeHtml(a.respondentEmail)}" style="color:${INK};">${escapeHtml(a.respondentEmail)}</a>`)
      : "",
    a.answers.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">${rows}</table>`
      : p(`<span style="color:${MUTED};">No answers were recorded.</span>`),
    button(a.responseUrl, "Open in chatform"),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    // The form title first, so a person filtering their inbox by form can.
    subject: `${a.isTest ? "[test] " : ""}New response — ${a.formTitle}`,
    html: layout({
      preheader: a.answers[0] ? `${a.answers[0].question}: ${a.answers[0].answer}` : "A new response came in.",
      body,
      footer: "You're getting this because your address is on this form's notification list. Change it in the form's settings.",
    }),
    text: [
      a.isTest ? `[test response — excluded from your counts]\n` : ``,
      `New response to ${a.formTitle}`,
      a.respondentEmail ? `From: ${a.respondentEmail}` : ``,
      ``,
      ...a.answers.map((l) => `${l.question}\n${l.answer}\n`),
      `Open: ${a.responseUrl}`,
    ]
      .filter((l) => l !== ``)
      .join("\n"),
  };
}

// ─────────────────── auto-reply, to the respondent ───────────────────

export function autoReplyEmail(a: {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  formTitle: string;
  /** Absent when the form owner has paid to remove it. */
  showPoweredBy: boolean;
}): Omit<MailMessage, "to"> {
  const body = [h1(a.subject), a.bodyHtml].join("\n");
  return {
    subject: a.subject,
    html: layout({
      preheader: a.bodyText.slice(0, 140),
      body,
      brand: a.showPoweredBy,
      footer: a.showPoweredBy
        ? `In reply to your response to ${escapeHtml(a.formTitle)}. Powered by chatform.`
        : `In reply to your response to ${escapeHtml(a.formTitle)}.`,
    }),
    text: `${a.bodyText}\n\n—\nIn reply to your response to ${a.formTitle}.`,
  };
}

// ─────────────────────────── follow-up nudge ───────────────────────────

/**
 * A nudge to somebody who started answering and left.
 *
 * Three things separate this from every other message in this file, and each is
 * a legal or deliverability requirement rather than a stylistic choice:
 *
 * **One link.** The resume button, and the plain-text copy of it that
 * `fallbackLink` exists for. No footer navigation, no "browse our other forms".
 * A second link is a second thing to decide about, and the whole message has one
 * job.
 *
 * **A postal address and an ad disclosure.** This is commercial mail under
 * CAN-SPAM — the transactional exemption is a closed list of five and none of
 * them covers "a transaction the recipient never agreed to enter into" — so the
 * sender's physical address is mandatory, not decorative.
 *
 * **An unsubscribe that works in one click**, mirrored in the `List-Unsubscribe`
 * headers the caller sets. Not a preference centre, not a login.
 *
 * The progress line leads because it is the one piece of the usual psychology
 * story that survives scrutiny: the Zeigarnik effect does not replicate, but
 * endowed progress — framing a task as already begun — roughly doubled
 * completion in Nunes & Dreze (2005).
 */
export function followUpEmail(a: {
  subject: string;
  /** Rendered from the author's markdown, already escaped. Empty when unset. */
  bodyHtml: string;
  bodyText: string;
  formTitle: string;
  resumeUrl: string;
  unsubscribeUrl: string;
  /** Omitted when the author turned the progress line off, or nothing is known. */
  progress?: { answered: number; total: number };
  /** From a contact block, when the form collected one. */
  firstName?: string;
  /** The sender's physical address. Required by CAN-SPAM; see above. */
  postalAddress?: string;
  /** False when the form's owner has paid to remove our name. */
  showPoweredBy: boolean;
}): Omit<MailMessage, "to"> {
  const greeting = a.firstName ? `${escapeHtml(a.firstName)}, y` : "Y";
  const remaining = a.progress ? Math.max(a.progress.total - a.progress.answered, 0) : 0;

  const progressLine = a.progress
    ? p(
        `${greeting}ou answered <strong>${a.progress.answered} of ${a.progress.total}</strong> questions in ` +
          `<strong>${escapeHtml(a.formTitle)}</strong>` +
          (remaining > 0
            ? ` — ${remaining} to go, about ${estimateMinutes(remaining)}.`
            : ` and were nearly done.`),
      )
    : p(
        `${greeting}ou started <strong>${escapeHtml(a.formTitle)}</strong> and did not finish. ` +
          `Your answers are still there.`,
      );

  const body = [
    h1(a.subject),
    progressLine,
    a.bodyHtml,
    button(a.resumeUrl, "Pick up where you left off"),
    fallbackLink(a.resumeUrl),
  ]
    .filter(Boolean)
    .join("\n");

  /**
   * The footer carries the compliance furniture. It is deliberately plain and
   * deliberately not hidden behind a colour that disappears against the card:
   * an unsubscribe somebody cannot find is the same as one that does not exist,
   * and it is the cheapest possible alternative to a spam complaint.
   */
  const footerParts = [
    `You are receiving this because you started filling in ${escapeHtml(a.formTitle)}.`,
    `<a href="${escapeHtml(a.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>`,
  ];
  if (a.postalAddress) footerParts.push(escapeHtml(a.postalAddress));
  if (a.showPoweredBy) footerParts.push("Powered by chatform.");

  const textParts = [
    a.progress
      ? `You answered ${a.progress.answered} of ${a.progress.total} questions in ${a.formTitle}.`
      : `You started ${a.formTitle} and did not finish. Your answers are still there.`,
    a.bodyText,
    `Pick up where you left off: ${a.resumeUrl}`,
    "—",
    `You are receiving this because you started filling in ${a.formTitle}.`,
    `Unsubscribe: ${a.unsubscribeUrl}`,
    a.postalAddress ?? "",
  ].filter(Boolean);

  return {
    subject: a.subject,
    html: layout({
      preheader: a.progress
        ? `${a.progress.answered} of ${a.progress.total} answered — ${remaining} to go.`
        : `Your answers to ${a.formTitle} are still saved.`,
      body,
      brand: a.showPoweredBy,
      footer: footerParts.join("<br>"),
    }),
    text: textParts.join("\n\n"),
  };
}

/**
 * How long the rest will take, in words.
 *
 * Naming the remaining cost is what makes "you're nearly done" actionable
 * rather than a claim. Fifteen seconds a question is the rough middle of what
 * conversational forms actually measure; it is rounded hard because a precise
 * estimate would be a false one.
 */
function estimateMinutes(remaining: number): string {
  const mins = Math.max(1, Math.round((remaining * 15) / 60));
  return mins === 1 ? "a minute" : `${mins} minutes`;
}
