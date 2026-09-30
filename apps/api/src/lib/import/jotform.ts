import { decodeEntities } from "../research.js";
import { inferTextType } from "./text.js";
import { htmlToMarkdown, htmlToPlain, imageUrlOf } from "./text.js";
import { skippedNote, visibilityToJumps, type VisibilityRule } from "./show-hide.js";
import type { ImportedCondition, ImportedConditionGroup, ImportedForm, ImportedItem } from "./types.js";

/**
 * A Jotform, from its server-rendered page.
 *
 * Jotform has no public JSON for a form (its API needs the owner's key), but
 * `form.jotform.com/<id>` renders every field as `<li data-type="control_…">`
 * with the label, the choices and a `jf-required` class, and ships its logic
 * inline as `JotForm.setConditions([...])`. Logic is show/hide, like Tally's,
 * so it goes through the same conversion (`show-hide.ts`).
 *
 * Only `<li>` tags count as fields: the page's stylesheet also mentions every
 * `data-type="control_…"` in its selectors.
 */

const text = (html: string): string =>
  decodeEntities(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]!) : null;
};

/** `<label id="label_7">Question<span class="form-required">*</span></label>`, or a span or h4 with that id. */
function labelOf(body: string, qid: string): string {
  const m = body.match(new RegExp(`<(label|span|h4|div)\\b[^>]*\\bid="label_${qid}"[^>]*>([\\s\\S]*?)</\\1>`, "i"));
  if (!m) return "";
  return text(m[2]!.replace(/<span[^>]*form-required[^>]*>[\s\S]*?<\/span>/gi, "")).replace(/\s*\*\s*$/, "");
}

function choices(body: string, input: "radio" | "checkbox"): { options: string[]; other: boolean } {
  const options: string[] = [];
  let other = false;
  for (const m of body.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    if ((attr(tag, "type") ?? "").toLowerCase() !== input) continue;
    const cls = attr(tag, "class") ?? "";
    if (/other/i.test(cls) || attr(tag, "id")?.endsWith("_other")) {
      other = true;
      continue;
    }
    const value = attr(tag, "value");
    if (value && !options.includes(value)) options.push(value);
  }
  return { options, other };
}

const PAYMENT = /^control_(payment|paymentmethods|paypal|paypalpro|paypalcomplete|stripe|square|braintree|authnet|mollie|razorpay|sensepass|echeck|chargify|payu|cardconnect|worldpay)/;

