import {
  AddressField,
  Block as BlockSchema,
  BLOCK_TYPES,
  ContactField,
  FormDoc,
  lintFormDoc,
  buildFlowRules,
  type Block,
  type DraftBranch,
  type FormDocInput,
} from "@repo/form-schema";
import type { GenerationDraft, EditDraft } from "./ai.js";

/**
 * Loose model draft → a strict FormDoc.
 *
 * Shared by the one-shot generator, the streaming generator, and the builder's
 * "ask AI to change this" bar, all three of which used to normalize slightly
 * differently.
 */

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

const CONTACT_FIELDS = ContactField.options;
const ADDRESS_FIELDS = AddressField.options;

/**
 * Type names a model reaches for that are not ours.
 *
 * The prompt now lists the exact set (see `buildFlowGeneratorPrompt`), but a
 * near miss must not cost the author a question. It used to: `normalizeBlock`
 * returned null for an unknown type and the caller quietly skipped it, so a
 * draft that answered the request perfectly arrived missing the email question
 * because the model had written `single_choice` next to it and shifted
 * everything. Silence was the real bug — an unrecognised type is now either
 * mapped or, failing that, kept as a text question, because a question with
 * the wrong input is recoverable in the builder and a missing one is invisible.
 */
const TYPE_ALIASES: Record<string, Block["type"]> = {
  // choice
  single_choice: "single_select",
  singlechoice: "single_select",
  choice: "single_select",
  radio: "single_select",
  select: "single_select",
  multiple_choice: "multi_select",
  multiplechoice: "multi_select",
  multi_choice: "multi_select",
  multiselect: "multi_select",
  checkbox: "multi_select",
  checkboxes: "multi_select",
  picture: "picture_choice",
  image_choice: "picture_choice",
  // text
  text: "short_text",
  string: "short_text",
  shorttext: "short_text",
  short_answer: "short_text",
  name: "short_text",
  textarea: "long_text",
  paragraph: "long_text",
  longtext: "long_text",
  long_answer: "long_text",
  open_text: "long_text",
  // scalars
  tel: "phone",
  telephone: "phone",
  phone_number: "phone",
  mobile: "phone",
  link: "url",
  website: "url",
  integer: "number",
  numeric: "number",
  datetime: "date",
  boolean: "yes_no",
  yesno: "yes_no",
  bool: "yes_no",
  // scales
  star_rating: "rating",
  stars: "rating",
  scale: "opinion_scale",
  likert: "opinion_scale",
  linear_scale: "opinion_scale",
  net_promoter_score: "nps",
  // structural
  intro: "welcome",
  start: "welcome",
  info: "statement",
  message: "statement",
  upload: "file_upload",
  file: "file_upload",
  consent: "legal_consent",
  terms: "legal_consent",
  // money, booking and the rest — the four types the prompt used to forbid, so
  // a model that reached for one anyway had its choice thrown away.
  pay: "payment",
  upi: "payment",
  checkout: "payment",
  price: "payment",
  ticket: "payment",
  booking: "scheduling",
  book: "scheduling",
  calendar: "scheduling",
  appointment: "scheduling",
  meeting: "scheduling",
  rank: "ranking",
  order: "ranking",
  grid: "matrix",
  likert_grid: "matrix",
  sign: "signature",
  contact: "contact_info",
  location: "address",
  postal_address: "address",
};

const KNOWN_TYPES = new Set<string>(BLOCK_TYPES);

/**
 * `"method=upi; upi=acme@okicici; amount=499"` → a lookup.
 *
 * Values keep their case (a VPA and a URL both need it); keys do not. Anything
 * that is not a `key=value` pair is ignored rather than failing the block —
 * a model that writes prose here should cost the author a setting, not a
 * question.
 */
export function parseBlockConfig(raw: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (raw ?? "").split(/[;\n]+/)) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    const key = part.slice(0, at).trim().toLowerCase();
    const value = part.slice(at + 1).trim();
    if (key && value) out.set(key, value);
  }
  return out;
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  // "₹499", "499 INR", "499.00" — models quote amounts the way people write them.
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

