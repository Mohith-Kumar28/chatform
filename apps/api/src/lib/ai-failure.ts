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

/**
 * An HTTP status, wherever this error keeps one.
 *
 * `code` too: an error OpenRouter sends mid-stream arrives as the stream's
 * `error` part, a plain `{ code: 402, message }` rather than an `Error`, and
 * reading only `status` filed every one of those as `unknown`.
 */
function statusOf(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { statusCode?: unknown; status?: unknown; code?: unknown };
  for (const s of [e.statusCode, e.status, e.code]) {
    if (typeof s === "number" && s >= 400 && s < 600) return s;
  }
  return null;
}

/** Words for any thrown value. A plain object stringifies to "[object Object]", which says nothing. */
function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** The error itself, then whatever it wraps, outermost first. Bounded. */
function chain(err: unknown): unknown[] {
  const out: unknown[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 6 && cur; i++) {
    out.push(cur);
    if (typeof cur !== "object") break;
    const c = cur as { lastError?: unknown; cause?: unknown; error?: unknown };
    // `error`: OpenRouter's stream part nests the provider's own `{ code, message }` one level down.
    cur = c.lastError ?? c.cause ?? (c.error && typeof c.error === "object" ? c.error : undefined);
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
  const deepest = [...links].reverse().find((e) => e instanceof Error || (e && typeof e === "object" && "message" in e));
  const message = messageOf(deepest ?? err).slice(0, MAX_MESSAGE);
  return { code, message };
}
