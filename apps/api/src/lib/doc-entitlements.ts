/**
 * Reconciling a form document with what the organization's plan allows.
 *
 * Two operations, deliberately at different points in the lifecycle:
 *
 *   `stripForPublish` — runs at publish. Gated settings are removed from the version
 *                       being published, and every removal is reported by path so the
 *                       builder can say exactly what was dropped and what it costs.
 *   `clampForRuntime` — runs when a published doc is read. Plan-derived values replace
 *                       the authored ones, so a form built on Pro keeps working after a
 *                       downgrade instead of refusing to load — and a form built under an
 *                       old default is repaired without anyone republishing it.
 *
 * Authoring is never gated. `PUT /forms/:id/doc` accepts anything valid, so a free user
 * uploads their logo, picks their font, and sees their form wearing both in the builder
 * preview. That is deliberate on two counts: it is honest — nothing silently disappears —
 * and it is the highest-intent moment in the product, because they have just built the
 * thing and can see it.
 */

import {
  DEFAULT_CONFIRMATION_BODY,
  DEFAULT_CONFIRMATION_SUBJECT,
  PAYMENT_PROVIDER_LABELS,
  toMinorUnits,
  type FormDoc,
} from "@repo/form-schema";
import {
  can,
  featureLocked,
  limitOf,
  FEATURES,
  minPlanFor,
  type Entitlements,
  type FeatureKey,
  type GateErrorBody,
} from "@repo/entitlements";
import type { Bindings } from "../env.js";
import { loadAccountForOrg } from "./payments/accounts.js";
import { gatewayEnabled } from "./payments/flag.js";
import { toStripeAmount } from "./payments/stripe.js";

export interface StrippedSetting {
  /** Dotted path into the document, e.g. `settings.branding.hidePoweredBy`. */
  path: string;
  feature: FeatureKey;
  /** What the user called it, for the notice the builder renders. */
  label: string;
  requiredPlan: "free" | "pro" | "business";
}

export interface StripResult {
  doc: FormDoc;
  stripped: StrippedSetting[];
}

function note(stripped: StrippedSetting[], path: string, feature: FeatureKey): void {
  stripped.push({ path, feature, label: FEATURES[feature].label, requiredPlan: minPlanFor(feature) });
}

/**
 * Remove everything the plan does not include, and say what was removed.
 *
 * Works on a structural clone: the working document is left exactly as authored, so a
 * later upgrade republishes the full thing with no re-authoring. Nothing here deletes
 * uploaded assets either — the logo stays in R2 and reappears the moment they subscribe.
 */
