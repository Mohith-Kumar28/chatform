import type { ImportedCondition, ImportedConditionGroup, ImportedEnding, ImportedForm, ImportedItem, ImportedJump } from "./types.js";

/**
 * A Tally form, from the `__NEXT_DATA__` its respond page is rendered with.
 *
 * Tally is a document, not a list of questions: one flat run of blocks, where
 * a question is a `TITLE` block followed by its input, and each option of a
 * choice is a block of its own tied to its siblings by `groupUuid`. Logic is
 * a block too, and it shows or hides other blocks rather than jumping.
 *
 * Show and hide is not how our flows work (a goto fires after a question and
 * the form carries on from where it lands), but the way nearly every Tally
 * form uses it is: a follow-up placed straight after a question, shown only
 * for some answers. That is exactly "otherwise, skip past it", so that shape
 * is converted precisely. Anything else is counted in `notCopied`.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseTallyData(html: string): Json | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return obj(obj(obj(JSON.parse(m[1]!)).props).pageProps);
  } catch {
    return null;
  }
}

/** Tally's rich text (`[["text", styles], [[nested], styles]]`) as plain words. */
export function tallyText(schema: unknown): string {
  const node = (n: unknown): string => {
    if (typeof n === "string") return n;
    const parts = list(n);
    const head = parts[0];
    if (typeof head === "string") return head;
    if (Array.isArray(head)) return head.map(node).join("");
    return "";
  };
  return list(schema).map(node).join("").replace(/\s+/g, " ").trim();
}

const INPUT: Record<string, string> = {
  INPUT_TEXT: "short_text",
  TEXTAREA: "long_text",
  INPUT_EMAIL: "email",
  INPUT_PHONE_NUMBER: "phone",
  INPUT_NUMBER: "number",
  INPUT_LINK: "url",
  INPUT_DATE: "date",
  INPUT_TIME: "short_text",
  FILE_UPLOAD: "file_upload",
  SIGNATURE: "signature",
};

const CHOICE: Record<string, string> = {
  MULTIPLE_CHOICE_OPTION: "single_select",
  CHECKBOX: "multi_select",
  DROPDOWN_OPTION: "dropdown",
  RANKING_OPTION: "ranking",
};

const TEXT_BLOCKS = new Set(["TEXT", "LABEL", "HEADING_1", "HEADING_2", "HEADING_3"]);

