import { z } from "zod";
import { ConditionGroup } from "./conditions";
import { NanoId, RefString, HiddenFieldName } from "./ids";
import { IdentityFieldSetting } from "./identity-fields";

export const BLOCK_TYPES = [
  "welcome",
  "statement",
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "yes_no",
  "single_select",
  "multi_select",
  "dropdown",
  "picture_choice",
  "rating",
  "nps",
  "opinion_scale",
  "ranking",
  "matrix",
  "file_upload",
  "signature",
  "payment",
  "scheduling",
  "contact_info",
  "address",
  "field_group",
  "legal_consent",
] as const;

export const BlockType = z.enum(BLOCK_TYPES);
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Per-block guidance for the interview agent. The block still defines WHAT is
 * collected and how it validates; this only shapes how the agent asks for it.
 */
export const AgentHints = z.object({
  /** "casual, mention it's optional" */
  askStyle: z.string().max(500).optional(),
  /** What to say when the respondent refuses or gives something unusable. */
  retryHint: z.string().max(500).optional(),
  /** The answer to "why do you need this?" */
  whyWeAsk: z.string().max(500).optional(),
  examples: z.array(z.string().max(200)).max(5).default([]),
});
export type AgentHints = z.output<typeof AgentHints>;

/**
 * Media attached to a question.
 *
 * `image` and `video` render inline above the question; `file` renders as a
 * download the respondent can take away (a brief, a price list, a consent PDF).
 * `url` is resolved server-side from `key` for R2-hosted assets, or set
 * directly when the builder pasted a link.
 */
export const BlockMedia = z.object({
  kind: z.enum(["image", "video", "file"]),
  /** R2 object key, when the asset was uploaded here. */
  key: z.string().max(500).nullable().default(null),
  /** Direct URL, when the builder pasted one. */
  url: z.string().max(1000).nullable().default(null),
  filename: z.string().max(300).optional(),
  mime: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(0).optional(),
  /** Alt text for images — required for the question to be accessible. */
  alt: z.string().max(300).optional(),
  caption: z.string().max(300).optional(),
});
export type BlockMedia = z.output<typeof BlockMedia>;

const BlockBase = {
  id: NanoId,
  ref: RefString,
  title: z.string().max(2000),
  description: z.string().max(5000).optional(),
  required: z.boolean().default(false),
  /** When defined and evaluates false, block is skipped deterministically. */
  visibility: ConditionGroup.nullable().default(null),
  image_key: z.string().nullable().default(null),

  agentHints: AgentHints.nullable().default(null),

  /** Media shown with the question — an image, a short video, or a download. */
  media: BlockMedia.nullable().default(null),

  /** Prefill this block's answer from a URL query parameter. */
  prefillParam: HiddenFieldName.optional(),

  /**
   * Override for which reusable detail this question holds.
   *
   * Left unset — which is how it will be left — the question is read from its
   * own wording by `identityFieldForBlock`, so "What's your college?" is
   * remembered as a school without anybody opening this panel. Set it to name
   * the field when that guess is wrong, or to `never` to keep a question out
   * of the profile however plainly it reads.
   */
  identityField: IdentityFieldSetting.optional(),

  /** Label on the advance control in non-conversational renderings and widgets. */
  buttonLabel: z.string().max(60).optional(),
};

const Option = z.object({
  id: NanoId,
  label: z.string().min(1).max(500),
  description: z.string().max(1000).optional(),
  image_key: z.string().nullable().default(null),
  score: z.number().optional(),
});
export type Option = z.infer<typeof Option>;

const MatrixColumn = z.object({ id: NanoId, label: z.string().min(1).max(300) });
const MatrixRow = z.object({ id: NanoId, label: z.string().min(1).max(300) });

/**
 * Refuse an answer another respondent has already given.
 *
 * A team name, a username, a referral code, a seat number: answers that are
 * only useful when no two responses carry the same one. Checked against every
 * answer already recorded for this question on this form, at the moment it is
 * given — see `findDuplicateAnswer` — because "already taken" is a fact about a
 * form, and because deduplicating afterwards is work somebody does by hand.
 *
 * Only on the types where sameness is well defined. A paragraph, a rating or a
 * choice from a list of five has no useful notion of "taken".
 */
const Unique = z.boolean().default(false);