export function readJotform(html: string, url: string): ImportedForm {
  const items: ImportedItem[] = [];
  const notCopied = new Set<string>();
  const hiddenFields: string[] = [];
  let title = "";
  let description = "";
  /** An image field waiting for the field below it. */
  let pendingImage: string | undefined;

  const starts = [...html.matchAll(/<li\b[^>]*data-type="(control_[a-z0-9_]+)"[^>]*>/gi)];
  starts.forEach((m, k) => {
    const tag = m[0];
    const type = m[1]!.toLowerCase();
    const end = k + 1 < starts.length ? starts[k + 1]!.index! : Math.min(html.length, m.index! + m[0].length + 20_000);
    const body = html.slice(m.index! + m[0].length, end);
    const qid = (attr(tag, "id") ?? "").replace(/^(id|cid)_/, "");
    const key = `q${qid || k}`;
    const cls = attr(tag, "class") ?? "";
    const required = /\bjf-required\b/.test(cls);
    const label = labelOf(body, qid);
    const base: ImportedItem = { key, type: "short_text", title: label, description: "", required, options: [], allowOther: false, scale: 0, config: "" };
    const push = (item: Partial<ImportedItem> & { type: string }) => {
      if (!(item.title ?? base.title)) return;
      items.push({ ...base, ...(pendingImage ? { imageUrl: pendingImage } : {}), ...item });
      pendingImage = undefined;
    };

    switch (type) {
      case "control_head": {
        const heading = text(body.match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1] ?? "");
        const sub = text(body.match(/<div[^>]*form-subHeader[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "");
        if (!title && items.length === 0) {
          title = heading;
          description = sub;
        } else if (heading) {
          push({ type: "statement", title: heading, description: sub, required: false });
        }
        return;
      }
      case "control_text": {
        const inner = body.match(/<div\b[^>]*id="text_\d+"[^>]*>([\s\S]*)<\/div>/i)?.[1] ?? body;
        const words = htmlToMarkdown(inner);
        const lines = words.split("\n");
        if (words) push({ type: "statement", title: htmlToPlain(lines[0]!.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")).replace(/\*\*|_/g, ""), description: lines.slice(1).join("\n"), required: false });
        return;
      }
      case "control_textbox": {
        const input = body.match(/<input\b[^>]*>/i)?.[0] ?? "";
        const placeholder = (attr(input, "placeholder") ?? "").trim() || undefined;
        const validate = attr(input, "class") ?? "";
        const kind = /Email/.test(validate) ? "email" : /Numeric/.test(validate) ? "number" : /Url/i.test(validate) ? "url" : inferTextType({ label, placeholder, name: attr(input, "name") });
        push({ type: kind ?? "short_text", placeholder });
        return;
      }
      case "control_textarea":
        push({ type: "long_text" });
        return;
      case "control_email":
        push({ type: "email" });
        return;
      case "control_phone":
        push({ type: "phone" });
        return;
      case "control_number":
      case "control_spinner":
        push({ type: "number", placeholder: (attr(body.match(/<input\b[^>]*>/i)?.[0] ?? "", "placeholder") ?? "").trim() || undefined });
        return;
      case "control_fullname": {
        // A name, as its own card: first and last.
        push({ type: "contact_info", config: "fields=first_name|last_name" });
        return;
      }
      case "control_address": {
        const parts = [
          /addr_line1/.test(body) ? "street" : "",
          /\[city\]/.test(body) ? "city" : "",
          /\[state\]/.test(body) ? "state" : "",
          /\[postal\]/.test(body) ? "postal" : "",
          /\[country\]/.test(body) ? "country" : "",
        ].filter(Boolean);
        push({ type: "address", config: parts.length ? `fields=${parts.join("|")}` : "" });
        return;
      }
      case "control_radio": {
        const { options, other } = choices(body, "radio");
        push({ type: "single_select", options, optionKeys: options, allowOther: other });
        return;
      }
      case "control_checkbox": {
        const { options, other } = choices(body, "checkbox");
        // One box on its own is agreement ("I accept the terms").
        if (options.length === 1 && !other) push({ type: "yes_no", title: label || options[0]! });
        else push({ type: "multi_select", options, optionKeys: options, allowOther: other });
        return;
      }
      case "control_dropdown": {
        const select = body.match(/<select\b[\s\S]*?<\/select>/i)?.[0] ?? "";
        const options = [...select.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
          .filter((o) => (attr(`<option${o[1]}>`, "value") ?? "") !== "")
          .map((o) => text(o[2]!))
          .filter(Boolean);
        push({ type: /\smultiple\b/i.test(select.slice(0, 300)) ? "multi_select" : "dropdown", options, optionKeys: options });
        return;
      }
      case "control_datetime":
      case "control_birthdate":
        push({ type: "date" });
        return;
      case "control_time":
        push({ type: "short_text", placeholder: "HH:MM" });
        return;
      case "control_fileupload":
        push({ type: "file_upload" });
        return;
      case "control_signature":
        push({ type: "signature" });
        return;
      case "control_scale": {
        const values = [...body.matchAll(/<input\b[^>]*type="radio"[^>]*>/gi)].map((i) => Number(attr(i[0], "value"))).filter(Number.isFinite);
        const worst = text(body.match(/for="input_\d+_worst"[^>]*>([\s\S]*?)<\/label>/i)?.[1] ?? "");
        const best = text(body.match(/for="input_\d+_best"[^>]*>([\s\S]*?)<\/label>/i)?.[1] ?? "");
        push({
          type: "opinion_scale",
          scale: values.length || 5,
          exact: { startAt: values[0] === 0 ? 0 : 1, labelLow: worst || undefined, labelHigh: best || undefined },
        });
        return;
      }
      case "control_rating": {
        // A <select> of 1..N in the current renderer; radios in older ones.
        const stars =
          Number(body.match(/data-stars="(\d+)"/i)?.[1]) ||
          [...body.matchAll(/<option\b[^>]*value="\d+"/gi)].length ||
          [...body.matchAll(/<input\b[^>]*type="radio"/gi)].length ||
          5;
        push({ type: "rating", scale: Math.min(10, stars) });
        return;
      }
      case "control_matrix": {
        // A header can wrap with <br>: "Totally<br>Disagree" is one label.
        const cell = (html: string) => text(html).replace(/\s*\n\s*/g, " ");
        const columns = [...body.matchAll(/<th\b[^>]*scope="col"[^>]*>([\s\S]*?)<\/th>/gi)].map((c) => cell(c[1]!)).filter((c) => c && c !== "Rows");
        const rows = [...body.matchAll(/<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/gi)].map((r) => cell(r[1]!)).filter(Boolean);
        const multiple = /type="checkbox"/i.test(body);
        if (rows.length === 0 || columns.length < 2) {
          notCopied.add("A grid question whose cells are text boxes or dropdowns");
          push({ type: "long_text" });
          return;
        }
        push({ type: "matrix", options: columns, config: `rows=${rows.map((r) => r.replace(/[|;]/g, " ")).join("|")}${multiple ? "; multiplePerRow=true" : ""}` });
        return;
      }
      case "control_appointment":
        notCopied.add("Appointment slots (asked as a date instead)");
        push({ type: "date" });
        return;
      case "control_hidden": {
        const name = attr(body.match(/<input\b[^>]*>/i)?.[0] ?? "", "name")?.replace(/^q\d+_/, "");
        if (name) hiddenFields.push(name);
        return;
      }
      case "control_image": {
        const src = body.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1] ?? body.match(/<img\b[^>]*\bdata-src="([^"]+)"/i)?.[1];
        const url = src ? imageUrlOf(decodeEntities(src).replace(/^\/\//, "https://")) : undefined;
        if (url) pendingImage = url;
        else notCopied.add("Images");
        return;
      }
      case "control_widget":
        notCopied.add("Jotform widgets");
        return;
      case "control_button":
      case "control_divider":
      case "control_pagebreak":
      case "control_captcha":
      case "control_collapse":
        return;
      default:
        if (PAYMENT.test(type)) {
          notCopied.add("Payment fields (add a payment question and connect Stripe or Razorpay)");
          return;
        }
        if (label) {
          notCopied.add(`A "${type.replace("control_", "").replace(/_/g, " ")}" field, copied as a text question`);
          push({ type: "short_text" });
        }
    }
  });

  const jumps = conditionsToJumps(html, items, notCopied);
  const thanks = thankYou(html);

  return {
    provider: "jotform",
    url,
    title: title || text(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    description,
    items,
    endings: thanks ? [{ key: "", title: thanks, body: "" }] : [],
    jumps,
    hiddenFields,
    notCopied: [...notCopied],
    closed: false,
  };
}

/** The balanced JSON array passed to a `JotForm.setX([...])` call. */
function inlineArray(html: string, call: string): unknown[] {
  const at = html.indexOf(`${call}(`);
  if (at < 0) return [];
  const start = html.indexOf("[", at);
  if (start < 0) return [];
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "[") depth++;
    else if (ch === "]" && --depth === 0) {
      try {
        const parsed = JSON.parse(html.slice(start, i + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
  }
  return [];
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

const OPERATORS: Record<string, ImportedCondition["op"]> = {
  equals: "eq",
  notEquals: "neq",
  greaterThan: "gt",
  lessThan: "lt",
  contains: "contains",
  notContains: "not_contains",
  startsWith: "starts_with",
  endsWith: "ends_with",
  isEmpty: "is_empty",
  isFilled: "is_not_empty",
};

function conditionsToJumps(html: string, items: ImportedItem[], notCopied: Set<string>) {
  const byKey = new Map(items.map((it) => [it.key, it]));
  const rules: VisibilityRule[] = [];
  let other = 0;
  for (const raw of inlineArray(html, "JotForm.setConditions")) {
    const c = obj(raw);
    if (c.type !== "field") {
      other++;
      continue;
    }
    const terms = list(c.terms).map(obj);
    const fields = new Set(terms.map((t) => `q${str(t.field)}`));
    const from = fields.size === 1 ? [...fields][0]! : null;
    const fromItem = from ? byKey.get(from) : undefined;
    const conditions: ImportedCondition[] = [];
    let readable = !!fromItem;
    for (const t of terms) {
      const op = OPERATORS[str(t.operator)];
      if (!op || !fromItem) {
        readable = false;
        break;
      }
      const value = str(t.value);
      conditions.push(
        op === "is_empty" || op === "is_not_empty"
          ? { itemKey: fromItem.key, op }
          : { itemKey: fromItem.key, op, value: fromItem.optionKeys?.includes(value) ? { optionKey: value } : Number.isFinite(Number(value)) && value !== "" && !fromItem.options.length ? Number(value) : value },
      );
    }
    const when: ImportedConditionGroup | null = readable && conditions.length ? { op: str(c.link) === "All" ? "and" : "or", conditions, groups: [] } : null;
    for (const a of list(c.action).map(obj)) {
      const visibility = str(a.visibility);
      const kind = /^Show/.test(visibility) ? "show" : /^Hide/.test(visibility) ? "hide" : null;
      if (!kind) {
        other++;
        continue;
      }
      const targets = [...list(a.fields).map(str), str(a.field)].filter(Boolean).map((f) => `q${f}`);
      rules.push({ fromKey: when ? from : null, when, kind, targets });
    }
  }
  const { jumps, skipped } = visibilityToJumps(rules, items);
  if (skipped + other > 0) notCopied.add(skippedNote(skipped + other));
  return jumps;
}

/** The thank-you text a Jotform shows after submitting, when the page carries it. */
function thankYou(html: string): string {
  const m = html.match(/"thankYouText"\s*:\s*"((?:[^"\\]|\\.)*)"/) ?? html.match(/"thanktext"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  if (!m) return "";
  try {
    return text(JSON.parse(`"${m[1]}"`) as string).slice(0, 500);
  } catch {
    return "";
  }
}