export function stripForPublish(input: FormDoc, ent: Entitlements): StripResult {
  const doc = structuredClone(input) as FormDoc;
  const stripped: StrippedSetting[] = [];
  const s = doc.settings;
  const t = doc.theme;

  // ── branding ────────────────────────────────────────────────────────────────
  if (s.branding?.hidePoweredBy && !can(ent, "remove_branding")) {
    s.branding.hidePoweredBy = false;
    note(stripped, "settings.branding.hidePoweredBy", "remove_branding");
  }
  if (!can(ent, "brand_logo")) {
    if (t.logoUrl || t.logoKey) {
      // The R2 object is kept; only the reference in the published version goes.
      t.logoUrl = null;
      t.logoKey = null;
      note(stripped, "theme.logoUrl", "brand_logo");
    }
    if (t.brandName) {
      t.brandName = undefined;
      note(stripped, "theme.brandName", "brand_logo");
    }
  }
  if (!can(ent, "custom_fonts")) {
    const defaults = { fontHeading: "Bricolage Grotesque", fontBody: "Inter" };
    if (t.fontHeading !== defaults.fontHeading || t.fontBody !== defaults.fontBody) {
      t.fontHeading = defaults.fontHeading;
      t.fontBody = defaults.fontBody;
      note(stripped, "theme.fontHeading", "custom_fonts");
    }
  }

  // ── share & deliver ─────────────────────────────────────────────────────────
  if (!can(ent, "form_metadata")) {
    const m = s.meta;
    if (m && (m.ogTitle || m.ogDescription || m.ogImageKey || m.faviconKey || m.noIndex)) {
      m.ogTitle = undefined;
      m.ogDescription = undefined;
      m.ogImageKey = null;
      m.faviconKey = null;
      m.noIndex = false;
      note(stripped, "settings.meta", "form_metadata");
    }
  }
  /**
   * Both places a redirect can be set, not just the settings one.
   *
   * `Ending.redirectUrl` has always existed and `toPublicEnding` has always
   * preferred it over the form-level setting, so the paid feature was reachable
   * by writing it onto an ending — through the API, or through any builder
   * control that offers it. Only the settings field was stripped, which made
   * this a paywall with a door beside it. Gate the capability, wherever it is
   * expressed.
   */
  if (!can(ent, "completion_redirect")) {
    if (s.onComplete?.redirectUrl) {
      s.onComplete.redirectUrl = undefined;
      note(stripped, "settings.onComplete.redirectUrl", "completion_redirect");
    }
    for (const [i, ending] of doc.endings.entries()) {
      if (!ending.redirectUrl) continue;
      ending.redirectUrl = undefined;
      note(stripped, `endings[${i}].redirectUrl`, "completion_redirect");
    }
  }
  /**
   * The confirmation email is not a paid feature; writing your own is.
   *
   * It used to be switched off wholesale below Pro, which was the wrong line to
   * draw once it became the default: a respondent to a free form would get
   * nothing back, and the author would have had no way of knowing that from a
   * switch reading "on". A receipt for having answered belongs to the
   * respondent rather than to the plan, so the send survives and the *copy* is
   * what gets reset — a free plan sends the standard words.
   */
  const autoReply = s.onComplete?.autoReplyEmail;
  if (autoReply?.enabled && !can(ent, "auto_reply_email")) {
    const customised =
      autoReply.subject !== DEFAULT_CONFIRMATION_SUBJECT || autoReply.bodyMd !== DEFAULT_CONFIRMATION_BODY;
    if (customised) {
      autoReply.subject = DEFAULT_CONFIRMATION_SUBJECT;
      autoReply.bodyMd = DEFAULT_CONFIRMATION_BODY;
      note(stripped, "settings.onComplete.autoReplyEmail", "auto_reply_email");
    }
  }
  if (s.followUp?.enabled && !can(ent, "followup_email")) {
    s.followUp.enabled = false;
    note(stripped, "settings.followUp", "followup_email");
  }

  // ── collect ─────────────────────────────────────────────────────────────────
  if (s.allowResubmissions === false && !can(ent, "duplicate_prevention")) {
    s.allowResubmissions = true;
    note(stripped, "settings.allowResubmissions", "duplicate_prevention");
  }
  if (s.requireAuth?.enabled) {
    // Respondent verification is per-method: Google and phone are separate features, and
    // a plan may in principle grant one without the other. The gate names one method, so
    // there is no falling back to the other — a respondent must never meet a sign-in step
    // the plan cannot actually complete, and switching them to a method the author did not
    // choose would change who the form collects.
    const feature: FeatureKey =
      s.requireAuth.method === "phone" ? "respondent_auth_phone" : "respondent_auth_google";
    if (!can(ent, feature)) {
      s.requireAuth.enabled = false;
      note(stripped, "settings.requireAuth.enabled", feature);
    }
  }
  // Verified answers, question by question. Reported once however many questions ask for
  // it: a publish notice listing the same upsell six times is a worse notice.
  if (!can(ent, "verified_answers")) {
    let anyVerified = false;
    for (const b of doc.blocks) {
      if ((b.type === "email" || b.type === "phone") && b.verify) {
        b.verify = false;
        anyVerified = true;
      }
    }
    if (anyVerified) note(stripped, "blocks[].verify", "verified_answers");
  }
  if (s.language && s.language !== "en" && doc.settings.agent?.language && doc.settings.agent.language !== s.language) {
    // A form whose agent speaks a different language than the form chrome is the
    // multi-language feature in all but name.
    if (!can(ent, "multi_language")) {
      doc.settings.agent.language = s.language;
      note(stripped, "settings.agent.language", "multi_language");
    }
  }

  // ── the agent ───────────────────────────────────────────────────────────────
  const agent = s.agent;
  if (agent) {
    /*
     * The two ceilings are ours, so a published version stores neither.
     *
     * Dropped rather than clamped, and silently rather than reported: an author
     * did not choose these and there is nothing to tell them they have lost.
     * `clampForRuntime` puts the plan's numbers back on the way out, which is
     * what makes every already-published form pick up a new limit without being
     * republished. Anything a client or the public API sent ends here.
     */
    agent.sessionTokenBudget = undefined;
    if (agent.guardrails) agent.guardrails.maxTurns = undefined;
    if (!can(ent, "agent_persona")) {
      if (agent.personaPrompt || agent.goal || agent.successCriteria) {
        agent.personaPrompt = undefined;
        agent.goal = undefined;
        agent.successCriteria = undefined;
        note(stripped, "settings.agent.personaPrompt", "agent_persona");
      }
    }
    /*
     * Knowledge is not stripped here any more, because it is no longer in the
     * document. It lives in `knowledge_sources` and is gated where an author
     * can actually see the refusal — at upload, in `routes/knowledge.ts` —
     * rather than silently vanishing at publish, which is what a document
     * field could only ever do.
     */
    if (!can(ent, "agent_guardrails") && agent.guardrails) {
      if (agent.guardrails.forbiddenTopics.length > 0) {
        agent.guardrails.forbiddenTopics = [];
        note(stripped, "settings.agent.guardrails.forbiddenTopics", "agent_guardrails");
      }
    }
    if (agent.model && !can(ent, "agent_model_picker")) {
      // Falls back to the plan's default tier rather than to nothing.
      agent.model = undefined;
      note(stripped, "settings.agent.model", "agent_model_picker");
    }
  }

  return { doc, stripped };
}

