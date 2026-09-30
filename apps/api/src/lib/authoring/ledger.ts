import type { Bindings } from "../../env.js";
import { meter } from "../entitlements.js";
import { logAiGeneration } from "../ai-usage.js";
import type { TokenUsage } from "../ai.js";

/**
 * Every model call one authoring action made, and what it cost.
 *
 * One action is rarely one call: reading links, drafting, a retry, a repair,
 * a review. Each is recorded as its own row with the model that actually
 * answered (a schema fallback is logged as the fallback, a research call on
 * the research tier), and the author's allowance is charged once for the
 * whole action, only when it produced something they can use.
 */
export class Ledger {
  private rows: { kind: string; model: string; usage: TokenUsage }[] = [];
  private logged = 0;

  /** Every call is recorded, a zero-token one included: the admin page counts unreported usage as unpriced. */
  add(kind: string, model: string, usage: TokenUsage): void {
    this.rows.push({ kind, model, usage });
  }

  get tokens(): number {
    return this.rows.reduce((n, r) => n + r.usage.input + r.usage.output, 0);
  }

  /** Rename rows whose call turned out to serve another purpose (an edit that asked a question instead). */
  relabel(from: string, to: string): void {
    for (const row of this.rows) if (row.kind === from) row.kind = to;
  }

  /**
   * Charge the allowance: tokens always, and one generation when the action
   * produced something (a form, an applied-ready edit). An action that failed
   * upstream or changed nothing is logged but not charged a generation.
   */
  async meter(env: Bindings, organizationId: string | null | undefined, opts: { generation: boolean }): Promise<void> {
    if (!organizationId) return;
    if (opts.generation) await meter(env, organizationId, "ai_generations");
    if (this.tokens > 0) await meter(env, organizationId, "ai_tokens", this.tokens);
  }

  /** Write the cost rows not yet written. Safe to call on every way out. */
  async log(
    env: Bindings,
    ctx: { organizationId: string | null | undefined; userId?: string | null; formId?: string | null; latencyMs: number },
  ): Promise<void> {
    if (!ctx.organizationId) return;
    const pending = this.rows.slice(this.logged);
    this.logged = this.rows.length;
    for (const row of pending) {
      await logAiGeneration(env, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        formId: ctx.formId ?? null,
        kind: row.kind,
        model: row.model,
        usage: row.usage,
        latencyMs: ctx.latencyMs,
      });
    }
  }
}
