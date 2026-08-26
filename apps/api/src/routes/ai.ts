import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { Block as BlockSchema, FormDoc, lintFormDoc, hasErrors, type Block, type FormDocInput, type LogicRuleInput } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, assertFormAccess, type GuardVars } from "../lib/guards.js";
import { generateFormDraft, type GenerationDraft } from "../lib/ai.js";
import { buildFlowGeneratorPrompt } from "../lib/agent-prompts.js";

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: Partial<GuardVars> }>();

aiRouter.use("*", requireSession);
aiRouter.use("*", requireOrg);

const GenerateBody = z.object({
  prompt: z.string().min(5).max(2000),
  questionCount: z.number().int().min(2).max(20).default(6),
});

/** Map a loose generated block onto the strict Block schema; falls back to short_text. */
function normalizeBlock(draft: GenerationDraft["blocks"][number], index: number): Block | null {
  const type = draft.type as Block["type"];
  const id = `blk_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
  const base = { id, ref: draft.ref, title: draft.title, description: draft.description || undefined, required: draft.required };

  if (index === 0 && (type === "welcome" || draft.ref === "welcome")) {
    return BlockSchema.parse({ ...base, type: "welcome", buttonLabel: "Start" });
  }
  try {
    switch (type) {
      case "welcome":
        return BlockSchema.parse({ ...base, type: "welcome", buttonLabel: "Start" });
      case "statement":
        return BlockSchema.parse({ ...base, type: "statement", buttonLabel: "Continue" });
      case "short_text":
        return BlockSchema.parse({ ...base, type: "short_text", minLength: 0, maxLength: 300 });
      case "long_text":
        return BlockSchema.parse({ ...base, type: "long_text", minLength: 0, maxLength: 1500 });
      case "email":
      case "phone":
      case "url":
      case "date":
      case "number":
        return BlockSchema.parse({ ...base, type });
      case "yes_no":
        return BlockSchema.parse({ ...base, type: "yes_no" });
      case "single_select":
      case "multi_select":
      case "dropdown": {
        const options = (draft.options ?? []).map((o) => ({ id: o.id, label: o.label }));
        void options;
        if (options.length < 2) return null;
        if (type === "multi_select") {
          return BlockSchema.parse({ ...base, type, options, minSelections: 1, maxSelections: options.length, allowOther: false });
        }
        return BlockSchema.parse({ ...base, type, options, allowOther: false });
      }
      case "rating":
        return BlockSchema.parse({ ...base, type: "rating", scale: draft.scale ?? 5, shape: "star" });
      case "nps":
        return BlockSchema.parse({ ...base, type: "nps" });
      case "opinion_scale":
        return BlockSchema.parse({ ...base, type: "opinion_scale", steps: draft.scale ?? 10, startAt: 1 });
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Map AI draft branches onto strict goto logic rules; drops anything invalid. */
function normalizeBranches(draft: GenerationDraft, blocks: Block[]): LogicRuleInput[] {
  const refs = new Set(blocks.map((b) => b.ref));
  const rules: LogicRuleInput[] = [];
  for (const br of draft.branches) {
    if (!refs.has(br.when.ref)) continue;
    const isEnding = br.then === "end_thanks";
    if (!isEnding && !refs.has(br.then)) continue;
    if (br.when.ref === br.then) continue;
    rules.push({
      id: `rl_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
      action_kind: "goto",
      from: br.when.ref,
      when: {
        op: "and",
        conditions: [
          {
            left: { kind: "ref", ref: br.when.ref },
            op: br.when.op,
            ...(br.when.value !== null && br.when.value !== undefined ? { value: br.when.value } : {}),
          },
        ],
        groups: [],
      },
      target: br.then,
      targetKind: isEnding ? "ending" : "block",
      branch: "true",
    });
  }
  return rules;
}

