import { z } from "zod";
import type { RespondentAuthMethod } from "./respondent";
import { AnswerMap } from "./answers";
import { Block, type BlockMedia } from "./blocks";
import { Ending, HiddenField, LogicRule, Variable } from "./logic";
import { SettingsDoc, ThemeDoc } from "./settings";
import { buildUpiUri } from "./payment-link";

export const SCHEMA_VERSION = 4;

export const FormDoc = z.object({
  schemaVersion: z.number().int().positive().default(SCHEMA_VERSION),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  blocks: z.array(Block).min(1).max(200),
  endings: z.array(Ending).min(1).max(20),
  /** Rules evaluated after the last completed block; first matching goto(ending) wins. */
  endingRules: z.array(LogicRule).default([]),
  /** Rules evaluated after each recorded answer, in array order. */
  logic: z.array(LogicRule).default([]),
  /** Visual workflow editor positions, keyed by block/ending ref or rule id. */
  layout: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).default({}),
  variables: z.array(Variable).default([]),
  hiddenFields: z.array(HiddenField).default([]),
  settings: SettingsDoc.prefault({}),
  theme: ThemeDoc.prefault({}),
});

export type FormDoc = z.output<typeof FormDoc>;
export type FormDocInput = z.input<typeof FormDoc>;

/** Public projection of a block — safe for respondents (no scores, no logic internals). */
export interface PublicBlock {
  id: string;
  ref: string;
  type: Block["type"];
  title: string;
  description?: string;
  required: boolean;
  imageKey?: string | null;
  options?: { id: string; label: string; description?: string; imageKey?: string | null }[];
  items?: { id: string; label: string }[];
  rows?: { id: string; label: string }[];
  columns?: { id: string; label: string }[];
  multiplePerRow?: boolean;
  scale?: number;
  shape?: string;
  steps?: number;
  startAt?: number;
  labels?: { low?: string; high?: string };
  yesLabel?: string;
  noLabel?: string;
  accept?: string[];
  maxFiles?: number;
  maxSizeMB?: number;
  fields?: string[];
  consentText?: string;
  buttonLabel?: string;
  currency?: string;
  amount?: number;
  dateFormat?: string;
  placeholder?: string;
  maxLength?: number;
  /** date: ISO bounds the composer must respect. */
  minDate?: string;
  maxDate?: string;
  disablePast?: boolean;
  /** date: also ask for a time of day, turning the answer into an appointment. */
  includeTime?: boolean;
  timeStepMinutes?: number;
  timeMin?: string;
  timeMax?: string;
  /** scheduling: the external booking link. payment (method "link"): the checkout page. */
  url?: string;
  /** payment: how the respondent is asked to pay. */
  paymentMethod?: "link" | "upi";
  /** payment (method "upi"): the ready-to-scan `upi://pay` URI, built server-side. */
  upiUri?: string;
  /** payment (method "upi"): shown as text so the payer can copy it into their own app. */
  upiId?: string;
  payeeName?: string;
  /** signature: whether to also collect a typed name. */
  drawnNameRequired?: boolean;
  /** number: bounds, so the composer can constrain input. */
  min?: number;
  max?: number;
  integerOnly?: boolean;
  /** multi_select: how many may be picked. */
  minSelections?: number;
  maxSelections?: number;
  allowOther?: boolean;
  /** Image, video or downloadable file shown with the question. */
  media?: BlockMedia | null;
}

export function toPublicBlock(b: Block): PublicBlock {
  const pub: PublicBlock = {
    id: b.id,
    ref: b.ref,
    type: b.type,
    title: b.title,
    description: b.description,
    required: b.required,
    imageKey: b.image_key,
    media: b.media,
  };
  switch (b.type) {
    case "welcome":
    case "statement":
      pub.buttonLabel = b.buttonLabel;
      break;
    case "single_select":
    case "multi_select":
    case "dropdown":
    case "picture_choice":
      pub.options = b.options.map((o) => ({
        id: o.id,
        label: o.label,
        description: o.description,
        imageKey: o.image_key,
      }));
      if (b.type === "multi_select") {
        pub.minSelections = b.minSelections;
        pub.maxSelections = b.maxSelections;
      }
      if (b.type === "single_select" || b.type === "multi_select") {
        pub.allowOther = b.allowOther;
      }
      break;
    case "ranking":
      pub.items = b.items;
      break;
    case "date":
      pub.minDate = b.min;
      pub.maxDate = b.max;
      pub.disablePast = b.disablePast;
      pub.dateFormat = b.dateFormat;
      pub.includeTime = b.includeTime;
      pub.timeStepMinutes = b.timeStepMinutes;
      pub.timeMin = b.timeMin;
      pub.timeMax = b.timeMax;
      break;
    case "scheduling":
      pub.url = b.url;
      break;
    case "signature":
      pub.drawnNameRequired = b.drawnNameRequired;
      break;
    case "number":
      pub.min = b.min;
      pub.max = b.max;
      pub.integerOnly = b.integerOnly;
      pub.currency = b.currency;
      break;
    case "matrix":
      pub.rows = b.rows;
      pub.columns = b.columns;
      pub.multiplePerRow = b.multiplePerRow;
      break;
    case "rating":
      pub.scale = b.scale;
      pub.shape = b.shape;
      break;
    case "nps":
      pub.labels = { low: b.labelLow, high: b.labelHigh };
      break;
    case "opinion_scale":
      pub.steps = b.steps;
      pub.startAt = b.startAt;
      pub.labels = { low: b.labelLow, high: b.labelHigh };
      break;
    case "yes_no":
      pub.yesLabel = b.yesLabel;
      pub.noLabel = b.noLabel;
      break;
    case "file_upload":
      pub.accept = b.accept;
      pub.maxFiles = b.maxFiles;
      pub.maxSizeMB = b.maxSizeMB;
      break;
    case "contact_info":
      pub.fields = b.fields;
      break;
    case "address":
      pub.fields = b.fields;
      break;
    case "legal_consent":
      pub.consentText = b.consentText;
      break;
    case "payment": {
      pub.currency = b.currency;
      // A variable amount has nothing to resolve at publish time, so it is left
      // undefined: the checkout page states the price, and a UPI URI without
      // `am` lets the payer enter it. Better than publishing a wrong number.
      pub.amount = b.amountMode === "fixed" ? b.amount : undefined;
      pub.paymentMethod = b.method;
      if (b.method === "upi") {
        pub.upiId = b.upiId;
        pub.payeeName = b.upiPayeeName;
        pub.upiUri =
          b.upiId
            ? (buildUpiUri({ upiId: b.upiId, payeeName: b.upiPayeeName, amount: pub.amount }) ?? undefined)
            : undefined;
      } else {
        pub.url = b.url;
      }
      break;
    }
    case "short_text":
    case "long_text":
      pub.placeholder = b.placeholder;
      pub.maxLength = b.maxLength;
      break;
    default:
      break;
  }
  return pub;
}