export function readTallyForm(page: Json, url: string): ImportedForm {
  const blocks = list(page.blocks).map(obj);
  const settings = obj(page.settings);
  const items: ImportedItem[] = [];
  const notCopied = new Set<string>();
  const hiddenFields: string[] = [];
  /** Any block's uuid → the item it belongs to (a title, an input, an option). */
  const itemOfBlock = new Map<string, string>();
  const logic: Json[] = [];
  const endings: ImportedEnding[] = [];

  let title = "";
  let description = "";
  let pendingTitle: { text: string; uuid: string } | null = null;
  let pendingText: string[] = [];
  let pendingTextUuids: string[] = [];
  let seenQuestion = false;
  let inThankYou: ImportedEnding | null = null;

  const flushText = (next?: string) => {
    const words = pendingText.filter(Boolean);
    const uuids = pendingTextUuids;
    pendingText = [];
    pendingTextUuids = [];
    if (words.length === 0) return;
    // A paragraph repeating the question title below it is layout, not content.
    if (next && words.length === 1 && words[0] === next) return;
    if (!seenQuestion && items.length === 0 && !description) {
      description = words.join("\n\n");
      return;
    }
    const key = uuids[0] ?? `text_${items.length}`;
    items.push({ key, type: "statement", title: words[0]!, description: words.slice(1).join("\n\n"), required: false, options: [], allowOther: false, scale: 0, config: "" });
    for (const u of uuids) itemOfBlock.set(u, key);
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    const type = text(b.type);
    const p = obj(b.payload);
    const uuid = text(b.uuid);
    const group = text(b.groupUuid) || uuid;

    if (inThankYou) {
      if (TEXT_BLOCKS.has(type) || type === "TITLE") {
        const words = tallyText(p.safeHTMLSchema);
        if (!words) continue;
        if (inThankYou.title === "Thanks for completing this form!") inThankYou.title = words;
        else inThankYou.body = inThankYou.body ? `${inThankYou.body}\n\n${words}` : words;
      } else if (type === "PAGE_BREAK" && p.isThankYouPage !== true) {
        inThankYou = null;
      }
      continue;
    }

    if (type === "FORM_TITLE") {
      title = text(p.title) || tallyText(p.safeHTMLSchema);
      continue;
    }
    if (type === "TITLE") {
      pendingTitle = { text: tallyText(p.safeHTMLSchema), uuid };
      continue;
    }
    if (TEXT_BLOCKS.has(type)) {
      pendingText.push(tallyText(p.safeHTMLSchema));
      pendingTextUuids.push(uuid);
      continue;
    }
    if (type === "PAGE_BREAK") {
      flushText();
      if (p.isThankYouPage === true) {
        inThankYou = { key: `ty_${endings.length + 1}`, title: "Thanks for completing this form!", body: "" };
        endings.push(inThankYou);
      }
      continue;
    }
    if (type === "CONDITIONAL_LOGIC") {
      logic.push(p);
      continue;
    }
    if (type === "HIDDEN_FIELDS") {
      for (const f of list(p.hiddenFields)) if (text(obj(f).name)) hiddenFields.push(text(obj(f).name));
      continue;
    }
    if (type === "CALCULATED_FIELDS") {
      notCopied.add("Calculated fields");
      continue;
    }
    if (type === "IMAGE" || type === "EMBED" || type === "EMBED_VIDEO" || type === "EMBED_AUDIO" || type === "DIVIDER") {
      if (type === "IMAGE") notCopied.add("Images");
      if (type.startsWith("EMBED")) notCopied.add("Embedded videos and media");
      continue;
    }

    const question = pendingTitle;
    flushText(question?.text);
    pendingTitle = null;
    const required = p.isRequired === true;
    const base = (t: string): ImportedItem => ({
      key: group,
      type: t,
      title: question?.text || text(p.placeholder) || "Untitled question",
      description: "",
      required,
      options: [],
      allowOther: false,
      scale: 0,
      config: "",
    });
    const own = (key: string) => {
      itemOfBlock.set(uuid, key);
      if (question) itemOfBlock.set(question.uuid, key);
    };

    if (INPUT[type]) {
      seenQuestion = true;
      items.push({ ...base(INPUT[type]!), placeholder: text(p.placeholder) || (type === "INPUT_TIME" ? "HH:MM" : undefined) });
      own(group);
      continue;
    }
    if (CHOICE[type]) {
      seenQuestion = true;
      // Every option of one question shares the group; collect them all here.
      const options: Json[] = [b];
      while (i + 1 < blocks.length && text(blocks[i + 1]!.groupUuid) === group && text(blocks[i + 1]!.type) === type) {
        options.push(blocks[++i]!);
      }
      const real = options.filter((o) => obj(o.payload).isOtherOption !== true);
      const multiple = type === "CHECKBOX" || obj(b.payload).allowMultiple === true;
      items.push({
        ...base(type === "MULTIPLE_CHOICE_OPTION" && multiple ? "multi_select" : CHOICE[type]!),
        options: real.map((o) => text(obj(o.payload).text)),
        optionKeys: real.map((o) => text(o.uuid)),
        allowOther: options.some((o) => obj(o.payload).isOtherOption === true),
      });
      for (const o of options) itemOfBlock.set(text(o.uuid), group);
      own(group);
      continue;
    }
    if (type === "RATING") {
      seenQuestion = true;
      items.push({ ...base("rating"), scale: typeof p.stars === "number" ? p.stars : 5 });
      own(group);
      continue;
    }
    if (type === "LINEAR_SCALE") {
      seenQuestion = true;
      const start = typeof p.start === "number" ? p.start : 1;
      const end = typeof p.end === "number" ? p.end : 10;
      items.push({
        ...base("opinion_scale"),
        scale: end - start + 1,
        exact: {
          startAt: start === 0 ? 0 : 1,
          labelLow: text(p.leftLabel) || undefined,
          labelHigh: text(p.rightLabel) || undefined,
        },
      });
      own(group);
      continue;
    }
    if (type === "PAYMENT") {
      notCopied.add("Payment blocks (add a payment question and connect Stripe or Razorpay)");
      continue;
    }
    if (type === "MATRIX" || type === "MATRIX_ROW" || type === "MATRIX_COLUMN") {
      notCopied.add("Matrix questions");
      continue;
    }
    // A block we do not read. Keep its question, if it had one, as text.
    if (question?.text) {
      seenQuestion = true;
      items.push(base("short_text"));
      own(group);
      notCopied.add(`A "${type.toLowerCase().replace(/_/g, " ")}" block, copied as a text question`);
    }
  }
  flushText();

  const jumps = showHideToJumps(logic, items, itemOfBlock, notCopied);

  return {
    provider: "tally",
    url,
    title: title || text(page.name),
    description,
    items,
    endings,
    jumps,
    hiddenFields,
    notCopied: [...notCopied],
    closed: page.isClosed === true || settings.isClosed === true,
  };
}

const COMPARISON: Record<string, ImportedCondition["op"]> = {
  IS: "eq",
  IS_NOT: "neq",
  EQUAL: "eq",
  NOT_EQUAL: "neq",
  GREATER_THAN: "gt",
  GREATER_OR_EQUAL_THAN: "gte",
  LESS_THAN: "lt",
  LESS_OR_EQUAL_THAN: "lte",
  CONTAINS: "contains",
  DOES_NOT_CONTAIN: "not_contains",
  STARTS_WITH: "starts_with",
  ENDS_WITH: "ends_with",
  IS_EMPTY: "is_empty",
  IS_NOT_EMPTY: "is_not_empty",
};