aiRouter.post(
  "/ai/generate-form",
  validator("json", GenerateBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Generate a form document from a natural-language prompt",
    responses: {
      200: {
        description: "Generated FormDoc + lint issues",
        content: {
          "application/json": {
            schema: resolver(z.object({ doc: z.unknown(), issues: z.array(z.any()), tokens: z.number() })),
          },
        },
      },
      502: { description: "Generation failed after retries" },
      503: { description: "AI not configured" },
    },
  }),
  async (c) => {
    if (!c.env.OPENROUTER_API_KEY) {
      return c.json({ error: { code: "ai_not_configured", message: "OPENROUTER_API_KEY is not set" } }, 503);
    }
    const { prompt, questionCount } = c.req.valid("json");

    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const fixNote =
        attempt === 0
          ? ""
          : `\n\nYour previous attempt had these problems — fix them:\n${lastError}`;
      const { draft, tokens } = await generateFormDraft({
        env: c.env,
        prompt: buildFlowGeneratorPrompt(prompt, questionCount) + fixNote,
      });

      // normalize loose draft → strict blocks
      const blocks: Block[] = [];
      const seenRefs = new Set<string>();
      for (const [i, b] of draft.blocks.entries()) {
        let ref = b.ref;
        while (seenRefs.has(ref)) ref = `${ref}_${i}`;
        seenRefs.add(ref);
        const block = normalizeBlock({ ...b, ref }, i);
        if (block) blocks.push(block);
      }
      if (blocks.length < 2 || blocks[0]!.type !== "welcome") {
        lastError = "First block must be a welcome block; include at least 2 blocks with valid options for choice questions.";
        continue;
      }

      const doc = FormDoc.parse({
        schemaVersion: 1,
        title: draft.title,
        description: draft.description,
        blocks,
        endings: [
          {
            id: `end_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
            ref: "end_thanks",
            title: draft.endingTitle,
            bodyMd: draft.endingBody,
            redirectDelaySec: 5,
            showSummary: false,
          },
        ],
        logic: normalizeBranches(draft, blocks),
        endingRules: [],
        variables: [],
        hiddenFields: [],
        settings: {},
        theme: {},
      } satisfies FormDocInput);

      const issues = lintFormDoc(doc);
      if (!hasErrors(issues)) {
        return c.json({ doc, issues, tokens });
      }
      lastError = issues.filter((i) => i.level === "error").map((i) => `${i.path ?? ""}: ${i.message}`).join("\n");
    }
    return c.json({ error: { code: "generation_failed", message: "AI could not produce a valid form. Try rephrasing." } }, 502);
  },
);

aiRouter.post(
  "/ai/add-blocks",
  validator(
    "json",
    z.object({
      formId: z.string(),
      prompt: z.string().min(3).max(1000),
      count: z.number().int().min(1).max(10).default(3),
    }),
  ),
  describeRoute({
    tags: ["dashboard"],
    summary: "AI-generate additional blocks appended to an existing form",
    responses: {
      200: { description: "New blocks + updated doc", content: { "application/json": { schema: resolver(z.object({ doc: z.unknown(), added: z.number(), tokens: z.number() })) } } },
      503: { description: "AI not configured" },
    },
  }),
  async (c) => {
    if (!c.env.OPENROUTER_API_KEY) {
      return c.json({ error: { code: "ai_not_configured", message: "OPENROUTER_API_KEY is not set" } }, 503);
    }
    const { formId, prompt, count } = c.req.valid("json");
    // formId arrives in the body, so path middleware cannot guard it — check here.
    const form = await assertFormAccess(c, formId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const row = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ? AND deleted_at IS NULL`)
      .bind(formId)
      .first<{ working_schema: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const doc = FormDoc.parse(JSON.parse(row.working_schema));

    const existing = doc.blocks.map((b) => `${b.ref} (${b.type}): ${b.title}`).join("; ");
    const { draft, tokens } = await generateFormDraft({
      env: c.env,
      prompt: `You are extending an EXISTING form. Current questions: [${existing}].
Create ${count} NEW question blocks only (no welcome block, no endings) that: ${prompt}
Avoid duplicating existing questions. Return them in "blocks" (title/description may be "" if none).`,
    });

    const added: Block[] = [];
    for (const b of draft.blocks) {
      if (b.type === "welcome" || b.type === "statement") continue;
      let ref = b.ref;
      while (doc.blocks.some((x) => x.ref === ref)) ref = `${ref}_x`;
      const normalized = normalizeBlock({ ...b, ref }, 1); // index 1 = never treated as welcome
      if (normalized) {
        added.push(normalized);
        doc.blocks.push(normalized);
      }
    }
    if (added.length === 0) {
      return c.json({ error: { code: "generation_failed", message: "AI could not produce new blocks. Try a different prompt." } }, 502);
    }
    const issues = lintFormDoc(doc);
    await c.env.DB.prepare(`UPDATE forms SET working_schema = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(doc), Date.now(), formId)
      .run();
    return c.json({ doc, added: added.length, tokens, issues });
  },
);