/**
 * Hard document limits, checked at publish rather than silently truncated.
 *
 * Trimming someone's questions without asking would be data loss; refusing the publish
 * with a number they can act on is not.
 */
export interface DocLimitProblem {
  limitKey: "blocks_per_form";
  label: string;
  used: number;
  limit: number;
}

export function checkDocLimits(doc: FormDoc, ent: Entitlements): DocLimitProblem[] {
  const problems: DocLimitProblem[] = [];
  const blockLimit = limitOf(ent, "blocks_per_form");
  if (blockLimit != null && doc.blocks.length > blockLimit) {
    problems.push({ limitKey: "blocks_per_form", label: "Questions per form", used: doc.blocks.length, limit: blockLimit });
  }
  return problems;
}

/**
 * Verified payment questions, checked against the plan and the organization's connected
 * accounts before a version that asks for money is published.
 *
 * Refused rather than stripped, which is where these part ways with verified answers above.
 * A `verify` question with the check taken off still collects the email; a payment question
 * with its gateway taken off has nothing left to be — there is no manual method to fall back
 * to without a link or a UPI ID the author never gave, and quietly publishing a Pay button
 * that cannot take payment is the dead end lint exists to prevent. So the plan gate is a 402
 * with the upsell, and everything else is a 422 that names the question.
 *
 * What lint cannot see, because it lives in D1: whether the account still exists and belongs
 * to this organization (`loadAccountForOrg` answers "not found" for another org's id, so the
 * two read the same), whether it is still connected, and whether it can charge the block's
 * currency. Cashfree and Razorpay accounts are connected through partner OAuth, and
 * collecting in anything but rupees on a linked merchant is not confirmed for either, so
 * both are INR-only until it is. Stripe is not currency-checked: an account presents in any
 * of 135+ currencies whatever its default is.
 *
 * `clampForRuntime` deliberately has no counterpart. A form published while entitled and
 * then downgraded keeps its payment question, and the session refuses at the Pay button
 * with `plan_required` — the same stance, reached at the only moment it can be.
 */
