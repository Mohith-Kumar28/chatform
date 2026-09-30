import { htmlToMarkdown, htmlToPlain, imageUrlOf } from "./text.js";
import type { ImportedCondition, ImportedConditionGroup, ImportedEnding, ImportedForm, ImportedItem, ImportedJump } from "./types.js";

/**
 * A Youform, from the blocks its public page is rendered with.
 *
 * `app.youform.com/forms/<slug>` sets `window.youForm.formBlocks = [...]`: every
 * block in order, each with its own logic. The model is ours exactly: after a
 * block, the first matching jump wins, else `default_transition` names the
 * block that comes next, else the next by position. Thank-you screens are
 * `text` blocks with `is_last`.
 *
 * Block types (from the form bundle): text, input, textarea, email, phone,
 * number, url, date, radio, checkbox, dropdown, file_upload, signature,
 * star_rating, opinion_scale, nps, slider, ranking, matrix, contact, address,
 * payment, scheduler, group. The first eight are read from real forms; the
 * rest read the same common keys and fall back to a text question, said.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined);

export function parseYouformData(html: string): { blocks: Json[]; name: string; hidden: string[] } | null {
  const at = html.indexOf("window.youForm.formBlocks = ");
  if (at < 0) return null;
  const blocks = readJsonAt(html, at + "window.youForm.formBlocks = ".length);
  if (!Array.isArray(blocks)) return null;
  const name = html.match(/window\.youForm\.formName = "((?:[^"\\]|\\.)*)"/)?.[1];
  const hiddenAt = html.indexOf("window.youForm.hiddenFields = ");
  const hidden = hiddenAt >= 0 ? readJsonAt(html, hiddenAt + "window.youForm.hiddenFields = ".length) : null;
  return {
    blocks: blocks.map(obj),
    name: name ? (JSON.parse(`"${name}"`) as string) : "",
    hidden: list(hidden)
      .map((h) => (typeof h === "string" ? h : str(obj(h).name) || str(obj(h).key)))
      .filter(Boolean),
  };
}

/** One JSON value starting at `start`, however long, without a regex over the page. */
function readJsonAt(text: string, start: number): unknown {
  const open = text[start];
  if (open !== "[" && open !== "{") return null;
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      try {
        return JSON.parse(text.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

const OPERANDS: Record<string, ImportedCondition["op"]> = {
  equal: "eq",
  not_equal: "neq",
  greater_than: "gt",
  greater_than_equal: "gte",
  less_than: "lt",
  less_than_equal: "lte",
  contains: "contains",
  doesnt_contain: "not_contains",
  begins_with: "starts_with",
  ends_with: "ends_with",
};

export function readYouform(data: { blocks: Json[]; name: string; hidden: string[] }, url: string): ImportedForm {
  const blocks = [...data.blocks].sort((a, b) => (num(a.position) ?? 0) - (num(b.position) ?? 0));
  const notCopied = new Set<string>();
  const items: ImportedItem[] = [];
  const endings: ImportedEnding[] = [];
  const itemById = new Map<string, ImportedItem>();
  const endingIds = new Set<string>();
  let welcome: ImportedForm["welcome"];

  blocks.forEach((b, index) => {
    const id = str(b.id);
    const type = str(b.type);
    const title = htmlToPlain(str(b.question) || str(b.title));
    const description = htmlToMarkdown(str(b.description));
    const image = imageUrlOf(b.cover_image_url) ?? imageUrlOf(b.image_url);

    if (type === "text") {
      if (b.is_last === true) {
        endingIds.add(id);
        const cta = str(b.cta_link);
        endings.push({
          key: id,
          title: title || "Thank you!",
          body: description,
          imageUrl: image,
          ...(/^https?:\/\//.test(cta) && str(b.cta_text) ? { ctaLabel: str(b.cta_text).slice(0, 60), ctaUrl: cta } : {}),
        });
        return;
      }
      // The first screen, before any question, is the welcome.
      if (index === 0 && !welcome) {
        welcome = { title, description, buttonLabel: str(b.cta_text) || undefined, imageUrl: image };
        return;
      }
      pushItem({ key: id, type: "statement", title: title || description.split("\n")[0] || "", description: title ? description : "", required: false, imageUrl: image, exact: { buttonLabel: str(b.cta_text) || undefined } });
      return;
    }

    const base: ImportedItem = {
      key: id,
      type: "short_text",
      title,
      description,
      required: b.required === true,
      options: [],
      allowOther: false,
      scale: 0,
      config: "",
      placeholder: str(b.placeholder).trim() || undefined,
      imageUrl: image,
    };
    const options = list(b.options)
      .map(obj)
      .sort((x, y) => (num(x.position) ?? 0) - (num(y.position) ?? 0));
    const labels = options.map((o) => htmlToPlain(str(o.value) || str(o.label)));
    const withOptions = (t: string): ImportedItem => {
      const images = options.map((o) => imageUrlOf(o.image_url) ?? null);
      const pictured = images.some(Boolean);
      return {
        ...base,
        type: pictured && (t === "single_select" || t === "multi_select") ? "picture_choice" : t,
        options: labels,
        optionKeys: options.map((o) => str(o.id)),
        allowOther: b.allow_other === true || b.other_option === true,
        ...(pictured ? { optionImages: images, exact: { multiSelect: t === "multi_select" } } : {}),
      };
    };

    switch (type) {
      case "input":
        return pushItem({ ...base, type: b.is_email === true ? "email" : "short_text" });
      case "textarea":
        return pushItem({ ...base, type: "long_text" });
      case "email":
        return pushItem({ ...base, type: "email" });
      case "phone":
        return pushItem({ ...base, type: "phone" });
      case "number":
        return pushItem({ ...base, type: "number", config: [num(b.min) !== undefined ? `min=${num(b.min)}` : "", num(b.max) !== undefined ? `max=${num(b.max)}` : ""].filter(Boolean).join("; ") });
      case "url":
        return pushItem({ ...base, type: "url" });
      case "date":
        return pushItem({ ...base, type: "date" });
      case "radio":
        return pushItem(withOptions("single_select"));
      case "checkbox":
        return pushItem(withOptions("multi_select"));
      case "dropdown":
        return pushItem(withOptions("dropdown"));
      case "ranking":
        return pushItem(withOptions("ranking"));
      case "file_upload":
        return pushItem({ ...base, type: "file_upload" });
      case "signature":
        return pushItem({ ...base, type: "signature" });
      case "star_rating":
        return pushItem({ ...base, type: "rating", scale: Math.min(10, num(b.max_rating) ?? num(b.max) ?? 5) });
      case "nps":
        return pushItem({ ...base, type: "nps", exact: labelsOf(b) });
      case "opinion_scale":
      case "slider": {
        const min = num(b.min) ?? num(b.start) ?? 1;
        const max = num(b.max) ?? num(b.end) ?? (num(b.steps) ?? 10) + min - 1;
        return pushItem({ ...base, type: "opinion_scale", scale: Math.max(2, Math.min(11, max - min + 1)), exact: { startAt: min === 0 ? 0 : 1, ...labelsOf(b) } });
      }
      case "matrix": {
        const rows = list(b.rows).map((r) => htmlToPlain(str(obj(r).value) || str(obj(r).label) || str(r))).filter(Boolean);
        const columns = list(b.columns).map((c) => htmlToPlain(str(obj(c).value) || str(obj(c).label) || str(c))).filter(Boolean);
        if (rows.length === 0 || columns.length < 2) {
          notCopied.add("A matrix question, copied as a text question");
          return pushItem({ ...base, type: "long_text" });
        }
        return pushItem({ ...base, type: "matrix", options: columns, config: `rows=${rows.map((r) => r.replace(/[|;]/g, " ")).join("|")}${b.multiple === true || b.allow_multiple === true ? "; multiplePerRow=true" : ""}` });
      }
      case "contact":
        return pushItem({ ...base, type: "contact_info" });
      case "address":
        return pushItem({ ...base, type: "address" });
      case "payment":
        notCopied.add("Payment blocks (add a payment question and connect Stripe or Razorpay)");
        return pushItem({ ...base, type: "statement", required: false });
      case "scheduler":
        notCopied.add("Scheduling blocks (add a scheduling question with your booking link)");
        return pushItem({ ...base, type: "statement", required: false });
      case "group":
        if (title) pushItem({ ...base, type: "statement", required: false });
        return;
      default:
        if (title) {
          notCopied.add(`A "${type.replace(/_/g, " ")}" block, copied as a text question`);
          pushItem({ ...base, type: "short_text" });
        }
    }
  });

  // The flow: every block's jumps, then where it goes otherwise.
  const order = blocks.map((b) => str(b.id));
  const jumps: ImportedJump[] = [];
  let crossRules = 0;
  let calcRules = 0;
  const target = (blockId: string): ImportedJump["to"] | null =>
    endingIds.has(blockId) ? { kind: "ending", key: blockId } : itemById.has(blockId) ? { kind: "item", key: blockId } : null;

  for (const b of blocks) {
    const from = str(b.id);
    if (!itemById.has(from)) continue;
    for (const rule of list(b.logic).map(obj)) {
      const jump = list(rule.actions).map(obj).find((a) => a.type === "jump");
      if (list(rule.actions).some((a) => obj(a).type !== "jump")) calcRules++;
      if (!jump) continue;
      const to = target(str(jump.block_id));
      const when = conditionOf(rule, from, itemById.get(from)!);
      if (!to) continue;
      if (when === "cross") {
        crossRules++;
        continue;
      }
      jumps.push({ fromKey: from, when, to });
    }
    const next = str(b.default_transition);
    if (next) {
      const natural = order[order.indexOf(from) + 1];
      const to = target(next);
      if (to && next !== natural) jumps.push({ fromKey: from, when: null, to });
    }
  }
  if (crossRules > 0) {
    notCopied.add(`${crossRules} ${crossRules === 1 ? "rule that checks" : "rules that check"} an earlier answer or a variable (rebuild ${crossRules === 1 ? "it" : "them"} in the Flow tab)`);
  }
  if (calcRules > 0) notCopied.add("Scores and calculations");

  return {
    provider: "youform",
    url,
    title: data.name || welcome?.title || "",
    description: "",
    welcome,
    items,
    endings,
    jumps,
    hiddenFields: data.hidden,
    notCopied: [...notCopied],
    closed: false,
  };

  function pushItem(item: Partial<ImportedItem> & { key: string; type: string; title: string }) {
    if (!item.title) return;
    const full: ImportedItem = { description: "", required: false, options: [], allowOther: false, scale: 0, config: "", ...item };
    items.push(full);
    itemById.set(full.key, full);
  }
}

function labelsOf(b: Json): { labelLow?: string; labelHigh?: string } {
  const low = str(b.left_label) || str(b.min_label) || str(b.label_left) || str(b.start_label);
  const high = str(b.right_label) || str(b.max_label) || str(b.label_right) || str(b.end_label);
  return { labelLow: low || undefined, labelHigh: high || undefined };
}

/** Youform conditions as ours; "cross" when one reads another block or a variable. */
function conditionOf(rule: Json, from: string, item: ImportedItem): ImportedConditionGroup | null | "cross" {
  const conds = list(rule.conditions).map(obj);
  if (conds.length === 0) return null;
  const out: ImportedCondition[] = [];
  for (const c of conds) {
    const op = OPERANDS[str(c.operand)];
    if (!op || str(c.operator_1_type) !== "block" || str(c.operator_1) !== from) return "cross";
    const right = str(c.operator_2);
    out.push({
      itemKey: from,
      op,
      value: str(c.operator_2_type) === "option_id" || item.optionKeys?.includes(right) ? { optionKey: right } : num(c.operator_2) ?? right,
    });
  }
  const any = /^(or|any)$/i.test(str(rule.match) || str(rule.operator) || str(rule.logic_operator) || str(rule.condition_type));
  return { op: any ? "or" : "and", conditions: out, groups: [] };
}
