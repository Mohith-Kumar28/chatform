/**
 * One conversation turn, on real models: how soon each model starts answering
 * on each provider, and whether it can tell an answer from a reply that is not
 * one.
 *
 * The second number is why typed replies stay on `MODELS.interview`. Half the
 * cases are replies that do NOT answer the question; recording one of those
 * stores nonsense as the respondent's answer, which is worse than a slow turn.
 * Run this before moving any typed reply to the faster model.
 *
 *   pnpm --filter @repo/api bench:interview [--runs 3]
 *
 * Needs OPENROUTER_API_KEY. Costs real money, though little: one short call
 * per case, per model, per provider, per run.
 */
import { readFileSync } from "node:fs";
import { streamText } from "ai";
import { FormDoc, leadFormFixture } from "@repo/form-schema";
import { INTERVIEW_PROVIDER_OPTIONS, INTERVIEW_ROUTE, MODELS, interviewFollowupModel, interviewModel } from "../src/lib/ai.js";
import { buildStablePrefix, buildTurnSuffix } from "../src/lib/agent-prompts.js";
import { buildAgentTools, nextStepAfter, revisionOf } from "../src/do/agent-tools.js";
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

const RUNS = Number(arg("runs", "3"));
const env = { OPENROUTER_API_KEY: apiKey(), ENVIRONMENT: "script" } as Bindings;
const doc = FormDoc.parse(leadFormFixture);

/** A reply to a question, and whether it answers it. */
const CASES: { ref: string; reply: string; answers: boolean }[] = [
  { ref: "q_name", reply: "everyone just calls me Sam", answers: true },
  { ref: "q_name", reply: "is this going to take long?", answers: false },
  { ref: "q_name", reply: "mostly the pricing, to be honest", answers: false },
  { ref: "q_detail", reply: "a scheduling tool for small dental clinics", answers: true },
  { ref: "q_detail", reply: "about twelve people, half of them engineers", answers: false },
  { ref: "q_detail", reply: "why do you need to know that?", answers: false },
];

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : 0);
const secs = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

async function turn(modelId: string, route: readonly string[], c: (typeof CASES)[number]) {
  const block = doc.blocks.find((b) => b.ref === c.ref)!;
  const state = { answers: {}, variables: {}, hidden: {} };
  let called: string[] = [];
  const tools = buildAgentTools(
    {
      doc,
      currentBlock: block,
      nextAfter: (value?: unknown) => nextStepAfter(doc, block, state, value, {}),
      revise: (ref: string, value?: unknown) => revisionOf(doc, state, block.ref, ref, value),
      clarifications: 0,
      unansweredRequired: [],
      hasKnowledge: false,
      announced: null,
    },
    () => {},
  );
  const result = streamText({
    model: modelId === MODELS.interview ? interviewModel(env, undefined, route).model : interviewFollowupModel(env, route),
    system: buildStablePrefix(doc, { hasKnowledge: false }),
    prompt:
      `${buildTurnSuffix(doc, block, 0, { transcript: "", answers: "", turnCount: 1 })}\n\n` +
      `The respondent replied: "${c.reply}"\n\n` +
      `Their message may contain an answer, a question of their own, or both, so handle everything in it.\n` +
      `1. If any part of it answers "${block.title}", call record_answer with ref=${block.ref}.\n` +
      `2. If they also asked something, answer that too, in one or two sentences.\n` +
      `If you did not record an answer, ask "${block.title}" again.`,
    tools,
    // One step: what this measures is the first call, the one that decides.
    stopWhen: () => true,
    maxOutputTokens: 1600,
    providerOptions: INTERVIEW_PROVIDER_OPTIONS,
    abortSignal: AbortSignal.timeout(30_000),
    maxRetries: 0,
  });
  for await (const part of result.fullStream) if (part.type === "tool-call") called = [...called, part.toolName];
  const step = (await result.steps)[0]!;
  return {
    firstMs: step.performance.timeToFirstOutputMs ?? 0,
    totalMs: step.performance.responseTimeMs,
    recorded: called.includes("record_answer"),
  };
}

const rows: Record<string, string | number>[] = [];
for (const modelId of [MODELS.interview, MODELS.interviewFollowup]) {
  for (const route of [INTERVIEW_ROUTE, [...INTERVIEW_ROUTE].reverse()]) {
    const first: number[] = [];
    const total: number[] = [];
    let wrongRecord = 0;
    let missedAnswer = 0;
    let failed = 0;
    for (let run = 0; run < RUNS; run += 1) {
      for (const c of CASES) {
        try {
          const out = await turn(modelId, route, c);
          first.push(out.firstMs);
          total.push(out.totalMs);
          if (out.recorded && !c.answers) wrongRecord += 1;
          if (!out.recorded && c.answers) missedAnswer += 1;
        } catch (err) {
          failed += 1;
          console.error(`${modelId} via ${route[0]}: ${String(err)}`);
        }
      }
    }
    const nonAnswers = CASES.filter((c) => !c.answers).length * RUNS;
    const realAnswers = CASES.filter((c) => c.answers).length * RUNS;
    rows.push({
      model: modelId,
      "first provider": route[0]!,
      "first token": secs(median(first)),
      total: secs(median(total)),
      "non-answers recorded": `${wrongRecord}/${nonAnswers}`,
      "answers missed": `${missedAnswer}/${realAnswers}`,
      failed,
    });
  }
}
console.table(rows);