export interface GatewayPublishIssue {
  level: "error";
  code:
    | "payment_gateway_disabled"
    | "payment_account_missing"
    | "payment_account_inactive"
    | "payment_currency_unsupported"
    | "payment_amount_unsupported";
  message: string;
  refs: string[];
}

export type GatewayPublishProblem =
  | { status: 402; body: GateErrorBody }
  | {
      status: 422;
      body: { error: { code: "payment_setup_invalid"; message: string; issues: GatewayPublishIssue[] } };
    };

const INR_ONLY_PROVIDERS = new Set(["cashfree", "razorpay"]);

export async function checkGatewayPayments(
  env: Bindings,
  orgId: string,
  doc: FormDoc,
  ent: Entitlements,
): Promise<GatewayPublishProblem | null> {
  const blocks = doc.blocks.flatMap((b) => (b.type === "payment" && b.method === "gateway" ? [b] : []));
  if (blocks.length === 0) return null;

  if (!can(ent, "collect_payments")) {
    return {
      status: 402,
      body: featureLocked("collect_payments", ent.planId, {
        surface: "publish",
        count: blocks.length,
        noun: blocks.length === 1 ? "verified payment question" : "verified payment questions",
      }),
    };
  }

  const issues: GatewayPublishIssue[] = [];
  if (!gatewayEnabled(env)) {
    issues.push({
      level: "error",
      code: "payment_gateway_disabled",
      message: "Verified payments aren't switched on for this organization yet. Use a payment link or UPI QR instead.",
      refs: blocks.map((b) => b.ref),
    });
  } else {
    // Lint has already refused a gateway block with no account, so every id here is set.
    const accounts = new Map<string, Awaited<ReturnType<typeof loadAccountForOrg>>>();
    for (const b of blocks) {
      const id = b.paymentAccountId ?? "";
      if (!accounts.has(id)) accounts.set(id, id ? await loadAccountForOrg(env, orgId, id) : null);
      const account = accounts.get(id) ?? null;
      const named = b.title || b.ref;
      if (!account || account.status === "disconnected") {
        issues.push({
          level: "error",
          code: "payment_account_missing",
          message: `"${named}" takes payments on an account that isn't connected to this organization. Pick another account.`,
          refs: [b.ref],
        });
        continue;
      }
      const provider = PAYMENT_PROVIDER_LABELS[account.provider];
      if (account.status !== "active") {
        issues.push({
          level: "error",
          code: "payment_account_inactive",
          message: `"${named}" takes payments on a ${provider} account that needs reconnecting. Reconnect it in Integrate.`,
          refs: [b.ref],
        });
        continue;
      }
      if (INR_ONLY_PROVIDERS.has(account.provider) && b.currency.toUpperCase() !== "INR") {
        issues.push({
          level: "error",
          code: "payment_currency_unsupported",
          message: `"${named}" charges in ${b.currency.toUpperCase()}, but ${provider} accounts connected to Chatform take rupees only. Switch the currency to INR.`,
          refs: [b.ref],
        });
        continue;
      }
      /*
       * A fixed price Stripe cannot charge in its own units — a fraction of an ariary, a
       * thousandth of a dinar. Said here rather than at the Pay button, where the respondent
       * would be the one to find out. A variable amount can only be checked when it resolves.
       */
      if (
        account.provider === "stripe" &&
        b.amountMode === "fixed" &&
        typeof b.amount === "number" &&
        b.amount > 0 &&
        toStripeAmount(toMinorUnits(b.amount, b.currency), b.currency) === null
      ) {
        issues.push({
          level: "error",
          code: "payment_amount_unsupported",
          message: `"${named}" charges ${b.amount} ${b.currency.toUpperCase()}, which Stripe can't charge in that currency's smallest unit. Round the amount.`,
          refs: [b.ref],
        });
      }
    }
  }
  if (issues.length === 0) return null;
  return {
    status: 422,
    body: {
      error: { code: "payment_setup_invalid", message: issues.map((i) => i.message).join("; "), issues },
    },
  };
}

