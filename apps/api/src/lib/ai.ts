import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, generateText, generateObject, tool, type ToolSet, type LanguageModel } from "ai";
import { z } from "zod";
import type { Bindings } from "../env.js";

/**
 * Vercel AI SDK + OpenRouter — the single AI gateway for chatform.
 * Every AI call goes through here (agent turns, flow generation, validation).
 */

/**
 * Model tiers.
 *
 * The interview is the product, so it runs on a strong model — it has to
 * handle objections, answer questions from the knowledge base, and stay in
 * character. Extraction and classification are narrow, schema-constrained
 * tasks where a small fast model is both cheaper and lower latency.
 *
 * Slugs are OpenRouter's. Verify against https://openrouter.ai/api/v1/models
 * before changing them — a wrong slug fails at request time, not build time.
 */
export const MODELS = {
  /**
   * Conversation turns. Latency is felt directly by the respondent — every
   * second here is a second of watching a typing indicator — so this tier is
   * optimised for speed, with tool calling as a hard requirement.
   */
  interview: "google/gemini-3.7-flash",
  /** Free-text → structured answer. Narrow, schema-bound, wants to be cheap. */
  extraction: "google/gemini-3.1-flash-lite",
  /**
   * Form generation runs once, in the builder, behind a spinner — quality
   * matters more than latency, so it keeps the stronger model.
   */
  generation: "anthropic/claude-sonnet-5",
} as const;

export const DEFAULT_MODEL = MODELS.interview;

export function openrouter(env: Bindings) {
  return createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
}

export function chatModel(env: Bindings, model: string = DEFAULT_MODEL): LanguageModel {
  return openrouter(env).chat(model);
}

/** The interview model for a form, honouring its per-form override. */
export function interviewModel(env: Bindings, override?: string): { model: LanguageModel; id: string } {
  const id = override?.trim() || MODELS.interview;
  return { model: openrouter(env).chat(id), id };
}

/**
 * Provider options for a conversation turn.
 *
 * An interview turn is phrasing plus a tool call, not a problem to think
 * through, so reasoning is pushed as low as the model allows. It cannot be
 * switched off — Gemini 3.7 Flash answers `enabled: false` with
 * "Reasoning is mandatory for this endpoint and cannot be disabled" — so it is
 * capped at minimal and excluded from the response stream instead.
 *
 * This matters for more than cost: reasoning tokens are billed against the
 * same output budget as the reply. At `responseMaxTokens: 400` the model spent
 * the entire budget thinking, produced no visible text, and the turn was
 * treated as a failure and fell back to scripted phrasing — after ~19 seconds.
 */
export const INTERVIEW_PROVIDER_OPTIONS = {
  openrouter: { reasoning: { effort: "minimal" as const, exclude: true } },
} as const;

/**
 * Headroom added to the author's `responseMaxTokens` to cover reasoning.
 *
 * `responseMaxTokens` means "how long should the reply be" to whoever set it;
 * they should not have to budget for tokens they never see.
 */
export const REASONING_HEADROOM_TOKENS = 1200;

