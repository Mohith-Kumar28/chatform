/**
 * A new form's settings, on real models: the drafting prompt with every
 * settings section, the same schema the route sends, and the same check.
 *
 * Each case names the settings it must set. Anything else it sets is an
 * UNASKED setting, which is the failure this exists to catch: a new form
 * should keep its defaults unless the prompt asked otherwise.
 *
 *   pnpm --filter @repo/api bench:create-settings [--runs 2] [--only <substring>]
 */
import { readFileSync } from "node:fs";
import type { z } from "zod";
import { resolve } from "@repo/entitlements";
import { FormDoc } from "@repo/form-schema";
import { GenerationDraft, generateFormDraft } from "../src/lib/ai.js";
import { buildFlowGeneratorPrompt, FORM_DESIGNER_SYSTEM } from "../src/lib/agent-prompts.js";
import { draftToDoc } from "../src/lib/draft-normalize.js";
import { checkSettingsDraft, createSettingsField, createSettingsPrompt, type SettingsDraft } from "../src/lib/edit-settings.js";
import type { Bindings } from "../src/env.js";

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of file.split("\n")) {
    if (line.startsWith("OPENROUTER_API_KEY=")) return line.slice("OPENROUTER_API_KEY=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("OPENROUTER_API_KEY is not set, and apps/api/.dev.vars does not carry one.");
}

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1]! : fallback;
};
const RUNS = Number(arg("runs", "2"));
const ONLY = arg("only", "");
const env = { OPENROUTER_API_KEY: apiKey(), ENVIRONMENT: "script" } as Bindings;
const free = resolve({ planId: "free", status: "none", now: Date.now() });

/**
 * `settings` must be set; `allowed` may be, because the form itself implies it
 * (a law firm's tone, the colours around a brand colour) and a model inferring
 * it is doing its job rather than inventing work.
 */
const CASES: { prompt: string; settings: string[]; allowed?: string[] }[] = [
  { prompt: "a signup form for a pottery workshop", settings: [] },
  { prompt: "a feedback form for my cafe", settings: [] },
  { prompt: "a job application form for a law firm", settings: [], allowed: ["settings.agent.tone"] },
  { prompt: "customer onboarding form for a SaaS product", settings: [] },
  { prompt: "a playful signup form for a pottery workshop in forest green that closes on november 20", settings: ["settings.agent.tone", "theme.accent", "settings.closeRules.closeAt"], allowed: ["theme.background", "theme.text", "theme.botBubble", "theme.userBubble", "theme.accentText"] },
  { prompt: "a professional job application form for a law firm, only one response per person", settings: ["settings.agent.tone", "settings.allowResubmissions"] },
  { prompt: "an event RSVP that stops after 50 people and emails me at ana@acme.com for each one", settings: ["settings.closeRules.maxSubmissions", "settings.onComplete.notificationEmails"] },
];

const { text, keys } = createSettingsPrompt(free);
const schema = GenerationDraft.extend(createSettingsField(keys)) as unknown as z.ZodType<GenerationDraft>;
let clean = 0;
let cost = 0;

for (const c of CASES.filter((x) => x.prompt.includes(ONLY))) {
  let ok = 0;
  const lines: string[] = [];
  for (let run = 0; run < RUNS; run++) {
    const started = Date.now();
    const r = await generateFormDraft({ env, system: FORM_DESIGNER_SYSTEM, prompt: buildFlowGeneratorPrompt(c.prompt, undefined, text), schema });
    cost += r.usage.costUsd ?? 0;
    const doc: FormDoc = draftToDoc(r.draft).doc;
    const asked = (r.draft as GenerationDraft & SettingsDraft).settings ?? [];
    const checked = checkSettingsDraft(doc, { settings: asked }, free, { parse: { now: Date.now() } });
    const set = checked.settings.map((s) => s.key);
    const missing = c.settings.filter((k) => !set.includes(k));
    const unasked = set.filter((k) => !c.settings.includes(k) && !c.allowed?.includes(k));
    const pass = missing.length === 0 && unasked.length === 0;
    if (pass) ok++;
    lines.push(
      `  ${pass ? "ok  " : "FAIL"} ${Date.now() - started}ms set=[${checked.settings.map((s) => `${s.key}=${JSON.stringify(s.after)}${s.locked ? "(locked)" : ""}`).join(", ")}]` +
        (missing.length ? ` missing=[${missing}]` : "") +
        (unasked.length ? ` UNASKED=[${unasked}]` : ""),
    );
  }
  if (ok === RUNS) clean++;
  console.log(`${ok}/${RUNS}  "${c.prompt}"`);
  for (const l of lines) console.log(l);
}
console.log(`\npass^${RUNS}: ${clean}/${CASES.filter((x) => x.prompt.includes(ONLY)).length}   cost $${cost.toFixed(4)}`);