/**
 * Show/hide rules, as jumps where they mean one.
 *
 * - "Hide R when C", with R starting right after the question C reads: after
 *   that question, when C, go past R.
 * - "Show R when C" on the same shape: when C, go to R; otherwise go past it.
 *   Several shown runs off one question (Yes shows A, No shows B) each get
 *   their own jump in, and every run but the last jumps past the rest when it
 *   ends, so a respondent who took A never falls into B.
 *
 * Two rules showing the same run are one rule with their conditions OR'd,
 * which is what Tally does when both are true.
 */
function showHideToJumps(logic: Json[], items: ImportedItem[], itemOfBlock: Map<string, string>, notCopied: Set<string>): ImportedJump[] {
  const index = new Map(items.map((it, i) => [it.key, i]));
  const byKey = new Map(items.map((it) => [it.key, it]));
  const jumps: ImportedJump[] = [];
  let skipped = 0;
  let required = 0;

  /** Question → shown runs off it, keyed by the run's first item. */
  const shows = new Map<string, Map<string, { run: string[]; when: ImportedConditionGroup[] }>>();

  for (const rule of logic) {
    const conds = list(rule.conditionals).map(obj);
    const fields = new Set(conds.map((c) => text(obj(obj(c.payload).field).blockGroupUuid) || text(obj(obj(c.payload).field).uuid)));
    const actions = list(rule.actions).map(obj);
    for (const a of actions) {
      const kind = text(a.type);
      if (kind === "REQUIRE_ANSWER") {
        required++;
        continue;
      }
      if (kind !== "SHOW_BLOCKS" && kind !== "HIDE_BLOCKS") {
        skipped++;
        continue;
      }
      const from = fields.size === 1 ? [...fields][0]! : "";
      const fromItem = byKey.get(from);
      const uuids = list(obj(a.payload)[kind === "SHOW_BLOCKS" ? "showBlocks" : "hideBlocks"]).map(text);
      const run = [...new Set(uuids.map((u) => itemOfBlock.get(u)).filter((k): k is string => !!k))].sort(
        (x, y) => index.get(x)! - index.get(y)!,
      );
      const when = fromItem ? conditionOf(conds, rule, fromItem) : null;
      const contiguous = run.every((k, n) => n === 0 || index.get(k)! === index.get(run[n - 1]!)! + 1);
      if (!fromItem || !when || run.length === 0 || !contiguous || index.get(run[0]!)! <= index.get(from)!) {
        skipped++;
        continue;
      }
      if (kind === "HIDE_BLOCKS") {
        if (index.get(run[0]!)! !== index.get(from)! + 1) {
          skipped++;
          continue;
        }
        jumps.push({ fromKey: from, when, to: past(run.at(-1)!) });
        continue;
      }
      const runs = shows.get(from) ?? new Map();
      const existing = runs.get(run[0]!);
      if (existing) existing.when.push(when);
      else runs.set(run[0]!, { run, when: [when] });
      shows.set(from, runs);
    }
  }

  for (const [from, runs] of shows) {
    const ordered = [...runs.values()].sort((a, b) => index.get(a.run[0]!)! - index.get(b.run[0]!)!);
    // The runs must fill the space right after the question, one after another.
    let at = index.get(from)! + 1;
    const fits = ordered.every((r) => {
      const ok = index.get(r.run[0]!) === at;
      at = index.get(r.run.at(-1)!)! + 1;
      return ok;
    });
    if (!fits) {
      skipped += ordered.length;
      continue;
    }
    const end = past(ordered.at(-1)!.run.at(-1)!);
    for (const r of ordered) {
      const when = r.when.length === 1 ? r.when[0]! : { op: "or" as const, conditions: [], groups: r.when };
      jumps.push({ fromKey: from, when, to: { kind: "item", key: r.run[0]! } });
    }
    jumps.push({ fromKey: from, when: null, to: end });
    for (const r of ordered.slice(0, -1)) jumps.push({ fromKey: r.run.at(-1)!, when: null, to: end });
  }

  if (skipped > 0) notCopied.add(`${skipped} show/hide ${skipped === 1 ? "rule" : "rules"} (rebuild ${skipped === 1 ? "it" : "them"} in the Flow tab)`);
  if (required > 0) notCopied.add("Answers that become required only after certain answers");
  return jumps;

  function past(lastKey: string): ImportedJump["to"] {
    const next = items[index.get(lastKey)! + 1];
    return next ? { kind: "item", key: next.key } : { kind: "ending", key: "" };
  }
}

function conditionOf(conds: Json[], rule: Json, item: ImportedItem): ImportedConditionGroup | null {
  const out: ImportedCondition[] = [];
  for (const c of conds) {
    const p = obj(c.payload);
    const op = COMPARISON[text(p.comparison)];
    if (!op) return null;
    const raw = p.value;
    if (op === "is_empty" || op === "is_not_empty") {
      out.push({ itemKey: item.key, op });
      continue;
    }
    // A choice is compared by the option block's uuid.
    const value =
      typeof raw === "string" && item.optionKeys?.includes(raw)
        ? { optionKey: raw }
        : typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean"
          ? raw
          : null;
    if (value === null) return null;
    out.push({ itemKey: item.key, op, value });
  }
  if (out.length === 0) return null;
  return { op: text(rule.logicalOperator) === "OR" ? "or" : "and", conditions: out, groups: [] };
}