export interface AgentTurnResult {
  text: string;
  toolCalls: { name: string; args: unknown }[];
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * One agentic turn: given the transcript + toolset, run the model with tools.
 * Tools are provided by SessionDO; guard() enforcement lives there.
 */
export async function runAgentTurn(opts: {
  env: Bindings;
  system: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  tools: ToolSet;
  maxTokens?: number;
}): Promise<AgentTurnResult> {
  const result = streamText({
    model: chatModel(opts.env),
    system: opts.system,
    messages: opts.messages as never,
    tools: opts.tools,
    maxOutputTokens: opts.maxTokens ?? 400,
  });
  const toolCalls: { name: string; args: unknown }[] = [];
  for await (const part of result.fullStream) {
    if (part.type === "tool-call") {
      toolCalls.push({ name: part.toolName, args: (part as { input?: unknown }).input });
    }
  }
  const usage = await result.usage;
  return {
    text: await result.text,
    toolCalls,
    usage: usage ? { promptTokens: usage.inputTokens ?? 0, completionTokens: usage.outputTokens ?? 0 } : undefined,
  };
}

/**
 * Loose generation schema — deliberately NOT the full FormDoc (recursive
 * condition groups are rejected by provider structured-output APIs).
 * The route normalizes this draft into a strict FormDoc afterwards.
 */
export const GenerationDraft = z.object({
  title: z.string().min(1),
  description: z.string(),
  blocks: z
    .array(
      z.object({
        ref: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/),
        type: z.string(),
        title: z.string().min(1),
        description: z.string(),
        required: z.boolean(),
        options: z.array(
          z.object({ id: z.string().regex(/^[a-z0-9_]{3,30}$/), label: z.string().min(1) }),
        ),
        /**
         * Only meaningful for rating and opinion_scale. Strict structured
         * output requires every property to be present, so the model sends a
         * placeholder for other block types — commonly 0. Accept anything and
         * let the normalizer clamp it; rejecting 0 here failed the whole
         * generation because one unrelated field was out of range.
         */
        scale: z.number().int().min(0).max(20),
      }),
    )
    .min(2)
    .max(30),
  /**
   * One entry per distinct outcome.
   *
   * This was a single `endingTitle`/`endingBody` pair, which made "route big
   * teams to sales and everyone else to a trial" impossible to express: the
   * model would emit the branch anyway and, with nowhere to send it, aim it at
   * a question instead — silently skipping whatever sat between.
   */
  endings: z
    .array(
      z.object({
        ref: z.string().regex(/^end_[a-z0-9_]{1,30}$/),
        title: z.string().min(1),
        body: z.string(),
      }),
    )
    .min(1)
    .max(5),
  /** Conditional flow: when <condition on question ref> → jump to <target ref | ending ref>. */
  branches: z
    .array(
      z.object({
        when: z.object({
          ref: z.string(),
          op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "is_empty", "is_not_empty"]),
          /** null when the op needs no value (is_empty / is_not_empty) — required field for strict structured output. */
          value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
        }),
        then: z.string(),
      }),
    )
    .max(12),
});
export type GenerationDraft = z.output<typeof GenerationDraft>;

/** AI flow generator: prompt → loose draft (normalized to FormDoc by the caller). */
export async function generateFormDraft(opts: { env: Bindings; prompt: string }): Promise<{ draft: GenerationDraft; tokens: number }> {
  const result = await generateObject({
    model: chatModel(opts.env, MODELS.generation),
    schema: GenerationDraft,
    prompt: opts.prompt,
  });
  return {
    draft: result.object as GenerationDraft,
    tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  };
}

/**
 * Extract a typed answer from free text.
 *
 * The schema is built from the block itself (see `@repo/form-schema`
 * `extractionSchema`), so the model is bounded by the same limits
 * `validateAnswer` enforces — and the result is still passed through
 * `validateAnswer` afterwards. The extractor narrows; the validator decides.
 *
 * Returns null on any failure so the caller falls back to a clarify turn
 * rather than recording a guess.
 */
export interface ExtractionEnvelope {
  value: unknown;
  confident: boolean;
  note: string | null;
}

export async function extractAnswer(opts: {
  env: Bindings;
  /** Built by `extractionSchema(block)` — always an envelope-shaped object. */
  schema: z.ZodType<ExtractionEnvelope>;
  question: string;
  guidance: string;
  answer: string;
  transcript?: string;
}): Promise<{ value: unknown; confident: boolean; note?: string; tokens: number } | null> {
  try {
    const result = await generateObject({
      model: chatModel(opts.env, MODELS.extraction),
      schema: opts.schema,
      system:
        "You convert a person's free-text reply into a structured value. You never invent information they did not give. If their reply is ambiguous, incomplete, or does not answer the question, return value=null and confident=false.",
      prompt: `Question asked: ${opts.question}
${opts.guidance}
${opts.transcript ? `\nRecent conversation:\n${opts.transcript}\n` : ""}
Their reply: """${opts.answer}"""`,
    });
    const out = result.object;
    return {
      value: out.value,
      confident: out.confident,
      note: out.note ?? undefined,
      tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
    };
  } catch (err) {
    console.error("extraction_failed", err);
    return null;
  }
}

export { tool, generateText };
