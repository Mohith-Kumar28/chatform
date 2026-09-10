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
  type FormDoc,
} from "@repo/form-schema";
import {
  can,
  limitOf,
  FEATURES,
  minPlanFor,
  type Entitlements,
  type FeatureKey,
} from "@repo/entitlements";

export interface StrippedSetting {
  /** Dotted path into the document, e.g. `settings.branding.hidePoweredBy`. */
  path: string;
  feature: FeatureKey;
  /** What the user called it, for the notice the builder renders. */
  label: string;
  requiredPlan: "pro" | "business";
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
  if (s.onComplete?.redirectUrl && !can(ent, "completion_redirect")) {
    s.onComplete.redirectUrl = undefined;
    note(stripped, "settings.onComplete.redirectUrl", "completion_redirect");
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
