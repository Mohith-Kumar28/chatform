/**
 * Reconciling a form document with what the organization's plan allows.
 *
 * Two operations, deliberately at different points in the lifecycle:
 *
 *   `stripForPublish` — runs at publish. Gated settings are removed from the version
 *                       being published, and every removal is reported by path so the
 *                       builder can say exactly what was dropped and what it costs.
 *   `clampForRuntime` — runs when a published doc is read. Plan-capped values replace
 *                       larger authored ones, so a form built on Pro keeps working after
 *                       a downgrade instead of refusing to load.
 *
 * Authoring is never gated. `PUT /forms/:id/doc` accepts anything valid, so a free user
 * uploads their logo, picks their font, and sees their form wearing both in the builder
 * preview. That is deliberate on two counts: it is honest — nothing silently disappears —
 * and it is the highest-intent moment in the product, because they have just built the
 * thing and can see it.
 */

import type { FormDoc } from "@repo/form-schema";
import {
  can,
  limitOf,
  clampToLimit,
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
    if (m && (m.ogTitle || m.ogDescription || m.ogImageKey || m.noIndex)) {
      m.ogTitle = undefined;
      m.ogDescription = undefined;
      m.ogImageKey = null;
      m.noIndex = false;
      note(stripped, "settings.meta", "form_metadata");
    }
  }
  if (s.onComplete?.redirectUrl && !can(ent, "completion_redirect")) {
    s.onComplete.redirectUrl = undefined;
    note(stripped, "settings.onComplete.redirectUrl", "completion_redirect");
  }
  if (s.onComplete?.autoReplyEmail?.enabled && !can(ent, "auto_reply_email")) {
    s.onComplete.autoReplyEmail.enabled = false;
    note(stripped, "settings.onComplete.autoReplyEmail", "auto_reply_email");
  }

  // ── collect ─────────────────────────────────────────────────────────────────
  if (s.duplicates?.strategy && s.duplicates.strategy !== "none" && !can(ent, "duplicate_prevention")) {
    s.duplicates.strategy = "none";
    s.duplicates.fieldRef = undefined;
    note(stripped, "settings.duplicates.strategy", "duplicate_prevention");
  }
  if (s.requireAuth?.enabled) {
    // Respondent verification is per-method: Google and phone are separate features, and
    // a plan may in principle grant one without the other.
    const allowed = s.requireAuth.methods.filter((m) =>
      m === "phone" ? can(ent, "respondent_auth_phone") : can(ent, "respondent_auth_google"),
    );
    if (allowed.length === 0) {
      // Turn the gate off rather than leaving it on with no usable method — a respondent
      // must never meet a sign-in step the plan cannot actually complete.
      s.requireAuth.enabled = false;
      note(
        stripped,
        "settings.requireAuth.enabled",
        s.requireAuth.methods.includes("phone") ? "respondent_auth_phone" : "respondent_auth_google",
      );
    } else if (allowed.length !== s.requireAuth.methods.length) {
      s.requireAuth.methods = allowed as typeof s.requireAuth.methods;
      note(stripped, "settings.requireAuth.methods", "respondent_auth_phone");
    }
    if (s.requireAuth.onePerIdentity && !can(ent, "one_response_per_identity")) {
      s.requireAuth.onePerIdentity = false;
      note(stripped, "settings.requireAuth.onePerIdentity", "one_response_per_identity");
    }
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
    if (!can(ent, "agent_persona")) {
      if (agent.personaPrompt || agent.goal || agent.successCriteria) {
        agent.personaPrompt = undefined;
        agent.goal = undefined;
        agent.successCriteria = undefined;
        note(stripped, "settings.agent.personaPrompt", "agent_persona");
      }
    }
    if (agent.knowledge.length > 0 && !can(ent, "agent_knowledge")) {
      agent.knowledge = [];
      note(stripped, "settings.agent.knowledge", "agent_knowledge");
    } else if (agent.knowledge.length > 0) {
      // Entitled, but capped. Truncation is reported the same way a removal is.
      const maxEntries = limitOf(ent, "knowledge_entries");
      if (maxEntries != null && agent.knowledge.length > maxEntries) {
        agent.knowledge = agent.knowledge.slice(0, maxEntries);
        note(stripped, "settings.agent.knowledge", "agent_knowledge");
      }
      const maxChars = limitOf(ent, "knowledge_chars");
      if (maxChars != null) {
        let budget = maxChars;
        const kept = [];
        for (const entry of agent.knowledge) {
          const size = entry.title.length + entry.body.length;
          if (size > budget) break;
          budget -= size;
          kept.push(entry);
        }
        if (kept.length !== agent.knowledge.length) {
          agent.knowledge = kept;
          note(stripped, "settings.agent.knowledge", "agent_knowledge");
        }
      }
    }
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
    const allowed = gate.methods.filter((m) =>
      m === "phone" ? can(ent, "respondent_auth_phone") : can(ent, "respondent_auth_google"),
    );
    if (allowed.length === 0) gate.enabled = false;
    else gate.methods = allowed as typeof gate.methods;
    if (gate.onePerIdentity && !can(ent, "one_response_per_identity")) gate.onePerIdentity = false;
  }

  const agent = doc.settings.agent;
  if (!agent) return doc;
  if (agent.guardrails) {
    agent.guardrails.maxTurns = clampToLimit(agent.guardrails.maxTurns, limitOf(ent, "agent_max_turns"));
  }
  agent.sessionTokenBudget = clampToLimit(agent.sessionTokenBudget, limitOf(ent, "agent_token_budget"));
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