/**
 * Make the respondent prove the address or number they just typed.
 *
 * A code goes to whatever they answered — an SMS for a phone block, an email
 * for an email block — and the answer is not recorded until they type it back.
 * A refused code is an ordinary validation failure: same `validation_error`,
 * same conversational retry, same escalation counter.
 *
 * Off by default, and deliberately not the same thing as
 * `settings.requireAuth`. That gate asks "who are you" once, before the first
 * question, and produces an identity the whole response is filed under. This
 * asks "is this particular value real" about one answer, which is what a form
 * collecting a delivery number or a newsletter address actually wants — and it
 * can be asked of somebody who never signed in at all.
 *
 * Where the two meet, the runtime does not ask twice: a respondent who
 * verified with Google and then types that same address, or who verified by
 * SMS and types that same number, is already proven and goes straight through.
 * A *different* value is a different claim, and gets a code of its own.
 */
const VerifyAnswer = z.boolean().default(false);

export const ContactField = z.enum(["first_name", "last_name", "email", "phone"]);
export const AddressField = z.enum(["street", "city", "state", "postal", "country"]);

/**
 * What one field inside a `field_group` may collect.
 *
 * A subset of `BLOCK_TYPES` on purpose. Everything here validates from a single
 * typed value and nothing here needs an out-of-band step, a code, a canvas or a
 * checkout page — which is what keeps an entry a row you can fill in and keeps
 * `groupFieldBlock` able to hand each one to the real validator. A group whose
 * rows could contain a payment or a file upload would be a form inside a form,
 * and neither the composer nor the session has anywhere to put that.
 */
export const GROUP_FIELD_KINDS = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "url",
  "number",
  "date",
  "single_select",
  "yes_no",
] as const;
export const GroupFieldKind = z.enum(GROUP_FIELD_KINDS);
export type GroupFieldKind = (typeof GROUP_FIELD_KINDS)[number];

/**
 * One column of a repeating group.
 *
 * `key` is the identity, not `id`: the answer is an array of records keyed by
 * it, so it is what a results column, an export header and an integration read.
 * It is therefore treated like a `ref` — authored once, snake_case, and stable
 * across edits — while `id` stays the throwaway React key.
 */
export const GroupField = z.object({
  id: NanoId,
  key: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/, "key must be lowercase snake_case"),
  label: z.string().min(1).max(200),
  kind: GroupFieldKind,
  /** Required *within an entry* — an entry that exists must fill it in. */
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  /** `single_select` only; ignored by every other kind. */
  options: z.array(Option).max(50).default([]),
  /** `number` only. */
  min: z.number().optional(),
  max: z.number().optional(),
});
export type GroupField = z.output<typeof GroupField>;

