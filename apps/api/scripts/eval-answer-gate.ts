/**
 * The answer gate against real Jev, on labelled replies. The tuning bench.
 *
 * Prints every miss, then the two numbers that matter:
 *
 * - **false accepts**: a reply that was not the answer (or was a different
 *   answer) recorded anyway. This puts words in a respondent's mouth. It has
 *   to be zero, or as near as the thresholds can get it.
 * - **missed answers**: a plain answer handed to the agent. This only costs
 *   the agent turn the form would have run anyway. It is the saving, not a bug.
 *
 *   pnpm --filter @repo/api eval:gate
 *
 * Needs OPENROUTER_API_KEY (read from apps/api/.dev.vars if not in the env).
 * Costs roughly $0.002 a run.
 */
import { readFileSync } from "node:fs";
import { validateAnswer } from "@repo/form-schema";
import { gateAnswer } from "../src/lib/answer-gate.js";
import type { Bindings } from "../src/env.js";
import { GATE_CASES } from "./fixtures/gate-cases.js";

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of file.split("\n")) {
    if (line.startsWith("OPENROUTER_API_KEY=")) return line.slice("OPENROUTER_API_KEY=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("OPENROUTER_API_KEY is not set, and apps/api/.dev.vars does not carry one.");
}

// `ENVIRONMENT: "script"` keeps eval traffic out of the production numbers in Langfuse.
const env = { OPENROUTER_API_KEY: apiKey(), ENVIRONMENT: "script" } as Bindings;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

let falseAccepts = 0;
let missed = 0;
let right = 0;
let cost = 0;
const latencies: number[] = [];

// A few at a time: fast enough, and polite to the rate limit.
const results = [];
for (let i = 0; i < GATE_CASES.length; i += 6) {
  results.push(
    ...(await Promise.all(
      GATE_CASES.slice(i, i + 6).map(async (c) => ({ c, r: await gateAnswer(env, c.block, c.reply, { source: "script" }) })),
    )),
  );
}

for (const { c, r } of results) {
  if (r.call) {
    latencies.push(r.call.latencyMs);
    cost += r.call.usage.costUsd ?? 0;
  }
  const got = r.outcome.kind === "answer" ? r.outcome.value : "off";
  // Compare what would be stored, so "29" and 29 are the same answer.
  const norm = (v: unknown) => (v === "off" ? "off" : validateAnswer(c.block, v).value);
  const ok = same(norm(got), norm(c.expect));
  if (ok) right++;
  else if (got === "off") missed++;
  else falseAccepts++;
  if (!ok) {
    const why = r.outcome.kind === "off_script" ? ` (${r.outcome.reason})` : "";
    const tag = got === "off" ? "MISSED      " : "FALSE ACCEPT";
    console.log(`${tag} [${c.block.type}] "${c.reply}" → got ${JSON.stringify(got)}${why}, want ${JSON.stringify(c.expect)}`);
  }
}

latencies.sort((a, b) => a - b);
const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor((latencies.length * p) / 100))] ?? 0;
console.log(
  `\n${right}/${GATE_CASES.length} right · ${falseAccepts} false accepts · ${missed} missed answers` +
    ` · ${latencies.length} Jev calls, p50 ${pct(50)}ms p95 ${pct(95)}ms · $${cost.toFixed(5)}`,
);
process.exitCode = falseAccepts > 0 ? 1 : 0;
