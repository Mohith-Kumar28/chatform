/**
 * Both edit paths, same prompts, real models. The ship decision.
 *
 * `AI_EDIT_MODE` is a flag rather than a swap because the tool loop's failure
 * modes are genuinely new — a model that narrates instead of calling, a loop
 * that does not converge, a guard that fires so often it is really a badly
 * worded tool description — and none of them show up in a unit test. The only
 * honest comparison is both paths on the same real requests.
 *
 * What it prints, per case per mode: wall clock, tokens, cost, and for the
 * loop, steps and rejections. Plus `pass^k` rather than `pass@1` — the share
 * of cases that succeeded on EVERY run, not on their best one. An edit path
 * that works four times in five is not one you want behind a button.
 *
 *   pnpm --filter @repo/api bench:edit [--mode tools|object|both] [--runs 3]
 *
 * Needs OPENROUTER_API_KEY, and costs real money: 10 cases × 2 modes × 3 runs
 * is 60 model calls.
 */
import { readFileSync } from "node:fs";
import { FormDoc, lintFormDoc, type FormDoc as FormDocType } from "@repo/form-schema";
import { generateEdit, runEditAgent, reviewEdit, clampDraft, MODELS, type TokenUsage } from "../src/lib/ai.js";
import { costUsdMicro } from "../src/lib/ai-pricing.js";
import { buildEditPrompt, FORM_DESIGNER_SYSTEM, EDIT_TOOL_PROTOCOL } from "../src/lib/agent-prompts.js";
import { applyEditDraft, introducedFlowProblems, describeEditChanges } from "../src/lib/edit-apply.js";
import { buildEditContext, buildEditTools } from "../src/lib/edit-tools.js";
import { EDIT_CASES, type EditCase } from "./fixtures/edit-cases.js";
import type { Bindings } from "../src/env.js";

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of file.split("\n")) {
    if (line.startsWith("OPENROUTER_API_KEY=")) return line.slice("OPENROUTER_API_KEY=".length).trim();
  }
  throw new Error("OPENROUTER_API_KEY is not set, and apps/api/.dev.vars does not carry one.");
}

const arg = (name: string, fallback: string): string => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] ? process.argv[at + 1]! : fallback;
};

const MODE = arg("mode", "both");
const RUNS = Number(arg("runs", "3"));
const env = { OPENROUTER_API_KEY: apiKey() } as Bindings;

interface Attempt {
  ok: boolean;
  why: string[];
  ms: number;
  tokens: number;
  usage: TokenUsage;
  model: string;
  steps: number;
  rejections: number;
  /** Flow problems the edit left behind. */
  broke: number;
  changed: { added: string[]; updated: string[]; removed: string[]; rules: number; endings: string[] };
}

/** Did the edit do what the request asked? Shallow on purpose — see the fixtures. */
function judge(c: EditCase, before: FormDocType, after: FormDocType, changed: Attempt["changed"]): string[] {
  const fail: string[] = [];
  const e = c.expect;
  const refs = new Set(after.blocks.map((b) => b.ref));

  for (const ref of e.addedRefs ?? []) if (!refs.has(ref)) fail.push(`missing ${ref}`);
  for (const ref of e.updatedRefs ?? []) if (!changed.updated.includes(ref)) fail.push(`did not update ${ref}`);
  for (const ref of e.removedRefs ?? []) if (refs.has(ref)) fail.push(`did not remove ${ref}`);
  if (e.addsNothing && changed.added.length > 0) fail.push(`invented ${changed.added.length} question(s)`);

  for (const { from, to } of e.routes ?? []) {
    const has = after.logic.some(
      (r) => r.action_kind === "goto" && r.from === from && (to === "" || r.target === to),
    );
    if (!has) fail.push(`no route from ${from}${to ? ` to ${to}` : ""}`);
  }
  // The half a shallow judge misses: an arm the request never mentioned,
  // quietly deleted.
  for (const { from, to } of e.preservedRoutes ?? []) {
    const had = before.logic.some((r) => r.action_kind === "goto" && r.from === from && r.target === to);
    const has = after.logic.some((r) => r.action_kind === "goto" && r.from === from && r.target === to);
    if (had && !has) fail.push(`DELETED the ${from}→${to} route it was not asked to touch`);
  }
  for (const want of e.endings ?? []) {
    const has = after.endings.some((x) => (want.ref ? x.ref === want.ref : true) && (x.kind ?? "success") === want.kind);
    if (!has) fail.push(`no ${want.kind} ending`);
  }
  // `__any_x__` means "some block of this type must now exist", since the model
  // picks its own ref.
  for (const [key, type] of Object.entries(e.types ?? {})) {
    if (key.startsWith("__any_")) {
      const had = before.blocks.some((b) => b.type === type);
      const has = after.blocks.some((b) => b.type === type);
      if (!has || had) fail.push(`no new ${type} question`);
    } else if (after.blocks.find((b) => b.ref === key)?.type !== type) {
      fail.push(`${key} is not a ${type}`);
    }
  }
  return fail;
}

