import { readFormDoc, sha256Hex, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { getEntitlements, meter, checkQuota } from "./entitlements.js";
import { clampForRuntime, brandingHiddenFor } from "./doc-entitlements.js";
import { respondentKey, type RespondentKey } from "./respondent-key.js";
import { can } from "@repo/entitlements";
import { isHashedPassword, verifyPassword, timingSafeEqual } from "./crypto.js";
import type { ResponseSource } from "./submissions.js";

/**
 * Opening a chat session, and every gate that decides whether it may be opened.
 *
 * This used to live inside the `/p` route handler, which meant `/v1` — the
 * headless path a paying customer's own server uses — skipped all of it: the
 * close date, the monthly response ceiling, `maxSubmissions`, the password, the
 * captcha and the duplicate rule. A form could be closed, capped and
 * password-protected and the API would still open sessions on it, and none of
 * them would be metered.
 *
 * Both surfaces call this now. The only difference between them is
 * `trustedCaller`, and what it turns off is deliberately narrow.
 */

export interface FormRow {
  id: string;
  slug: string;
  status: string;
  close_at: number | null;
  organization_id: string;
  version_id: string;
  schema_json: string;
  /** Per-form salt for the respondent device key. See `lib/respondent-key.ts`. */
  fingerprint_salt: string;
}

export interface OpenSessionInput {
  env: Bindings;
  form: FormRow;
  source: ResponseSource;
  hiddenFields: Record<string, string>;
  ip: string;
  country: string | null;
  userAgent: string | null;
  /** Seconds the respondent token stays valid. */
  ttlSeconds?: number;
  password?: string;
  turnstileToken?: string;
  /**
   * The caller is a customer's own server, authenticated by an API key.
   *
   * Turns off exactly two gates. The form password, because an API key is
   * strictly stronger proof than a shared secret typed into a browser; and the
   * captcha, because there is no browser to solve one and a server-to-server
   * caller is not the bot it defends against.
   *
   * Everything else still applies. The close date, the response ceiling and
   * `maxSubmissions` are the form owner's own rules about whether their form is
   * open, and a headless caller does not get to ignore them.
   */
  trustedCaller?: boolean;
  /**
   * The respondent's address, when the caller knows it. The API caller's own IP
   * is not the respondent's, so the duplicate rule stays inert unless this is
   * supplied deliberately.
   */
  respondentIpHash?: string;
  /**
   * The device signal the browser computed, when there is a browser.
   *
   * Optional everywhere. It is blocked by extensions, refused by hardened
   * browsers, and absent from every server-to-server caller — so the key falls
   * back to the IP, which is what it was before. See `lib/respondent-key.ts`.
   */
  deviceSignal?: string | null;
  /**
   * The respondent's IANA zone, already canonicalised by the caller.
   *
   * Stored so a follow-up reminder can be held out of their night. Resolved on
   * the public route rather than here because `/v1` also opens sessions, and
   * the edge properties available there describe the customer's own
   * datacentre — a headless session honestly has no respondent zone.
   */
  timezone?: string | null;
  /** Opened with a test-mode key: real rows, excluded from every count. */
  isTest?: boolean;
  apiKeyId?: string | null;
  /**
   * The page that framed the form, when there is one.
   *
   * Checked against the form's embed allowlist here rather than in the browser,
   * because a page can claim to be anything — this is the `Origin` header the
   * browser sets, which it cannot.
   */
  embedOrigin?: string | null;
  /**
   * This session continues a response that was abandoned, opened from the link
   * in a follow-up email.
   *
   * It relaxes exactly two gates, and only those two:
   *
   * `allowResubmissions: false` — which would answer "you have already answered
   * this form" to the very person we just invited back, since they demonstrably
   * have. And `maxSubmissions`, which counts *completed*
   * responses: a form at its cap should stop taking new respondents, not
   * refuse the ones already half-way through.
   *
   * Everything else still applies. A closed form is closed, and a resume link
   * is not a way past a password or an embed allowlist — the link proves who
   * the response belongs to, not that the form is open to them.
   */
  resumeSubmissionId?: string;
  /**
   * The respondent pressed "Start over".
   *
   * The caller has already used it to decline the device match; this records it
   * on the session so the sign-in gate, which runs long after this call and
   * knows things this one could not, declines the identity match too.
   */
  startedOver?: boolean;
}

/** Exact origins, or one leading wildcard label. Matched on the host, never as a substring. */
function embedOriginAllowed(origin: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  let host: string;
  let scheme: string;
  try {
    const url = new URL(origin);
    host = url.host;
    scheme = url.protocol;
  } catch {
    return false;
  }
  return allowed.some((entry) => {
    const trimmed = entry.trim();
    if (!trimmed) return false;
    if (trimmed === origin) return true;
    const star = trimmed.indexOf("://*.");
    if (star === -1) return false;
    const entryScheme = `${trimmed.slice(0, star)}:`;
    const suffix = trimmed.slice(star + 4);
    return scheme === entryScheme && (host.endsWith(suffix) || host === suffix.slice(1));
  });
}

export type OpenSessionResult =
  | {
      ok: true;
      sessionId: string;
      respondentToken: string;
      expiresAt: number;
      doc: FormDoc;
      runtimeDoc: FormDoc;
      brandingHidden: boolean;
      aiDegraded: boolean;
      ipHash: string;
      /** The salted device key, and how much of it is a real device signal. */
      device: RespondentKey;
    }
  | { ok: false; status: 401 | 403 | 409; body: { error: { code: string; message: string } } };

/**
 * The scheduled close date, from the document first.
 *
 * `forms.close_at` is a denormalised copy that the builder does not always
 * write, so reading the column alone is what once made the close date do
 * nothing at all. The doc wins.
 */
function isClosed(doc: FormDoc, closeAtColumn: number | null): boolean {
  const scheduled = doc.settings.closeRules.closeAt;
  if (scheduled && Date.parse(scheduled) <= Date.now()) return true;
  return !!(closeAtColumn && closeAtColumn < Date.now());
}

/**
 * Responses that finished, which is the only kind `maxSubmissions` counts.
 *
 * Shared with the public config route, which shows the respondent how many
 * places are left. Two copies of this query would be two chances to disagree —
 * and the way they would disagree is the worst one available: a form telling
 * somebody there are places left and then refusing them, or holding places back
 * that nobody is using. A started-and-abandoned response takes no place, so
 * `status` narrows to completed here and must keep doing so in both readings.
 */
export async function completedSubmissions(env: Bindings, formId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?1 AND status = 'completed'`,
  )
    .bind(formId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * The monthly response ceiling. Its own function because a respondent hitting it
 * must be told the form is closed, never that somebody's plan is exhausted.
 */
async function ceilingReached(
  env: Bindings,
  orgId: string,
  ent: Awaited<ReturnType<typeof getEntitlements>>,
): Promise<boolean> {
  if (!orgId) return false;
  const quota = await checkQuota(env, orgId, "responses", ent);
  return !quota.ok;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export async function openSession(input: OpenSessionInput): Promise<OpenSessionResult> {
  const { env, form } = input;
  const doc = readFormDoc(JSON.parse(form.schema_json));
  const settings = doc.settings;

  if (isClosed(doc, form.close_at)) {
    return { ok: false, status: 403, body: { error: { code: "form_closed", message: "This form is closed" } } };
  }

  /**
   * The embed allowlist, enforced where it cannot be bypassed.
   *
   * The body used to carry `embed.origin` and nothing read it, so the setting
   * existed and did nothing. This is checked before anything is created, so a
   * disallowed page cannot open a session however it frames the form.
   */
  const allowedOrigins = settings.embed?.allowedOrigins ?? [];
  if (allowedOrigins.length > 0 && input.source === "embed") {
    if (!input.embedOrigin || !embedOriginAllowed(input.embedOrigin, allowedOrigins)) {
      return {
        ok: false,
        status: 403,
        body: {
          error: {
            code: "origin_not_allowed",
            message: "This form cannot be embedded on that site.",
          },
        },
      };
    }
  }

  const ent = await getEntitlements(env, form.organization_id);

  /**
   * The monthly ceiling behind "unlimited responses".
   *
   * A respondent must never see a billing error — that is the owner's problem,
   * not theirs — so an exhausted ceiling presents as the form being closed, in
   * the owner's own words.
   */
  if (await ceilingReached(env, form.organization_id, ent)) {
    return {
      ok: false,
      status: 403,
      body: { error: { code: "form_closed", message: settings.closeRules.closedMessageMd } },
    };
  }

  const cap = settings.closeRules.maxSubmissions;
  if (cap && !input.resumeSubmissionId) {
    if ((await completedSubmissions(env, form.id)) >= cap) {
      return { ok: false, status: 403, body: { error: { code: "form_closed", message: "This form is closed" } } };
    }
  }

  if (settings.password.enabled && !input.trustedCaller) {
    const supplied = input.password ?? "";
    const stored = settings.password.value;
    const ok = isHashedPassword(stored) ? await verifyPassword(supplied, stored) : timingSafeEqual(supplied, stored);
    if (!ok) {
      return {
        ok: false,
        status: 401,
        body: { error: { code: "password_required", message: "This form requires a password" } },
      };
    }
  }

  // A missing token used to skip verification entirely, so any client could
  // bypass the captcha by simply not sending one. Enabled means required.
  if (settings.captcha.enabled && env.TURNSTILE_SECRET_KEY && !input.trustedCaller) {
    if (!input.turnstileToken) {
      return {
        ok: false,
        status: 403,
        body: { error: { code: "captcha_required", message: "Captcha verification required" } },
      };
    }
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: input.turnstileToken }),
    });
    const vr = (await verify.json()) as { success: boolean };
    if (!vr.success) {
      return {
        ok: false,
        status: 403,
        body: { error: { code: "captcha_failed", message: "Captcha verification failed" } },
      };
    }
  }

  const ipHash = input.respondentIpHash ?? (input.ip ? sha256Hex(input.ip) : "");

  /**
   * The device key, which is what the duplicate rule keys on now.
   *
   * `ipHash` is still computed and still stored — it is what analytics and the
   * abuse paths read, and it is the fallback when no device signal arrives —
   * but it is no longer what decides whether somebody has answered before. An
   * IP is a network: it treated a hundred people in one office as one person,
   * and one person moving from wifi to mobile data as two.
   */
  const device = respondentKey({
    signal: input.deviceSignal,
    ip: input.ip,
    salt: form.fingerprint_salt,
  });

  /**
   * "One response per person", enforced on the device.
   *
   * This used to expire after 24 hours, on the reasoning that an IP identifies
   * a network rather than a person and a permanent block locks out everyone
   * behind a shared office or campus address. The window is gone because the
   * setting no longer says "per day" — an author who switched resubmissions off
   * meant off, and a block that quietly lapses overnight is a setting that does
   * not do what it is called.
   *
   * What does count as a prior response also changed: a *finished* session,
   * not merely one that was opened. The window used to hide this — abandoning
   * the form locked you out for a day and then let you back in. With no window
   * to expire, opening the link and closing the tab would have locked someone
   * out forever without them answering a single question. `disqualified`
   * counts alongside `completed`, or screening out would be undone by
   * reloading and answering differently.
   *
   * ── Two reasons this half stands down ──
   *
   * A form with a sign-in gate, on a plan that can key on the identity, gets
   * the stronger check at sign-in instead — and running both is not
   * belt-and-braces, it is a bug. The device check fires at the door, before
   * anybody can prove who they are, so two students sharing a lab PC ends with
   * the second one refused for a response the first one left. The identity
   * check would have waved them through. Where the identity is available it
   * is the only key that should be consulted.
   *
   * And it never fires on the IP fallback. `respondentKey` falls back to the
   * hashed IP when the browser sends no device signal, and an IP is a network:
   * blocking on it means the first person behind a campus NAT closes the form
   * for everybody else on it. `findDeviceResumable` already refuses to hand
   * back answers on an IP match for exactly this reason, and refusing a
   * response is the more damaging of the two. Over-blocking loses real
   * registrations silently; letting a determined duplicate through is what
   * sign-in is for, and the setting has never claimed to stop one.
   *
   * The same reasoning retires the old `ip_hash` clause that sat beside the
   * fingerprint to recognise responses left before this key existed. It
   * matched every row rather than only those legacy ones, so it was the NAT
   * collision above wearing a different hat.
   */
  const identityKeyed = settings.requireAuth.enabled && can(ent, "one_response_per_identity");
  if (
    !settings.allowResubmissions &&
    !identityKeyed &&
    device.source === "device" &&
    !input.resumeSubmissionId
  ) {
    const prior = await env.DB.prepare(
      `SELECT 1 FROM chat_sessions
        WHERE form_id = ?1 AND status IN ('completed', 'disqualified')
          AND fingerprint = ?2
        LIMIT 1`,
    )
      .bind(form.id, device.value)
      .first();
    if (prior) {
      return {
        ok: false,
        status: 409,
        body: {
          error: {
            code: "already_responded",
            message: "It looks like you have already answered this form.",
          },
        },
      };
    }
  }

  const sessionId = `chs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const respondentToken = crypto.randomUUID().replace(/-/g, "");
  const now = Date.now();
  const expiresAt = now + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;

  await env.DB.prepare(
    `INSERT INTO chat_sessions (id, form_id, form_version_id, organization_id, respondent_token_hash, status,
                                hidden_fields, ip_hash, fingerprint, country, timezone, source, is_test,
                                started_over, submission_id, created_at, last_activity_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      form.id,
      form.version_id,
      form.organization_id,
      sha256Hex(respondentToken),
      JSON.stringify(input.hiddenFields),
      ipHash,
      // Empty string rather than null would make every signal-less session
      // match every other one on the resubmission gate.
      device.value || null,
      input.country,
      input.timezone ?? null,
      input.source,
      input.isTest ? 1 : 0,
      input.startedOver ? 1 : 0,
      input.resumeSubmissionId ?? null,
      now,
      now,
      // Written at last. The column has existed since the first migration and
      // nothing has ever populated it, so a respondent token never expired.
      expiresAt,
    )
    .run();

  /**
   * Should this interview be a conversation, or scripted questions?
   *
   * The AI cap is `degrade`-mode: past it the form keeps working, it just stops
   * being a conversation. `responses` is metered here rather than at completion
   * because an abandoned session still cost us the interview.
   *
   * Test-mode sessions are metered as neither: rehearsing an integration must
   * not spend the customer's month.
   */
  let aiDegraded = false;
  if (!input.isTest) {
    const aiBudget = await meter(env, form.organization_id, "ai_conversations", 1, ent);
    aiDegraded = aiBudget.degraded === true;
    await meter(env, form.organization_id, "responses", 1, ent);
  }

  return {
    ok: true,
    sessionId,
    respondentToken,
    expiresAt,
    doc,
    // Plan-capped turn and token budgets are applied at read time, so a form
    // authored on a higher plan keeps running after a downgrade.
    runtimeDoc: clampForRuntime(doc, ent),
    brandingHidden: brandingHiddenFor(doc, ent),
    aiDegraded,
    ipHash,
    device,
  };
}
