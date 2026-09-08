/**
 * Keeping tool results small enough to be worth reading.
 *
 * MCP token cost has two sinks: the `tools/list` menu, which the curated/passthrough
 * split addresses, and result payloads, which this does. A form's response list is
 * unbounded and a single long-answer row can be kilobytes, so a tool that returned
 * the API's own JSON verbatim would spend an agent's context on one call and leave
 * nothing for the reasoning the user actually asked for.
 *
 * Everything here errs toward *saying* what it withheld. A silently truncated
 * answer is worse than a short one, because the agent will quote it as complete.
 */

/** Free text longer than this is cut, with a flag saying so. */
const TEXT_CAP = 500;

/** Tool page size. Smaller than the API's own default of 25, deliberately. */
export const DEFAULT_PAGE = 10;
export const MAX_PAGE = 50;

export function clampLimit(requested: number | undefined): number {
  if (requested === undefined) return DEFAULT_PAGE;
  return Math.max(1, Math.min(MAX_PAGE, Math.trunc(requested)));
}

export interface Truncation {
  truncated: true;
  original_length: number;
}

/** Cut a long string, and admit it in-band so the agent cannot mistake it for whole. */
export function capText(value: unknown): unknown {
  if (typeof value !== "string" || value.length <= TEXT_CAP) return value;
  return {
    value: `${value.slice(0, TEXT_CAP)}…`,
    truncated: true,
    original_length: value.length,
  } satisfies { value: string } & Truncation;
}

/** Apply `capText` through an answer map, leaving non-text answers alone. */
export function capAnswers(answers: unknown): unknown {
  if (answers === null || typeof answers !== "object") return answers;
  if (Array.isArray(answers)) return answers.map(capText);
  const out: Record<string, unknown> = {};
  for (const [ref, value] of Object.entries(answers as Record<string, unknown>)) {
    out[ref] = Array.isArray(value) ? value.map(capText) : capText(value);
  }
  return out;
}

/**
 * The fields of a response row a tool returns by default.
 *
 * Enough to decide which rows matter — who, when, how far they got — without the
 * answers, which are the expensive part and are opt-in through `include_answers`.
 */
const RESPONSE_SUMMARY_FIELDS = [
  "id",
  "object",
  "form_id",
  "status",
  "source",
  "is_test",
  "started_at",
  "updated_at",
  "completed_at",
  "ending_ref",
  "answer_count",
] as const;

export function projectResponseRow(row: unknown, includeAnswers: boolean): unknown {
  if (row === null || typeof row !== "object") return row;
  const src = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of RESPONSE_SUMMARY_FIELDS) {
    if (field in src) out[field] = src[field];
  }
  // Preserve anything the API added that we have not thought of, minus the heavy
  // parts — a tool that silently drops a new field is a tool that goes stale.
  for (const [k, v] of Object.entries(src)) {
    if (k in out || k === "answers" || k === "meta") continue;
    out[k] = capText(v);
  }
  if (includeAnswers && "answers" in src) out.answers = capAnswers(src.answers);
  return out;
}

/**
 * A tool result, as JSON in a text block.
 *
 * Deliberately not `structuredContent`: the SDK only expects that field when the
 * tool also declares an `outputSchema`, and sending it without one risks the host
 * rejecting the result. Declaring output schemas for all eighteen tools is worth
 * doing — ChatGPT's compatibility schema asks for it — but it is a separate pass,
 * not something to half-do here.
 */
export function jsonResult(payload: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

/** A failed tool call. `isError` is what tells the host to show it as a failure. */
export function errorResult(message: string): {
  content: { type: "text"; text: string }[];
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}
