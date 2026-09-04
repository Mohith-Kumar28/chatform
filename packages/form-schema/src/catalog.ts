import { BLOCK_TYPES, type BlockType } from "./blocks";

/**
 * What each block type is for, in one place, exhaustively.
 *
 * Every prompt that asks a model to choose a block type used to carry its own
 * hand-written list. Both had gone stale in the same direction — they named 16
 * of the 26 types and then said "any other word is wrong, pick the closest type
 * from the list above" — so `payment` and `scheduling` were not merely
 * undocumented, they were forbidden. Asked to take a 499-rupee ticket over UPI,
 * the model correctly obeyed the prompt and produced a short-text question
 * titled "Payment Confirmation".
 *
 * A `Record<BlockType, …>` is the fix, not a longer list: adding a type to
 * `BLOCK_TYPES` now fails to compile until it is described here, so the prompts
 * cannot fall behind the schema again.
 *
 * Entries are written for the reader who has to choose between them, which is
 * why several say what they are NOT — `scheduling` against `date` is the
 * distinction a model gets wrong on its own every time.
 */
export interface BlockCatalogEntry {
  /** What it collects. One line, in the terms a chooser needs. */
  summary: string;
  /**
   * `config` keys this type reads, if any.
   *
   * The draft carries one flat `config` string per block — see `GenerationDraft`
   * for why the draft schema cannot afford a field per option — so these are
   * documented as the `key=value` pairs that go in it.
   */
  config?: string;
  /** Marks the choice-based types, whose `options` are not optional. */
  needsOptions?: boolean;
}

export const BLOCK_CATALOG: Record<BlockType, BlockCatalogEntry> = {
  welcome: { summary: "The opening greeting. Always the first block, never used again." },
  statement: { summary: "Says something and moves on. Collects no answer." },

  short_text: { summary: "One line of free text — a name, a job title, a company." },
  long_text: { summary: "A paragraph. Only when you genuinely want prose." },
  email: { summary: "An email address, validated as one." },
  phone: { summary: "A phone number, validated as one." },
  url: { summary: "A web address." },
  number: {
    summary: "A quantity — how many guests, how many seats, a budget.",
    config: "min, max, integerOnly=true, currency=<3-letter code> when it is money",
  },
  date: {
    summary:
      "A date, or a date and time they choose — an arrival time, a preferred day. This is the right type when YOU are asking them when; `scheduling` is for booking against a calendar you own.",
    config: "disablePast=true to refuse dates already gone",
  },
  yes_no: {
    summary: "A yes/no answer. The best decider for a branch.",
    config: "yes=<label>, no=<label> to relabel the two buttons",
  },

  single_select: { summary: "Pick one from a short list.", needsOptions: true },
  multi_select: { summary: "Pick any number from a list.", needsOptions: true },
  dropdown: { summary: "Pick one from a long list — a country, a plan.", needsOptions: true },
  picture_choice: {
    summary: "Pick by image. The builder attaches the pictures afterwards.",
    needsOptions: true,
  },

  rating: { summary: "Stars, 1 to `scale`.", config: "scale sets how many stars" },
  nps: { summary: "The 0–10 'how likely are you to recommend us' question." },
  opinion_scale: {
    summary: "Agree/disagree on a numbered scale.",
    config: "scale sets the number of steps",
  },
  ranking: { summary: "Drag a list into order of preference. `options` are the things being ranked.", needsOptions: true },
  matrix: {
    summary: "A grid — the same choice made once per row.",
    config: "rows=<Row A|Row B|Row C>; `options` are the columns",
    needsOptions: true,
  },

  file_upload: {
    summary: "A file or image — a CV, a screenshot, a receipt.",
    config: "accept=<image/*|application/pdf>, maxFiles=<1-10>, maxSizeMB=<0.1-100>",
  },
  signature: { summary: "A signature drawn with a finger or mouse, for agreements." },

  payment: {
    summary:
      "Takes money. Use this whenever the request mentions a price, a fee, a ticket, a deposit or a UPI id — never a text question asking them to confirm they paid.",
    config:
      "method=upi with upi=<vpa like name@bank>, OR method=link with url=<checkout page>; amount=<number>, currency=<3-letter code, INR for rupees>",
  },
  scheduling: {
    summary:
      "Books a slot on a calendar the builder already owns — Cal.com, Calendly, a Meet room. Needs their booking link. If you do not have one, use `date` instead and ask them for a time directly.",
    config: "url=<booking link> — required; without it this becomes a date question",
  },

  contact_info: {
    summary: "Name, email and phone collected together in one step.",
    config: "fields=<first_name|last_name|email|phone>",
  },
  address: {
    summary: "A postal address.",
    config: "fields=<street|city|state|postal|country>",
  },
  legal_consent: {
    summary: "A tickbox agreeing to terms. Put the wording in `description`.",
  },
};

