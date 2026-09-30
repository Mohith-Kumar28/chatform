import type { ImportedCondition, ImportedConditionGroup, ImportedForm, ImportedItem, ImportedJump } from "./types.js";

/**
 * A Typeform, from the definition its own renderer loads.
 *
 * `GET https://api.typeform.com/forms/{id}` answers any published form's full
 * definition without a token: fields, choices with their refs, logic, welcome
 * and thank-you screens. It is the same JSON the `/to/` page renders from (as
 * `window.rendererData.form`), so the page is only a fallback for when the API
 * turns us away.
 */

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Typeform's markdown and recall, as plain words.
 *
 * Titles carry `*bold*`, `_italic_`, `[links](…)` and `{{field:ref}}` recall.
 * Our titles are plain text read aloud by the interviewer, so the emphasis
 * markers go and a recalled answer is dropped: "Thanks {{field:abc}}!" reads
 * "Thanks!". The chat already addresses people by what they said.
 */
export function plainTypeformText(raw: string): { text: string; recalled: boolean } {
  const recalled = /\{\{[^}]+\}\}/.test(raw);
  const out = raw
    .replace(/\s*\{\{[^}]+\}\}/g, "")
    .replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1")
    // Bold is `*…*`, often with the spaces inside ("your* last name*"), so every asterisk goes.
    .replace(/\\\*/g, "\u0000")
    .replace(/\*/g, "")
    .replace(/\u0000/g, "*")
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1$2")
    .replace(/\\([*_[\]()])/g, "$1")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { text: out, recalled };
}

/** Descriptions render as markdown in the chat, so links and emphasis stay; only recall goes. */
function description(raw: unknown): string {
  return text(raw).replace(/\s*\{\{[^}]+\}\}/g, "").trim();
}

const CONTACT: Record<string, string> = { first_name: "first_name", last_name: "last_name", email: "email", phone_number: "phone" };
const ADDRESS: Record<string, string> = { address_line_1: "street", city: "city", state_province: "state", zip_code: "postal", country: "country" };

