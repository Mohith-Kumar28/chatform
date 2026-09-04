import { readFormDoc, sha256Hex, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { getEntitlements, meter, checkQuota } from "./entitlements.js";
import { clampForRuntime, brandingHiddenFor } from "./doc-entitlements.js";
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
  if (cap) {
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?1 AND status = 'completed'`,
    )
      .bind(form.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= cap) {
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
   * "One response per person, per day."
   *
   * Scoped to a day rather than forever because an IP identifies a network, not
   * a person: an office or a campus shares one, and a permanent block would lock
   * out everyone behind the first respondent.
   */
  if (settings.duplicates.strategy === "ip_daily" && ipHash) {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const prior = await env.DB.prepare(
      `SELECT 1 FROM chat_sessions WHERE form_id = ?1 AND ip_hash = ?2 AND created_at > ?3 LIMIT 1`,
    )
      .bind(form.id, ipHash, since)
      .first();
    if (prior) {
      return {
        ok: false,
        status: 409,
        body: {
          error: {
            code: "already_responded",
            message: "It looks like you have already answered this form today.",
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
                                hidden_fields, ip_hash, country, source, is_test, created_at, last_activity_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      sessionId,
      form.id,
      form.version_id,
      form.organization_id,
      sha256Hex(respondentToken),
      JSON.stringify(input.hiddenFields),
      ipHash,
      input.country,
      input.source,
      input.isTest ? 1 : 0,
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
  };
}
