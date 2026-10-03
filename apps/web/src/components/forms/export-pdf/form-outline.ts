import {
  contactFieldLabel,
  describeAccept,
  isScreenOut,
  type Block,
  type BlockType,
  type Condition,
  type ConditionGroup,
  type FormDoc,
} from "@repo/form-schema";
import { blockMeta, type BlockTone } from "@/components/builder/block-library";
import { conditionText, edgeLabel } from "@/components/builder/branch-layout";
import { isGoto } from "@/components/builder/flow-graph";

/**
 * A form, read out as a document.
 *
 * Everything the PDF prints, worked out here and nowhere else, so the page
 * components only lay text out and this can be tested without rendering a PDF.
 * Every value carries its own label: a bare "500" on a printed page is a number
 * nobody can place.
 */

export interface Fact {
  label: string;
  value: string;
}

export interface OutlineChoice {
  label: string;
  description?: string;
  /** "Other", which the respondent writes in rather than picks. */
  writeIn?: boolean;
}

export interface OutlineQuestion {
  /** The same number the Questions list and the flow canvas put on it. */
  number: number;
  type: BlockType;
  typeLabel: string;
  tone: BlockTone;
  title: string;
  description?: string;
  /** Welcome and message blocks say something; they ask nothing. */
  asks: boolean;
  required: boolean;
  /** What the respondent picks from, in order. */
  choices: OutlineChoice[];
  /** A matrix: rows answered against the same columns. */
  grid?: { rows: string[]; columns: string[] };
  /** A long passage the question shows, such as consent terms. */
  passage?: string;
  facts: Fact[];
  /** Where each answer goes next, in the order the builder lists them. */
  routes: Fact[];
  /** Asked only when this holds. */
  shownWhen?: string;
}

export interface OutlineEnding {
  title: string;
  screenOut: boolean;
  body?: string;
  facts: Fact[];
  requirements: string[];
}

export interface FormOutline {
  title: string;
  description?: string;
  stats: Fact[];
  questions: OutlineQuestion[];
  endings: OutlineEnding[];
  overview: OverviewGroup[];
}

const CHOICE_TYPES = new Set<BlockType>(["single_select", "multi_select", "poll", "dropdown", "picture_choice"]);

export function outlineForm(doc: FormDoc, extras: OutlineExtras = {}): FormOutline {
  const numberOf = new Map(doc.blocks.map((b, i) => [b.ref, i + 1]));
  const endingByRef = new Map(doc.endings.map((e) => [e.ref, e]));
  const gotos = doc.logic.filter(isGoto);

  const nameTarget = (ref: string): string => {
    const ending = endingByRef.get(ref);
    if (ending) return `Ending: ${ending.title}`;
    const block = doc.blocks.find((b) => b.ref === ref);
    return block ? `Q${numberOf.get(ref)} ${block.title}` : "a step that no longer exists";
  };

  const questions = doc.blocks.map((block, i): OutlineQuestion => {
    const meta = blockMeta(block.type);
    const routes = gotos
      .filter((r) => r.from === block.ref)
      .map((r) => ({
        label: r.when && r.when.conditions.length > 0 ? `If ${routeCondition(block, r.when)}` : "Otherwise",
        value: nameTarget(r.target),
      }))
      // "Otherwise" last, however the rules happen to be stored.
      .sort((a, b) => Number(a.label === "Otherwise") - Number(b.label === "Otherwise"));
    const visibility = block.visibility && hasConditions(block.visibility) ? block.visibility : null;
    return {
      number: i + 1,
      type: block.type,
      typeLabel: meta.label,
      tone: meta.tone,
      title: block.title,
      description: block.description?.trim() || undefined,
      asks: block.type !== "welcome" && block.type !== "statement",
      required: block.required,
      choices: choicesOf(block),
      grid: block.type === "matrix" ? { rows: block.rows.map((r) => r.label), columns: block.columns.map((c) => c.label) } : undefined,
      passage: block.type === "legal_consent" ? block.consentText : undefined,
      facts: factsOf(block),
      routes,
      shownWhen: visibility ? groupSentence(visibility, doc.blocks, numberOf) : undefined,
    };
  });

  const endings = doc.endings.map((ending): OutlineEnding => {
    const reachedBy = doc.endingRules
      .filter((r) => r.action_kind === "goto" && r.target === ending.ref && r.when && hasConditions(r.when))
      .map((r) => groupSentence(r.when!, doc.blocks, numberOf));
    const facts: Fact[] = [];
    if (reachedBy.length > 0) facts.push({ label: "Reached when", value: reachedBy.join("; or ") });
    if (ending.ctaLabel) facts.push({ label: "Button", value: ending.ctaUrl ? `${ending.ctaLabel} (${ending.ctaUrl})` : ending.ctaLabel });
    if (ending.redirectUrl) {
      facts.push({ label: "Redirects to", value: `${ending.redirectUrl} after ${ending.redirectDelaySec}s` });
    }
    if (ending.showSummary) facts.push({ label: "Answer summary", value: "Shown" });
    return {
      title: ending.title,
      screenOut: isScreenOut(ending),
      body: plainText(ending.bodyMd) || undefined,
      facts,
      requirements: ending.requirements.map((r) => r.label),
    };
  });

  const asked = questions.filter((q) => q.asks);
  const branching = new Set(gotos.filter((r) => r.from && r.when && hasConditions(r.when)).map((r) => r.from)).size;
  const stats: Fact[] = [
    { label: "Questions", value: String(asked.length) },
    { label: "Required", value: String(asked.filter((q) => q.required).length) },
    { label: "Branching points", value: String(branching) },
    { label: "Endings", value: String(doc.endings.length) },
  ];

  return {
    title: doc.title,
    description: doc.description?.trim() || undefined,
    stats,
    questions,
    endings,
    overview: overviewOf(doc, extras),
  };
}