export const Block = z.discriminatedUnion("type", [
  z.object({ ...BlockBase, type: z.literal("welcome"), buttonLabel: z.string().max(60).default("Start") }),
  z.object({ ...BlockBase, type: z.literal("statement"), buttonLabel: z.string().max(60).default("Continue") }),
  z.object({
    ...BlockBase,
    type: z.literal("short_text"),
    unique: Unique,
    minLength: z.number().int().min(0).max(500).default(0),
    maxLength: z.number().int().min(1).max(500).default(500),
    pattern: z.string().max(500).optional(),
    placeholder: z.string().max(200).optional(),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("long_text"),
    minLength: z.number().int().min(0).max(5000).default(0),
    maxLength: z.number().int().min(1).max(5000).default(2000),
    aiQualityCheck: z.boolean().default(false),
    placeholder: z.string().max(200).optional(),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("email"),
    unique: Unique,
    businessOnly: z.boolean().default(false),
    /** Email a six-digit code and hold the answer until it comes back. */
    verify: VerifyAnswer,
  }),
  z.object({
    ...BlockBase,
    type: z.literal("phone"),
    unique: Unique,
    countryHint: z.string().length(2).optional(),
    /** SMS a six-digit code and hold the answer until it comes back. */
    verify: VerifyAnswer,
  }),
  z.object({ ...BlockBase, type: z.literal("url"), unique: Unique }),
  z.object({
    ...BlockBase,
    type: z.literal("number"),
    unique: Unique,
    min: z.number().optional(),
    max: z.number().optional(),
    integerOnly: z.boolean().default(false),
    currency: z.string().length(3).optional(),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("date"),
    min: z.string().optional(),
    max: z.string().optional(),
    disablePast: z.boolean().default(false),
    dateFormat: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]).default("YYYY-MM-DD"),
    /**
     * Also collect a time of day — what turns "when shall we meet?" from a
     * date into an appointment. Off by default, so an existing date block keeps
     * storing a plain `YYYY-MM-DD`; on, the answer is `YYYY-MM-DDTHH:mm`.
     */
    includeTime: z.boolean().default(false),
    /** Minutes between selectable times, when `includeTime` is on. */
    timeStepMinutes: z.number().int().min(5).max(120).default(30),
    /** Earliest and latest time offered, as `HH:mm`. */
    timeMin: z.string().regex(/^\d{2}:\d{2}$/).default("09:00"),
    timeMax: z.string().regex(/^\d{2}:\d{2}$/).default("18:00"),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("yes_no"),
    yesLabel: z.string().max(60).default("Yes"),
    noLabel: z.string().max(60).default("No"),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("single_select"),
    options: z.array(Option).min(1).max(100),
    allowOther: z.boolean().default(false),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("multi_select"),
    options: z.array(Option).min(1).max(100),
    minSelections: z.number().int().min(0).max(100).default(1),
    maxSelections: z.number().int().min(1).max(100).default(10),
    allowOther: z.boolean().default(false),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("dropdown"),
    options: z.array(Option).min(1).max(500),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("picture_choice"),
    options: z.array(Option).min(2).max(30),
    multiSelect: z.boolean().default(false),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("rating"),
    scale: z.number().int().min(1).max(10).default(5),
    shape: z.enum(["star", "heart", "number"]).default("star"),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("nps"),
    labelLow: z.string().max(100).default("Not likely"),
    labelHigh: z.string().max(100).default("Extremely likely"),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("opinion_scale"),
    steps: z.number().int().min(2).max(11).default(10),
    startAt: z.union([z.literal(0), z.literal(1)]).default(1),
    labelLow: z.string().max(100).optional(),
    labelHigh: z.string().max(100).optional(),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("ranking"),
    items: z.array(MatrixColumn).min(2).max(12),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("matrix"),
    rows: z.array(MatrixRow).min(1).max(20),
    columns: z.array(MatrixColumn).min(2).max(10),
    multiplePerRow: z.boolean().default(false),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("file_upload"),
    accept: z.array(z.string()).min(1).max(20),
    maxFiles: z.number().int().min(1).max(10).default(1),
    maxSizeMB: z.number().min(0.1).max(100).default(10),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("signature"),
    drawnNameRequired: z.boolean().default(false),
  }),
  /**
   * Payment is collected *outside* Chatform: we show the respondent where to
   * pay and record that they say they did. We are never in the flow of funds,
   * so there is no gateway to verify against — see `verified` on the answer.
   *
   * `link` sends them to a checkout page the builder already owns (Razorpay,
   * Stripe, PayPal, anything). `upi` takes a VPA and builds the `upi://` URI
   * itself, which renders as both a QR to scan and a link to tap.
   */
  z.object({
    ...BlockBase,
    type: z.literal("payment"),
    method: z.enum(["link", "upi"]).default("link"),
    amountMode: z.enum(["fixed", "variable"]).default("fixed"),
    amount: z.number().min(0).optional(),
    amountVariable: z.string().optional(),
    currency: z.string().length(3).default("USD"),
    /** `link`: the checkout page. Optional in the schema so a half-built block still saves; lint requires it to publish. */
    url: z.string().url().max(500).optional(),
    /** `upi`: the payee VPA, e.g. "acme@okhdfcbank". */
    upiId: z.string().max(120).optional(),
    /** `upi`: the name UPI apps show the payer. Falls back to the form's name. */
    upiPayeeName: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
  }),
  /**
   * Booking happens on whatever the builder already uses — Cal.com, Calendly,
   * Google Calendar, a bare Meet or Zoom room. Any URL is accepted on purpose:
   * the moment this enumerates providers, the one someone uses is missing.
   */
  z.object({
    ...BlockBase,
    type: z.literal("scheduling"),
    provider: z.literal("external").default("external"),
    url: z.string().url().max(500),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("contact_info"),
    fields: z.array(ContactField).min(1),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("address"),
    fields: z.array(AddressField).min(1),
    countryWhitelist: z.array(z.string().length(2)).optional(),
  }),
  /**
   * A small form inside one question, repeated as many times as the answer needs.
   *
   * Everything else here collects one value per question, so "two to five team
   * members, each with a name and an email" could only be built as ten separate
   * questions — eight of which are wrong for a team of two, and none of which
   * can be asked at all for a team of six. The same shape turns up constantly
   * once you look for it: guests on a booking, children on a school form, line
   * items on an order, authors on a paper, referees on an application.
   *
   * `fields` are the columns, `minEntries` rows are offered from the start, and
   * the respondent adds up to `maxEntries` of them. Set both to 1 and it is
   * simply a group of related fields asked together — a `contact_info` whose
   * fields you chose yourself.
   *
   * The answer is an array of records keyed by each field's `key`, which is why
   * `key` is stable and authored rather than derived: it is the column header in
   * an export and the property name in a webhook payload.
   */
  z.object({
    ...BlockBase,
    type: z.literal("field_group"),
    fields: z.array(GroupField).min(1).max(10),
    /** What one entry is called, in the singular: "Team member", "Guest". */
    itemLabel: z.string().min(1).max(60).default("Entry"),
    /** How many rows are offered before they add any. Never fewer than one. */
    minEntries: z.number().int().min(1).max(20).default(1),
    maxEntries: z.number().int().min(1).max(20).default(5),
  }),
  /**
   * Terms, waivers, a code of conduct: wording shown verbatim, and a record of
   * who accepted which version of it.
   *
   * `allowDecline` is what makes it a question rather than a turnstile. With it
   * off — the default, and how this shipped — the only answer the validator
   * accepts is `true`, so a respondent who does not agree has nowhere to go but
   * away: no answer is recorded, no rule can fire, and the form simply refuses
   * to advance. That is right for a consent that is genuinely non-negotiable.
   * It is wrong for every form that wants to say something about a "no", which
   * is most of them — an eligibility gate, a waiver a minor cannot sign, a
   * policy that routes the refusal somewhere useful. With it on, "I do not
   * agree" is a real answer, stored as `accepted: false`, and a branch can read
   * it like any other.
   */
  z.object({
    ...BlockBase,
    type: z.literal("legal_consent"),
    consentText: z.string().min(1).max(10000),
    /** Offer an explicit refusal, so declining is an answer and not a dead end. */
    allowDecline: z.boolean().default(false),
    agreeLabel: z.string().max(60).default("I agree"),
    declineLabel: z.string().max(60).default("I do not agree"),
  }),
]);