/** A 3-letter code, or the currency implied by a symbol the model kept. */
function currencyOf(config: Map<string, string>): string | undefined {
  const raw = config.get("currency");
  if (raw && /^[a-z]{3}$/i.test(raw.trim())) return raw.trim().toUpperCase();
  const amount = config.get("amount") ?? "";
  if (/₹|rs\.?|rupee/i.test(amount + " " + (raw ?? ""))) return "INR";
  if (amount.includes("$")) return "USD";
  if (amount.includes("€")) return "EUR";
  if (amount.includes("£")) return "GBP";
  return undefined;
}

/** `"Row A|Row B"` → labelled rows, which is all the matrix shapes need. */
function labelled(raw: string | undefined): { id: string; label: string }[] {
  return (raw ?? "")
    .split("|")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, 20)
    .map((label) => ({ id: uid("mx"), label }));
}

/** Members of a fixed set, as the model may have listed them. */
function pickFields<T extends string>(raw: string | undefined, allowed: readonly T[]): T[] {
  const wanted = (raw ?? "")
    .split(/[|,]/)
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);
  const hits = allowed.filter((a) => wanted.includes(a));
  return hits.length > 0 ? hits : [...allowed];
}

function resolveType(raw: string): Block["type"] {
  const key = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (KNOWN_TYPES.has(key)) return key as Block["type"];
  return TYPE_ALIASES[key] ?? "short_text";
}

/** `Google Play` → `opt_google_play`, stable for the same label. */
function optionId(label: string, taken: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/(^_|_$)/g, "")
      .slice(0, 24) || "opt";
  let id = `opt_${base}`;
  let n = 2;
  while (taken.has(id)) id = `opt_${base}_${n++}`;
  taken.add(id);
  return id;
}

/** A ref the schema will accept: lowercase, snake_case, unique in this form. */
function normalizeRef(raw: string, index: number, taken: Set<string>): string {
  let base =
    (raw ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/(^[^a-z]+|_$)/g, "")
      .slice(0, 40) || `q_${index + 1}`;
  if (base.length < 2) base = `q_${index + 1}`;
  let ref = base;
  let n = 2;
  while (taken.has(ref)) ref = `${base}_${n++}`.slice(0, 40);
  taken.add(ref);
  return ref;
}

/** The model's placeholder scale is often 0; fall back rather than fail. */
function clampScale(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || value < min || value > max) return fallback;
  return value;
}

/** A block as the draft describes it, in the shape both drafts share. */
export interface LooseBlock {
  ref: string;
  type: string;
  title: string;
  description?: string;
  required: boolean;
  /** Choice labels, as the respondent reads them. */
  options: string[];
  scale?: number;
  /** Per-type setup as `key=value; key=value` — see `parseBlockConfig`. */
  config?: string;
}

export interface NormalizedBlock {
  block: Block;
  /** Option label → option id, so branch values can be resolved. */
  optionIds: Map<string, string>;
}

/**
 * Map one loose block onto the strict Block schema.
 *
 * Returns null only when the block cannot be salvaged at all — a choice
 * question with fewer than two options, which is not a choice.
 */
