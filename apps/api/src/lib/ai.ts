import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, generateText, generateObject, tool, type ToolSet, type LanguageModel } from "ai";
import { z } from "zod";
import type { Bindings } from "../env.js";

/**
 * Vercel AI SDK + OpenRouter — the single AI gateway for chatform.
 * Every AI call goes through here (agent turns, flow generation, validation).
 */

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function openrouter(env: Bindings) {
  return createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
}

export function chatModel(env: Bindings, model: string = DEFAULT_MODEL): LanguageModel {
  return openrouter(env).chat(model);
}

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
        scale: z.number().int().min(2).max(10),
      }),
    )
    .min(2)
    .max(30),
  endingTitle: z.string(),
  endingBody: z.string(),
  /** Conditional flow: when <condition on question ref> → jump to <target ref | end_thanks>. */
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
    model: chatModel(opts.env),
    schema: GenerationDraft,
    prompt: opts.prompt,
  });
  return {
    draft: result.object as GenerationDraft,
    tokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
  };
}

export { tool, generateText };
