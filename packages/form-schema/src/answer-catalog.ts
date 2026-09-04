import { BLOCK_TYPES, type BlockType, type BlockInput, type Block } from "./blocks";
import type { AnswerValue } from "./answers";
import type { ValidationCode } from "./engine/validators";

/**
 * What every block type accepts and what it stores, exhaustively.
 *
 * This is the one part of the answer contract that was not expressed as data.
 * It lived inside a `switch` in `validators.ts`, while `AnswerValue` is a loose
 * union across all 26 types — so an integrator asking "what do I send for a
 * matrix" had nowhere to look, and any documentation of it would be prose that
 * rots.
 *
 * A `Record<BlockType, …>` for the same reason `BLOCK_CATALOG` is one: adding a
 * type to `BLOCK_TYPES` fails to compile until its answer is described here.
 * `BLOCK_CATALOG`'s own comment records what happened the last time two
 * hand-written lists were allowed to drift — `payment` became unreachable. The
 * failure mode here would be worse, because the reader is an integrator whose
 * POST returns 422 and whose documentation says it should not.
 *
 * The examples are not illustrative. `tests/answer-catalog.test.ts` runs every
 * one of them through the real `validateAnswer`, asserts the canonical value it
 * returns, and asserts each counter-example fails with exactly the code claimed
 * here — so the documentation cannot describe behaviour the engine does not
 * have.
 */

export interface AnswerExample {
  value: unknown;
  /** What `validateAnswer` returns and what gets stored, when it differs from `value`. */
  canonical?: AnswerValue;
  note?: string;
}

export interface AnswerCounterExample {
  value: unknown;
  code: ValidationCode;
  note?: string;
}

export interface AnswerCatalogEntry {
  /** The wire shape in one line, for someone reading the block reference. */
  shape: string;
  /** The TypeScript type a caller sends, as source text for the docs page. */
  tsType: string;
  /** A representative block of this type. Every example below is checked against it. */
  block: BlockInput;
  /** Each of these MUST validate. */
  examples: readonly AnswerExample[];
  /** Each of these MUST fail, with exactly this code. */
  counterExamples: readonly AnswerCounterExample[];
  /** Every code this type can emit. A superset of the counter-examples' codes. */
  codes: readonly ValidationCode[];
}

const CONSENT_TEXT = "I agree to receive product updates.";

