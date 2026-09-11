import { z } from "zod";
import type { Block } from "./blocks";

/**
 * Structured extraction targets for the interview agent.
 *
 * The deterministic NLU in SessionDO handles the block types where string
 * matching is exact and free: choices, yes/no, and the numeric scales. Those
 * must never go near a model — it would be slower, cost money and could
 * hallucinate an option that does not exist.
 *
 * Everything else (dates in prose, addresses, contact details, rankings…) is
 * unanswerable by typing without extraction, which is why those block types
 * currently force a widget. Each schema below is built FROM the block, so the
 * model's output is constrained by the same bounds `validateAnswer` enforces —
 * and its result is still passed through `validateAnswer` afterwards. The
 * extractor narrows; the validator remains the authority.
 */

/** Block types answered by exact matching — never sent to a model. */
export const DETERMINISTIC_TYPES = new Set<Block["type"]>([
  "welcome",
  "statement",
  "yes_no",
  "single_select",
  "multi_select",
  "dropdown",
  "picture_choice",
  "rating",
  "nps",
  "opinion_scale",
  "legal_consent",
]);

/** Block types whose answer arrives out-of-band (upload, payment, booking). */
export const OUT_OF_BAND_TYPES = new Set<Block["type"]>([
  "file_upload",
  "signature",
  "payment",
  "scheduling",
]);

export function needsExtraction(block: Block): boolean {
  return !DETERMINISTIC_TYPES.has(block.type) && !OUT_OF_BAND_TYPES.has(block.type);
}

/**
 * The envelope every extraction returns. `confident: false` routes to a
 * clarify turn rather than recording a guess — a wrong answer recorded
 * silently is far worse than one extra question.
 */
export interface ExtractionEnvelope<T> {
  value: T | null;
  confident: boolean;
  /** What the agent should say if it has to ask again. */
  note: string | null;
}

function envelope<T extends z.ZodTypeAny>(value: T) {
  // Every key must be present and required: providers running strict
  // structured output reject a schema whose `required` array omits any
  // property, so `note` is nullable rather than optional.
  return z.object({
    value: value.nullable(),
    confident: z.boolean(),
    note: z.string().max(300).nullable(),
  });
}

/**
 * Build the extraction schema for a block. Returns null when the block type is
 * handled deterministically or out-of-band.
 */
