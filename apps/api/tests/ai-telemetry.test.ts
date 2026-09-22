import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { z } from "zod";
import { MODELS, NO_USAGE, addUsage, reportedUsage, telemetry, type TokenUsage } from "../src/lib/ai.js";
import { RATES_KV_KEY, forgetRates, splitCost, type ModelRates } from "../src/lib/ai-cost-split.js";
import { logAiGeneration } from "../src/lib/ai-usage.js";
import type { Bindings } from "../src/env.js";
import { applySchema } from "./helpers.js";

const ENV = { ENVIRONMENT: "production", CF_VERSION_METADATA: { id: "ver_123" } };

describe("telemetry", () => {
  it("names the account as the user, the conversation as the session, and the feature in the trace", () => {
    const opts = telemetry(ENV, { openrouter: { reasoning: { effort: "minimal" } } }, {
      kind: "interview_turn",
      organizationId: "org_abc",
      sessionId: "chs_123",
      formId: "frm_9",
    });
    expect(opts.openrouter).toEqual({
      reasoning: { effort: "minimal" },
      user: "org_abc",
      session_id: "chs_123",
      trace: {
        trace_name: "interview_turn",
        generation_name: "interview_turn",
        environment: "production",
        release: "ver_123",
        feature: "interview_turn",
        organization_id: "org_abc",
        form_id: "frm_9",
        chat_session_id: "chs_123",
      },
    });
  });

  it("groups builder calls under the form, and one action under one trace", () => {
    const trace = { traceId: "t_1", traceName: "generate_form", userId: "usr_1" };
    const research = telemetry(ENV, {}, { kind: "research", organizationId: "org_abc", formId: "frm_9", ...trace });
    const draft = telemetry(ENV, {}, {
      kind: "generate_stream",
      organizationId: "org_abc",
      formId: "frm_9",
      ...trace,
      model: MODELS.generationFallback,
    });
    for (const o of [research, draft]) {
      expect(o.openrouter?.session_id).toBe("form:frm_9");
      expect(o.openrouter?.trace).toMatchObject({ trace_id: "t_1", trace_name: "generate_form", user_id: "usr_1" });
    }
    expect(research.openrouter?.trace).toMatchObject({ generation_name: "research" });
    expect(draft.openrouter?.trace).toMatchObject({ generation_name: "generate_stream", model_role: "fallback" });
    expect(research.openrouter?.trace).not.toHaveProperty("model_role");
  });

  it("still labels a call with no account, and never sends an empty id", () => {
    const opts = telemetry({ ENVIRONMENT: "script" }, {}, { kind: "schema_probe", organizationId: "" });
    expect(opts.openrouter).not.toHaveProperty("user");
    expect(opts.openrouter).not.toHaveProperty("session_id");
    expect(opts.openrouter?.trace).toEqual({
      trace_name: "schema_probe",
      generation_name: "schema_probe",
      environment: "script",
      feature: "schema_probe",
    });
  });

  it("reaches OpenRouter in the request body, where Broadcast reads it", async () => {
    let body: Record<string, unknown> = {};
    const or = createOpenRouter({
      apiKey: "test",
      fetch: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify({
            id: "gen-1",
            model: "m",
            choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, cost: 0.0001 },
          }),
          { headers: { "content-type": "application/json" } },
        );
      },
    });
    await generateObject({
      model: or.chat("google/gemini-3.7-flash"),
      schema: z.object({ ok: z.boolean() }),
      prompt: "x",
      providerOptions: telemetry(ENV, {}, { kind: "clarify", organizationId: "org_abc", traceId: "t_9" }),
    });
    expect(body.user).toBe("org_abc");
    expect(body.trace).toMatchObject({ trace_id: "t_9", feature: "clarify", environment: "production" });
  });
});

describe("reportedUsage", () => {
  it("keeps the token detail and prices the tool round trips from the steps' own costs", () => {
    const step = (cost: number, toolCalls: number) => ({
      providerMetadata: { openrouter: { usage: { cost } } },
      toolCalls: Array.from({ length: toolCalls }, () => ({})),
    });
    const u = reportedUsage({
      usage: {
        inputTokens: 3000,
        outputTokens: 400,
        inputTokenDetails: { cacheReadTokens: 1000, cacheWriteTokens: 0 },
        outputTokenDetails: { reasoningTokens: 150 },
      },
      steps: [step(0.001, 1), step(0.0006, 0)],
      response: { id: "gen-2" },
    });
    expect(u).toMatchObject({
      input: 3000,
      output: 400,
      cacheReadTokens: 1000,
      reasoningTokens: 150,
      steps: 2,
      toolCalls: 1,
      generationId: "gen-2",
    });
    expect(u.costUsd).toBeCloseTo(0.0016, 10);
    expect(u.toolStepsCostUsd).toBeCloseTo(0.0006, 10);
  });

  it("adds two calls' detail, and an unreported detail stays unknown", () => {
    const a: TokenUsage = { input: 10, output: 5, costUsd: 0.1, generationId: null, reasoningTokens: 2, steps: 1, toolCalls: 0, toolStepsCostUsd: 0 };
    const b: TokenUsage = { input: 10, output: 5, costUsd: 0.2, generationId: "g", steps: 2, toolCalls: 1, toolStepsCostUsd: 0.05 };
    const sum = addUsage(addUsage(NO_USAGE, a), b);
    expect(sum.reasoningTokens).toBeUndefined();
    expect(sum).toMatchObject({ steps: 3, toolCalls: 1 });
    expect(sum.toolStepsCostUsd).toBeCloseTo(0.05, 10);
    expect(addUsage(NO_USAGE, a).reasoningTokens).toBe(2);
  });
});