function choicesOf(block: Block): OutlineChoice[] {
  if (CHOICE_TYPES.has(block.type) && "options" in block) {
    const list: OutlineChoice[] = block.options.map((o) => ({ label: o.label, description: o.description }));
    if ("allowOther" in block && block.allowOther) list.push({ label: "Other", writeIn: true });
    return list;
  }
  switch (block.type) {
    case "yes_no":
      return [{ label: block.yesLabel }, { label: block.noLabel }];
    case "ranking":
      return block.items.map((item) => ({ label: item.label }));
    case "legal_consent":
      return block.allowDecline ? [{ label: block.agreeLabel }, { label: block.declineLabel }] : [{ label: block.agreeLabel }];
    case "contact_info":
    case "address":
      return block.fields.map((f) => ({ label: contactFieldLabel(f) }));
    case "field_group":
      return block.fields.map((f) => ({
        label: f.label,
        description: [kindLabel(f.kind), f.required ? "required" : "optional"].join(", "),
      }));
    default:
      return [];
  }
}

function factsOf(block: Block): Fact[] {
  const facts: Fact[] = [];
  const add = (label: string, value: string | number | undefined | null | false) => {
    if (value === undefined || value === null || value === false || value === "") return;
    facts.push({ label, value: String(value) });
  };
  const on = (label: string, flag: boolean | undefined) => flag && facts.push({ label, value: "On" });

  switch (block.type) {
    case "welcome":
    case "statement":
      add("Button", block.buttonLabel);
      break;
    case "short_text":
      add("Placeholder", block.placeholder);
      add("Length", lengthRange(block.minLength, block.maxLength, 500));
      add("Must match pattern", block.pattern);
      on("One answer per person", block.unique);
      break;
    case "long_text":
      add("Placeholder", block.placeholder);
      add("Length", lengthRange(block.minLength, block.maxLength, 2000));
      on("AI quality check", block.aiQualityCheck);
      break;
    case "email":
      on("Verify with a code", block.verify);
      on("Work emails only", block.businessOnly);
      add("Allowed domains", block.allowedDomains.join(", "));
      on("One answer per person", block.unique);
      break;
    case "phone":
      add("Default country", block.countryHint);
      on("Verify by SMS", block.verify);
      on("One answer per person", block.unique);
      break;
    case "url":
      on("HTTPS only", block.httpsOnly);
      on("One answer per person", block.unique);
      break;
    case "number":
      add("Minimum", block.min);
      add("Maximum", block.max);
      on("Whole numbers only", block.integerOnly);
      add("Currency", block.currency);
      on("One answer per person", block.unique);
      break;
    case "date":
      add("Format", block.dateFormat);
      add("Earliest", block.min);
      add("Latest", block.max);
      on("No past dates", block.disablePast);
      if (block.includeTime) {
        add("Time", `${block.timeMin} to ${block.timeMax}, every ${block.timeStepMinutes} min`);
      }
      break;
    case "multi_select":
      add("Pick", block.minSelections === block.maxSelections ? `exactly ${block.minSelections}` : `${block.minSelections} to ${block.maxSelections}`);
      break;
    case "poll":
      add("Results", block.showResults ? `Shown after ${block.minResponsesToReveal} responses` : "Hidden");
      break;
    case "picture_choice":
      add("Selection", block.multiSelect ? "Several" : "One");
      break;
    case "rating":
      add("Scale", `1 to ${block.scale}, ${block.shape === "number" ? "numbers" : `${block.shape}s`}`);
      break;
    case "nps":
      add("Scale", "0 to 10");
      add("Low end", block.labelLow);
      add("High end", block.labelHigh);
      break;
    case "opinion_scale":
      add("Scale", `${block.startAt} to ${block.startAt + block.steps - 1}`);
      add("Low end", block.labelLow);
      add("High end", block.labelHigh);
      break;
    case "matrix":
      add("Per row", block.multiplePerRow ? "Several answers" : "One answer");
      break;
    case "file_upload":
      add("Accepts", describeAccept(block.accept));
      add("Files", `Up to ${block.maxFiles}`);
      add("Max size", `${block.maxSizeMB} MB each`);
      break;
    case "signature":
      on("Typed name required", block.drawnNameRequired);
      break;
    case "payment":
      add("Method", block.method === "upi" ? "UPI" : block.method === "gateway" ? "Card checkout" : "Payment link");
      if (block.amountMode === "fixed" && block.amount !== undefined) add("Amount", money(block.amount, block.currency));
      if (block.amountMode === "variable") {
        add("Amount", "Respondent chooses");
        add("Minimum", block.minAmount !== undefined ? money(block.minAmount, block.currency) : undefined);
        add("Maximum", block.maxAmount !== undefined ? money(block.maxAmount, block.currency) : undefined);
      }
      if (block.amountMode === "answer") add("Amount", "Priced from an earlier answer");
      add("Link", block.method === "link" ? block.url : undefined);
      add("UPI ID", block.method === "upi" ? block.upiId : undefined);
      break;
    case "scheduling":
      add("Booking link", block.url);
      break;
    case "address":
      add("Current location", block.location === "off" ? undefined : block.location === "required" ? "Required" : "Optional");
      add("Countries", block.countryWhitelist?.join(", "));
      break;
    case "field_group":
      add("Entries", `${block.minEntries} to ${block.maxEntries} ${block.itemLabel.toLowerCase()}s`);
      break;
    case "legal_consent":
      add("Decline", block.allowDecline ? "Allowed" : "Not offered");
      break;
  }

  if (block.media) add("Attached", block.media.kind === "file" ? (block.media.filename ?? "A file") : `An ${block.media.kind}`);
  add("Prefilled from", block.prefillParam ? `?${block.prefillParam}=` : undefined);
  add("How to ask", block.agentHints?.askStyle);
  add("Why we ask", block.agentHints?.whyWeAsk);
  return facts;
}

