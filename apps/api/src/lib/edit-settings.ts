import { z } from "zod";
import {
  applySettingOps,
  renderSettingsForPrompt,
  settingDef,
  settingKeysFor,
  SETTING_SECTIONS,
  type FormDoc,
  type KnowledgeAdd,
  type ParseContext,
  type SettingChange,
  type SettingSection,
} from "@repo/form-schema";
import { can, FEATURES, limitOf, minPlanFor, PLANS, type Entitlements, type FeatureKey } from "@repo/entitlements";
import type { RequestRoute } from "./settings-route.js";

/**
 * The builder AI's reach beyond the questions: form settings, the knowledge
 * base, and knowing where everything is.
 *
 * The edit model sees the settings a request needs (Jev picked the sections,
 * see `settings-route.ts`) and answers with keys and values as text. Everything
 * after that is code: the key is one of an enum built for this request, the
 * value is parsed by the registry, and the plan is checked twice, once by
 * leaving locked settings out of the enum and once more on the value.
 */

/**
 * Every place in the builder, in the builder's own words.
 *
 * Sent with every edit because it is small and because "where do I upload a
 * logo?" is answered from it. The AI can change none of the things only listed
 * here, so it can point to them rather than pretend.
 */
export const BUILDER_MAP = `Where things are in the builder (tabs along the top):
- Build: Questions (the list) and Flow (branching). Its Design button opens colours, fonts, corners, background pattern, and the logo upload (Brand).
- Agent: Persona (interview style, tone, persona), Goal, Knowledge (upload files, add links or text the interviewer answers from), Guardrails.
- Results: responses, analytics and exports.
- Share: the link, QR code, social sharing, a PDF of the questions.
- Integrate: embed on a website, webhooks, a live spreadsheet feed, payment accounts.
- Settings: Form name, Display, Access & closing (sign-in, password, captcha, closing date, response limit), Hidden fields & variables, Link & social (preview title, description, image, favicon), On completion (notification and confirmation emails, redirect), Follow-ups (reminder emails).
- Top right: Publish sends changes live; the ... menu has Version history.
Only the author can upload files (a logo, an image, a document), set a password, connect webhooks, spreadsheets or payment accounts, or publish.`;

/**
 * What the fields beyond the questions are for, said once for every edit.
 *
 * General on purpose: which setting a request means is the model's call, made
 * against the labels and current values it is shown, not against examples.
 */
const BEYOND_QUESTIONS = `Besides the questions, an edit can carry:
- "settings": form settings to change, each { "key", "value" } with a key from the settings listed below and the value as text. Only what the author asked for. [] when they asked for nothing about settings.
- "knowledge": information for the interviewer to answer respondents from, each { "kind": "text", "title", "body" } in the author's own words, or { "kind": "link", "url" } for a page they name that is not already linked in the request (linked pages are added on their own). [] otherwise.
- "answer": a short reply when the author asked how, where or whether something can be done. "" otherwise.
A request can be entirely about settings and need no change to the questions at all: when it describes something a setting below already holds, set that setting rather than building questions around it.
The builder shows the author every change with its old and new value before anything is applied, so change exactly what was asked and nothing else. When something they asked for cannot be done here, say so in the summary.`;

/** The draft fields this adds to an edit, with the setting keys this request may name. */
export function settingsDraftFields(keys: readonly string[]) {
  // No `.max()` on any list: the provider counts `maxItems` against a schema
  // budget and refuses the whole request past it (see `GenerationDraft`).
  // `clampDraft` trims these on the way back instead, via `DRAFT_LIMITS`.
  return {
    ...(keys.length > 0
      ? {
          settings: z
            .array(
              z.object({
                key: z.enum(keys as [string, ...string[]]),
                value: z.string().describe("The new value as text, in the format the setting's line gives. Empty clears it."),
              }),
            )
            .optional()
            .describe("Form settings to change. Only when asked; never to restate what is already true."),
        }
      : {}),
    knowledge: z
      .array(
        z.object({
          kind: z.enum(["link", "text"]),
          url: z.string().optional().describe("For a link: the page to read."),
          title: z.string().optional().describe("For text: a short name for it."),
          body: z.string().optional().describe("For text: the information itself, in the author's words."),
        }),
      )
      .optional()
      .describe("Pages or text to add to the knowledge base the interviewer answers from. Only when asked."),
    answer: z
      .string()
      .optional()
      .describe("A plain answer when the author asked how or where to do something, using the map of the builder."),
  };
}

export interface SettingsDraft {
  settings?: { key: string; value: string }[];
  knowledge?: { kind: "link" | "text"; url?: string; title?: string; body?: string }[];
  answer?: string;
}

/** What the plan allows, as the registry's `allowed` predicate. */
export const allowedBy = (ent: Entitlements) => (feature: string) => can(ent, feature as FeatureKey);

function planNeeded(feature: string): string {
  return PLANS[minPlanFor(feature as FeatureKey)].name;
}

/**
 * The prompt section for a request: the builder map always, the settings of
 * the sections Jev picked, and what this plan cannot do.
 */