async function runOne(c: EditCase, mode: "tools" | "object"): Promise<Attempt> {
  const started = Date.now();
  const base = c.doc;
  let draft;
  let tokens = 0;
  let usage: TokenUsage = { input: 0, output: 0 };
  let model: string = MODELS.generation;
  let steps = 0;
  let rejections = 0;
  let asked: string | null = null;
  let objected: string | null = null;

  if (mode === "tools") {
    const ctx = buildEditContext(base, (d) => ({
      introduced: introducedFlowProblems(base, applyEditDraft(base, d).doc),
    }));
    const r = await runEditAgent({
      env,
      system: `${FORM_DESIGNER_SYSTEM}\n\n${EDIT_TOOL_PROTOCOL}`,
      prompt: buildEditPrompt(base, c.prompt, [], "tools"),
      tools: buildEditTools(ctx, () => {}),
      onStep: process.argv.includes("--verbose")
        ? (st) => console.log(`      step ${st.number}: ${st.toolNames.join(", ") || "(no tools — prose)"}`)
        : undefined,
    });
    draft = clampDraft(ctx.best?.draft ?? ctx.draft);
    ({ tokens, usage, model, steps, rejections } = r);
    asked = r.question ?? null;

    // The reviewer, on the same terms the route runs it: only when the flow is
    // sound, and only as an opinion.
    if (!asked && process.argv.includes("--review")) {
      const applied = applyEditDraft(base, draft);
      if (introducedFlowProblems(base, applied.doc).length === 0) {
        const { review, tokens: rt, usage: ru } = await reviewEdit({
          env, request: c.prompt, diff: describeEditChanges(base, applied),
        });
        tokens += rt;
        usage = { input: usage.input + ru.input, output: usage.output + ru.output };
        if (review && !review.ok) objected = review.problem.slice(0, 90);
      }
    }
  } else {
    const r = await generateEdit({
      env,
      system: FORM_DESIGNER_SYSTEM,
      prompt: buildEditPrompt(base, c.prompt, [], "object"),
    });
    draft = r.draft;
    ({ tokens, usage, model } = r);
  }

  const applied = applyEditDraft(base, draft);
  const changed = {
    added: applied.added.map((b) => b.ref),
    updated: applied.updated,
    removed: applied.removed,
    rules: applied.newRules.length,
    endings: applied.endingChanges,
  };
  const why = judge(c, base, applied.doc, changed);
  // A question is not a wrong answer, but it is not the edit either.
  if (asked) why.push(`ASKED instead: ${asked.slice(0, 70)}`);
  if (objected) why.push(`REVIEWER: ${objected}`);
  return {
    ok: why.length === 0,
    why,
    ms: Date.now() - started,
    tokens,
    usage,
    model,
    steps,
    rejections,
    broke: introducedFlowProblems(base, applied.doc).length,
    changed,
  };
}

const modes: ("tools" | "object")[] = MODE === "both" ? ["object", "tools"] : [MODE as "tools" | "object"];
const pad = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
const results = new Map<string, Attempt[]>();

console.log(`\n${RUNS} run(s) per case, ${EDIT_CASES.length} cases, mode: ${modes.join(" + ")}\n`);

for (const mode of modes) {
  console.log(`\n═══ ${mode.toUpperCase()} ═══`);
  console.log(`${pad("case", 42)} ${pad("ok", 6)} ${pad("ms", 7)} ${pad("tok", 7)} ${pad("¢", 7)} steps rej`);
  for (const c of EDIT_CASES) {
    const attempts: Attempt[] = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        attempts.push(await runOne(c, mode));
      } catch (err) {
        attempts.push({
          ok: false, why: [err instanceof Error ? err.message.slice(0, 60) : String(err)],
          ms: 0, tokens: 0, usage: { input: 0, output: 0 }, model: "-", steps: 0, rejections: 0, broke: 0,
          changed: { added: [], updated: [], removed: [], rules: 0, endings: [] },
        });
      }
    }
    results.set(`${mode}:${c.name}`, attempts);
    const passed = attempts.filter((a) => a.ok).length;
    const avg = (f: (a: Attempt) => number) => Math.round(attempts.reduce((s, a) => s + f(a), 0) / attempts.length);
    const cents = attempts.reduce((s, a) => s + costUsdMicro(a.model, a.usage.input, a.usage.output), 0) / attempts.length / 10_000;
    console.log(
      `${pad(c.name, 42)} ${pad(`${passed}/${RUNS}`, 6)} ${pad(String(avg((a) => a.ms)), 7)} ` +
        `${pad(String(avg((a) => a.tokens)), 7)} ${pad(cents.toFixed(3), 7)} ` +
        `${pad(String(avg((a) => a.steps)), 5)} ${avg((a) => a.rejections)}`,
    );
    const firstFail = attempts.find((a) => !a.ok);
    if (firstFail) console.log(`${" ".repeat(4)}↳ ${firstFail.why.join("; ")}`);
  }
}

console.log(`\n═══ SUMMARY ═══`);
for (const mode of modes) {
  const all = EDIT_CASES.map((c) => results.get(`${mode}:${c.name}`) ?? []);
  // pass^k: succeeded on EVERY run, not on its best one.
  const everyRun = all.filter((a) => a.length > 0 && a.every((x) => x.ok)).length;
  const anyRun = all.filter((a) => a.some((x) => x.ok)).length;
  const flat = all.flat();
  const ms = Math.round(flat.reduce((s, a) => s + a.ms, 0) / flat.length);
  const tok = Math.round(flat.reduce((s, a) => s + a.tokens, 0) / flat.length);
  const cents = flat.reduce((s, a) => s + costUsdMicro(a.model, a.usage.input, a.usage.output), 0) / flat.length / 10_000;
  const broke = flat.filter((a) => a.broke > 0).length;
  console.log(
    `${pad(mode, 8)} pass^${RUNS}: ${everyRun}/${EDIT_CASES.length}   pass@1: ${anyRun}/${EDIT_CASES.length}   ` +
      `avg ${ms}ms  ${tok} tok  ${cents.toFixed(3)}¢   left the flow broken: ${broke}/${flat.length}`,
  );
}
console.log(
  `\npass^${RUNS} is the number to decide on: an edit path that works most of the time\n` +
    `is not one you want behind a button an author presses on a live form.\n`,
);
