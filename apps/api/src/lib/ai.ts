import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, streamObject, generateText, generateObject, tool, type ToolSet, type LanguageModel } from "ai";
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
   * Form generation and every builder-side edit.
   *
   * This was `anthropic/claude-sonnet-5`, chosen on the reasoning that
   * generation happens once behind a spinner so quality could outrank
   * latency. Measured on one real prompt, that trade was far worse than it
   * looked: Sonnet spent 41.6s and $0.043 per draft, of which 2,740 of 3,962
   * output tokens were reasoning. Gemini 3.7 Flash produces the same shape of
   * document in 7.2s for $0.0018 — a quarter of the wall clock and a
   * twenty-fourth of the cost — so the money is better spent on reading the
   * author's site (see `researchBrief`) than on thinking tokens nobody reads.
   */
  generation: "google/gemini-3.7-flash",
  /** Reading the author's site and searching around it, before drafting. */
  research: "google/gemini-3.7-flash",
} as const;

export const DEFAULT_MODEL = MODELS.interview;

export function openrouter(env: Bindings) {
  return createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
}

export function chatModel(env: Bindings, model: string = DEFAULT_MODEL): LanguageModel {
  return openrouter(env).chat(model);
}

/**
 * The interview model.
 *
 * `override` is still accepted so the caller does not have to know that the
 * choice has been withdrawn, but it is deliberately ignored. Letting authors
 * pick the model put the platform's per-conversation cost in the hands of
 * whoever opened a dropdown — and the dropdown offered Opus, at roughly thirty
 * times the tier below it. Documents saved while the control existed may still
 * carry `settings.agent.model`; those forms now run on the same tier as
 * everything else rather than quietly billing at their old one.
 */
export function interviewModel(env: Bindings, override?: string): { model: LanguageModel; id: string } {
  void override;
  const id = MODELS.interview;
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
 *
 * FLATNESS IS A HARD REQUIREMENT, not a style choice.
 *
 * Google's structured-output validator enforces a budget over the whole
 * schema, and `maxItems` multiplies into it: a draft with `blocks` capped at
 * 30 × 7 properties alongside `branches` capped at 12 × 4 is rejected outright
 * with "Request contains an invalid argument", before the model is even
 * reached. Measured on `google/gemini-3.7-flash`: blocks(30) + endings(5) is
 * accepted, blocks(30) + branches(12) is not, and blocks(20) + branches(12)
 * is. Nesting counts double — options as `{id, label}` objects inside blocks
 * blew the same budget on its own.
 *
 * Hence: 20 blocks, options as plain labels, and conditions flattened to four
 * scalar fields. Anthropic accepted the old nested shape, which is exactly why
 * this went unnoticed until the model changed.
 */
export const GenerationDraft = z.object({
  title: z.string().min(1),
  description: z.string(),
  blocks: z
    .array(
      z.object({
        ref: z.string(),
        type: z.string(),
        title: z.string().min(1),
        description: z.string(),
        required: z.boolean(),
        /**
         * Choice labels as the respondent reads them — "Android", not
         * "opt_android". Ids are derived from the labels when the draft is
         * normalized, which also removes a whole class of failure: the model
         * used to be asked for both a label and a matching `opt_` id, then
         * write a branch against an id it had misremembered.
         */
        options: z.array(z.string()),
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
    .max(20),
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
        ref: z.string(),
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
        /** Ref of the question the condition reads. */
        whenRef: z.string(),
        op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "is_empty", "is_not_empty"]),
        /**
         * Compared against the answer, as a string. For a choice question this
         * is the option's LABEL, matched back to its id when normalizing;
         * empty for `is_empty` / `is_not_empty`. A string rather than a union
         * because a `string | number | boolean` union is one more thing for a
         * provider's schema dialect to reject, and the normalizer knows the
         * block's type well enough to coerce.
         */
        value: z.string(),
        /** Target question ref or ending ref. */
        then: z.string(),
      }),
    )
    .max(12),
});
export type GenerationDraft = z.output<typeof GenerationDraft>;

/**
 * Editing a form that already exists.
 *
 * This was `ExtensionDraft`, behind a route called `add-blocks`, and it could
 * only ever append questions: `blocks` was `.min(1)` and the route answered 502
 * when nothing new arrived. That made a whole category of request impossible to
 * answer honestly. Asked "if they say iPhone I need their email, if Android I
 * need their Play Store email, that's the only thing" — a pure routing change
 * on questions that were already there — the model had no way to say "no new
 * questions, here is the new wiring". It complied with the schema instead, and
 * invented a filler question ("Is there anything else you would like us to
 * know?") to carry a routing change nobody had asked to be accompanied.
 *
 * So the shape of an edit is now the shape of the request: questions may be
 * added, removed, or left alone, and the wiring is stated separately and can be
 * the entire content of an edit.
 *
 * Flat for the reason `GenerationDraft` is; see the note there.
 */
