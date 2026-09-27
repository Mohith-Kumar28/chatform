import { FEATURES, LIMIT_KEYS, PLANS, limitMeta, type LimitKey, type PlanId } from "@repo/entitlements";
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

/**
 * Re-exported rather than defined: this was one of two identical copies, the
 * other in the web app's printable-form builder, and a third would have been
 * written the next time somebody assembled markup from data.
 */
export { escapeHtml } from "@repo/guard";
import { escapeHtml } from "@repo/guard";

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
      ${
        // An empty string means no footer at all, not an empty one: a bare
        // padded block under the card reads as something that failed to render.
        opts.footer === ""
          ? ""
          : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px;">
        <tr>
          <td style="padding:16px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
            ${opts.footer ?? "Sent by chatform."}
          </td>
        </tr>
      </table>`
      }
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

// ─────────────────────────── card pieces ───────────────────────────
//
// The announcement mails (an invitation, a plan upgrade, a gift) are the ones a
// person keeps and forwards, so they get more than a heading and a paragraph.
// Still tables and inline styles, for the same Outlook reasons as `layout`.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Orange at roughly 10% on white, for the check discs. Solid, because Outlook drops rgba. */
const ORANGE_TINT = "#ffece2";

/** A small pill above the heading, then a large heading, then one line under it. */
function hero(a: { eyebrow?: string; title: string; subtitle?: string }): string {
  const pill = a.eyebrow
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 14px 0;">
  <tr>
    <td style="border-radius:999px;padding:4px 12px;background-color:${ORANGE};background-image:linear-gradient(100deg, ${ORANGE}, ${VIOLET});font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${ON_PRIMARY};">${escapeHtml(a.eyebrow)}</td>
  </tr>
</table>`
    : "";
  return `${pill}<h1 style="margin:0 0 10px 0;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.025em;color:${INK};">${escapeHtml(a.title)}</h1>
${a.subtitle ? `<p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:${MUTED};">${a.subtitle}</p>` : ""}`;
}

/** Feature copy is shared with the app, which uses em dashes; mail does not. */
function plainDash(text: string): string {
  return text.replace(/\s*—\s*/g, ", ");
}

/** Checked rows: a bold label with a muted line under it. */
function featureList(items: { label: string; blurb?: string }[], more = 0): string {
  const rows = items
    .map(
      (it) => `<tr>
    <td valign="top" width="30" style="padding:0 0 14px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" valign="middle" width="20" height="20" style="width:20px;height:20px;border-radius:999px;background-color:${ORANGE_TINT};font-family:${FONT};font-size:12px;line-height:20px;font-weight:700;color:${ORANGE};">&#10003;</td>
      </tr></table>
    </td>
    <td valign="top" style="padding:0 0 14px 0;font-family:${FONT};">
      <div style="font-size:15px;line-height:20px;font-weight:600;color:${INK};">${escapeHtml(plainDash(it.label))}</div>
      ${it.blurb ? `<div style="margin-top:2px;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(plainDash(it.blurb))}</div>` : ""}
    </td>
  </tr>`,
    )
    .join("\n");
  const tail = more > 0 ? `<p style="margin:0 0 8px 30px;font-size:13px;color:${MUTED};">And ${more} more.</p>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px 0;">
${rows}
</table>${tail}`;
}

/** Up to three big numbers side by side. */
function statTiles(tiles: { value: string; label: string }[]): string {
  if (tiles.length === 0) return "";
  const cells = tiles
    .map(
      (t, i) => `<td width="${Math.floor(100 / tiles.length)}%" valign="top" style="padding:14px 12px;${i > 0 ? `border-left:1px solid ${BORDER};` : ""}font-family:${FONT};text-align:center;">
      <div style="font-size:20px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${INK};">${escapeHtml(t.value)}</div>
      <div style="margin-top:4px;font-size:12px;line-height:1.4;color:${MUTED};">${escapeHtml(t.label)}</div>
    </td>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 18px 0;background-color:${GROUND};border:1px solid ${BORDER};border-radius:12px;">
  <tr>
${cells}
  </tr>
</table>`;
}

/** A quiet box of label and value pairs. Values are HTML, labels are text. */
function detailRows(rows: [label: string, valueHtml: string][]): string {
  if (rows.length === 0) return "";
  const body = rows
    .map(
      ([label, value], i) => `<tr>
    <td valign="top" style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${BORDER};` : ""}font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(label)}</td>
    <td valign="top" align="right" style="padding:12px 16px;${i > 0 ? `border-top:1px solid ${BORDER};` : ""}font-family:${FONT};font-size:14px;line-height:1.5;font-weight:600;color:${INK};">${value}</td>
  </tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0;background-color:${GROUND};border:1px solid ${BORDER};border-radius:12px;">
${body}
</table>`;
}

/** "14 Oct 2027", in UTC so the date in the mail matches the date in the app. */
function longDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// ─────────────────────────── team invitation ───────────────────────────

/** One workspace the invitation opens, and what they can do in it. */
export interface InvitationWorkspace {
  name: string;
  role: string;
}

const WORKSPACE_ROLE_COPY: Record<string, { title: string; blurb: string }> = {
  editor: { title: "Editor", blurb: "Editors build, edit and publish forms, and work with every response." },
  viewer: { title: "Viewer", blurb: "Viewers read completed responses and basic analytics." },
};

export function invitationEmail(a: {
  organizationName: string;
  inviterName: string | null;
  inviterEmail: string | null;
  role: string;
  acceptUrl: string;
  expiresAt: number | null;
  workspaces?: InvitationWorkspace[];
}): Omit<MailMessage, "to"> {
  const org = escapeHtml(a.organizationName);
  // "Someone" rather than an empty space: an invitation from nobody reads as
  // phishing, and the inviter's name is the single strongest signal that it is not.
  const who = a.inviterName?.trim() || a.inviterEmail?.trim() || "Someone";
  const primary = a.role.split(",")[0]?.trim() ?? a.role;
  const isAdmin = primary === "admin" || primary === "owner";
  const roleLabel = ROLE_LABELS[primary] ?? "a member";
  const roleTitle = isAdmin ? (primary === "owner" ? "Owner" : "Admin") : "Member";
  const expiry = a.expiresAt ? relativeExpiry(a.expiresAt) : null;
  const workspaces = isAdmin ? [] : (a.workspaces ?? []);

  const rows: [string, string][] = [["Team role", escapeHtml(roleTitle)]];
  if (isAdmin) rows.push(["Workspaces", "All, with full access"]);
  for (const w of workspaces) {
    rows.push([w.name, escapeHtml(WORKSPACE_ROLE_COPY[w.role]?.title ?? w.role)]);
  }
  const roleNotes = [...new Set(workspaces.map((w) => w.role))]
    .map((r) => WORKSPACE_ROLE_COPY[r]?.blurb)
    .filter((b): b is string => Boolean(b));
  const note = isAdmin
    ? "Admins can open every workspace and manage people and settings."
    : roleNotes.join(" ");

  const body = [
    hero({
      eyebrow: "Team invite",
      title: `Join ${a.organizationName} on chatform`,
      subtitle: `<strong style="color:${INK};">${escapeHtml(who)}</strong> invited you to build and run forms together in <strong style="color:${INK};">${org}</strong>.`,
    }),
    detailRows(rows),
    note ? `<p style="margin:10px 0 0 0;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(note)}</p>` : "",
    button(a.acceptUrl, "Accept invitation"),
    expiry ? p(`<span style="color:${MUTED};font-size:13px;">This invitation ${escapeHtml(expiry)}.</span>`) : "",
    fallbackLink(a.acceptUrl),
  ].join("\n");

  const textAccess = [
    `Team role: ${roleTitle}`,
    ...(isAdmin ? ["Workspaces: all, with full access"] : workspaces.map((w) => `${w.name}: ${WORKSPACE_ROLE_COPY[w.role]?.title ?? w.role}`)),
  ];

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
      ...textAccess,
      ``,
      `Accept: ${a.acceptUrl}`,
      expiry ? `\nThis invitation ${expiry}.` : ``,
      ``,
      `If you weren't expecting this, you can ignore this email.`,
    ].join("\n"),
  };
}

