import type { Bindings } from "../env.js";
import { APP_HEADERS, MODELS, telemetry, type AiCallContext, type TokenUsage } from "./ai.js";

/**
 * TypeSafe's Jev, through OpenRouter: a classifier, not a chat model.
 *
 * It takes a `state` and a map of typed questions and returns, for each, a
 * probability (`noul`) or a pick from options we wrote (`choice`). It cannot
 * produce text, so it cannot invent an answer, which is exactly why it is safe
 * to put in front of `record()`. Every value it helps choose was built in code
 * and still goes through `validateAnswer`.
 *
 * It is not a chat completion, so neither the AI SDK nor the OpenRouter provider
 * can call it. OpenRouter serves it on its own route, `/api/v1/systemone`, with
 * the same key, the same billing and the same Broadcast fields as everything
 * else. The route is absent from `/api/v1/models`, whose list holds only text
 * models; its endpoints page is `/api/v1/models/typesafe/jev-1.13/endpoints`.
 */

const SYSTEM_ONE_URL = "https://openrouter.ai/api/v1/systemone";

/**
 * Jev answers in well under a second. Past this the respondent is waiting on a
 * classifier whose only job was to save money, so the gate gives up and the
 * turn goes the way it would have gone without it.
 */
export const JEV_TIMEOUT_MS = 2_500;

export type JevQuestion =
  | { type: "noul"; instructions: unknown; criteria?: { true?: unknown; false?: unknown } }
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };

export interface JevResult {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: TokenUsage;
  latencyMs: number;
}

export type JevEnv = Pick<Bindings, "OPENROUTER_API_KEY" | "ENVIRONMENT" | "CF_VERSION_METADATA">;

export function jevAvailable(env: Pick<Bindings, "OPENROUTER_API_KEY">): boolean {
  return typeof env.OPENROUTER_API_KEY === "string" && env.OPENROUTER_API_KEY.length > 0;
}

/**
 * One call. Null on anything but a well-formed answer to every question asked.
 *
 * No retries. The caller has a fallback that is always correct (the agent turn,
 * or asking again), and retrying an overloaded provider would spend the latency
 * we are here to save.
 */
export async function askJev(
  env: JevEnv,
  state: unknown,
  questions: Record<string, JevQuestion>,
  ctx: Omit<AiCallContext, "kind">,
  opts: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<JevResult | null> {
  if (!jevAvailable(env)) return null;
  const started = Date.now();
  // The same `user`, `session_id` and `trace` every chat call sends, so Langfuse
  // shows the gate inside the conversation it ran in.
  const attribution = telemetry(env, {}, { ...ctx, kind: "answer_gate" }).openrouter ?? {};
  try {
    const res = await (opts.fetch ?? fetch)(SYSTEM_ONE_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "content-type": "application/json", ...APP_HEADERS },
      body: JSON.stringify({ ...attribution, model: MODELS.answerGate, state, questions }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? JEV_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("jev_failed", { status: res.status, body: (await res.text().catch(() => "")).slice(0, 300) });
      return null;
    }
    const body = (await res.json()) as {
      id?: unknown;
      model?: unknown;
      answers?: Record<string, JevAnswer>;
      usage?: { input_tokens?: unknown; output_tokens?: unknown; cost?: unknown };
    };
    const answers = body.answers ?? {};
    // A missing or mistyped answer is a failed call, not a "no".
    for (const [id, q] of Object.entries(questions)) {
      const a = answers[id];
      if (!a || a.type !== q.type) return null;
      if (a.type === "noul" && typeof a.noul !== "number") return null;
      if (a.type === "choice" && (typeof a.choice !== "string" || typeof a.confidence !== "number")) return null;
    }
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      model: typeof body.model === "string" ? body.model : MODELS.answerGate,
      answers,
      usage: {
        input: num(body.usage?.input_tokens) ?? 0,
        output: num(body.usage?.output_tokens) ?? 0,
        // OpenRouter's own figure, as for every other call. See `TokenUsage.costUsd`.
        costUsd: num(body.usage?.cost),
        generationId: typeof body.id === "string" ? body.id : null,
      },
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    console.error("jev_failed", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