export const EditDraft = z.object({
  /** May be empty — most edits to a working form change wiring, not questions. */
  addBlocks: z
    .array(
      z.object({
        ref: z.string(),
        type: z.string(),
        title: z.string().min(1),
        description: z.string(),
        required: z.boolean(),
        /** Choice labels as written for the respondent; ids are derived. */
        options: z.array(z.string()),
        scale: z.number().int().min(0).max(20),
        /**
         * Ref of the block this one goes directly after — existing or newly
         * added. Empty string puts it at the end. Position is what makes a
         * branch possible at all: the arms of a condition have to sit
         * immediately below the question that decides it.
         */
        insertAfter: z.string(),
      }),
    )
    .max(12),
  /** Refs of questions the request asks to be taken out. Usually empty. */
  removeRefs: z.array(z.string()).max(12),
  /**
   * Questions whose routing this edit is changing.
   *
   * Advisory, and deliberately so. The distinction that was missing is that new
   * rules used to be folded in beside the old ones, so restating a branch
   * produced a duplicate and changing one left the original competing with it —
   * a request to re-route Android users added `q_android_email →
   * q_capture_source` while `q_android_device → q_capture_source` still stood,
   * and which of the two won came down to evaluation order.
   *
   * Replacement is decided from `branches` rather than from this list, per
   * question AND answer, because a list of questions is too coarse to be safe:
   * dropping every branch of a question the model names, then trusting it to
   * have restated them all, lost the Android route the one time it restated
   * only two of three options. This field is still read as intent — it makes
   * the model think about which routes it is changing — but a route the edit
   * does not mention is never removed on the strength of it.
   */
  rewireRefs: z.array(z.string()).max(12),
  /**
   * Every branch this edit asserts: the ones it is changing, restated in full,
   * plus any new ones. Each replaces the existing rule for that same question
   * and condition, and leaves every other route alone. May hang off a question
   * that was already in the form.
   */
  branches: z
    .array(
      z.object({
        whenRef: z.string(),
        op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "contains", "not_contains", "is_empty", "is_not_empty"]),
        /** Option label for a choice question, or the literal value; "" when the op needs none. */
        value: z.string(),
        then: z.string(),
      }),
    )
    .max(12),
  /** One sentence on what changed, shown to the builder. */
  summary: z.string(),
});
export type EditDraft = z.output<typeof EditDraft>;

/**
 * Provider options for anything drafted in the builder.
 *
 * Reasoning is capped rather than left at the provider default, on measurement
 * rather than principle. On one real prompt the same model and schema produced
 * an equally usable eight-block draft at every setting, and the wall clock was
 * the only thing that moved: 41.6s at the default, 19.6s at `low`, 12.6s at
 * `minimal`. Drafting a form is a formatting job with a schema holding the
 * shape — the thinking budget was buying seconds of spinner, not questions.
 *
 * `low` rather than `minimal` because the branching is the part that genuinely
 * benefits from a moment's thought, and it is the part authors notice missing.
 */
export const GENERATION_PROVIDER_OPTIONS = {
  openrouter: { reasoning: { effort: "low" as const, exclude: true } },
} as const;

/** Edit an existing form: questions added or removed, and how the flow rewires. */
export async function generateEdit(opts: { env: Bindings; prompt: string }): Promise<{ draft: EditDraft; tokens: number }> {
  const result = await generateObject({
    model: chatModel(opts.env, MODELS.generation),
    schema: EditDraft,
    prompt: opts.prompt,
    providerOptions: GENERATION_PROVIDER_OPTIONS,
  });
  return {
    draft: result.object as EditDraft,
    tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  };
}

/** AI flow generator: prompt → loose draft (normalized to FormDoc by the caller). */
export async function generateFormDraft(opts: { env: Bindings; prompt: string }): Promise<{ draft: GenerationDraft; tokens: number }> {
  const result = await generateObject({
    model: chatModel(opts.env, MODELS.generation),
    schema: GenerationDraft,
    prompt: opts.prompt,
    providerOptions: GENERATION_PROVIDER_OPTIONS,
  });
  return {
    draft: result.object as GenerationDraft,
    tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  };
}

/** A question as it appears mid-stream, before the draft is complete. */
export interface DraftBlockPreview {
  index: number;
  ref: string;
  type: string;
  title: string;
  optionCount: number;
}

