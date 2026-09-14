import type { Bindings } from "../env.js";
import type { TokenUsage } from "./ai.js";

/**
 * Record one model call in `ai_generations`.
 *
 * There used to be two of these — this one, and a private `logAiUsage` inside
 * SessionDO — and they disagreed about which columns exist. The builder path
 * wrote `user_id` and `status` but no `session_id`; the conversation path wrote
 * `session_id` but neither of the others. So a conversation's rows could not be
 * attributed to a user, a builder row could not be traced to a session, and
 * every `status` the DO wrote was the default. One writer, every column, and
 * the two paths can no longer drift apart.
 *
 * ## Cost is not computed here
 *
 * `costUsd` arrives from OpenRouter's own response and is stored verbatim. It
 * was previously derived from a hardcoded rate table, which had gone stale
 * without anything being able to detect it: a month that cost $6.53 was
 * reported as $0.70. Nothing in this file multiplies anything.
 *
 * `null` is a real answer, and it is not zero. A call whose cost OpenRouter did
 * not report is written as unpriced and counted as such on the admin page,
 * because a spend figure that quietly treats unknown calls as free is the
 * failure we are climbing out of.
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
    sessionId?: string | null;
    formId?: string | null;
    /** `interview_turn` | `extraction` | `generate` | `edit` | `research` | … */
    kind: string;
    model: string;
    usage: TokenUsage;
    latencyMs?: number;
    status?: "ok" | "error";
  },
): Promise<void> {
  /**
   * A call that produced nothing still cost something.
   *
   * This used to return early on zero tokens, which sounds like a tidiness rule
   * and was actually the reason the admin page could report a 0% error rate
   * with a straight face: a turn that failed had no tokens to its name, so it
   * was never written down, so nothing failed. A row with no tokens and no cost
   * is still the record that a call happened and did not work.
   */
  if (row.usage.input + row.usage.output === 0 && row.status !== "error") return;
  try {
    await env.DB.prepare(
      `INSERT INTO ai_generations
         (id, organization_id, user_id, session_id, form_id, kind, provider, model,
          prompt_tokens, completion_tokens, cost_usd, generation_id, latency_ms, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'openrouter', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `ai_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        row.organizationId,
        row.userId ?? null,
        row.sessionId ?? null,
        row.formId ?? null,
        row.kind,
        row.model,
        row.usage.input,
        row.usage.output,
        row.usage.costUsd,
        row.usage.generationId,
        row.latencyMs ?? null,
        row.status ?? "ok",
        Date.now(),
      )
      .run();
  } catch (err) {
    console.error("ai_generation_log_failed", row.kind, err);
  }
}