/**
 * Reconcile a *published* document with the plan in force right now.
 *
 * Runs on read rather than at publish, and that is the whole point: a version published
 * while entitled keeps whatever it was published with, so a lapse would otherwise leave a
 * form asking respondents to verify with a method the plan no longer includes — asking,
 * and then failing. Deriving it on read means a downgrade takes effect without anyone
 * republishing, and an upgrade restores the authored behaviour without re-authoring.
 *
 * Mutates a clone; the stored version row is never rewritten.
 */
export function clampForRuntime(input: FormDoc, ent: Entitlements): FormDoc {
  const doc = structuredClone(input) as FormDoc;

  // Respondent verification, re-derived per method. A respondent must never meet a
  // sign-in step the plan cannot complete, so losing every method turns the gate off
  // rather than leaving it up.
  const gate = doc.settings.requireAuth;
  if (gate?.enabled) {
    const granted = gate.method === "phone" ? can(ent, "respondent_auth_phone") : can(ent, "respondent_auth_google");
    if (!granted) gate.enabled = false;
  }
  /*
   * Answer verification, re-derived per read for the same reason the gate is: a form
   * published on Business and then downgraded must stop texting codes rather than start
   * failing at the send. The answer is simply recorded as given from then on.
   */
  if (!can(ent, "verified_answers")) {
    for (const b of doc.blocks) {
      if ((b.type === "email" || b.type === "phone") && b.verify) b.verify = false;
    }
  }

  const agent = doc.settings.agent;
  if (!agent) return doc;
  /**
   * Both agent ceilings are the plan's numbers, not the author's.
   *
   * They used to be `min(authored, plan)`, which turned two numbers nobody
   * understands into cliffs a respondent walks off. A live registration form
   * carried an authored budget of 12,000 from the day it was made; the
   * interviewer spends ~2,600 a turn, so on the fifth answer `aiEnabled` went
   * quiet mid-conversation and the form stopped talking back. The author had
   * no way to know that was the number that mattered, and no reason to care.
   * `maxTurns` is the same trap in a quieter form: it stops nothing on its own
   * — the hard cap is a fixed `turnCount` guard in the session object — but it
   * is what tells the interviewer a conversation is running long, so a stale 60
   * had it hurrying respondents who had barely started.
   *
   * So the runtime decides both, from the plan, on read. That is also what
   * repairs every form already published under an old low default, without
   * anyone republishing: `clampForRuntime` runs on the way out, not at publish.
   *
   * Neither is offered in the builder any more, so the stored values are
   * whatever a form happened to be created with — history, not intent. Reading
   * the plan instead is the only way they mean the same thing on every form.
   */
  const turns = limitOf(ent, "agent_max_turns");
  if (agent.guardrails && turns != null) agent.guardrails.maxTurns = turns;
  const budget = limitOf(ent, "agent_token_budget");
  if (budget != null) agent.sessionTokenBudget = budget;
  if (agent.model && !can(ent, "agent_model_picker")) agent.model = undefined;
  return doc;
}

/**
 * The one place the watermark decision is made.
 *
 * Read by `/p/forms/:slug/config`, not by the client. Before this, `hidePoweredBy` was
 * honoured straight out of the document with no plan check, so any free user could remove
 * the footer — Youform's single most-purchased Pro feature, given away.
 *
 * A published version authored while entitled keeps its stripped state in the row, but
 * this re-derives it anyway: a lapsed subscription must put the footer back without
 * anyone republishing.
 */
export function brandingHiddenFor(doc: FormDoc, ent: Entitlements): boolean {
  return doc.settings.branding?.hidePoweredBy === true && can(ent, "remove_branding");
}