// ─────────────────────────── invitation accepted ───────────────────────────

/** The newcomer as a card: an initial disc, their name and address, their role. */
function personCard(a: { name: string; email: string; badge: string }): string {
  const initial = escapeHtml((a.name.trim()[0] ?? a.email[0] ?? "?").toUpperCase());
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 14px 0;background-color:${CARD};border:1px solid ${BORDER};border-radius:12px;">
  <tr>
    <td width="48" valign="middle" style="padding:16px 0 16px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" valign="middle" width="44" height="44" style="width:44px;height:44px;border-radius:999px;background-color:${ORANGE};background-image:linear-gradient(135deg, ${ORANGE}, ${VIOLET});font-family:${FONT};font-size:18px;line-height:44px;font-weight:700;color:${ON_PRIMARY};">${initial}</td>
      </tr></table>
    </td>
    <td valign="middle" style="padding:16px 12px;font-family:${FONT};">
      <div style="font-size:16px;line-height:22px;font-weight:600;color:${INK};">${escapeHtml(a.name)}</div>
      <div style="font-size:13px;line-height:18px;color:${MUTED};word-break:break-all;">${escapeHtml(a.email)}</div>
    </td>
    <td align="right" valign="middle" style="padding:16px 16px 16px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-radius:999px;padding:4px 10px;background-color:${ORANGE_TINT};font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;color:${INK};white-space:nowrap;">${escapeHtml(a.badge)}</td>
      </tr></table>
    </td>
  </tr>
</table>`;
}

/** To the person who sent an invitation, once it has been accepted. */
export function invitationAcceptedEmail(a: {
  organizationName: string;
  inviterName: string | null;
  memberName: string | null;
  memberEmail: string;
  role: string;
  workspaces: InvitationWorkspace[];
  invitedAt: number | null;
  joinedAt: number;
  teamSize: number;
  teamUrl: string;
}): Omit<MailMessage, "to"> {
  const who = a.memberName?.trim() || a.memberEmail;
  const primary = a.role.split(",")[0]?.trim() ?? a.role;
  const isAdmin = primary === "admin" || primary === "owner";
  const roleTitle = isAdmin ? (primary === "owner" ? "Owner" : "Admin") : "Member";
  const workspaces = isAdmin ? [] : a.workspaces;

  const rows: [string, string][] = [];
  if (isAdmin) rows.push(["Workspaces", "All, with full access"]);
  for (const w of workspaces) rows.push([w.name, escapeHtml(WORKSPACE_ROLE_COPY[w.role]?.title ?? w.role)]);
  if (!isAdmin && workspaces.length === 0) rows.push(["Workspaces", "None yet"]);
  if (a.invitedAt) rows.push(["Invited", escapeHtml(longDate(a.invitedAt))]);
  rows.push(["Joined", escapeHtml(longDate(a.joinedAt))]);
  rows.push(["Team size", `${a.teamSize} ${a.teamSize === 1 ? "person" : "people"}`]);

  const hi = a.inviterName?.trim() ? `${escapeHtml(a.inviterName.trim().split(/\s+/)[0]!)}, ` : "";
  const nudge =
    !isAdmin && workspaces.length === 0
      ? "They can't open any workspace yet. Give them access from your team settings."
      : "They can start working with you right away.";

  const body = [
    hero({
      eyebrow: "New teammate",
      title: `${who} joined ${a.organizationName}`,
      subtitle: `${hi}<strong style="color:${INK};">${escapeHtml(who)}</strong> accepted your invitation to <strong style="color:${INK};">${escapeHtml(a.organizationName)}</strong>. ${escapeHtml(nudge)}`,
    }),
    personCard({ name: who, email: a.memberEmail, badge: roleTitle }),
    detailRows(rows),
    button(a.teamUrl, "View your team"),
  ].join("\n");

  return {
    subject: `${who} joined ${a.organizationName} on chatform`,
    html: layout({
      preheader: `${who} accepted your invitation and joined as ${ROLE_LABELS[primary] ?? "a member"}.`,
      body,
      footer: `You received this because you invited ${escapeHtml(a.memberEmail)} to ${escapeHtml(a.organizationName)} on chatform.`,
    }),
    text: [
      `${who} (${a.memberEmail}) accepted your invitation and joined ${a.organizationName} on chatform.`,
      ``,
      `Team role: ${roleTitle}`,
      ...(isAdmin
        ? ["Workspaces: all, with full access"]
        : workspaces.length === 0
          ? ["Workspaces: none yet"]
          : workspaces.map((w) => `${w.name}: ${WORKSPACE_ROLE_COPY[w.role]?.title ?? w.role}`)),
      ...(a.invitedAt ? [`Invited: ${longDate(a.invitedAt)}`] : []),
      `Joined: ${longDate(a.joinedAt)}`,
      `Team size: ${a.teamSize}`,
      ``,
      `View your team: ${a.teamUrl}`,
    ].join("\n"),
  };
}

/**
 * The organization role, with its article, the way the web app's `lib/roles.ts`
 * spells it: an organization role is owner, admin or member. `editor` and
 * `viewer` are per-workspace now, and a row that still holds one at the
 * organization level predates that and reads as a member. What a member can
 * actually open is the workspace list under it, not this word.
 */
const ROLE_LABELS: Record<string, string> = {
  owner: "an owner",
  admin: "an admin",
  member: "a member",
  editor: "a member",
  viewer: "a member",
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
export type OtpPurpose =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email"
  /** Proving one answer on a customer's form. The only one not about an account. */
  | "answer-verification";

export function otpEmail(a: { code: string; purpose: OtpPurpose; formTitle?: string }): Omit<MailMessage, "to"> {
  const copy = OTP_COPY[a.purpose];
  const spaced = a.code.split("").join(" ");

  const lead =
    a.purpose === "answer-verification" && a.formTitle
      ? `Enter this code to confirm your email address on “${a.formTitle}”.`
      : copy.lead;

  const body = [
    h1(copy.heading),
    p(escapeHtml(lead)),
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
    text: [copy.heading, ``, lead, ``, a.code, ``, `Expires in 10 minutes.`, copy.disclaimer].join("\n"),
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
  /*
   * Addressed to a respondent, who has no account here and did not ask us for
   * anything — so it says which form wants the address rather than talking
   * about "your chatform account", and the disclaimer promises that ignoring it
   * costs them nothing.
   */
  "answer-verification": {
    heading: "Confirm your email address",
    lead: "Enter this code back in the form to confirm this address.",
    disclaimer: "Didn't fill in a form? Ignore this email — nothing is recorded without the code.",
  },
};

// ───────────────────── new response, to the form owner ─────────────────────

/**
 * Question above answer, as a table rather than a definition list.
 *
 * Outlook renders `<dl>` unpredictably and ignores margins on it, and every
 * layout in this file is already table-based for the same reason. The rule sits
 * on top of the question rather than under the answer so the first pair has one
 * too — a list whose first item is missing its separator reads as a heading.
 *
 * Shared by the owner's notification and the respondent's confirmation: they
 * are the same content read by two people, and one of them noticing a
 * difference in how their answers came back would be right to wonder which copy
 * was the real one.
 */
function answerTable(lines: AnswerLine[]): string {
  const rows = lines
    .map(
      (l) => `<tr>
  <td style="padding:10px 0 2px 0;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};">${escapeHtml(l.question)}</td>
</tr>
<tr>
  <td style="padding:0 0 10px 0;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap;">${escapeHtml(l.answer)}</td>
</tr>`,
    )
    .join("\n");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">${rows}</table>`;
}

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
  const body = [
    a.isTest
      ? `<p style="margin:0 0 14px 0;padding:8px 12px;border-radius:8px;background-color:#f4f0ff;font-size:13px;color:#5b3fa8;">Test response — written with a test API key, and excluded from your counts.</p>`
      : "",
    h1(`New response to ${a.formTitle}`),
    a.respondentEmail
      ? p(`From <a href="mailto:${escapeHtml(a.respondentEmail)}" style="color:${INK};">${escapeHtml(a.respondentEmail)}</a>`)
      : "",
    a.answers.length
      ? answerTable(a.answers)
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

// ─────────────────── confirmation, to the respondent ───────────────────

/**
 * The receipt somebody gets for having answered.
 *
 * Its job is to be the artefact a chat conversation does not leave behind: proof
 * the answers arrived, and a copy of what they were. So the answers lead the
 * layout under the message rather than sitting below a call to action, and there
 * is no button — a receipt is not a solicitation. The one link it may carry is
 * a quiet, underlined "Submit another response" under the answers, and only
 * when the form takes more than one response from a person: the same offer the
 * form's own ending makes, for whoever closed that tab and needs to go again.
 */
export function autoReplyEmail(a: {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  formTitle: string;
  /**
   * Their own answers, echoed back. Empty when the author switched the summary
   * off, or when the response recorded nothing worth listing.
   */
  answers?: AnswerLine[];
  /** Absent when the form owner has paid to remove it. */
  showPoweredBy: boolean;
  /** The form's link, when it accepts another response from the same person. */
  submitAgainUrl?: string | null;
}): Omit<MailMessage, "to"> {
  const answers = a.answers ?? [];
  const body = [
    h1(a.subject),
    a.bodyHtml,
    answers.length
      ? `<p style="margin:22px 0 0 0;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">What you sent</p>${answerTable(answers)}`
      : "",
    a.submitAgainUrl
      ? `<p style="margin:22px 0 0 0;font-size:14px;line-height:1.6;"><a href="${escapeHtml(a.submitAgainUrl)}" style="color:${MUTED};text-decoration:underline;">Submit another response</a></p>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
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
    text: [
      a.bodyText,
      answers.length ? `\nWhat you sent\n` : ``,
      ...answers.map((l) => `${l.question}\n${l.answer}\n`),
      a.submitAgainUrl ? `Submit another response: ${a.submitAgainUrl}\n` : ``,
      `—\nIn reply to your response to ${a.formTitle}.`,
    ]
      .filter((l) => l !== ``)
      .join("\n"),
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
  /**
   * How many questions they actually answered, known whether or not the author
   * shows a progress line.
   *
   * Separate from `progress` because "did they answer anything at all" decides
   * what this email may truthfully claim, and that must not depend on a display
   * setting: with `showProgress` off and no answers, the old copy still told
   * them their answers were waiting.
   */
  answered: number;
  /** From a contact block, when the form collected one. */
  firstName?: string;
  /** The sender's physical address. Required by CAN-SPAM; see above. */
  postalAddress?: string;
  /** False when the form's owner has paid to remove our name. */
  showPoweredBy: boolean;
}): Omit<MailMessage, "to"> {
  const greeting = a.firstName ? `${escapeHtml(a.firstName)}, y` : "Y";
  const remaining = a.progress ? Math.max(a.progress.total - a.progress.answered, 0) : 0;

  /**
   * Three cases, because two of them used to share a sentence that was false
   * in one of them.
   *
   * "Your answers are still there" is the right thing to say to somebody who
   * left half a form behind, and a plain untruth to somebody who signed in and
   * stopped before the first question — who now gets a nudge at all, since the
   * sign-in told us where to send it. Telling that person their answers are
   * safe invites them back to look for work they never did, and "pick up where
   * you left off" points at a conversation with nothing in it.
   */
  const startedNothing = a.progress ? a.progress.answered === 0 : a.answered === 0;

  const progressLine = startedNothing
    ? p(
        `${greeting}ou opened <strong>${escapeHtml(a.formTitle)}</strong> but did not get to any ` +
          `of the questions` +
          (a.progress ? `, and there ${a.progress.total === 1 ? "is" : "are"} ${a.progress.total}.` : `.`),
      )
    : a.progress
      ? p(
          `${greeting}ou answered <strong>${a.progress.answered} of ${a.progress.total}</strong> questions in ` +
            `<strong>${escapeHtml(a.formTitle)}</strong>` +
            (remaining > 0
              ? `, ${remaining} to go, about ${estimateMinutes(remaining)}.`
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
    button(a.resumeUrl, startedNothing ? "Start the form" : "Pick up where you left off"),
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
  const why = startedNothing
    ? `You are receiving this because you opened ${escapeHtml(a.formTitle)}.`
    : `You are receiving this because you started filling in ${escapeHtml(a.formTitle)}.`;
  const footerParts = [
    why,
    `<a href="${escapeHtml(a.unsubscribeUrl)}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>`,
  ];
  if (a.postalAddress) footerParts.push(escapeHtml(a.postalAddress));
  if (a.showPoweredBy) footerParts.push("Powered by chatform.");

  const textParts = [
    startedNothing
      ? `You opened ${a.formTitle} but did not get to any of the questions.`
      : a.progress
        ? `You answered ${a.progress.answered} of ${a.progress.total} questions in ${a.formTitle}.`
        : `You started ${a.formTitle} and did not finish. Your answers are still there.`,
    a.bodyText,
    startedNothing
      ? `Start the form: ${a.resumeUrl}`
      : `Pick up where you left off: ${a.resumeUrl}`,
    "—",
    startedNothing
      ? `You are receiving this because you opened ${a.formTitle}.`
      : `You are receiving this because you started filling in ${a.formTitle}.`,
    `Unsubscribe: ${a.unsubscribeUrl}`,
    a.postalAddress ?? "",
  ].filter(Boolean);

  return {
    subject: a.subject,
    html: layout({
      preheader: startedNothing
        ? `You have not started ${a.formTitle} yet.`
        : a.progress
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

// ──────────────── a respondent's bug report, to the founders ────────────────

/**
 * The one message in this file that goes to us rather than to a customer.
 *
 * Two jobs, in this order. **Be recognisable in a list of nineteen thousand
 * emails** — so the subject is the same four words every time, followed by the
 * form it happened on, and the respondent's own words move to the preheader,
 * which is the grey line Gmail prints beside a subject. Nothing is lost from
 * the inbox view and the report stops looking like a stray notification.
 * **Then be enough to act on without opening anything else**: their words, a
 * button straight to the live form, where in the conversation they were, and
 * which account's form it is.
 *
 * No "Powered by chatform" shell and no footer: `brand: false`, `footer: ""`.
 * This is internal mail, and dressing it as a product email makes it file
 * itself, in an inbox, with the notifications it must not be confused with.
 */
export function feedbackNotificationEmail(a: {
  rating: number;
  ratingLabel: string;
  message: string | null;
  formTitle: string | null;
  formId: string | null;
  /** The live form, exactly as the respondent had it open. */
  formUrl: string | null;
  /** Whose form it is — the customer, not the respondent. */
  accountName: string | null;
  respondentId: string | null;
  /** From a verified sign-in, when there was one — the only source that writes these. */
  respondentName: string | null;
  respondentEmail: string | null;
  respondentPhone: string | null;
  /** What the note turned out to be about, already a label. Null when untagged. */
  topic: string | null;
  /** The issue it was grouped into, and how big that issue now is. */
  issue: { title: string; reports: number; reopened: boolean } | null;
  /** This report, opened in the console. */
  reportUrl: string;
  /** How many reports this person has sent, ever. 1 on their first. */
  reportCount: number | null;
  /** Answers recorded when they stopped to tell us, and turns taken to get there. */
  answered: number | null;
  turns: number | null;
  /** `chat` | `embed` — where the conversation was running. */
  source: string | null;
  country: string | null;
  userAgent: string | null;
  createdAt: number;
  consoleUrl: string;
}): Omit<MailMessage, "to"> {
  const facts: [string, string][] = [
    ["Rating", `${a.ratingLabel} (${a.rating}/5)`],
    ...(a.issue
      ? ([
          [
            "Issue",
            `${a.issue.title} · ${a.issue.reports === 1 ? "first report" : `${a.issue.reports} reports`}${a.issue.reopened ? " · reopened" : ""}`,
          ],
        ] as [string, string][])
      : []),
    ...(a.topic ? ([["Topic", a.topic]] as [string, string][]) : []),
    ["Form", a.formTitle ?? a.formId ?? "unknown"],
    ["Account", a.accountName ?? "unknown"],
    ["When", stamp(a.createdAt)],
  ];

  /*
    Where in the conversation they stopped to tell us — the fact that turns a
    report into a reproduction. "Nothing answered yet" is the interesting case
    and has to say so out loud rather than print a zero.
  */
  if (a.answered !== null) {
    facts.push([
      "Progress",
      a.answered === 0
        ? `nothing answered yet${a.turns ? `, ${a.turns} turn${a.turns === 1 ? "" : "s"} in` : ""}`
        : `${a.answered} answer${a.answered === 1 ? "" : "s"} in${a.turns ? `, ${a.turns} turns` : ""}`,
    ]);
  }

  const where = [a.source === "embed" ? "embedded" : a.source === "chat" ? "hosted page" : a.source, a.country]
    .filter(Boolean)
    .join(" · ");
  if (where) facts.push(["Where", where]);

  facts.push([
    "Respondent",
    a.respondentId
      ? `${a.respondentId}${a.reportCount && a.reportCount > 1 ? ` — report no. ${a.reportCount} from them` : " — first report from them"}`
      : "not recognised",
  ]);
  facts.push(["Browser", a.userAgent ?? "not reported"]);

  const body = [
    h1(`${a.ratingLabel} — a respondent reported something`),
    /*
      Their words, first and whole. `white-space:pre-wrap` keeps the line breaks
      somebody typed: a bug report is often three numbered steps, and reflowing
      it into a paragraph destroys the only structure it had.
    */
    a.message
      ? `<div style="margin:0 0 18px 0;padding:14px 16px;border-radius:10px;background-color:${GROUND};border:1px solid ${BORDER};font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap;">${escapeHtml(a.message)}</div>`
      : p(`<span style="color:${MUTED};">No note — they rated it and left.</span>`),
    /*
      Who sent it, and whether they can be answered — the first decision the
      reader makes, so it sits straight under their words. The address is a
      mailto with the form named and their note quoted, so a reply is one tap
      from the phone that showed the notification.
    */
    whoBlock(a),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">${facts
      .map(
        ([label, value]) => `<tr>
  <td style="padding:8px 12px 8px 0;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:8px 0;font-size:13px;line-height:1.5;color:${INK};border-top:1px solid ${BORDER};word-break:break-word;">${escapeHtml(value)}</td>
</tr>`,
      )
      .join("\n")}</table>`,
    /*
      The form itself is the button, because reproducing the bug means opening
      the thing it happened on. The console is the second stop, not the first —
      it says what we already know, and this email is that.
    */
    /*
      The report first: it holds the replay of what they were looking at, the
      triage controls and every link below in one place. The live form and the
      account are the quieter second stops.
    */
    button(a.reportUrl, "Open the report"),
    `<p style="margin:-8px 0 0 0;font-size:12px;line-height:1.6;color:${MUTED};">${[
      a.formUrl ? `<a href="${escapeHtml(a.formUrl)}" style="color:${MUTED};">Open the form</a>` : "",
      `<a href="${escapeHtml(a.consoleUrl)}" style="color:${MUTED};">the account</a>`,
    ]
      .filter(Boolean)
      .join(" · ")}</p>`,
  ]
    .filter(Boolean)
    .join("\n");

  /*
    The first line of the note, not the first sixty characters of it.

    Bug reports arrive as a sentence and then numbered steps, and collapsing the
    newlines to make a summary puts "1." on the end of it — the reader's eye
    stops on a fragment of the reproduction rather than on what broke. The
    opening line is the one somebody wrote as a summary anyway.
  */
  const firstLine = a.message
    ?.split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);

  return {
    /*
      The same four words every time, then the form.

      It used to lead with the rating and their words, which read in a list as
      an ordinary notification from a form — the one thing this must never look
      like. Recognisable first: anything starting "chatform bug report" is this,
      and the form name after it says which one before it is opened. What they
      said is not lost; it moves to the preheader below, which is what an inbox
      prints in grey beside the subject.
    */
    /*
      A reopened issue says so first: a bug somebody marked fixed coming back is
      the one report in the inbox that should not wait.
    */
    subject: `chatform bug report${a.issue?.reopened ? " (reopened)" : ""}${a.formTitle ? ` — ${a.formTitle}` : ""}`,
    html: layout({
      preheader: `${a.ratingLabel} · ${firstLine ? trimTo(firstLine, 100) : "no note"}`,
      body,
      brand: false,
      // Nothing. The line here named an environment variable, which belongs in
      // a deploy and not in anybody's inbox.
      footer: "",
    }),
    text: [
      `chatform bug report — ${a.formTitle ?? "unknown form"}`,
      ``,
      a.message ?? "(no note)",
      ``,
      `From: ${whoLine(a)}`,
      ...facts.map(([label, value]) => `${label}: ${value}`),
      ``,
      `Report: ${a.reportUrl}`,
      ...(a.formUrl ? [`Form: ${a.formUrl}`] : []),
      `Console: ${a.consoleUrl}`,
    ].join("\n"),
  };
}

/**
 * A heads-up to the founders: a new account, or a new form.
 *
 * One shape for both, because both are the same read: what happened, a few
 * labelled facts, and one button to the account in the console.
 */
export function platformEventEmail(a: {
  subject: string;
  heading: string;
  facts: [string, string][];
  buttonUrl: string;
  buttonLabel: string;
}): Omit<MailMessage, "to"> {
  const body = [
    h1(a.heading),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">${a.facts
      .map(
        ([label, value]) => `<tr>
  <td style="padding:8px 12px 8px 0;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:8px 0;font-size:13px;line-height:1.5;color:${INK};border-top:1px solid ${BORDER};word-break:break-word;">${escapeHtml(value)}</td>
</tr>`,
      )
      .join("\n")}</table>`,
    button(a.buttonUrl, a.buttonLabel),
  ].join("\n");
  return {
    subject: a.subject,
    html: layout({
      preheader: a.facts.map(([, v]) => v).slice(0, 2).join(" · "),
      body,
      brand: false,
      footer: "",
    }),
    text: [a.heading, ``, ...a.facts.map(([label, value]) => `${label}: ${value}`), ``, `${a.buttonLabel}: ${a.buttonUrl}`].join("\n"),
  };
}

type WhoArgs = {
  respondentName: string | null;
  respondentEmail: string | null;
  respondentPhone: string | null;
  formTitle: string | null;
  message: string | null;
};

/** One line naming the person, for the plain-text part. */
function whoLine(a: WhoArgs): string {
  const parts = [a.respondentName, a.respondentEmail, a.respondentPhone].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "never signed in — no way to reply";
}

/**
 * The reply, prepared.
 *
 * Subject names the form, body quotes their note — so the founder types the
 * answer and nothing else, and the respondent recognises what it is a reply to.
 */
function replyHref(a: WhoArgs): string {
  const subject = `Re: your report about ${a.formTitle ?? "the form"}`;
  const quoted = a.message ? `\n\n> ${a.message.split(/\r?\n/).join("\n> ")}` : "";
  return `mailto:${a.respondentEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(quoted)}`;
}

function whoBlock(a: WhoArgs): string {
  if (!a.respondentEmail && !a.respondentPhone && !a.respondentName) {
    return p(`<span style="color:${MUTED};">From someone who never signed in — there is no way to reply.</span>`);
  }
  const lines = [
    a.respondentName ? `<strong style="color:${INK};">${escapeHtml(a.respondentName)}</strong>` : "",
    a.respondentEmail
      ? `<a href="${escapeHtml(replyHref(a))}" style="color:${INK};">${escapeHtml(a.respondentEmail)}</a>`
      : "",
    a.respondentPhone
      ? `<a href="tel:${escapeHtml(a.respondentPhone)}" style="color:${INK};">${escapeHtml(a.respondentPhone)}</a>`
      : "",
  ].filter(Boolean);
  return `<p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:${INK};">From ${lines.join(" · ")}</p>`;
}

/** `15 Sep 2026, 14:19 UTC` — one zone, named, because the readers are in two. */
export function stamp(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
  return `${date}, ${time} UTC`;
}

/** Cut on a word where there is one, so a trimmed subject does not end mid-syllable. */
function trimTo(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// ──────────────── a builder's feedback, to the founders ────────────────

/**
 * A bug, feature request or feedback from somebody who builds forms.
 *
 * Shaped like the respondent report above: recognisable in a list first, then
 * enough to act on without opening anything. The difference is who sent it. This
 * is a paying customer, signed in, so the account and plan sit in the subject,
 * and Reply goes straight to them (set by the job, not here).
 */
export function builderFeedbackEmail(a: {
  kindLabel: string;
  /** Severity for a bug, importance for a request. Null for feedback. */
  severityLabel: string | null;
  rating: number | null;
  ratingLabel: string | null;
  areaLabel: string | null;
  /** The tagger's summary, when it ran. */
  title: string | null;
  message: string;
  steps: string | null;
  expected: string | null;
  why: string | null;
  userName: string | null;
  userEmail: string | null;
  role: string | null;
  accountName: string | null;
  planLabel: string | null;
  pageUrl: string | null;
  formTitle: string | null;
  attachments: number;
  errors: number;
  issue: { title: string; reports: number; accounts: number } | null;
  impersonatorEmail: string | null;
  userAgent: string | null;
  createdAt: number;
  reportUrl: string;
  consoleUrl: string;
}): Omit<MailMessage, "to"> {
  const facts: [string, string][] = [];
  if (a.severityLabel) facts.push([a.kindLabel === "Bug" ? "Severity" : "Importance", a.severityLabel]);
  if (a.rating) facts.push(["Rating", `${a.ratingLabel ?? ""} (${a.rating}/5)`.trim()]);
  if (a.areaLabel) facts.push(["Area", a.areaLabel]);
  if (a.issue) {
    facts.push([
      "Issue",
      `${a.issue.title} · ${a.issue.reports === 1 ? "first report" : `${a.issue.reports} reports from ${a.issue.accounts} account${a.issue.accounts === 1 ? "" : "s"}`}`,
    ]);
  }
  facts.push(["Account", [a.accountName ?? "unknown", a.planLabel].filter(Boolean).join(" · ")]);
  if (a.role) facts.push(["Role", a.role]);
  if (a.formTitle) facts.push(["Form", a.formTitle]);
  if (a.pageUrl) facts.push(["Page", a.pageUrl]);
  facts.push(["Attached", `${a.attachments} image${a.attachments === 1 ? "" : "s"}${a.errors ? `, ${a.errors} console error${a.errors === 1 ? "" : "s"}` : ""}`]);
  if (a.impersonatorEmail) facts.push(["Filed by", `${a.impersonatorEmail}, acting as this user`]);
  facts.push(["When", stamp(a.createdAt)]);
  facts.push(["Browser", a.userAgent ?? "not reported"]);

  const block = (label: string, text: string | null) =>
    text
      ? `<p style="margin:0 0 6px 0;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(label)}</p>
<div style="margin:0 0 14px 0;padding:12px 14px;border-radius:10px;background-color:${GROUND};border:1px solid ${BORDER};font-size:14px;line-height:1.6;color:${INK};white-space:pre-wrap;">${escapeHtml(text)}</div>`
      : "";

  const who = [a.userName, a.userEmail].filter(Boolean).join(" · ") || "unknown user";
  const heading = a.title ?? trimTo(a.message.split(/\r?\n/).find((l) => l.trim()) ?? a.message, 80);

  const body = [
    h1(`${a.kindLabel}: ${heading}`),
    p(`From <strong>${escapeHtml(who)}</strong>${a.accountName ? ` at ${escapeHtml(a.accountName)}` : ""}. Reply to this email to answer them.`),
    block(a.kindLabel === "Feature request" ? "What they want" : a.kindLabel === "Bug" ? "What went wrong" : "What they said", a.message),
    block("Steps to reproduce", a.steps),
    block("What they expected", a.expected),
    block("Why they need it", a.why),
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px 0;">${facts
      .map(
        ([label, value]) => `<tr>
  <td style="padding:8px 12px 8px 0;font-size:12px;line-height:1.5;color:${MUTED};border-top:1px solid ${BORDER};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td>
  <td style="padding:8px 0;font-size:13px;line-height:1.5;color:${INK};border-top:1px solid ${BORDER};word-break:break-word;">${escapeHtml(value)}</td>
</tr>`,
      )
      .join("\n")}</table>`,
    button(a.reportUrl, a.attachments ? "Open the report and screenshots" : "Open the report"),
    `<p style="margin:-8px 0 0 0;font-size:12px;line-height:1.6;color:${MUTED};"><a href="${escapeHtml(a.consoleUrl)}" style="color:${MUTED};">the account</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  const subjectBits = [a.kindLabel, a.severityLabel ?? a.ratingLabel].filter(Boolean).join(" · ");
  const account = [a.accountName, a.planLabel].filter(Boolean).join(", ");
  return {
    subject: `chatform feedback: ${subjectBits}: ${trimTo(heading, 70)}${account ? ` (${account})` : ""}`,
    html: layout({
      preheader: `${who} · ${trimTo(a.message.replace(/\s+/g, " "), 100)}`,
      body,
      brand: false,
      footer: "",
    }),
    text: [
      `chatform feedback: ${subjectBits}`,
      `From: ${who}${a.accountName ? ` at ${a.accountName}` : ""}`,
      ``,
      a.message,
      ...(a.steps ? [``, `Steps to reproduce:`, a.steps] : []),
      ...(a.expected ? [``, `Expected:`, a.expected] : []),
      ...(a.why ? [``, `Why they need it:`, a.why] : []),
      ``,
      ...facts.map(([label, value]) => `${label}: ${value}`),
      ``,
      `Report: ${a.reportUrl}`,
      `Account: ${a.consoleUrl}`,
    ].join("\n"),
  };
}

// ─────────────────────────── plan upgraded ───────────────────────────

/** How many unlocked features the upgrade card lists before "And N more". */
const UPGRADE_FEATURE_ROWS = 6;

/**
 * Which unlocked features lead the list. The catalogue's own order is by
 * area (branding first), which opens the card on "Custom fonts"; this puts
 * the ones people upgrade for on top. Anything not named follows in catalogue
 * order, so a new feature still shows up without touching this.
 */
const UPGRADE_HEADLINERS: readonly string[] = [
  "partial_responses",
  "remove_branding",
  "advanced_analytics",
  "collect_payments",
  "followup_email",
  "verified_answers",
  "activity_log",
  "one_response_per_identity",
  "agent_model_picker",
  "conversation_analytics",
  "brand_logo",
];

/**
 * "You're on Pro now", for a paid upgrade and an admin's gift alike.
 *
 * The features listed are exactly what the new plan has that the old one did
 * not, read from the catalogue, minus anything marked `soon`: promising an
 * unbuilt feature in a receipt-like mail is the same misrepresentation the
 * pricing page is careful to avoid.
 */
export function planUpgradedEmail(a: {
  organizationName: string;
  recipientName: string | null;
  planId: PlanId;
  previousPlanId: PlanId;
  cycle: "monthly" | "yearly" | null;
  endsAt: number | null;
  gifted: boolean;
  dashboardUrl: string;
}): Omit<MailMessage, "to"> {
  const plan = PLANS[a.planId];
  const before = new Set<string>(PLANS[a.previousPlanId].features);
  const rank = (k: string) => {
    const i = UPGRADE_HEADLINERS.indexOf(k);
    return i === -1 ? UPGRADE_HEADLINERS.length : i;
  };
  const unlocked = plan.features
    .filter((k) => !before.has(k) && !FEATURES[k].soon)
    .map((k, i) => ({ k, i }))
    .sort((a, b) => rank(a.k) - rank(b.k) || a.i - b.i)
    .map(({ k }) => FEATURES[k]);
  const shown = unlocked.slice(0, UPGRADE_FEATURE_ROWS);

  const tiles = (["ai_conversations_per_month", "workspaces_count", "seats"] as const).map((key) => ({
    value: `${limitValue(plan.limits[key])}${key === "ai_conversations_per_month" && plan.limits[key] !== null ? " / mo" : ""}`,
    label: limitMeta(key).label,
  }));

  const billing = a.gifted ? "A gift from the chatform team" : a.cycle === "yearly" ? "Yearly" : "Monthly";
  const rows: [string, string][] = [
    ["Plan", escapeHtml(plan.name)],
    ["Billing", escapeHtml(billing)],
  ];
  if (a.gifted) rows.push(["Access until", a.endsAt ? escapeHtml(longDate(a.endsAt)) : "No end date"]);

  const hi = a.recipientName?.trim() ? `${escapeHtml(a.recipientName.trim().split(/\s+/)[0]!)}, ` : "";
  const lead = a.gifted
    ? `${hi}the chatform team put <strong style="color:${INK};">${escapeHtml(a.organizationName)}</strong> on ${escapeHtml(plan.name)}, on us. Here is what just unlocked.`
    : `${hi}<strong style="color:${INK};">${escapeHtml(a.organizationName)}</strong> is now on ${escapeHtml(plan.name)}. Here is what just unlocked.`;

  const body = [
    hero({ eyebrow: `${plan.name} plan`, title: a.gifted ? `A gift: ${plan.name} is yours` : `Welcome to ${plan.name}`, subtitle: lead }),
    featureList(shown, unlocked.length - shown.length),
    statTiles(tiles),
    detailRows(rows),
    button(a.dashboardUrl, "Open chatform"),
  ].join("\n");

  return {
    subject: a.gifted ? `You've been given chatform ${plan.name}` : `You're on chatform ${plan.name}`,
    html: layout({
      preheader: `${a.organizationName} is on ${plan.name}. ${plan.tagline}`,
      body,
      footer: `You received this because you own ${escapeHtml(a.organizationName)} on chatform.`,
    }),
    text: [
      a.gifted ? `The chatform team put ${a.organizationName} on ${plan.name}, on us.` : `${a.organizationName} is now on ${plan.name}.`,
      ``,
      `What just unlocked:`,
      ...unlocked.map((f) => `- ${plainDash(f.label)}`),
      ``,
      ...tiles.map((t) => `${t.label}: ${t.value}`),
      `Billing: ${billing}`,
      ...(a.gifted ? [`Access until: ${a.endsAt ? longDate(a.endsAt) : "no end date"}`] : []),
      ``,
      `Open chatform: ${a.dashboardUrl}`,
    ].join("\n"),
  };
}

function limitValue(v: number | null): string {
  return v === null ? "Unlimited" : v.toLocaleString("en-US");
}

// ─────────────────────────── access granted ───────────────────────────

/** One thing an admin switched on or raised for an account. */
export interface AccessGrant {
  kind: "feature" | "limit";
  key: string;
  /** A limit's new value as stored: a decimal string, or "" for unlimited. */
  value: string;
}

/** A feature unlocked or a limit raised by the chatform team, outside any plan. */
export function accessGrantedEmail(a: {
  organizationName: string;
  recipientName: string | null;
  grants: AccessGrant[];
  expiresAt: number | null;
  dashboardUrl: string;
}): Omit<MailMessage, "to"> {
  const items = a.grants.map(describeGrant).filter((g): g is { label: string; blurb?: string } => g !== null);
  const hi = a.recipientName?.trim() ? `${escapeHtml(a.recipientName.trim().split(/\s+/)[0]!)}, ` : "";
  const onlyLimits = a.grants.every((g) => g.kind === "limit");
  const headline =
    items.length === 1 && !onlyLimits ? `Unlocked: ${plainDash(items[0]!.label)}` : onlyLimits ? "Your limit just went up" : "New access, unlocked";

  const body = [
    hero({
      eyebrow: "A gift from chatform",
      title: headline,
      subtitle: `${hi}the chatform team switched this on for <strong style="color:${INK};">${escapeHtml(a.organizationName)}</strong>. Enjoy.`,
    }),
    featureList(items),
    detailRows([["Access until", a.expiresAt ? escapeHtml(longDate(a.expiresAt)) : "No end date"]]),
    button(a.dashboardUrl, "Open chatform"),
  ].join("\n");

  return {
    subject: items.length === 1 ? `You've been given ${plainDash(items[0]!.label)} on chatform` : `You've been given new access on chatform`,
    html: layout({
      preheader: `The chatform team switched on ${items.map((i) => plainDash(i.label)).join(", ")} for ${a.organizationName}.`,
      body,
      footer: `You received this because you own ${escapeHtml(a.organizationName)} on chatform.`,
    }),
    text: [
      `The chatform team switched this on for ${a.organizationName}:`,
      ``,
      ...items.map((i) => `- ${plainDash(i.label)}${i.blurb ? `: ${plainDash(i.blurb)}` : ""}`),
      ``,
      `Access until: ${a.expiresAt ? longDate(a.expiresAt) : "no end date"}`,
      ``,
      `Open chatform: ${a.dashboardUrl}`,
    ].join("\n"),
  };
}

/** A grant as a row: a feature by its catalogue label, a limit as "Label: value". */
function describeGrant(g: AccessGrant): { label: string; blurb?: string } | null {
  if (g.kind === "feature") {
    const meta = (FEATURES as Record<string, { label: string; blurb: string } | undefined>)[g.key];
    return meta ? { label: meta.label, blurb: meta.blurb } : null;
  }
  if (!(LIMIT_KEYS as readonly string[]).includes(g.key)) return null;
  const meta = limitMeta(g.key as LimitKey);
  const n = g.value === "" ? null : Number(g.value);
  if (n !== null && !Number.isFinite(n)) return null;
  const unit = meta.unit === "megabytes" ? " MB" : "";
  const per = meta.kind === "monthly" ? " a month" : "";
  return { label: `${meta.label}: ${n === null ? "Unlimited" : `${n.toLocaleString("en-US")}${unit}${per}`}` };
}

// ─────────────────────────── plan lapsing ───────────────────────────

/** A live form, and what it loses (or lost) when the plan ends. */
export interface LapsedForm {
  title: string;
  url: string;
  /** Feature labels, as the catalogue names them. */
  losing: string[];
  /** A verified payment question closes the form to new responses. */
  closes: boolean;
}

/** The forms a lapse touches, one row each, the form's name linking to its builder. */
function lapsedFormList(forms: LapsedForm[], past: boolean, more: number): string {
  const rows = forms
    .map((f) => {
      const lines: string[] = [];
      if (f.closes) lines.push(past ? "Closed to new responses: verified payments" : "Will close to new responses: verified payments");
      const rest = f.losing.map(plainDash);
      if (rest.length > 0) lines.push(`${past ? "Lost" : "Loses"}: ${rest.join(", ")}`);
      return `<tr>
    <td valign="top" style="padding:12px 16px;border-top:1px solid ${BORDER};font-family:${FONT};">
      <a href="${escapeHtml(f.url)}" style="font-size:15px;line-height:20px;font-weight:600;color:${INK};text-decoration:none;">${escapeHtml(f.title)}</a>
      ${lines.map((l) => `<div style="margin-top:2px;font-size:13px;line-height:1.5;color:${MUTED};">${escapeHtml(l)}</div>`).join("")}
    </td>
  </tr>`;
    })
    .join("\n");
  const tail = more > 0 ? `<p style="margin:8px 0 0 0;font-size:13px;color:${MUTED};">And ${more} more.</p>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px 0;background-color:${GROUND};border:1px solid ${BORDER};border-top:0;border-radius:12px;">
${rows}
</table>${tail}`;
}

/**
 * A paid plan is about to stop applying, or just did.
 *
 * Three stages share one card so a gift running out, a cancellation and a card
 * that keeps declining all read the same way: when it happens, what it does to
 * the forms people are answering right now, and the one button that stops it.
 */
export function planLapseEmail(a: {
  organizationName: string;
  recipientName: string | null;
  stage: "payment_failed" | "ending" | "ended";
  reason: "payment" | "cancelled" | "gift";
  planId: PlanId;
  endsAt: number;
  forms: LapsedForm[];
  moreForms: number;
  planUrl: string;
}): Omit<MailMessage, "to"> {
  const plan = PLANS[a.planId].name;
  const org = a.organizationName;
  const date = longDate(a.endsAt);
  const hi = a.recipientName?.trim() ? `${a.recipientName.trim().split(/\s+/)[0]!}, ` : "";
  const past = a.stage === "ended";

  const copy =
    a.stage === "payment_failed"
      ? {
          subject: `Your chatform ${plan} payment didn't go through`,
          eyebrow: "Payment failed",
          title: "We couldn't take your payment",
          lead: `${hi}the renewal for ${org} on ${plan} was declined. Everything keeps working while we retry. If it still fails, ${org} moves to Free on ${date}.`,
          cta: "Update payment",
        }
      : a.stage === "ending"
        ? {
            subject:
              a.reason === "payment"
                ? `chatform ${plan} ends on ${date} unless payment goes through`
                : a.reason === "gift"
                  ? `Your gifted chatform ${plan} ends on ${date}`
                  : `Your chatform ${plan} plan ends on ${date}`,
            eyebrow: `${plan} ends soon`,
            title: `${plan} ends on ${date}`,
            lead:
              a.reason === "payment"
                ? `${hi}we still can't charge the card for ${org}. Unless a payment goes through, it moves to Free on ${date}.`
                : a.reason === "gift"
                  ? `${hi}the ${plan} plan the chatform team gave ${org} ends on ${date}, and ${org} moves to Free.`
                  : `${hi}${org} is set to move to Free on ${date}, when the ${plan} plan you cancelled runs out.`,
            cta: a.reason === "payment" ? "Update payment" : `Keep ${plan}`,
          }
        : {
            subject: `${org} is now on chatform Free`,
            eyebrow: "Now on Free",
            title: `${plan} has ended`,
            lead: `${hi}${org} moved to Free on ${date}. Nothing was deleted: your forms, responses and settings are all still there, and upgrading again puts every setting back.`,
            cta: `Get ${plan} back`,
          };

  const formsIntro =
    a.forms.length === 0
      ? `None of your live forms use ${plan} features, so they ${past ? "carry on" : "will carry on"} as they are.`
      : past
        ? `These live forms changed:`
        : `These live forms use ${plan} features and will change:`;

  const body = [
    hero({ eyebrow: copy.eyebrow, title: copy.title, subtitle: escapeHtml(copy.lead) }),
    p(escapeHtml(formsIntro)),
    a.forms.length > 0 ? lapsedFormList(a.forms, past, a.moreForms) : "",
    button(a.planUrl, copy.cta),
  ].join("\n");

  return {
    subject: copy.subject,
    html: layout({
      preheader: copy.lead,
      body,
      footer: `You received this because you own ${escapeHtml(org)} on chatform.`,
    }),
    text: [
      copy.lead,
      ``,
      formsIntro,
      ...a.forms.map((f) => {
        const bits = [
          ...(f.closes ? [past ? "closed to new responses (verified payments)" : "will close to new responses (verified payments)"] : []),
          ...(f.losing.length > 0 ? [`${past ? "lost" : "loses"} ${f.losing.map(plainDash).join(", ")}`] : []),
        ];
        return `- ${f.title}: ${bits.join("; ")} (${f.url})`;
      }),
      ...(a.moreForms > 0 ? [`And ${a.moreForms} more.`] : []),
      ``,
      `${copy.cta}: ${a.planUrl}`,
    ].join("\n"),
  };
}
