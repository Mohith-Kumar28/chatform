import { z } from "zod";
import { ConditionGroup } from "./conditions";
import { NanoId, RefString, HiddenFieldName } from "./ids";

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

export const ContactField = z.enum(["first_name", "last_name", "email", "phone"]);
export const AddressField = z.enum(["street", "city", "state", "postal", "country"]);

export const Block = z.discriminatedUnion("type", [
  z.object({ ...BlockBase, type: z.literal("welcome"), buttonLabel: z.string().max(60).default("Start") }),
  z.object({ ...BlockBase, type: z.literal("statement"), buttonLabel: z.string().max(60).default("Continue") }),
  z.object({
    ...BlockBase,
    type: z.literal("short_text"),
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
    businessOnly: z.boolean().default(false),
  }),
  z.object({
    ...BlockBase,
    type: z.literal("phone"),
    countryHint: z.string().length(2).optional(),
  }),
  z.object({ ...BlockBase, type: z.literal("url") }),
  z.object({
    ...BlockBase,
    type: z.literal("number"),
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
  z.object({
    ...BlockBase,
    type: z.literal("payment"),
    amountMode: z.enum(["fixed", "variable"]).default("fixed"),
    amount: z.number().min(0).optional(),
    amountVariable: z.string().optional(),
    currency: z.string().length(3).default("USD"),
    description: z.string().max(500).optional(),
  }),
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
  z.object({
    ...BlockBase,
    type: z.literal("legal_consent"),
    consentText: z.string().min(1).max(10000),
  }),
]);

export type Block = z.output<typeof Block>;
/** Input shape (fields with defaults are optional on input). */
export type BlockInput = z.input<typeof Block>;
