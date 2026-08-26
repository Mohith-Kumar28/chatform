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