export function settingsPrompt(doc: FormDoc, route: RequestRoute, ent: Entitlements): { text: string; keys: string[] } {
  const allowed = allowedBy(ent);
  /*
   * Every key in the picked sections, locked ones included. A locked change
   * the author asked for comes back, is refused by `applySettingOps`, and
   * shows on the card with its plan and an upgrade button: a better answer
   * than a sentence the author has to act on themselves.
   */
  const keys = settingKeysFor(route.sections, () => true);
  const parts = [BUILDER_MAP, BEYOND_QUESTIONS, `Today is ${new Date().toISOString().slice(0, 10)}.`];
  if (route.asksHowTo) {
    parts.push(
      "The author may be asking how or where to do something. Answer that in \"answer\", in a sentence or two, naming the place as the map gives it. " +
        "If they also asked for a change you can make, make it too; if it is something only they can do, say where.",
    );
  }
  if (route.sections.length > 0) {
    parts.push(
      "Form settings you can change, with their current values. Change one only when the author asks for it, " +
        "by its key, with the value as text. A setting or value marked LOCKED or [needs <plan>] is not on this plan: " +
        "when the author asks for it, still include it, since the builder shows it to them locked with the way to upgrade, " +
        "and say in the summary that it needs that plan rather than that you changed it.\n" +
        renderSettingsForPrompt(doc, route.sections, allowed, planNeeded),
    );
  }
  const unpicked = (Object.keys(SETTING_SECTIONS) as SettingSection[]).filter((s) => !route.sections.includes(s));
  if (unpicked.length > 0) {
    parts.push(`Other settings exist (${unpicked.map((s) => SETTING_SECTIONS[s].split(":")[0]).join("; ")}); they are not shown for this request.`);
  }
  const lockedBlocks = [
    !can(ent, "verified_answers") && `verifying an email or phone answer (verify=true) needs ${planNeeded("verified_answers")}`,
    !can(ent, "collect_payments") && `verified card payments (method=gateway) need ${planNeeded("collect_payments")}; payment links and UPI are free`,
  ].filter(Boolean);
  if (lockedBlocks.length > 0) parts.push(`On this plan, ${lockedBlocks.join("; ")}. Do not set them; tell the author instead.`);
  if (route.wantsKnowledge && !can(ent, "agent_knowledge")) {
    parts.push(`The knowledge base needs ${planNeeded("agent_knowledge")}.`);
  }
  return { text: parts.join("\n\n"), keys };
}

export interface CheckedSettings {
  /** The document with the allowed changes on it. */
  doc: FormDoc;
  /** Every change, locked ones included (and not applied), for the card. */
  settings: SettingChange[];
  knowledge: KnowledgeAdd[];
  /** Values that did not parse, for the retry prompt. */
  rejected: string[];
}

/**
 * The draft's settings and knowledge, checked and applied to `doc`.
 *
 * `usedSources` is the form's current source count, for the plan's limit; the
 * route reads it only when the draft names something to add.
 */
export function checkSettingsDraft(
  doc: FormDoc,
  draft: SettingsDraft,
  ent: Entitlements,
  opts: {
    parse?: ParseContext;
    usedSources?: number;
    /** Pages the request linked, which the link reader is already adding on its own. */
    alreadyAdding?: readonly string[];
  } = {},
): CheckedSettings {
  const applied = applySettingOps(doc, draft.settings ?? [], { allowed: allowedBy(ent), parse: opts.parse });
  const knowledge: KnowledgeAdd[] = [];
  const rejected = [...applied.rejected];
  const max = limitOf(ent, "knowledge_sources_count");
  let used = opts.usedSources ?? 0;
  for (const k of draft.knowledge ?? []) {
    const locked = !can(ent, "agent_knowledge") || (max !== null && used >= max) ? ({ limit: "knowledge_sources_count" } as const) : undefined;
    if (k.kind === "link") {
      const url = normaliseUrl(k.url ?? "");
      if (!url) {
        rejected.push(`knowledge: "${k.url ?? ""}" is not a link`);
        continue;
      }
      if (opts.alreadyAdding?.some((u) => sameUrl(u, url))) continue;
      knowledge.push({ kind: "link", url, ...(locked ? { locked } : {}) });
    } else {
      const title = (k.title ?? "").trim().slice(0, 200);
      const body = (k.body ?? "").trim().slice(0, 500_000);
      if (!title || !body) {
        rejected.push("knowledge: text needs a title and a body");
        continue;
      }
      knowledge.push({ kind: "text", title, body, ...(locked ? { locked } : {}) });
    }
    if (!locked) used++;
  }
  return { doc: applied.doc, settings: applied.changes, knowledge, rejected };
}

const sameUrl = (a: string, b: string) => normaliseUrl(a)?.replace(/\/$/, "") === normaliseUrl(b)?.replace(/\/$/, "");

function normaliseUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Paid question options an edit switched on, taken back off and reported.
 *
 * Question types are not gated, two options on them are: verifying an email or
 * phone answer, and taking payment through a gateway. The prompt says so; this
 * is what holds when the model sets one anyway. Only options this edit turned
 * on: one the author already had is theirs, and publish deals with it.
 */
export function lockPaidBlockOptions(base: FormDoc, proposed: FormDoc, ent: Entitlements): { doc: FormDoc; locked: SettingChange[] } {
  const doc = structuredClone(proposed);
  const locked: SettingChange[] = [];
  const before = new Map(base.blocks.map((b) => [b.ref, b]));
  const row = (feature: FeatureKey, label: string, key: string): SettingChange => ({
    key,
    section: "form",
    label,
    where: "the question's settings",
    format: "bool",
    before: false,
    after: true,
    locked: { feature },
  });
  for (const b of doc.blocks) {
    const was = before.get(b.ref);
    if ((b.type === "email" || b.type === "phone") && b.verify && !(was && "verify" in was && was.verify) && !can(ent, "verified_answers")) {
      b.verify = false;
      locked.push(row("verified_answers", `${FEATURES.verified_answers.label}: "${b.title}"`, `blocks.${b.ref}.verify`));
    }
    if (b.type === "payment" && b.method === "gateway" && !(was?.type === "payment" && was.method === "gateway") && !can(ent, "collect_payments")) {
      b.method = was?.type === "payment" ? was.method : "link";
      locked.push(row("collect_payments", `${FEATURES.collect_payments.label}: "${b.title}"`, `blocks.${b.ref}.method`));
    }
  }
  return { doc, locked };
}