/**
 * What lives around the questions and is not in the document: fetched when
 * the export runs. Each is optional, because a viewer may not be allowed to
 * read one, and a missing section beats a failed export.
 */
export interface OutlineExtras {
  integrations?: { provider: string; status: string }[];
  webhooks?: { formId: string | null; active: boolean }[];
  knowledge?: { enabled: boolean; sources: { status: string }[] };
  paymentAccounts?: { id: string; provider: string; label: string; environment: string }[];
}

export interface OverviewGroup {
  title: string;
  facts: Fact[];
}

const STYLE_LABELS: Record<string, string> = {
  template: "Scripted: your questions, word for word",
  hybrid: "Hybrid: your questions, with AI when needed",
  ai: "Agentic: AI runs the whole conversation",
};

const INTEGRATION_LABELS: Record<string, string> = {
  spreadsheet_feed: "Spreadsheet feed",
  google_sheets: "Google Sheets",
};

/**
 * The first page: how the form behaves, in the few settings that decide it.
 *
 * Not every setting. The ones somebody reading a printout would ask about:
 * who it talks like, who can get in, what happens at the end and who hears
 * about it, and what it is wired to. A row that would only say "default" is
 * left out, except where "off" is itself the answer people look for.
 */
export function overviewOf(doc: FormDoc, extras: OutlineExtras = {}): OverviewGroup[] {
  const s = doc.settings;
  const groups: OverviewGroup[] = [];

  const talk: Fact[] = [{ label: "Interview style", value: STYLE_LABELS[s.agent.mode] ?? s.agent.mode }];
  if (s.agent.mode !== "template") talk.push({ label: "Tone", value: capitalise(s.agent.tone) });
  if (s.agent.displayName) talk.push({ label: "Speaks as", value: s.agent.displayName });
  talk.push({ label: "Language", value: s.language.toUpperCase() });
  if (s.agent.goal) talk.push({ label: "Goal", value: clip(s.agent.goal, 220) });
  groups.push({ title: "Conversation", facts: talk });

  const access: Fact[] = [
    { label: "Sign-in", value: s.requireAuth.enabled ? `Required, ${authLabel(s.requireAuth.method)}` : "Not required" },
  ];
  // Only whether there is one. The password itself never goes on paper.
  if (s.password.enabled) access.push({ label: "Password", value: "Protected" });
  access.push({ label: "Responses", value: s.allowResubmissions ? "More than one per person" : "One per person" });
  if (s.closeRules.closeAt) access.push({ label: "Closes", value: new Date(s.closeRules.closeAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) });
  if (s.closeRules.maxSubmissions) access.push({ label: "Response limit", value: String(s.closeRules.maxSubmissions) });
  groups.push({ title: "Who can answer", facts: access });

  const done: Fact[] = [];
  done.push({
    label: "Confirmation to respondent",
    value: s.onComplete.autoReplyEmail.enabled ? (s.onComplete.autoReplyEmail.includeAnswers ? "Emailed, with their answers" : "Emailed") : "Off",
  });
  done.push({
    label: "New responses emailed to",
    value:
      s.onComplete.notifyOwner && s.onComplete.notificationEmails.length > 0
        ? s.onComplete.notificationEmails.join(", ")
        : "Nobody",
  });
  groups.push({ title: "Email notifications", facts: done });

  const follow = s.followUp;
  groups.push({
    title: "Automated follow-ups",
    facts: follow.enabled
      ? [
          { label: "Status", value: "On, for people who leave partway" },
          { label: "Emails", value: follow.steps.map((st) => afterHours(st.delayHours)).join(", ") },
        ]
      : [{ label: "Status", value: "Off" }],
  });

  const payments = doc.blocks.filter((b) => b.type === "payment");
  if (payments.length > 0) {
    groups.push({
      title: "Payments",
      facts: payments.map((b) => {
        const account = b.paymentAccountId ? extras.paymentAccounts?.find((a) => a.id === b.paymentAccountId) : undefined;
        const how =
          b.method === "gateway"
            ? account
              ? `${capitalise(account.provider)} checkout${account.environment === "test" ? " (test mode)" : ""}`
              : "Card checkout"
            : b.method === "upi"
              ? "UPI"
              : "Payment link";
        const amount = b.amountMode === "fixed" && b.amount !== undefined ? `, ${money(b.amount, b.currency)}` : "";
        return { label: clip(b.title, 60), value: `${how}${amount}` };
      }),
    });
  }

  const wired: Fact[] = [];
  for (const i of extras.integrations ?? []) {
    wired.push({ label: INTEGRATION_LABELS[i.provider] ?? capitalise(i.provider.replaceAll("_", " ")), value: i.status === "active" ? "Connected" : capitalise(i.status) });
  }
  const hooks = (extras.webhooks ?? []).filter((w) => w.active);
  if (hooks.length > 0) wired.push({ label: "Webhooks", value: `${hooks.length} sending responses` });
  const ready = extras.knowledge?.sources.filter((k) => k.status === "ready").length ?? 0;
  if (extras.knowledge && (extras.knowledge.enabled || ready > 0)) {
    wired.push({ label: "Knowledge base", value: extras.knowledge.enabled ? `${ready} resource${ready === 1 ? "" : "s"}, answers questions` : "Off" });
  }
  if (doc.hiddenFields.length > 0) wired.push({ label: "Hidden fields", value: doc.hiddenFields.map((h) => h.name).join(", ") });
  if (wired.length > 0) groups.push({ title: "Connected", facts: wired });

  return groups;
}

