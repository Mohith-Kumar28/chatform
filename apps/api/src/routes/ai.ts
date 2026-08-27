import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { Block as BlockSchema, FormDoc, lintFormDoc, hasErrors, type Block, type FormDocInput, type LogicRuleInput, migrateFormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, assertFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireQuota, type AuthzVars } from "../lib/authorize.js";
import { meter } from "../lib/entitlements.js";
import { generateFormDraft, generateExtension, type GenerationDraft } from "../lib/ai.js";
import { buildFlowRules } from "../lib/flow-normalize.js";
import { buildFlowGeneratorPrompt, buildExtensionPrompt } from "../lib/agent-prompts.js";

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

aiRouter.use("/ai/*", requireSession);
aiRouter.use("/ai/*", requireOrg);
// AI generation is a real cost, so it is both role-gated and quota-gated. The quota is
// checked here and consumed only on success, inside each handler — a generation that
// fails upstream must not spend someone's monthly allowance.
aiRouter.use("/ai/*", requirePermission("ai", "generate"));
aiRouter.use("/ai/*", requireQuota("ai_generations", "ai.generate"));

const GenerateBody = z.object({
  prompt: z.string().min(5).max(2000),
  questionCount: z.number().int().min(2).max(20).default(6),
});

/** The model's placeholder scale is often 0; fall back rather than fail. */
function clampScale(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || value < min || value > max) return fallback;
  return value;
}

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
        return BlockSchema.parse({
          ...base,
          type: "rating",
          scale: clampScale(draft.scale, 1, 10, 5),
          shape: "star",
        });
      case "nps":
        return BlockSchema.parse({ ...base, type: "nps" });
      case "opinion_scale":
        return BlockSchema.parse({
          ...base,
          type: "opinion_scale",
          steps: clampScale(draft.scale, 2, 11, 5),
          startAt: 1,
        });
      default:
        return null;
    }
  } catch {
    return null;
  }
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

      // Dedupe ending refs the same way block refs are deduped — two endings
      // sharing a ref would make every branch to it ambiguous.
      const seenEndingRefs = new Set<string>();
      const endings = draft.endings.map((e, i) => {
        let ref = e.ref;
        while (seenEndingRefs.has(ref)) ref = `${ref}_${i}`;
        seenEndingRefs.add(ref);
        return {
          id: `end_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`,
          ref,
          title: e.title,
          bodyMd: e.body,
          redirectDelaySec: 5,
          showSummary: false,
        };
      });

      const doc = FormDoc.parse({
        schemaVersion: 1,
        title: draft.title,
        description: draft.description,
        blocks,
        endings,
        logic: buildFlowRules(draft.branches, blocks, endings.map((e) => e.ref)),
        endingRules: [],
        variables: [],
        hiddenFields: [],
        settings: {},
        theme: {},
      } satisfies FormDocInput);

      const issues = lintFormDoc(doc);
      if (!hasErrors(issues)) {
        // Consumed only now that a valid document exists. A generation that failed
        // upstream, or produced something unusable, must not spend the allowance.
        const orgId = c.get("orgId");
        if (orgId) {
          await meter(c.env, orgId, "ai_generations");
          if (tokens > 0) await meter(c.env, orgId, "ai_tokens", tokens);
        }
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
    const doc = FormDoc.parse(migrateFormDoc(JSON.parse(row.working_schema)));

    const { draft, tokens } = await generateExtension({
      env: c.env,
      prompt: buildExtensionPrompt(doc, prompt),
    });

    // Insert each block where the model asked for it, resolving against the
    // list as it grows so one new block can follow another. Appending
    // everything to the end — which is all this route used to do — puts the
    // arms of a condition below the questions they are supposed to skip.
    const added: Block[] = [];
    const renamed = new Map<string, string>();
    for (const b of draft.blocks) {
      if (b.type === "welcome" || b.type === "statement") continue;
      let ref = b.ref;
      while (doc.blocks.some((x) => x.ref === ref)) ref = `${ref}_x`;
      if (ref !== b.ref) renamed.set(b.ref, ref);

      const normalized = normalizeBlock({ ...b, ref }, 1); // index 1 = never treated as welcome
      if (!normalized) continue;

      const anchor = renamed.get(b.insertAfter) ?? b.insertAfter;
      const at = anchor ? doc.blocks.findIndex((x) => x.ref === anchor) : -1;
      if (at >= 0) doc.blocks.splice(at + 1, 0, normalized);
      else doc.blocks.push(normalized);
      added.push(normalized);
    }
    if (added.length === 0) {
      return c.json({ error: { code: "generation_failed", message: "AI could not produce new blocks. Try a different prompt." } }, 502);
    }

    // Branches may hang off a question that was already in the form, so rules
    // are built against the merged block list and folded in beside the
    // existing ones rather than replacing them.
    const branches = draft.branches.map((br) => ({
      ...br,
      when: { ...br.when, ref: renamed.get(br.when.ref) ?? br.when.ref },
      then: renamed.get(br.then) ?? br.then,
    }));
    const priorGotos = doc.logic.filter((r) => r.action_kind === "goto");
    const newRules = buildFlowRules(
      branches,
      doc.blocks,
      doc.endings.map((e) => e.ref),
      priorGotos,
    );
    if (newRules.length > 0) {
      doc.logic = FormDoc.parse({ ...doc, logic: [...doc.logic, ...newRules] }).logic;
    }

    // Deliberately not persisted. The builder reviews the proposal and
    // applies it, and applying is what saves — so declining leaves the form
    // exactly as it was. Writing here meant a rejected suggestion was already
    // in the database, and the client's own copy then had to fight it.
    const issues = lintFormDoc(doc);
    const orgId = c.get("orgId");
    if (orgId) {
      await meter(c.env, orgId, "ai_generations");
      if (tokens > 0) await meter(c.env, orgId, "ai_tokens", tokens);
    }
    return c.json({ doc, added: added.length, rules: newRules.length, summary: draft.summary, tokens, issues });
  },
);
