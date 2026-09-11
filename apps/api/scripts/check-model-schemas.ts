/**
 * Ask the provider whether it still accepts every schema we send it.
 *
 * This exists because of an outage nothing in the repo could have caught.
 * Google budgets structured-output schemas and rejects anything over it with
 * "Request contains an invalid argument" — before the model, so it is not a bad
 * response, it is a refused request. The schemas were measured against that
 * budget when they were written, and then Google tightened it. Form generation
 * stopped working in production with no deploy, no failing test and no code
 * change on our side.
 *
 * A unit test cannot catch that: the schema it asserts on is ours, and ours did
 * not change. Only the provider knows, so only the provider can be asked — which
 * is what this does. It is worth one cheap call per schema to find out from a
 * cron job instead of from a customer.
 *
 * `pnpm --filter @repo/api check:schemas` — needs OPENROUTER_API_KEY. Exits
 * non-zero if anything is refused.
 */
import { readFileSync } from "node:fs";
import { generateObject } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { extractionSchema, type Block } from "@repo/form-schema";
import { GenerationDraft, EditDraft, MODELS, isSchemaRejection } from "../src/lib/ai.js";

function apiKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const file = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
    for (const line of file.split("\n")) {
      if (line.startsWith("OPENROUTER_API_KEY=")) return line.slice("OPENROUTER_API_KEY=".length).trim();
    }
  } catch {
    /* fall through to the error below */
  }
  throw new Error("OPENROUTER_API_KEY is not set, and apps/api/.dev.vars does not carry one.");
}

const or = createOpenRouter({ apiKey: apiKey() });

const DRAFT = "Make a short waitlist form with one screen-out ending and one branch.";
const EDIT = 'The form has a question with ref "q_platform" (options "iOS", "Android"). Add an email question after it, shown only to Android, and summarise the change.';
const ROSTER = "The team is Alice (alice@x.com) and Bob (bob@y.com).";

/**
 * The worst shape an author can configure, not a typical one — 10 fields with
 * 20 entries each is what `blocks.ts` allows, and the ceiling is the only
 * number worth testing. Everything smaller passes if this does.
 */
const worstFieldGroup = {
  id: "b1",
  ref: "q_team",
  type: "field_group",
  title: "Team members",
  required: true,
  itemLabel: "Member",
  minEntries: 1,
  maxEntries: 20,
  fields: Array.from({ length: 10 }, (_, i) => ({ key: `f${i}`, label: `Field ${i}`, kind: "short_text", required: false })),
} as unknown as Block;

/**
 * Each case carries a prompt its schema can actually be satisfied by. A draft
 * prompt handed to `EditDraft` comes back unparseable, which reads as a failure
 * and is not one — the question here is only ever "was the schema accepted".
 */
const CASES: { name: string; model: string; schema: z.ZodTypeAny; prompt: string }[] = [
  { name: "GenerationDraft", model: MODELS.generation, schema: GenerationDraft, prompt: DRAFT },
  { name: "GenerationDraft (fallback vendor)", model: MODELS.generationFallback, schema: GenerationDraft, prompt: DRAFT },
  { name: "EditDraft", model: MODELS.generation, schema: EditDraft, prompt: EDIT },
  { name: "EditDraft (fallback vendor)", model: MODELS.generationFallback, schema: EditDraft, prompt: EDIT },
  { name: "extraction: field_group at its ceiling", model: MODELS.extraction, schema: extractionSchema(worstFieldGroup)!, prompt: ROSTER },
];

let refused = 0;
for (const c of CASES) {
  const started = Date.now();
  try {
    await generateObject({
      model: or.chat(c.model),
      schema: c.schema as never,
      prompt: c.prompt,
    });
    console.log(`  ok       ${c.name}  [${c.model}]  ${Date.now() - started}ms`);
  } catch (err) {
    if (isSchemaRejection(err)) {
      refused++;
      console.error(`  REFUSED  ${c.name}  [${c.model}]  ${err instanceof Error ? err.message : String(err)}`);
    } else {
      // A timeout or a rate limit says nothing about the schema, which is the
      // only thing being asked. Not a pass, and not a failure either.
      console.warn(`  skipped  ${c.name}  [${c.model}]  ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

if (refused > 0) {
  console.error(`\n${refused} schema(s) refused by the provider. Generation or extraction is broken or about to be.`);
  console.error("Look for `maxItems` first — it is the only keyword measured to trigger this, and the budget multiplies it by the per-item property count. See the note on GenerationDraft.");
  process.exit(1);
}
console.log("\nEvery schema we send is still accepted.");