/**
 * The catalog as prompt text: one line per type, grouped the way someone
 * choosing scans it.
 *
 * Rendered rather than written out so the prompts are generated from the same
 * record the schema enforces. `only` narrows it for the editor prompt, which has
 * no business offering `welcome` on a form that already has one.
 */
export function renderBlockCatalog(only?: readonly BlockType[]): string {
  const types = only ?? BLOCK_TYPES;
  return types
    .map((type) => {
      const entry = BLOCK_CATALOG[type];
      const parts = [`- ${type} — ${entry.summary}`];
      if (entry.needsOptions) parts.push("  Requires `options`.");
      if (entry.config) parts.push(`  config: ${entry.config}`);
      return parts.join("\n");
    })
    .join("\n");
}

/** Everything a model may add to a form that already has its welcome block. */
export const ADDABLE_BLOCK_TYPES = BLOCK_TYPES.filter((t) => t !== "welcome");

/** The seven families the builder groups blocks into, in the order it shows them. */
export const BLOCK_GROUPS = [
  "Content",
  "Text",
  "Contact",
  "Numbers & dates",
  "Choice",
  "Scale",
  "Advanced",
] as const;
export type BlockGroup = (typeof BLOCK_GROUPS)[number];

/** The colour family a block is tinted with, matching the design tokens. */
export type BlockTone = "content" | "text" | "contact" | "number" | "choice" | "scale" | "advanced";

export interface BlockPresentation {
  /** What a person calls this type. `nps`, for instance, is never shown as "nps". */
  label: string;
  group: BlockGroup;
  tone: BlockTone;
}

/**
 * How each block type is presented, wherever it is presented.
 *
 * The builder's own list carried this and so would the docs generator, which
 * cannot import from the web app — so it would have become a third copy. This
 * file's header records what happened the last time two hand-written block lists
 * were allowed to drift: `payment` became unreachable. Icons and the builder's
 * one-line descriptions stay in the web app, because they are the only parts a
 * generator does not need.
 */
export const BLOCK_PRESENTATION: Record<BlockType, BlockPresentation> = {
  welcome: { label: "Welcome", group: "Content", tone: "content" },
  statement: { label: "Message", group: "Content", tone: "content" },

  short_text: { label: "Short text", group: "Text", tone: "text" },
  long_text: { label: "Long text", group: "Text", tone: "text" },

  email: { label: "Email", group: "Contact", tone: "contact" },
  phone: { label: "Phone", group: "Contact", tone: "contact" },
  url: { label: "Website", group: "Contact", tone: "contact" },
  contact_info: { label: "Contact info", group: "Contact", tone: "contact" },
  address: { label: "Address", group: "Contact", tone: "contact" },

  number: { label: "Number", group: "Numbers & dates", tone: "number" },
  date: { label: "Date", group: "Numbers & dates", tone: "number" },

  yes_no: { label: "Yes / No", group: "Choice", tone: "choice" },
  single_select: { label: "Single select", group: "Choice", tone: "choice" },
  multi_select: { label: "Multi select", group: "Choice", tone: "choice" },
  dropdown: { label: "Dropdown", group: "Choice", tone: "choice" },
  picture_choice: { label: "Picture choice", group: "Choice", tone: "choice" },
  ranking: { label: "Ranking", group: "Choice", tone: "choice" },

  rating: { label: "Rating", group: "Scale", tone: "scale" },
  nps: { label: "NPS", group: "Scale", tone: "scale" },
  opinion_scale: { label: "Opinion scale", group: "Scale", tone: "scale" },
  matrix: { label: "Matrix", group: "Scale", tone: "scale" },

  file_upload: { label: "File upload", group: "Advanced", tone: "advanced" },
  signature: { label: "Signature", group: "Advanced", tone: "advanced" },
  payment: { label: "Payment", group: "Advanced", tone: "advanced" },
  scheduling: { label: "Scheduling", group: "Advanced", tone: "advanced" },
  legal_consent: { label: "Consent", group: "Advanced", tone: "advanced" },
};