export function extractionSchema(block: Block): z.ZodTypeAny | null {
  switch (block.type) {
    case "short_text":
      return envelope(z.string().min(block.minLength).max(block.maxLength));

    case "long_text":
      return envelope(z.string().min(block.minLength).max(block.maxLength));

    case "email":
      return envelope(z.string().email());

    case "phone":
      // Loose here: `validateAnswer` canonicalizes to E.164 afterwards.
      return envelope(z.string().min(5).max(30));

    case "url":
      return envelope(z.string().min(3).max(500));

    case "number": {
      let n = z.number();
      if (block.min !== undefined) n = n.min(block.min);
      if (block.max !== undefined) n = n.max(block.max);
      return envelope(block.integerOnly ? n.int() : n);
    }

    case "date":
      // Always ISO `YYYY-MM-DD`, whatever the block's display format is; the
      // model resolves relative expressions ("next Friday") against a date
      // supplied in the prompt.
      return envelope(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

    case "ranking":
      return envelope(
        z
          .array(z.enum(block.items.map((i) => i.id) as [string, ...string[]]))
          .length(block.items.length),
      );

    case "matrix": {
      const cols = block.columns.map((c) => c.id) as [string, ...string[]];
      const cell = block.multiplePerRow ? z.array(z.enum(cols)).min(1) : z.enum(cols);
      return envelope(
        z.object(Object.fromEntries(block.rows.map((r) => [r.id, cell.optional()]))),
      );
    }

    case "contact_info":
    case "address": {
      const shape = Object.fromEntries(
        block.fields.map((f) => [f, z.string().max(300).optional()]),
      );
      return envelope(z.object(shape));
    }

    /**
     * A roster dictated in one breath — "Alice, alice@x.com, and Bob at
     * bob@y.com" — which is how anybody would answer this out loud and the only
     * way to answer it without touching the widget.
     *
     * Every column is optional even when the block requires it: the extractor's
     * job is to report what was said, and `validateAnswer` is what decides
     * whether a half-given entry is acceptable. Constraining it here would make
     * a partial dictation fail as a schema error, which is invisible, instead of
     * failing as "team member 2 — please enter an email address", which is not.
     */
    case "field_group": {
      const shape = Object.fromEntries(
        block.fields.map((f) => [
          f.key,
          (f.kind === "number"
            ? z.number()
            : f.kind === "yes_no"
              ? z.boolean()
              : f.kind === "single_select" && f.options.length > 0
                ? z.enum(f.options.map((o) => o.id) as [string, ...string[]])
                : z.string().max(500)
          ).optional(),
        ]),
      );
      /**
       * No `.max(block.maxEntries)`, for the same reason the columns are
       * optional: a cap here fails as a schema error, which is invisible, and
       * `validateAnswer` already fails it as "You can add up to 4 team
       * members", which is not (see `validators.ts`).
       *
       * It also costs what we cannot afford to spend. Google budgets `maxItems`
       * against the whole schema by MULTIPLYING it out — 10 fields × 20 entries
       * is 200, not 10 — and exceeding that budget rejects the request outright,
       * before the model. That is not hypothetical: the same defect took form
       * generation down in production when Google tightened the budget under a
       * schema that had been measured against it. This is the respondent's own
       * path, so the failure would have been an author's live form quietly
       * refusing to understand answers, and only for the forms configured near
       * the ceiling. The cap the author set is enforced either way; it just
       * isn't spent here.
       */
      return envelope(z.array(z.object(shape)));
    }

    default:
      return null;
  }
}

/**
 * Instruction text appended to the extractor prompt for this block. Kept beside
 * the schema so the two never drift.
 */
export function extractionGuidance(block: Block, todayIso: string): string {
  switch (block.type) {
    case "date":
      return `Return an ISO date (YYYY-MM-DD). Today is ${todayIso}; resolve relative expressions like "next Friday" or "in two weeks" against it. If the respondent gave an ambiguous date (e.g. "3/4" without a year or locale), set confident=false.`;
    case "number":
      // "about a dozen" is unambiguous and should extract to 12. Only a genuine
      // range ("50 to 60") is unresolvable — a hedge word in front of one
      // definite quantity is not.
      return `Return a number only. Strip currency symbols, thousands separators and units. Resolve written numbers and common quantities ("a dozen" is 12, "a couple" is 2, "fifty" is 50). Hedge words like "about", "roughly" or "~" do not make a value ambiguous — extract the number they hedge. Set confident=false only for a true range ("50 to 60"), a comparison ("more than 100"), or no number at all.`;
    case "ranking":
      return `Return every item id exactly once, best first. If the respondent ranked only some items, set confident=false.`;
    case "matrix":
      return `Return one column id per row the respondent actually answered. Do not invent answers for rows they skipped.`;
    case "contact_info":
    case "address":
      return `Fill only the fields the respondent actually supplied. Leave the rest out rather than guessing.`;
    case "field_group": {
      const columns = block.fields
        .map((f) => {
          const opts =
            f.kind === "single_select" && f.options.length > 0
              ? ` (one of: ${f.options.map((o) => `${o.id} = ${o.label}`).join(", ")})`
              : "";
          return `${f.key} — ${f.label}${opts}`;
        })
        .join("; ");
      return (
        `Return one object per ${block.itemLabel.toLowerCase()}, in the order they were given, with these keys: ${columns}. ` +
        `Leave a key out when it was not supplied rather than guessing it, and never invent an extra ${block.itemLabel.toLowerCase()} to reach a count.`
      );
    }
    case "email":
      return `Return the email address exactly as written, lowercased. If they described it ("name at company dot com"), reconstruct it and set confident=true only if unambiguous.`;
    case "phone":
      return `Return the phone number with its country code if given. Do not invent a country code.`;
    case "url":
      return `Return the URL. Add https:// only if no scheme was given.`;
    case "long_text":
    case "short_text":
      return `Return the respondent's answer verbatim, trimmed. Do not summarize, correct or rephrase it.`;
    default:
      return `Return the value the respondent supplied. Never invent one.`;
  }
}