export function normalizeBlock(draft: LooseBlock, ref: string, isFirst: boolean): NormalizedBlock | null {
  const type = resolveType(draft.type);
  const config = parseBlockConfig(draft.config);
  const base = {
    id: uid("blk"),
    ref,
    title: draft.title,
    description: draft.description || undefined,
    required: draft.required,
  };

  const taken = new Set<string>();
  const optionIds = new Map<string, string>();
  const options = (draft.options ?? [])
    .map((label) => (typeof label === "string" ? label.trim() : ""))
    .filter((label) => label.length > 0)
    .map((label) => {
      const id = optionId(label, taken);
      optionIds.set(label.toLowerCase(), id);
      return { id, label };
    });

  const done = (block: Block): NormalizedBlock => ({ block, optionIds });

  try {
    // Whatever the model called the first block, it is the greeting.
    if (isFirst) return done(BlockSchema.parse({ ...base, type: "welcome", buttonLabel: "Start" }));

    switch (type) {
      case "welcome":
        return done(BlockSchema.parse({ ...base, type: "welcome", buttonLabel: "Start" }));
      case "statement":
        return done(BlockSchema.parse({ ...base, type: "statement", buttonLabel: "Continue" }));
      case "short_text":
        return done(BlockSchema.parse({ ...base, type: "short_text", minLength: 0, maxLength: 300 }));
      case "long_text":
        return done(BlockSchema.parse({ ...base, type: "long_text", minLength: 0, maxLength: 1500 }));
      case "email":
      case "phone":
      case "url":
      case "nps":
      case "signature":
        return done(BlockSchema.parse({ ...base, type }));
      case "date":
        return done(
          BlockSchema.parse({ ...base, type, disablePast: config.get("disablepast") === "true" }),
        );
      case "number":
        return done(
          BlockSchema.parse({
            ...base,
            type,
            min: num(config.get("min")),
            max: num(config.get("max")),
            integerOnly: config.get("integeronly") === "true",
            currency: currencyOf(config),
          }),
        );
      case "yes_no":
        return done(
          BlockSchema.parse({
            ...base,
            type,
            yesLabel: config.get("yes") ?? "Yes",
            noLabel: config.get("no") ?? "No",
          }),
        );
      case "contact_info":
        return done(
          BlockSchema.parse({
            ...base,
            type,
            fields: pickFields(config.get("fields"), CONTACT_FIELDS),
          }),
        );
      case "address":
        return done(
          BlockSchema.parse({
            ...base,
            type,
            fields: pickFields(config.get("fields"), ADDRESS_FIELDS),
          }),
        );
      case "legal_consent":
        return done(BlockSchema.parse({ ...base, type, required: true, consentText: draft.description || draft.title }));
      case "file_upload":
        return done(BlockSchema.parse({ ...base, type, accept: ["image/*", "application/pdf"], maxFiles: 1, maxSizeMB: 10 }));
      case "single_select":
      case "multi_select":
      case "dropdown":
      case "picture_choice": {
        // A choice question with one option is not a choice. Asking it as text
        // keeps the question — losing it entirely is what shifted whole drafts.
        if (options.length < 2) {
          return done(BlockSchema.parse({ ...base, type: "short_text", minLength: 0, maxLength: 300 }));
        }
        if (type === "multi_select") {
          return done(
            BlockSchema.parse({
              ...base,
              type,
              options,
              minSelections: base.required ? 1 : 0,
              maxSelections: options.length,
              allowOther: false,
            }),
          );
        }
        if (type === "picture_choice") {
          return done(BlockSchema.parse({ ...base, type, options, multiSelect: false }));
        }
        return done(BlockSchema.parse({ ...base, type, options, allowOther: false }));
      }
      case "rating":
        return done(
          BlockSchema.parse({ ...base, type: "rating", scale: clampScale(draft.scale, 1, 10, 5), shape: "star" }),
        );
      case "opinion_scale":
        return done(
          BlockSchema.parse({ ...base, type: "opinion_scale", steps: clampScale(draft.scale, 2, 11, 5), startAt: 1 }),
        );
      /**
       * Money, collected outside the form.
       *
       * The `url` and `upiId` the schema wants are optional there on purpose —
       * a half-built payment block saves, and the linter refuses to publish it
       * — so a request that names a price but no destination still produces a
       * payment block with a visible gap, rather than a text question that
       * silently collects nothing. That fallback is what turned "the ticket is
       * 499 rupees, UPI mohith808@axl" into a short-text box titled "Payment
       * Confirmation".
       */
      case "payment": {
        const upi = config.get("upi") ?? config.get("upiid") ?? config.get("vpa");
        const url = config.get("url") ?? config.get("link");
        const method = config.get("method")?.toLowerCase() === "upi" || (upi && !url) ? "upi" : "link";
        return done(
          BlockSchema.parse({
            ...base,
            type,
            method,
            amountMode: "fixed",
            amount: num(config.get("amount")),
            currency: currencyOf(config) ?? (method === "upi" ? "INR" : "USD"),
            ...(method === "upi"
              ? { upiId: upi, upiPayeeName: config.get("payee") }
              : { url: url && /^https?:\/\//.test(url) ? url : undefined }),
          }),
        );
      }
      /**
       * Booking against a calendar the builder owns. The link is not optional
       * in the schema and cannot be invented, so without one this is a question
       * about a time — which is a `date`, and is usually what was meant anyway.
       */
      case "scheduling": {
        const url = config.get("url") ?? config.get("link");
        if (!url || !/^https?:\/\//.test(url)) {
          return done(BlockSchema.parse({ ...base, type: "date", disablePast: true }));
        }
        return done(BlockSchema.parse({ ...base, type, provider: "external", url }));
      }
      case "ranking": {
        // The things being ranked come through as options, like any other list.
        if (options.length < 2) {
          return done(BlockSchema.parse({ ...base, type: "short_text", minLength: 0, maxLength: 300 }));
        }
        return done(BlockSchema.parse({ ...base, type, items: options.slice(0, 12) }));
      }
      case "matrix": {
        const rows = labelled(config.get("rows"));
        // A grid needs both axes; one of them alone is a plain choice question.
        if (rows.length < 1 || options.length < 2) {
          if (options.length < 2) {
            return done(BlockSchema.parse({ ...base, type: "short_text", minLength: 0, maxLength: 300 }));
          }
          return done(BlockSchema.parse({ ...base, type: "single_select", options, allowOther: false }));
        }
        return done(
          BlockSchema.parse({
            ...base,
            type,
            rows: rows.slice(0, 20),
            columns: options.slice(0, 10),
            multiplePerRow: config.get("multipleperrow") === "true",
          }),
        );
      }
    }
  } catch {
    // A field the schema rejected outright (a title over 2000 chars, say).
    try {
      return done(
        BlockSchema.parse({
          ...base,
          title: base.title.slice(0, 2000),
          description: base.description?.slice(0, 5000),
          type: "short_text",
          minLength: 0,
          maxLength: 300,
        }),
      );
    } catch {
      return null;
    }
  }
}

/** A flat draft branch, as both draft schemas now express one. */
export interface LooseBranch {
  whenRef: string;
  op: DraftBranch["when"]["op"];
  value: string;
  then: string;
}

/**
 * Flat draft branches → the nested shape `buildFlowRules` derives from.
 *
 * The interesting part is the value. The model is asked for the option's LABEL
 * because that is the only thing it reliably knows — it wrote the label — while
 * the ids are ours, derived after the fact. So "Android" becomes `opt_android`
 * here, by looking it up in the block that owns it. A value that matches no
 * option is kept as written: on a text or number question it is the literal to
 * compare against, and on a choice question `buildFlowRules` and the linter
 * will drop the rule rather than route to nowhere.
 */
export function resolveBranches(
  branches: LooseBranch[],
  blocks: Block[],
  optionIdsByRef: Map<string, Map<string, string>>,
): DraftBranch[] {
  const byRef = new Map(blocks.map((b) => [b.ref, b]));
  const out: DraftBranch[] = [];

  for (const br of branches) {
    const block = byRef.get(br.whenRef);
    if (!block) continue;

    let value: string | number | boolean | null = br.value ?? "";
    if (br.op === "is_empty" || br.op === "is_not_empty") {
      value = null;
    } else {
      const raw = String(value).trim();
      const optionIds = optionIdsByRef.get(br.whenRef);
      const matched = optionIds?.get(raw.toLowerCase());
      if (matched) {
        value = matched;
      } else if ("options" in block && Array.isArray(block.options)) {
        // The model may have written the id after all, or a label whose case or
        // punctuation drifted. Match against the block's own options both ways.
        const opts = block.options as { id: string; label: string }[];
        const hit =
          opts.find((o) => o.id.toLowerCase() === raw.toLowerCase()) ??
          opts.find((o) => o.label.toLowerCase() === raw.toLowerCase()) ??
          opts.find((o) => o.label.toLowerCase().includes(raw.toLowerCase()) && raw.length > 2);
        value = hit ? hit.id : raw;
      } else if (block.type === "yes_no") {
        value = /^(y|yes|true|1)$/i.test(raw) ? true : /^(n|no|false|0)$/i.test(raw) ? false : raw;
      } else if (block.type === "number" || block.type === "nps" || block.type === "rating" || block.type === "opinion_scale") {
        const n = Number(raw);
        value = Number.isFinite(n) ? n : raw;
      } else {
        value = raw;
      }
    }

    out.push({ when: { ref: br.whenRef, op: br.op, value }, then: br.then });
  }

  return out;
}

export interface NormalizedDraft {
  doc: ReturnType<typeof FormDoc.parse>;
  issues: ReturnType<typeof lintFormDoc>;
  /** Questions that survived normalization, for progress reporting. */
  blocks: Block[];
  /** Branching rules the flow ended up with. */
  ruleCount: number;
}

/**
 * A whole generation draft → a FormDoc, ready to store.
 *
 * Throws only if the document is unusable (fewer than two blocks); anything
 * else is repaired. Lint issues are returned rather than thrown so the caller
 * can decide whether to retry.
 */
export function draftToDoc(draft: GenerationDraft): NormalizedDraft {
  const takenRefs = new Set<string>();
  const blocks: Block[] = [];
  const optionIdsByRef = new Map<string, Map<string, string>>();

  for (const [i, b] of draft.blocks.entries()) {
    const ref = normalizeRef(b.ref, i, takenRefs);
    const normalized = normalizeBlock({ ...b, options: b.options ?? [] }, ref, i === 0);
    if (!normalized) continue;
    blocks.push(normalized.block);
    optionIdsByRef.set(ref, normalized.optionIds);
  }

  if (blocks.length < 2) throw new Error("draft had fewer than two usable blocks");

  const takenEndingRefs = new Set<string>();
  const endings = draft.endings.map((e, i) => {
    let ref =
      (e.ref ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .slice(0, 34) || `end_${i + 1}`;
    if (!ref.startsWith("end_")) ref = `end_${ref}`.slice(0, 34);
    let candidate = ref;
    let n = 2;
    while (takenEndingRefs.has(candidate)) candidate = `${ref}_${n++}`.slice(0, 34);
    takenEndingRefs.add(candidate);
    return {
      id: uid("end"),
      ref: candidate,
      title: e.title,
      bodyMd: e.body,
      redirectDelaySec: 5,
      showSummary: false,
    };
  });

  const logic = buildFlowRules(
    resolveBranches(draft.branches ?? [], blocks, optionIdsByRef),
    blocks,
    endings.map((e) => e.ref),
  );

  const doc = FormDoc.parse({
    schemaVersion: 1,
    title: draft.title,
    description: draft.description,
    blocks,
    endings,
    logic,
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  } satisfies FormDocInput);

  return { doc, issues: lintFormDoc(doc), blocks, ruleCount: logic.length };
}

/** The edit draft's new blocks, normalized against a form that already exists. */
export function normalizeEditBlocks(
  draft: EditDraft,
  existingRefs: Set<string>,
): { blocks: { block: Block; insertAfter: string }[]; optionIdsByRef: Map<string, Map<string, string>>; renamed: Map<string, string> } {
  const taken = new Set(existingRefs);
  const out: { block: Block; insertAfter: string }[] = [];
  const optionIdsByRef = new Map<string, Map<string, string>>();
  const renamed = new Map<string, string>();

  for (const [i, b] of draft.addBlocks.entries()) {
    const resolved = resolveType(b.type);
    // The builder is asking for questions, not a new greeting or a sign-off.
    if (resolved === "welcome" || resolved === "statement") continue;
    const ref = normalizeRef(b.ref, i, taken);
    if (ref !== b.ref) renamed.set(b.ref, ref);
    const normalized = normalizeBlock({ ...b, options: b.options ?? [] }, ref, false);
    if (!normalized) continue;
    out.push({ block: normalized.block, insertAfter: b.insertAfter ?? "" });
    optionIdsByRef.set(ref, normalized.optionIds);
  }

  return { blocks: out, optionIdsByRef, renamed };
}
