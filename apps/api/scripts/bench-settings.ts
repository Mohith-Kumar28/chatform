/**
 * The builder chat's settings path, end to end on real models: Jev picks the
 * sections, the edit model answers, code checks the answer.
 *
 * Each case names the settings it must change and whether it may add
 * questions. Printed per case per run, then pass^k: the share of cases right on
 * EVERY run, because a settings change that lands two times in three is one
 * the author cannot trust.
 *
 *   pnpm --filter @repo/api bench:settings [--runs 3] [--only <substring>]
 *
 * Needs OPENROUTER_API_KEY. Costs real money: one Jev call and one or two
 * Gemini calls per case per run.
 */
import { readFileSync } from "node:fs";
import { resolve } from "@repo/entitlements";
import { FormDoc, leadFormFixture } from "@repo/form-schema";
import { EditDraft, clampDraft, generateEdit, runEditAgent } from "../src/lib/ai.js";
import { buildEditPrompt, EDIT_TOOL_PROTOCOL, FORM_DESIGNER_SYSTEM } from "../src/lib/agent-prompts.js";
import { applyEditDraft, introducedFlowProblems } from "../src/lib/edit-apply.js";
import { buildEditContext, buildEditTools } from "../src/lib/edit-tools.js";
import { allowedBy, checkSettingsDraft, planNeeded, settingsDraftFields, settingsPrompt, type SettingsDraft } from "../src/lib/edit-settings.js";
import { routeRequest } from "../src/lib/settings-route.js";
import type { Bindings } from "../src/env.js";
import type { z } from "zod";

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

const RUNS = Number(arg("runs", "3"));
const ONLY = arg("only", "");
const MODE = arg("mode", "object") as "object" | "tools";
const env = { OPENROUTER_API_KEY: apiKey(), ENVIRONMENT: "script" } as Bindings;
const pro = resolve({ planId: "pro", status: "active", now: Date.now() });

interface Case {
  prompt: string;
  /** Every one of these keys must change. */
  settings: string[];
  /** Whether adding questions is part of a right answer. */
  addsQuestions: boolean;
}

const CASES: Case[] = [
  { prompt: "the goal is to find people who can attend all three days", settings: ["settings.agent.goal"], addsQuestions: false },
  { prompt: "our goal with this form is to qualify leads for a sales call", settings: ["settings.agent.goal"], addsQuestions: false },
  { prompt: "use Lora for the headings and make it more professional", settings: ["theme.fontHeading", "settings.agent.tone"], addsQuestions: false },
  { prompt: "sound more professional", settings: ["settings.agent.tone"], addsQuestions: false },
  { prompt: "a good response tells us their budget and timeline", settings: ["settings.agent.successCriteria"], addsQuestions: false },
  { prompt: "make it playful and add a question about their t-shirt size", settings: ["settings.agent.tone"], addsQuestions: true },
  { prompt: "make it navy blue with square corners", settings: ["theme.accent", "theme.radius"], addsQuestions: false },
  { prompt: "close it after 200 responses", settings: ["settings.closeRules.maxSubmissions"], addsQuestions: false },
  { prompt: "add a phone number question", settings: [], addsQuestions: true },
  { prompt: "never talk about pricing", settings: ["settings.agent.guardrails.forbiddenTopics"], addsQuestions: false },
];

const base = FormDoc.parse(structuredClone(leadFormFixture));
let passAll = 0;
let cost = 0;

for (const c of CASES.filter((x) => x.prompt.includes(ONLY))) {
  let passes = 0;
  const lines: string[] = [];
  for (let run = 0; run < RUNS; run++) {
    const started = Date.now();
    const route = await routeRequest(env, { request: c.prompt }, { source: "script" }, { timeoutMs: 8000 });
    const part = settingsPrompt(base, route, pro, MODE);
    let draft: EditDraft & SettingsDraft;
    if (MODE === "tools") {
      const ctx = buildEditContext(base, (d) => ({ introduced: introducedFlowProblems(base, applyEditDraft(base, d).doc) }));
      const r = await runEditAgent({
        env,
        system: `${FORM_DESIGNER_SYSTEM}\n\n${EDIT_TOOL_PROTOCOL}`,
        prompt: buildEditPrompt(base, c.prompt, [], "tools", part.text),
        tools: buildEditTools(ctx, () => {}, { keys: part.keys, allowed: allowedBy(pro), planFor: planNeeded, parse: { now: Date.now() } }),
      });
      draft = clampDraft(ctx.best?.draft ?? ctx.draft);
      cost += r.usage.costUsd ?? 0;
    } else {
      const schema = EditDraft.extend(settingsDraftFields(part.keys)) as unknown as z.ZodType<EditDraft & SettingsDraft>;
      const r = await generateEdit({
        env,
        system: FORM_DESIGNER_SYSTEM,
        prompt: buildEditPrompt(base, c.prompt, [], "object", part.text),
        schema,
      });
      draft = r.draft;
      cost += r.usage.costUsd ?? 0;
    }
    cost += route.call?.usage.costUsd ?? 0;
    const applied = applyEditDraft(base, draft);
    const checked = checkSettingsDraft(applied.doc, draft, pro, { parse: { now: Date.now() } });
    const changed = new Set(checked.settings.filter((s) => !s.locked).map((s) => s.key));
    const missing = c.settings.filter((k) => !changed.has(k));
    const addedWrongly = !c.addsQuestions && applied.added.length > 0;
    const missedQuestion = c.addsQuestions && applied.added.length === 0;
    const ok = missing.length === 0 && !addedWrongly && !missedQuestion;
    if (ok) passes++;
    lines.push(
      `  ${ok ? "ok  " : "FAIL"} ${Date.now() - started}ms sections=[${route.sections}] changed=[${[...changed]}] added=${applied.added.length}` +
        (missing.length ? ` missing=[${missing}]` : "") +
        (checked.rejected.length ? ` rejected=${JSON.stringify(checked.rejected)}` : ""),
    );
  }
  if (passes === RUNS) passAll++;
  console.log(`${passes}/${RUNS}  "${c.prompt}"`);
  for (const l of lines) console.log(l);
}
const n = CASES.filter((x) => x.prompt.includes(ONLY)).length;
console.log(`\n${MODE} mode  pass^${RUNS}: ${passAll}/${n}   cost $${cost.toFixed(4)}`);