export function readTypeform(def: unknown, url: string): ImportedForm {
  const form = obj(def);
  const items: ImportedItem[] = [];
  const notCopied = new Set<string>();
  let recalled = false;
  /** A group's ref → the item a jump INTO it lands on, and the one a jump OUT of it hangs off. */
  const enterAt = new Map<string, string>();
  const leaveFrom = new Map<string, string>();
  /** Which item each question ref became, for conditions. */
  const itemByRef = new Map<string, ImportedItem>();

  const titleOf = (f: Json) => {
    const t = plainTypeformText(text(f.title));
    if (t.recalled) recalled = true;
    return t.text;
  };

  const push = (item: ImportedItem, ref: string) => {
    items.push(item);
    itemByRef.set(ref, item);
  };

  const walk = (raw: unknown) => {
    const f = obj(raw);
    const ref = text(f.ref) || text(f.id);
    const type = text(f.type);
    const p = obj(f.properties);
    const required = obj(f.validations).required === true;
    const base: ImportedItem = {
      key: ref,
      type: "short_text",
      title: titleOf(f),
      description: description(p.description),
      required,
      options: [],
      allowOther: false,
      scale: 0,
      config: "",
    };
    const choices = list(p.choices).map(obj);
    const withChoices = (t: string): ImportedItem => ({
      ...base,
      type: t,
      options: choices.map((c) => plainTypeformText(text(c.label)).text),
      optionKeys: choices.map((c) => text(c.ref) || text(c.id)),
      allowOther: p.allow_other_choice === true,
    });
    const labels = obj(p.labels);

    switch (type) {
      case "group":
      case "inline_group": {
        const children = list(p.fields);
        const before = items.length;
        if (base.title) push({ ...base, type: "statement", required: false }, ref);
        for (const child of children) walk(child);
        const first = items[before];
        const last = items.at(-1);
        if (first && items.length > before) enterAt.set(ref, first.key);
        if (last && items.length > before) leaveFrom.set(ref, last.key);
        return;
      }
      case "short_text":
        return push({ ...base, type: "short_text" }, ref);
      case "long_text":
        return push({ ...base, type: "long_text" }, ref);
      case "email":
        return push({ ...base, type: "email" }, ref);
      case "phone_number":
        return push({ ...base, type: "phone" }, ref);
      case "website":
        return push({ ...base, type: "url" }, ref);
      case "number": {
        const v = obj(f.validations);
        const bounds = [
          typeof v.min_value === "number" ? `min=${v.min_value}` : "",
          typeof v.max_value === "number" ? `max=${v.max_value}` : "",
        ].filter(Boolean);
        return push({ ...base, type: "number", config: bounds.join("; ") }, ref);
      }
      case "multiple_choice":
      case "checkbox":
        return push(withChoices(p.allow_multiple_selection === true || type === "checkbox" ? "multi_select" : "single_select"), ref);
      case "dropdown":
        return push(withChoices("dropdown"), ref);
      case "picture_choice":
        // Ours has no pictures on its choices, so the choice is kept and the pictures are said.
        notCopied.add("Pictures on picture-choice answers (the answers are kept as plain choices)");
        return push(withChoices(p.allow_multiple_selection === true ? "multi_select" : "single_select"), ref);
      case "yes_no":
        return push({ ...base, type: "yes_no" }, ref);
      case "legal":
        return push({ ...base, type: "legal_consent" }, ref);
      case "rating": {
        const shape = text(p.shape);
        return push(
          {
            ...base,
            type: "rating",
            scale: typeof p.steps === "number" ? p.steps : 5,
            exact: { shape: shape === "heart" ? "heart" : "star" },
          },
          ref,
        );
      }
      case "opinion_scale": {
        const startAt = p.start_at_one === false ? 0 : 1;
        const steps = typeof p.steps === "number" ? p.steps : 10;
        return push(
          {
            ...base,
            type: "opinion_scale",
            scale: steps,
            exact: { startAt, labelLow: text(labels.left) || undefined, labelHigh: text(labels.right) || undefined },
          },
          ref,
        );
      }
      case "nps":
        return push(
          { ...base, type: "nps", exact: { labelLow: text(labels.left) || undefined, labelHigh: text(labels.right) || undefined } },
          ref,
        );
      case "ranking":
        return push(withChoices("ranking"), ref);
      case "matrix": {
        const rows = list(p.fields).map(obj);
        const columns = list(obj(rows[0]?.properties).choices).map((c) => plainTypeformText(text(obj(c).label)).text);
        const multiple = rows.some((r) => obj(r.properties).allow_multiple_selection === true);
        return push(
          {
            ...base,
            type: "matrix",
            options: columns,
            config: `rows=${rows.map((r) => plainTypeformText(text(r.title)).text.replace(/[|;]/g, " ")).join("|")}${multiple ? "; multiplePerRow=true" : ""}`,
          },
          ref,
        );
      }
      case "date":
        return push({ ...base, type: "date" }, ref);
      case "file_upload":
        return push({ ...base, type: "file_upload" }, ref);
      case "statement":
        return push({ ...base, type: "statement", required: false, exact: { buttonLabel: text(p.button_text) || undefined } }, ref);
      case "contact_info": {
        const sub = list(p.fields).map((s) => text(obj(s).subfield_key) || text(obj(s).type));
        const mapped = sub.map((s) => CONTACT[s]).filter(Boolean);
        if (sub.includes("company")) notCopied.add("The company line of a contact card");
        return push({ ...base, type: "contact_info", config: mapped.length ? `fields=${mapped.join("|")}` : "" }, ref);
      }
      case "address": {
        const sub = list(p.fields).map((s) => text(obj(s).subfield_key) || text(obj(s).type));
        const mapped = [...new Set(sub.map((s) => ADDRESS[s]).filter(Boolean))];
        return push({ ...base, type: "address", config: mapped.length ? `fields=${mapped.join("|")}` : "" }, ref);
      }
      case "payment":
        notCopied.add("Payment questions (add a payment question and connect Stripe or Razorpay)");
        return push({ ...base, type: "statement", required: false }, ref);
      case "calendly":
        notCopied.add("Calendly booking (add a scheduling question with your booking link)");
        return push({ ...base, type: "statement", required: false }, ref);
      default:
        if (f.application || type === "") {
          notCopied.add("App blocks from Typeform's app directory");
          return push({ ...base, type: "statement", required: false }, ref);
        }
        notCopied.add(`A "${type.replace(/_/g, " ")}" question, copied as a text question`);
        return push({ ...base, type: "short_text" }, ref);
    }
  };

  for (const f of list(form.fields)) walk(f);

  const endings = list(form.thankyou_screens)
    .map(obj)
    .map((s) => {
      const p = obj(s.properties);
      const redirect = p.button_mode === "redirect" ? text(p.redirect_url) : "";
      return {
        key: text(s.ref) || text(s.id),
        title: plainTypeformText(text(s.title)).text || "Thank you!",
        body: description(p.description),
        ...(redirect && p.show_button === true && text(p.button_text)
          ? { ctaLabel: text(p.button_text).slice(0, 60), ctaUrl: redirect }
          : {}),
      };
    });

  const welcomeScreen = obj(list(form.welcome_screens)[0]);
  const welcome = Object.keys(welcomeScreen).length
    ? {
        title: plainTypeformText(text(welcomeScreen.title)).text,
        description: description(obj(welcomeScreen.properties).description),
        buttonLabel: text(obj(welcomeScreen.properties).button_text) || undefined,
      }
    : undefined;

  const jumps: ImportedJump[] = [];
  let crossRules = 0;
  let calcRules = 0;
  for (const raw of list(form.logic)) {
    const rule = obj(raw);
    if (rule.type !== "field" && rule.type !== "group") continue;
    const ref = text(rule.ref);
    const fromKey = leaveFrom.get(ref) ?? ref;
    if (!itemByRef.has(ref) && !leaveFrom.has(ref)) continue;
    for (const a of list(rule.actions).map(obj)) {
      if (a.action !== "jump") {
        calcRules++;
        continue;
      }
      const to = obj(obj(a.details).to);
      const target =
        to.type === "thankyou"
          ? { kind: "ending" as const, key: text(to.value) }
          : { kind: "item" as const, key: enterAt.get(text(to.value)) ?? text(to.value) };
      const when = condition(obj(a.condition), fromKey, ref);
      if (when === "cross") {
        crossRules++;
        continue;
      }
      jumps.push({ fromKey, when, to: target });
    }
  }
  if (crossRules > 0) {
    notCopied.add(
      `${crossRules} ${crossRules === 1 ? "rule that checks" : "rules that check"} an earlier answer, rather than the question ${crossRules === 1 ? "it follows" : "they follow"} (rebuild ${crossRules === 1 ? "it" : "them"} in the Flow tab)`,
    );
  }
  if (calcRules > 0) notCopied.add("Scores and calculations");
  if (recalled) notCopied.add("Earlier answers quoted inside question titles");

  return {
    provider: "typeform",
    url,
    title: plainTypeformText(text(form.title)).text,
    description: "",
    welcome,
    items,
    endings,
    jumps,
    hiddenFields: list(form.hidden).map(text).filter(Boolean),
    notCopied: [...notCopied],
    closed: false,
  };
}

