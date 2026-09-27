/**
 * Why a model call failed, in words an analytics page can group by.
 *
 * `ai_generations.status = 'error'` said *that* a call failed and nothing
 * about why, so an exhausted OpenRouter balance and a Gemini outage looked the
 * same on every dashboard. The respondent never sees either — every call in
 * the conversation falls back to the author's own wording — which is exactly
 * why the reason has to be written down somewhere: nothing else will show it.
 *
 * Duck-typed rather than `instanceof`, because the AI SDK wraps the provider's
 * error in `RetryError` (`lastError`) or `NoOutputGeneratedError` (`cause`),
 * and a raw `fetch` (Jev) reports a bare status.
 */
export type AiFailureCode =
  | "credits_exhausted"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "no_output"
  | "unknown";

export interface AiFailure {
  code: AiFailureCode;
  message: string;
}

const MAX_MESSAGE = 300;

export function codeForStatus(status: number): AiFailureCode {
  if (status === 402) return "credits_exhausted";
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "provider_error";
}

function statusOf(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const s = (err as { statusCode?: unknown; status?: unknown }).statusCode ?? (err as { status?: unknown }).status;
  return typeof s === "number" ? s : null;
}

/** The error itself, then whatever it wraps, outermost first. Bounded. */
function chain(err: unknown): unknown[] {
  const out: unknown[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    out.push(cur);
    if (typeof cur !== "object") break;
    const c = cur as { lastError?: unknown; cause?: unknown };
    cur = c.lastError ?? c.cause;
  }
  return out;
}

export function classifyAiError(err: unknown): AiFailure {
  const links = chain(err);
  let code: AiFailureCode = "unknown";
  for (const e of links) {
    const status = statusOf(e);
    if (status !== null) {
      code = codeForStatus(status);
      break;
    }
    const name = e instanceof Error ? e.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      code = "timeout";
      break;
    }
    if (name === "AI_NoOutputGeneratedError" && code === "unknown") code = "no_output";
  }
  // The innermost message is the provider's own words ("Insufficient credits"),
  // which is the one worth reading; the wrappers only say that it failed.
  const deepest = [...links].reverse().find((e) => e instanceof Error) as Error | undefined;
  const message = (deepest?.message ?? String(err)).slice(0, MAX_MESSAGE);
  return { code, message };
}
