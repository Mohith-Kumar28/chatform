/**
 * The builder's request router against real Jev, on labelled requests.
 *
 * Prints every miss at the current bar, then a sweep of bars:
 *
 * - **missed**: a section the request needed that the model would not see.
 *   The model then cannot make that change, so this is the number to hold down.
 * - **extra**: a section sent that was not needed. Costs prompt tokens only.
 *
 *   pnpm --filter @repo/api eval:route
 *
 * Needs OPENROUTER_API_KEY (read from apps/api/.dev.vars if not in the env).
 */
import { readFileSync } from "node:fs";
import type { SettingSection } from "@repo/form-schema";
import { SETTING_SECTION_IDS } from "@repo/form-schema";
import { routeRequest, T_QUESTION, T_SECTION } from "../src/lib/settings-route.js";
import type { Bindings } from "../src/env.js";
import { ROUTE_CASES } from "./fixtures/route-cases.js";

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const file = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of file.split("\n")) {
    if (line.startsWith("OPENROUTER_API_KEY=")) return line.slice("OPENROUTER_API_KEY=".length).trim().replace(/^"|"$/g, "");
  }
  throw new Error("OPENROUTER_API_KEY is not set, and apps/api/.dev.vars does not carry one.");
}

const env = { OPENROUTER_API_KEY: apiKey(), ENVIRONMENT: "script" } as Bindings;

const results: { c: (typeof ROUTE_CASES)[number]; probs: Record<string, number>; ms: number; cost: number }[] = [];
for (let i = 0; i < ROUTE_CASES.length; i += 6) {
  results.push(
    ...(await Promise.all(
      ROUTE_CASES.slice(i, i + 6).map(async (c) => {
        const r = await routeRequest(env, { request: c.request, previous: c.previous }, { source: "script" }, { timeoutMs: 8000 });
        const probs: Record<string, number> = {};
        for (const [k, a] of Object.entries(r.call?.answers ?? {})) if (a.type === "noul") probs[k] = a.noul;
        if (!r.call) console.log(`FAILED CALL: ${c.request}`);
        return { c, probs, ms: r.call?.latencyMs ?? 0, cost: r.call?.usage.costUsd ?? 0 };
      }),
    )),
  );
}

function score(bar: number, verbose: boolean) {
  let missed = 0;
  let extra = 0;
  let howToWrong = 0;
  let knowledgeWrong = 0;
  for (const { c, probs } of results) {
    const picked = SETTING_SECTION_IDS.filter((s) => (probs[`section_${s}`] ?? 0) >= bar);
    const need = new Set<SettingSection>(c.sections);
    const miss = [...need].filter((s) => !picked.includes(s));
    const more = picked.filter((s) => !need.has(s));
    // Nothing picked on a request that is not about questions falls back to everything.
    const how = (probs.how_to ?? 0) >= T_QUESTION;
    const knows = (probs.knowledge ?? 0) >= T_QUESTION;
    const fallback = picked.length === 0 && (probs.questions_only ?? 0) < 0.5 && !how && !knows;
    if (!fallback) missed += miss.length;
    extra += fallback ? SETTING_SECTION_IDS.length - need.size : more.length;
    if (how !== Boolean(c.howTo)) howToWrong++;
    if (knows !== Boolean(c.knowledge)) knowledgeWrong++;
    if (verbose && ((!fallback && miss.length) || how !== Boolean(c.howTo) || knows !== Boolean(c.knowledge))) {
      const top = Object.entries(probs)
        .filter(([, p]) => p >= 0.1)
        .map(([k, p]) => `${k.replace("section_", "")}=${p.toFixed(2)}`)
        .join(" ");
      console.log(`MISS "${c.request}" need=[${[...need]}] missed=[${miss}] howTo=${how}/${Boolean(c.howTo)} knowledge=${knows}/${Boolean(c.knowledge)} | ${top}`);
    }
  }
  return { missed, extra, howToWrong, knowledgeWrong };
}

score(T_SECTION, true);
console.log("\nbar   missed  extra  howToWrong  knowledgeWrong");
for (const bar of [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6]) {
  const s = score(bar, false);
  console.log(`${bar.toFixed(2)}  ${String(s.missed).padStart(6)}  ${String(s.extra).padStart(5)}  ${String(s.howToWrong).padStart(10)}  ${String(s.knowledgeWrong).padStart(14)}`);
}
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const total = results.reduce((n, r) => n + r.cost, 0);
console.log(`\n${results.length} requests, p50 ${ms[Math.floor(ms.length / 2)]}ms, p90 ${ms[Math.floor(ms.length * 0.9)]}ms, $${total.toFixed(5)} total`);