export interface PublicEnding {
  ref: string;
  title: string;
  bodyMd: string;
  ctaLabel?: string;
  ctaUrl?: string;
  redirectUrl?: string;
  redirectDelaySec: number;
  showSummary: boolean;
}

/**
 * `fallback` carries `settings.onComplete`, which is the form-level "redirect
 * after completion" the builder offers. It was parsed and stored and never
 * reached the respondent, because the client only ever reads the ending's own
 * redirect — so setting it did nothing. A per-ending value still wins; this is
 * the default beneath it.
 */
export function toPublicEnding(e: Ending, fallback?: { redirectUrl?: string; delaySec: number }): PublicEnding {
  return {
    ref: e.ref,
    title: e.title,
    bodyMd: e.bodyMd,
    ctaLabel: e.ctaLabel,
    ctaUrl: e.ctaUrl,
    redirectUrl: e.redirectUrl ?? fallback?.redirectUrl,
    redirectDelaySec: e.redirectUrl ? e.redirectDelaySec : (fallback?.delaySec ?? e.redirectDelaySec),
    showSummary: e.showSummary,
  };
}

/** Everything a respondent-side client needs to render a form. */
export interface PublicFormConfig {
  slug: string;
  title: string;
  description?: string;
  blocks: PublicBlock[];
  endings: PublicEnding[];
  hiddenFieldNames: string[];
  progressBar: "percent" | "steps" | "none";
  allowBack: boolean;
  allowSkip: boolean;
  brandingHidden: boolean;
  agentMode: "template" | "hybrid" | "ai";
  theme: ThemeDoc;
  /**
   * Null when the form is open to anyone. When set, the client must not send a
   * turn until the session reports a verified identity — but the gate is
   * enforced in the DO, not here; this only says what to render.
   */
  requireAuth: {
    methods: RespondentAuthMethod[];
    message: string;
  } | null;
  captchaEnabled: boolean;
  closed?: boolean;
  closedMessage?: string;
  /**
   * Social/SEO metadata. `settings.meta` existed but was never projected, so
   * the hosted form had no OG tags and every share preview was blank.
   */
  meta?: {
    ogTitle?: string;
    ogDescription?: string;
    ogImageUrl?: string;
    noIndex: boolean;
  };
  /** The agent's display name, when the builder set one. */
  agentName?: string;
  /** Whether one person may answer more than once. */
  duplicates: "none" | "ip_daily" | "field";
  /** Whether the form asks for an explicit submit once everything is answered. */
  requireSubmit: boolean;
}

export function toPublicConfig(
  doc: FormDoc,
  opts: {
    slug: string;
    brandingHidden: boolean;
    closed?: boolean;
    closedMessage?: string;
    /** Resolves `settings.meta.ogImageKey` to a public URL. */
    assetUrl?: (key: string) => string;
  },
): PublicFormConfig {
  const metaSettings = doc.settings.meta;
  const ogImageKey = metaSettings.ogImageKey;
  return {
    meta: {
      ogTitle: metaSettings.ogTitle,
      ogDescription: metaSettings.ogDescription,
      ogImageUrl: ogImageKey && opts.assetUrl ? opts.assetUrl(ogImageKey) : undefined,
      noIndex: metaSettings.noIndex,
    },
    agentName: doc.settings.agent.displayName,
    duplicates: doc.settings.duplicates.strategy,
    requireSubmit: doc.settings.onComplete.requireSubmit,
    slug: opts.slug,
    title: doc.title,
    description: doc.description,
    blocks: doc.blocks.map(toPublicBlock),
    endings: doc.endings.map((e) => toPublicEnding(e, doc.settings.onComplete)),
    hiddenFieldNames: doc.hiddenFields.map((h) => h.name),
    progressBar: doc.settings.progressBar,
    allowBack: doc.settings.navigation.allowBack,
    allowSkip: doc.settings.navigation.allowSkip,
    brandingHidden: opts.brandingHidden,
    agentMode: doc.settings.agent.mode,
    theme: doc.theme,
    requireAuth: doc.settings.requireAuth.enabled
      ? { methods: doc.settings.requireAuth.methods, message: doc.settings.requireAuth.message }
      : null,
    captchaEnabled: doc.settings.captcha.enabled,
    closed: opts.closed,
    closedMessage: opts.closedMessage,
  };
}

export type { AnswerMap };