export const ANSWER_CATALOG: Record<BlockType, AnswerCatalogEntry> = {
  welcome: {
    shape: "No answer. The respondent advances with an action.",
    tsType: "never",
    block: { id: "blk_welcome1", ref: "welcome", type: "welcome", title: "Hi there" },
    examples: [{ value: undefined, note: "advancing, not answering" }],
    counterExamples: [],
    codes: [],
  },
  statement: {
    shape: "No answer. Says something and moves on.",
    tsType: "never",
    block: { id: "blk_stmt0001", ref: "s_intro", type: "statement", title: "A quick note" },
    examples: [{ value: undefined }],
    counterExamples: [],
    codes: [],
  },

  short_text: {
    shape: "One line of text, trimmed.",
    tsType: "string",
    block: {
      id: "blk_short001", ref: "q_company", type: "short_text", title: "Company name?",
      required: true, minLength: 2, maxLength: 40,
    },
    examples: [{ value: "  Northwind  ", canonical: "Northwind", note: "trimmed before storage" }],
    counterExamples: [
      { value: "N", code: "too_short" },
      { value: "x".repeat(41), code: "too_long" },
      { value: 42, code: "type" },
      { value: "", code: "required" },
    ],
    codes: ["required", "type", "too_short", "too_long", "pattern"],
  },
  long_text: {
    shape: "A paragraph, trimmed.",
    tsType: "string",
    block: {
      id: "blk_long0001", ref: "q_about", type: "long_text", title: "Tell us more",
      required: true, minLength: 5, maxLength: 200,
    },
    examples: [{ value: " We build tools. ", canonical: "We build tools." }],
    counterExamples: [
      { value: "hi", code: "too_short" },
      { value: "x".repeat(201), code: "too_long" },
      { value: [], code: "type" },
    ],
    codes: ["required", "type", "too_short", "too_long"],
  },
  email: {
    shape: "An email address, lowercased and trimmed.",
    tsType: "string",
    block: {
      id: "blk_email001", ref: "q_email", type: "email", title: "Work email?",
      required: true, businessOnly: true,
    },
    examples: [{ value: "  Maya@Northwind.CO ", canonical: "maya@northwind.co" }],
    counterExamples: [
      { value: "maya", code: "invalid_email" },
      { value: "maya@gmail.com", code: "freemail", note: "businessOnly rejects free providers" },
      { value: 1, code: "type" },
      { value: "", code: "required" },
    ],
    codes: ["required", "type", "invalid_email", "freemail"],
  },
  phone: {
    shape: "A phone number in E.164 (`+<country><number>`).",
    tsType: "string",
    block: {
      id: "blk_phone001", ref: "q_phone", type: "phone", title: "Phone?",
      required: true, countryHint: "IN",
    },
    examples: [
      { value: "+91 98123 45678", canonical: "+919812345678", note: "spaces and punctuation removed" },
      { value: "9812345678", canonical: "+919812345678", note: "countryHint supplies the dialling code" },
    ],
    counterExamples: [
      { value: "not a phone", code: "invalid_phone" },
      { value: 9812345678, code: "type" },
    ],
    codes: ["required", "type", "invalid_phone"],
  },
  url: {
    shape: "A web address. `https://` is added when the scheme is missing.",
    tsType: "string",
    block: { id: "blk_url00001", ref: "q_site", type: "url", title: "Website?", required: true },
    examples: [{ value: "northwind.co", canonical: "https://northwind.co" }],
    counterExamples: [
      { value: "not a url", code: "invalid_url" },
      { value: 5, code: "type" },
    ],
    codes: ["required", "type", "invalid_url"],
  },
  number: {
    shape: "A number, within the block's bounds.",
    tsType: "number",
    block: {
      id: "blk_num00001", ref: "q_team", type: "number", title: "Team size?",
      required: true, min: 1, max: 500, integerOnly: true,
    },
    examples: [
      { value: 12, canonical: 12 },
      { value: "1,200".replace("1,200", "12"), canonical: 12, note: "numeric strings are coerced" },
    ],
    counterExamples: [
      { value: 0, code: "too_small" },
      { value: 501, code: "too_large" },
      { value: 1.5, code: "not_integer" },
      { value: "twelve", code: "type" },
    ],
    codes: ["required", "type", "not_integer", "too_small", "too_large"],
  },
  date: {
    shape: "A date as `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm` when the block includes a time.",
    tsType: "string",
    block: {
      id: "blk_date0001", ref: "q_start", type: "date", title: "Start date?",
      required: true, min: "2026-01-01", max: "2026-12-31",
    },
    examples: [{ value: "2026-06-01", canonical: "2026-06-01" }],
    counterExamples: [
      { value: "01/06/2026", code: "invalid_date", note: "always ISO on the wire, whatever the display format" },
      { value: "2025-12-31", code: "too_early" },
      { value: "2027-01-01", code: "too_late" },
      { value: "2026-06-01T10:00", code: "invalid_date", note: "a time is only accepted when the block asks for one" },
      { value: 20260601, code: "type" },
    ],
    codes: [
      "required", "type", "invalid_date", "invalid_time", "time_out_of_range",
      "past_date", "too_early", "too_late",
    ],
  },
  yes_no: {
    shape: "A boolean.",
    tsType: "boolean",
    block: { id: "blk_yesno001", ref: "q_agree", type: "yes_no", title: "Interested?", required: true },
    examples: [
      { value: true, canonical: true },
      { value: "yes", canonical: true, note: "the words are accepted too" },
      { value: "no", canonical: false },
    ],
    counterExamples: [{ value: "maybe", code: "type" }],
    codes: ["required", "type"],
  },

  single_select: {
    shape: "The chosen option's id.",
    tsType: "string",
    block: {
      id: "blk_single01", ref: "q_role", type: "single_select", title: "Your role?", required: true,
      options: [
        { id: "opt_founder1", label: "Founder" },
        { id: "opt_dev00001", label: "Developer" },
      ],
    },
    examples: [
      { value: "opt_founder1", canonical: "opt_founder1" },
      { value: "Founder", canonical: "opt_founder1", note: "a label resolves to its id" },
    ],
    counterExamples: [{ value: "opt_nope", code: "invalid_option" }],
    codes: ["required", "invalid_option"],
  },
  multi_select: {
    shape: "An array of option ids, deduplicated.",
    tsType: "string[]",
    block: {
      id: "blk_multi001", ref: "q_tools", type: "multi_select", title: "Which tools?", required: true,
      minSelections: 1, maxSelections: 2,
      options: [
        { id: "opt_slack001", label: "Slack" },
        { id: "opt_notion01", label: "Notion" },
        { id: "opt_linear01", label: "Linear" },
      ],
    },
    examples: [
      { value: ["opt_slack001"], canonical: ["opt_slack001"] },
      { value: ["Slack", "opt_slack001"], canonical: ["opt_slack001"], note: "duplicates collapse" },
    ],
    counterExamples: [
      { value: ["opt_slack001", "opt_notion01", "opt_linear01"], code: "too_many" },
      { value: ["opt_nope"], code: "invalid_option" },
    ],
    codes: ["required", "invalid_option", "too_few", "too_many"],
  },
  dropdown: {
    shape: "The chosen option's id.",
    tsType: "string",
    block: {
      id: "blk_drop0001", ref: "q_country", type: "dropdown", title: "Country?", required: true,
      options: [
        { id: "opt_in000001", label: "India" },
        { id: "opt_us000001", label: "United States" },
      ],
    },
    examples: [{ value: "India", canonical: "opt_in000001" }],
    counterExamples: [{ value: "Atlantis", code: "invalid_option" }],
    codes: ["required", "invalid_option"],
  },
  picture_choice: {
    shape: "An array of option ids — one, unless the block allows several.",
    tsType: "string[]",
    block: {
      id: "blk_pic00001", ref: "q_style", type: "picture_choice", title: "Pick a style", required: true,
      options: [
        { id: "opt_light001", label: "Light" },
        { id: "opt_dark0001", label: "Dark" },
      ],
    },
    examples: [{ value: ["opt_dark0001"], canonical: ["opt_dark0001"] }],
    counterExamples: [
      { value: ["opt_light001", "opt_dark0001"], code: "too_many", note: "multiSelect is off on this block" },
      { value: ["opt_nope"], code: "invalid_option" },
    ],
    codes: ["required", "invalid_option", "too_many"],
  },

  rating: {
    shape: "An integer from 1 to `scale`.",
    tsType: "number",
    block: {
      id: "blk_rate0001", ref: "q_excitement", type: "rating", title: "How excited are you?",
      required: true, scale: 5,
    },
    examples: [
      { value: 4, canonical: 4 },
      { value: "4", canonical: 4 },
    ],
    counterExamples: [
      { value: 0, code: "out_of_range" },
      { value: 6, code: "out_of_range" },
      { value: 3.5, code: "type" },
    ],
    codes: ["required", "type", "out_of_range"],
  },
  nps: {
    shape: "An integer from 0 to 10.",
    tsType: "number",
    block: { id: "blk_nps00001", ref: "q_nps", type: "nps", title: "How likely are you to recommend us?", required: true },
    examples: [{ value: 0, canonical: 0, note: "zero is a real answer, not an empty one" }, { value: 10, canonical: 10 }],
    counterExamples: [
      { value: 11, code: "out_of_range" },
      { value: -1, code: "out_of_range" },
    ],
    codes: ["required", "type", "out_of_range"],
  },
  opinion_scale: {
    shape: "An integer within the block's steps, offset by `startAt`.",
    tsType: "number",
    block: {
      id: "blk_opin0001", ref: "q_agreement", type: "opinion_scale", title: "It was easy to use",
      required: true, steps: 5, startAt: 1,
    },
    examples: [{ value: 3, canonical: 3 }],
    counterExamples: [
      { value: 0, code: "out_of_range" },
      { value: 6, code: "out_of_range" },
    ],
    codes: ["required", "type", "out_of_range"],
  },
  ranking: {
    shape: "Every item's id exactly once, best first.",
    tsType: "string[]",
    block: {
      id: "blk_rank0001", ref: "q_priorities", type: "ranking", title: "Rank these", required: true,
      // `items`, not `options` — ranking is the one choice-shaped type whose
      // list is the thing being ordered rather than a set to pick from.
      items: [
        { id: "opt_price001", label: "Price" },
        { id: "opt_speed001", label: "Speed" },
        { id: "opt_supp0001", label: "Support" },
      ],
    },
    examples: [{ value: ["opt_speed001", "opt_price001", "opt_supp0001"], canonical: ["opt_speed001", "opt_price001", "opt_supp0001"] }],
    counterExamples: [
      { value: ["opt_speed001"], code: "incomplete_ranking", note: "a partial ranking is not an ordering" },
      { value: ["opt_speed001", "opt_speed001", "opt_price001"], code: "invalid_ranking" },
    ],
    codes: ["required", "incomplete_ranking", "invalid_ranking"],
  },
  matrix: {
    shape: "A map of row id to the chosen column id (or an array of them).",
    tsType: "Record<string, string | string[]>",
    block: {
      id: "blk_matrix01", ref: "q_matrix", type: "matrix", title: "Rate each area", required: true,
      rows: [
        { id: "row_speed001", label: "Speed" },
        { id: "row_price001", label: "Price" },
      ],
      columns: [
        { id: "col_good0001", label: "Good" },
        { id: "col_bad00001", label: "Bad" },
      ],
    },
    examples: [
      {
        value: { row_speed001: "col_good0001", row_price001: "col_bad00001" },
        canonical: { row_speed001: "col_good0001", row_price001: "col_bad00001" },
      },
    ],
    counterExamples: [
      { value: { row_speed001: "col_good0001" }, code: "incomplete_matrix", note: "every row, when the block is required" },
      { value: { row_nope: "col_good0001" }, code: "invalid_row" },
      { value: { row_speed001: "col_nope", row_price001: "col_bad00001" }, code: "invalid_column" },
      { value: ["col_good0001"], code: "type" },
    ],
    codes: ["required", "type", "invalid_row", "invalid_column", "incomplete_matrix"],
  },

  file_upload: {
    shape: "File descriptors, as returned by the upload confirm step.",
    tsType: "{ fileId: string; filename: string; mime: string; size: number; r2Key: string }[]",
    block: {
      id: "blk_file0001", ref: "q_resume", type: "file_upload", title: "Upload your CV", required: true,
      accept: ["application/pdf"], maxFiles: 1, maxSizeMB: 1,
    },
    examples: [
      {
        value: [{ fileId: "fil_1", filename: "cv.pdf", mime: "application/pdf", size: 1000, r2Key: "uploads/cv.pdf" }],
        note: "the descriptor comes from the upload flow — a client never invents one",
      },
    ],
    counterExamples: [
      { value: "cv.pdf", code: "type" },
      {
        value: [{ fileId: "fil_1", filename: "big.pdf", mime: "application/pdf", size: 5_000_000, r2Key: "uploads/big.pdf" }],
        code: "file_too_large",
      },
    ],
    codes: ["required", "type", "too_many_files", "file_too_large"],
  },
  signature: {
    shape: "A reference to the stored signature image.",
    tsType: "{ fileId: string; r2Key: string; signedName?: string }",
    block: {
      id: "blk_sign0001", ref: "q_sign", type: "signature", title: "Sign here", required: true,
      drawnNameRequired: true,
    },
    examples: [{ value: { fileId: "fil_sig", r2Key: "uploads/sig.png", signedName: "Maya Iyer" } }],
    counterExamples: [
      { value: { fileId: "fil_sig", r2Key: "uploads/sig.png" }, code: "name_required" },
      { value: "data:image/png;base64,iVBOR", code: "type", note: "an image payload is uploaded first, not sent inline" },
    ],
    codes: ["required", "type", "name_required"],
  },
  payment: {
    shape: "The respondent's report that they paid. Never proof of it.",
    tsType: '{ status: "pending" | "paid"; method?: "link" | "upi"; reference?: string; amount?: number }',
    block: {
      id: "blk_pay00001", ref: "q_payment", type: "payment", title: "Pay the deposit", required: true,
      method: "link", amountMode: "fixed", amount: 4900, currency: "USD", url: "https://pay.example.com/x",
    },
    examples: [
      {
        value: { status: "paid", method: "link", reference: "CF-7K2M9X", verified: true },
        canonical: {
          status: "paid", method: "link", verified: false, reference: "CF-7K2M9X",
          paymentId: undefined, amount: undefined, currency: "USD",
        },
        note: "`verified` is forced to false however it arrives — nothing in this flow talks to a gateway, so nobody can confirm their own payment",
      },
    ],
    counterExamples: [
      { value: { status: "maybe" }, code: "payment_pending" },
      { value: "paid", code: "type" },
    ],
    codes: ["required", "type", "payment_pending"],
  },
  scheduling: {
    shape: "The booking the respondent made on your calendar provider.",
    tsType: "{ provider: string; url: string; slotIso?: string; confirmedAt?: number }",
    block: {
      id: "blk_sched001", ref: "q_call", type: "scheduling", title: "Book a call", required: true,
      provider: "external", url: "https://cal.com/acme/30min",
    },
    examples: [
      {
        value: { provider: "external", url: "https://cal.com/acme/30min", slotIso: "2026-06-01T10:00:00Z" },
        canonical: { provider: "external", url: "https://cal.com/acme/30min", slotIso: "2026-06-01T10:00:00Z", confirmedAt: undefined },
      },
    ],
    counterExamples: [
      { value: { provider: "external" }, code: "type" },
      { value: "booked", code: "type" },
    ],
    codes: ["required", "type"],
  },

  contact_info: {
    shape: "A map of the block's fields to their values.",
    tsType: "Record<'first_name' | 'last_name' | 'email' | 'phone', string>",
    block: {
      id: "blk_contact1", ref: "q_contact", type: "contact_info", title: "Your details", required: true,
      fields: ["first_name", "email"],
    },
    examples: [
      {
        value: { first_name: " Maya ", email: "maya@northwind.co" },
        canonical: { first_name: "Maya", email: "maya@northwind.co" },
      },
    ],
    counterExamples: [
      { value: { first_name: "Maya" }, code: "incomplete" },
      { value: { first_name: "Maya", email: "nope" }, code: "invalid_email" },
      { value: "Maya", code: "type" },
    ],
    codes: ["required", "type", "incomplete", "invalid_email"],
  },
  address: {
    shape: "A map of the block's address fields to their values.",
    tsType: "Record<'street' | 'city' | 'state' | 'postal' | 'country', string>",
    block: {
      id: "blk_addr0001", ref: "q_address", type: "address", title: "Where do we ship?", required: true,
      fields: ["city", "country"],
    },
    examples: [{ value: { city: "Bengaluru", country: "IN" }, canonical: { city: "Bengaluru", country: "IN" } }],
    counterExamples: [
      { value: { city: "Bengaluru" }, code: "incomplete" },
      { value: "Bengaluru", code: "type" },
    ],
    codes: ["required", "type", "incomplete"],
  },
  legal_consent: {
    shape: "`true`. The stored answer records what was agreed to, and when.",
    tsType: "true",
    block: {
      id: "blk_legal001", ref: "q_consent", type: "legal_consent", title: "One last thing", required: true,
      consentText: CONSENT_TEXT,
    },
    examples: [
      {
        value: true,
        note: "stored as { accepted, textSha256, ts } — the hash is of the exact wording shown, so consent stays provable after the text changes",
      },
    ],
    counterExamples: [
      { value: false, code: "consent_required" },
      { value: "sure", code: "consent_required" },
    ],
    codes: ["required", "consent_required"],
  },
};

/** Compile-time proof that nothing was forgotten; the test asserts it at runtime too. */
export const CATALOGUED_TYPES: readonly BlockType[] = BLOCK_TYPES;

/** The representative block for a type, parsed and ready to validate against. */
export function catalogBlock(type: BlockType): BlockInput {
  return ANSWER_CATALOG[type].block;
}

export type { Block };