const OPS: Record<string, ImportedCondition["op"]> = {
  is: "eq",
  equal: "eq",
  is_not: "neq",
  not_equal: "neq",
  greater_than: "gt",
  lower_than: "lt",
  greater_equal_than: "gte",
  lower_equal_than: "lte",
  contains: "contains",
  not_contains: "not_contains",
  begins_with: "starts_with",
  ends_with: "ends_with",
};

/**
 * A Typeform condition as ours, or "cross" when it cannot be one.
 *
 * Ours can only test the question the rule hangs off (see the note on goto
 * conditions in the form schema): a rule after Q3 that tests Q1 works at
 * runtime but is rewritten the first time the author touches the flow. So a
 * condition that reads any other question, a variable or a hidden field is not
 * copied, and is counted instead.
 */
function condition(c: Json, fromKey: string, fromRef: string): ImportedConditionGroup | null | "cross" {
  const op = text(c.op);
  if (op === "always") return null;
  const leaf = (x: Json): ImportedCondition | "cross" => {
    const mapped = OPS[text(x.op)];
    if (!mapped) return "cross";
    const vars = list(x.vars).map(obj);
    const field = vars.find((v) => v.type === "field");
    const other = vars.find((v) => v !== field);
    if (!field || !other) return "cross";
    if (text(field.value) !== fromRef) return "cross";
    const value =
      other.type === "choice"
        ? { optionKey: text(other.value) }
        : other.type === "constant" && (typeof other.value === "string" || typeof other.value === "number" || typeof other.value === "boolean")
          ? other.value
          : undefined;
    if (value === undefined) return "cross";
    return { itemKey: fromKey, op: mapped, value };
  };
  const group = (x: Json): ImportedConditionGroup | "cross" => {
    const kind = text(x.op);
    if (kind === "and" || kind === "or") {
      const out: ImportedConditionGroup = { op: kind, conditions: [], groups: [] };
      for (const v of list(x.vars).map(obj)) {
        const sub = text(v.op) === "and" || text(v.op) === "or" ? group(v) : leaf(v);
        if (sub === "cross") return "cross";
        if ("itemKey" in sub) out.conditions.push(sub);
        else out.groups.push(sub);
      }
      return out;
    }
    const one = leaf(x);
    return one === "cross" ? "cross" : { op: "and", conditions: [one], groups: [] };
  };
  return group(c);
}