describe("splitCost", () => {
  const rates: ModelRates = { prompt: 1e-6, completion: 4e-6, inputCacheRead: 1e-7, internalReasoning: 4e-6 };
  const usage = (costUsd: number | null): TokenUsage => ({
    input: 1000,
    output: 100,
    costUsd,
    generationId: null,
    cacheReadTokens: 400,
    reasoningTokens: 40,
  });
  const sum = (s: NonNullable<ReturnType<typeof splitCost>>) => s.input + s.cached + s.output + s.reasoning + s.other;

  it("splits by token type, and puts what tokens do not explain under other", () => {
    // 600 fresh * 1e-6 + 400 cached * 1e-7 + 60 reply * 4e-6 + 40 thinking * 4e-6 = 0.00104
    const s = splitCost(usage(0.01504), rates)!;
    expect(s.input).toBeCloseTo(0.0006, 12);
    expect(s.cached).toBeCloseTo(0.00004, 12);
    expect(s.output).toBeCloseTo(0.00024, 12);
    expect(s.reasoning).toBeCloseTo(0.00016, 12);
    expect(s.other).toBeCloseTo(0.014, 12);
    expect(sum(s)).toBeCloseTo(0.01504, 12);
  });

  it("scales down rather than inventing a negative fee when the charge is below list price", () => {
    const s = splitCost(usage(0.00052), rates)!;
    expect(s.other).toBe(0);
    expect(sum(s)).toBeCloseTo(0.00052, 12);
    expect(s.input / s.output).toBeCloseTo(0.0006 / 0.00024, 6);
  });

  it("refuses to split an unpriced call or one with no rates", () => {
    expect(splitCost(usage(null), rates)).toBeNull();
    expect(splitCost(usage(0.001), null)).toBeNull();
  });
});

describe("logAiGeneration", () => {
  beforeAll(applySchema);
  beforeEach(forgetRates);

  it("stores the token detail and the split, weighted by the cached price list", async () => {
    const model = "test/model-split";
    await env.KV_CONFIG.put(RATES_KV_KEY, JSON.stringify({ [model]: { prompt: 1e-6, completion: 4e-6 } }));
    await logAiGeneration(env as unknown as Bindings, {
      organizationId: "org_split",
      kind: "research",
      model,
      usage: { input: 1000, output: 100, costUsd: 0.0154, generationId: "gen-s", reasoningTokens: 0, steps: 1, toolCalls: 0, toolStepsCostUsd: 0 },
    });
    const row = await env.DB.prepare(
      `SELECT cost_usd, cost_input_usd, cost_output_usd, cost_other_usd, reasoning_tokens, steps, cost_tool_steps_usd
         FROM ai_generations WHERE generation_id = 'gen-s'`,
    ).first<Record<string, number>>();
    expect(row!.cost_usd).toBeCloseTo(0.0154, 10);
    expect(row!.cost_input_usd).toBeCloseTo(0.001, 10);
    expect(row!.cost_output_usd).toBeCloseTo(0.0004, 10);
    expect(row!.cost_other_usd).toBeCloseTo(0.014, 10);
    expect(row).toMatchObject({ reasoning_tokens: 0, steps: 1, cost_tool_steps_usd: 0 });
    await env.KV_CONFIG.delete(RATES_KV_KEY);
  });

  it("leaves the split empty when there is no price to weight it by", async () => {
    await logAiGeneration(env as unknown as Bindings, {
      organizationId: "org_split",
      kind: "research",
      model: "test/model-unknown",
      usage: { input: 10, output: 1, costUsd: 0.001, generationId: "gen-u" },
    });
    const row = await env.DB.prepare(
      `SELECT cost_usd, cost_input_usd, cost_other_usd FROM ai_generations WHERE generation_id = 'gen-u'`,
    ).first<Record<string, number | null>>();
    expect(row).toMatchObject({ cost_usd: 0.001, cost_input_usd: null, cost_other_usd: null });
  });
});
