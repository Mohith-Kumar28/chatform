import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { Block as BlockSchema, FormDoc, lintFormDoc, hasErrors, type Block, type FormDocInput } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { createAuth } from "../lib/auth.js";
import { generateFormDraft, type GenerationDraft } from "../lib/ai.js";
import { buildFlowGeneratorPrompt } from "../lib/agent-prompts.js";

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

aiRouter.use("*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  c.set("userId", session.user.id);
  await next();
});

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
        logic: [],
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
