import type { Bindings } from "../env.js";
import { costUsdMicro } from "./ai-pricing.js";
import type { TokenUsage } from "./ai.js";

/**
 * Record one builder-side model call in `ai_generations`.
 *
 * The conversation path has written this table since it was created — the session
 * object logs every turn. The builder path never did: form generation, streaming
 * generation and the edit proposal all called `meter()` to spend the org's
 * allowance and then wrote nothing, so the most expensive single call in the
 * product (a full form draft, tens of thousands of output tokens) left no trace
 * anywhere it could be attributed, priced or compared between models.
 *
 * The consequence was quiet: `ai_generations` looked complete, and every cost
 * figure derived from it silently omitted generation entirely.
 *
 * Never throws. Losing a usage row must not fail a generation the author is
 * waiting on — the meter has already been spent by then, so the allowance stays
 * correct even when this does not.
 */
export async function logAiGeneration(
  env: Bindings,
  row: {
    organizationId: string;
    userId?: string | null;
    formId?: string | null;
    /** `generate` | `generate_stream` | `edit` | `research` */
    kind: string;
    model: string;
    usage: TokenUsage;
    latencyMs?: number;
    status?: "ok" | "error";
  },
): Promise<void> {
  if (row.usage.input + row.usage.output === 0) return;
  try {
    await env.DB.prepare(
      `INSERT INTO ai_generations
         (id, organization_id, user_id, form_id, kind, provider, model,
          prompt_tokens, completion_tokens, cost_usd_micro, latency_ms, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'openrouter', ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `ai_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        row.organizationId,
        row.userId ?? null,
        row.formId ?? null,
        row.kind,
        row.model,
        row.usage.input,
        row.usage.output,
        costUsdMicro(row.model, row.usage.input, row.usage.output),
        row.latencyMs ?? null,
        row.status ?? "ok",
        Date.now(),
      )
      .run();
  } catch (err) {
    console.error("ai_generation_log_failed", row.kind, err);
  }
}