function authLabel(method: string): string {
  return method === "google" ? "Google" : method === "email" ? "email code" : method === "phone" ? "phone code" : method;
}

function afterHours(hours: number): string {
  return hours % 24 === 0 ? `after ${hours / 24} day${hours === 24 ? "" : "s"}` : `after ${hours}h`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A route's test, said from the question it leaves: "“Yes”", "greater than 5". */
function routeCondition(block: Block, when: ConditionGroup): string {
  const joiner = when.op === "and" ? " and " : " or ";
  return when.conditions
    .map((c) => {
      const phrase = edgeLabel(block, c);
      return phrase === conditionText(c) ? `answer ${fullConditionText(c)}` : `“${phrase}”`;
    })
    .join(joiner);
}

/** A test that may read any question, so each part names the one it reads. */
function groupSentence(group: ConditionGroup, blocks: Block[], numberOf: Map<string, number>): string {
  const parts = group.conditions.map((c) => conditionSentence(c, blocks, numberOf));
  for (const sub of group.groups) {
    if (hasConditions(sub)) parts.push(`(${groupSentence(sub, blocks, numberOf)})`);
  }
  return parts.join(group.op === "and" ? " and " : " or ");
}

function conditionSentence(c: Condition, blocks: Block[], numberOf: Map<string, number>): string {
  const block = c.left.kind === "ref" ? (blocks.find((b) => b.ref === (c.left as { ref: string }).ref) ?? null) : null;
  const subject = block
    ? `Q${numberOf.get(block.ref)}`
    : c.left.kind === "variable"
      ? `${c.left.name}`
      : c.left.kind === "hidden"
        ? `${c.left.name}`
        : "the answer";
  const phrase = edgeLabel(block, c);
  return phrase === conditionText(c) ? `${subject} ${fullConditionText(c)}` : `${subject} is “${phrase}”`;
}

/** `conditionText` cuts the value to fit a wire; paper has the room. */
function fullConditionText(c: Condition): string {
  const base = conditionText({ op: c.op });
  if (c.value === undefined || c.value === null) return base;
  const value = Array.isArray(c.value) ? c.value.join(", ") : String(c.value);
  return `${base} ${value}`;
}

function hasConditions(group: ConditionGroup): boolean {
  return group.conditions.length > 0 || group.groups.some(hasConditions);
}

function lengthRange(min: number, max: number, defaultMax: number): string | undefined {
  if (min === 0 && max === defaultMax) return undefined;
  if (min === 0) return `Up to ${max} characters`;
  return `${min} to ${max} characters`;
}

function money(amount: number, currency: string): string {
  // The code, not the symbol: the PDF's fonts carry Latin and little else.
  return `${currency} ${amount.toLocaleString("en", { maximumFractionDigits: 2 })}`;
}

function kindLabel(kind: string): string {
  return kind === "single_select" ? "choice" : kind === "yes_no" ? "yes or no" : kind.replaceAll("_", " ");
}

/** Markdown down to the words, for a short printed excerpt. */
function plainText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>]+/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