/**
 * The same generation, streamed.
 *
 * Worth the extra code purely for what the author sees. Unstreamed, the first
 * sign that anything happened is the finished document; streamed, the same run
 * puts a real question on screen at 3.7s and the last of eight at ~7s. The
 * spinner stops being a claim that work is happening and starts being the work
 * itself.
 *
 * `onBlock` fires once per question, the first time that question has a title
 * — partial objects arrive character by character, so a question is announced
 * only when there is something to announce, and never twice.
 */
export async function streamFormDraft(opts: {
  env: Bindings;
  prompt: string;
  onBlock?: (block: DraftBlockPreview) => void;
  abortSignal?: AbortSignal;
}): Promise<{ draft: GenerationDraft; tokens: number }> {
  const result = streamObject({
    model: chatModel(opts.env, MODELS.generation),
    schema: GenerationDraft,
    prompt: opts.prompt,
    providerOptions: GENERATION_PROVIDER_OPTIONS,
    abortSignal: opts.abortSignal,
  });

  const announced = new Set<number>();
  for await (const partial of result.partialObjectStream) {
    if (!opts.onBlock) continue;
    const blocks = partial.blocks ?? [];
    for (const [i, b] of blocks.entries()) {
      // The last element of a partial array is the one still being written, so
      // a block is only announced once its title has stopped growing — i.e.
      // once a later block has appeared, or the stream has ended.
      const settled = i < blocks.length - 1;
      if (!settled || announced.has(i) || !b?.title) continue;
      announced.add(i);
      opts.onBlock({
        index: i,
        ref: b.ref ?? "",
        type: b.type ?? "",
        title: b.title,
        optionCount: b.options?.filter(Boolean).length ?? 0,
      });
    }
  }

  const draft = (await result.object) as GenerationDraft;
  // The final block never gets a successor to settle it against, so it is
  // announced from the finished document instead.
  const last = draft.blocks.length - 1;
  if (opts.onBlock && last >= 0 && !announced.has(last)) {
    const b = draft.blocks[last]!;
    opts.onBlock({ index: last, ref: b.ref, type: b.type, title: b.title, optionCount: b.options.length });
  }
  const usage = await result.usage;
  return { draft, tokens: (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0) };
}

/**
 * What the author's own site says about their product.
 *
 * A prompt that names a URL is asking for questions about that product, and
 * without this the generator has only the URL string to go on — it produces the
 * same six generic questions it would for no URL at all. Given the page text,
 * the same request produces questions in the product's own vocabulary, about
 * the platforms it actually ships on.
 *
 * The page text is the reliable half; OpenRouter's `web` plugin adds what the
 * rest of the internet says. Search alone is not enough and was measured being
 * actively wrong: asked about "Meemo" with no page text, it confidently
 * described three unrelated products. So search runs grounded in the scrape,
 * never instead of it.
 *
 * Returns null rather than throwing. The plugin is a real dependency with real
 * failures — two 504s from OpenRouter while this was being written — and a
 * form must still get drafted when the research step is having a bad minute.
 */
export async function researchBrief(opts: {
  env: Bindings;
  request: string;
  sites: { url: string; title: string | null; text: string }[];
  abortSignal?: AbortSignal;
}): Promise<{ brief: string; sources: string[]; tokens: number } | null> {
  const pages = opts.sites
    .map((s) => `PAGE ${s.url}${s.title ? ` — ${s.title}` : ""}\n"""${s.text}"""`)
    .join("\n\n");

  try {
    const result = await generateText({
      model: chatModel(opts.env, MODELS.research),
      prompt: `A form author asked for: "${opts.request}"

${pages || "(no page content could be read)"}

Write a BRIEF for whoever drafts the survey. Under 160 words, plain lines, no preamble:
PRODUCT: what it is, in the site's own vocabulary
AUDIENCE: who signs up
PLATFORMS: the exact platform and store names the site mentions
VOCABULARY: 3-6 product-specific terms the questions should use
WORTH ASKING: 3-4 things this product specifically needs to know from a respondent

Use only what the page content and your search results support. If something is not evidenced, leave that line out rather than guessing — an invented detail becomes a question nobody can answer.`,
      providerOptions: {
        openrouter: {
          plugins: [{ id: "web" as const, max_results: 3 }],
          reasoning: { effort: "minimal" as const, exclude: true },
        },
      },
      abortSignal: opts.abortSignal,
    });

    const brief = result.text.trim();
    if (!brief) return null;
    const sources = [
      ...new Set(
        (result.sources ?? [])
          .map((src) => ("url" in src && typeof src.url === "string" ? src.url : null))
          .filter((u): u is string => !!u),
      ),
    ].slice(0, 6);
    return { brief, sources, tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0) };
  } catch (err) {
    console.error("research_failed", err);
    return null;
  }
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