export type Block = z.output<typeof Block>;
/** Input shape (fields with defaults are optional on input). */
export type BlockInput = z.input<typeof Block>;

/**
 * The types that can carry `unique`, and the one place that list is written.
 *
 * The builder's toggle, the AI editor's `config` key and the runtime check all
 * read this, so a type gaining or losing the flag cannot leave one of the three
 * behind — the same reason `BLOCK_CATALOG` exists.
 */
export const UNIQUE_CAPABLE_TYPES = new Set<BlockType>([
  "short_text",
  "email",
  "phone",
  "url",
  "number",
]);

/** True when this block refuses an answer another response already gave. */
export function enforcesUnique(block: Block): boolean {
  return "unique" in block && block.unique === true;
}

/**
 * One sub-field as a standalone block, so a group validates through the real
 * validators rather than a second implementation of them.
 *
 * An email inside a group has to be lowercased, a phone canonicalised to E.164
 * and a URL given its scheme in exactly the way the same question would be
 * outside one — and the moment that logic is written twice, one copy is the
 * one that rots. `validateAnswer` calls this and then calls itself.
 */
export function groupFieldBlock(field: GroupField): Block {
  const base = {
    id: field.id,
    ref: `q_${field.key}`,
    title: field.label,
    required: field.required,
  };
  switch (field.kind) {
    case "short_text":
      return Block.parse({ ...base, type: "short_text", maxLength: 500 });
    case "long_text":
      return Block.parse({ ...base, type: "long_text", maxLength: 2000 });
    case "email":
      return Block.parse({ ...base, type: "email" });
    case "phone":
      return Block.parse({ ...base, type: "phone" });
    case "url":
      return Block.parse({ ...base, type: "url" });
    case "number":
      return Block.parse({ ...base, type: "number", min: field.min, max: field.max });
    case "date":
      return Block.parse({ ...base, type: "date" });
    case "single_select":
      return Block.parse({ ...base, type: "single_select", options: field.options });
    case "yes_no":
      return Block.parse({ ...base, type: "yes_no" });
  }
}
