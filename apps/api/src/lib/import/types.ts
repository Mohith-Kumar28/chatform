/**
 * A form read out of another builder, before it becomes one of ours.
 *
 * Every reader (Typeform, Google Forms, Tally) produces this shape and nothing
 * else, and `importedToDoc` is the only thing that turns it into a FormDoc. So
 * a new source is one new reader, and the conversion rules (what a jump
 * becomes, what gets reported as not copied) live in exactly one place.
 *
 * Unlike `SourceForm` in `form-import.ts`, which hands a linked form to the AI
 * generator as a strong hint, this is the whole form: every question, every
 * ending and every jump the source states, converted by code. An import makes
 * no model call at all.
 */

/** The system organization that holds forms imported by visitors who have not signed up. Migration 0052. */
export const IMPORT_TRIAL_ORG = "org_import_trials";
export const IMPORT_TRIAL_WORKSPACE = "ws_import_trials";

/** `website` is any other page with a `<form>` on it: a contact page, a signup, an application. */
export type ImportProvider = "typeform" | "google_forms" | "tally" | "jotform" | "youform" | "website";

export const IMPORT_PROVIDERS: readonly ImportProvider[] = ["typeform", "google_forms", "tally", "jotform", "youform", "website"];

export const PROVIDER_NAMES: Record<ImportProvider, string> = {
  typeform: "Typeform",
  google_forms: "Google Forms",
  tally: "Tally",
  jotform: "Jotform",
  youform: "Youform",
  website: "Website",
};

/** One question or statement, in the draft vocabulary `normalizeBlock` reads. */
export interface ImportedItem {
  /** The source's own id for it, so jumps can name it. Unique within the form. */
  key: string;
  /** A draft block type: `short_text`, `single_select`, `statement`, ... */
  type: string;
  title: string;
  description: string;
  required: boolean;
  /** Choice labels, columns of a grid, or the things being ranked. */
  options: string[];
  /** The source's own ids for `options`, same order, so a jump on an answer can find its label. */
  optionKeys?: string[];
  allowOther: boolean;
  /** Stars, or the number of steps on a scale. */
  scale: number;
  /** Draft `config` (`rows=a|b; multiplePerRow=true`). */
  config: string;
  placeholder?: string;
  /** An image shown with the question, as the source hosts it. Copied into our storage on import. */
  imageUrl?: string;
  /** The type is our reading of a plain text box's label, not something the page stated. */
  typeGuessed?: boolean;
  /** The page marks no field required, so it checks in script and `required` says nothing. */
  requiredUnknown?: boolean;
  /** Per option, same order as `options`: a picture-choice answer's image. */
  optionImages?: (string | null)[];
  /** Applied after normalizing, where the draft has no field for them. */
  exact?: {
    startAt?: 0 | 1;
    labelLow?: string;
    labelHigh?: string;
    shape?: "star" | "heart" | "number";
    multiSelect?: boolean;
    buttonLabel?: string;
  };
}

export interface ImportedEnding {
  key: string;
  title: string;
  body: string;
  redirectUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
}

/** One side of a condition, as the source states it. */
export interface ImportedCondition {
  /** The item whose answer is tested. */
  itemKey: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains" | "starts_with" | "ends_with" | "is_empty" | "is_not_empty";
  /** An option key (resolved to its label), or a literal. */
  value?: { optionKey: string } | string | number | boolean;
}

export interface ImportedConditionGroup {
  op: "and" | "or";
  conditions: ImportedCondition[];
  groups: ImportedConditionGroup[];
}

/**
 * "After `fromKey`, when this holds, go to that."
 *
 * Every builder we read has this model: a jump fires after the question it is
 * attached to, then the form carries on in order from wherever it landed. Ours
 * works the same way, so a jump can be copied as one goto rule, exactly,
 * instead of being redescribed to a model and redrawn by it.
 */
export interface ImportedJump {
  fromKey: string;
  /** Null: always. */
  when: ImportedConditionGroup | null;
  to: { kind: "item"; key: string } | { kind: "ending"; key: string };
}

export interface ImportedForm {
  provider: ImportProvider;
  /** The link the respondent opens, after redirects. */
  url: string;
  title: string;
  description: string;
  welcome?: { title: string; description: string; buttonLabel?: string; imageUrl?: string };
  items: ImportedItem[];
  /** At least one; a source with none gets a plain thank-you. */
  endings: ImportedEnding[];
  jumps: ImportedJump[];
  hiddenFields: string[];
  /**
   * What did not come over, in words the author reads.
   *
   * Never silently lost: a payment, a Calendly block, a rule that tests a
   * different question than the one it hangs off. Each lands here and is
   * shown beside the preview and once in the builder.
   */
  notCopied: string[];
  /** The source is no longer taking responses. Imported anyway; worth saying. */
  closed: boolean;
}

/** Why a link could not be imported. The message is decided here, never by a model. */
export type ImportErrorCode =
  | "unsupported_url"
  | "edit_link"
  | "not_found"
  | "sign_in_required"
  | "closed_hidden"
  | "password_protected"
  | "no_questions"
  | "no_form"
  | "unreachable";

export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  unsupported_url: "Paste a link to a form, or to a page with a form on it.",
  edit_link:
    "That's the editor link, which only you can open. In Google Forms, press Send, copy the link, and paste that one.",
  not_found: "We couldn't find a form at that link. Check that it's published and opens in a private window.",
  sign_in_required:
    "This form only opens for people who sign in. Allow anyone with the link to respond, then try again.",
  closed_hidden:
    "This form is closed, and Google hides a closed form's questions. Turn on Accepting responses for a minute, import it, then turn it off.",
  password_protected: "This form is password-protected, so its questions can't be read. Remove the password, then try again.",
  no_questions: "We opened the form but found no questions to copy.",
  no_form: "We couldn't find a form on that page. Paste the link to the form itself.",
  unreachable: "We couldn't reach that form just now. Try again in a minute.",
};

export class ImportError extends Error {
  constructor(public code: ImportErrorCode) {
    super(IMPORT_ERROR_MESSAGES[code]);
  }
}

/** What an import reports beside the preview. */
export interface ImportReport {
  provider: ImportProvider;
  sourceUrl: string;
  questions: number;
  branches: number;
  endings: number;
  notCopied: string[];
  closed: boolean;
  /** Every step in order, for the preview's "what came over" list. Titles clipped. */
  outline: { title: string; type: string; required: boolean }[];
}
