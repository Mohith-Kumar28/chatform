import type { Block, FormDoc } from "@repo/form-schema";
import type { GenerationDraft } from "./ai.js";
import { decodeEntities } from "./research.js";

/**
 * Copying a form that already exists, word for word.
 *
 * Authors paste a Google Form, or a contact page, and ask for "this form".
 * What they mean is THIS form: the same questions in the same words, the same
 * options in the same order, the same ones required. The research path could
 * not give them that. It reduced the page to 6,000 characters of text with
 * every `<script>` removed (which is where a Google Form keeps its questions
 * and every dropdown's options) and then had a model summarise it, so by the
 * time the generator saw the form it had been paraphrased twice.
 *
 * So the form is read out of the page by code, not by a model:
 * - a Google Form from `FB_PUBLIC_LOAD_DATA_`, the JSON its own page renders from;
 * - anything else from its `<form>` markup: labels, input types, `<select>`
 *   options, radio groups, `required`.
 *
 * The generator is then told to place each one as `src_N`, and `applySourceForm`
 * makes that true whatever the model wrote: wording, type, options and required
 * come from here, and a field the model dropped is put back. The model still
 * decides the welcome, the endings, any branching, and anything the author
 * asked to ADD, which is the part of the job a model is for.
 */

export interface SourceField {
  title: string;
  description: string;
  /** A generation draft block type. */
  type: string;
  /** Exactly as the source wrote them, in its order. */
  options: string[];
  /** The source offered a free-text "Other". */
  allowOther: boolean;
  required: boolean;
  /** Draft `config`, for the types that need one (matrix rows). */
  config: string;
  /** Draft `scale`: stars, or the number of steps on a linear scale. */
  scale: number;
  /** A linear scale's end labels and first number, applied after normalizing. */
  scaleLabels?: { low?: string; high?: string; startAt: 0 | 1 };
  /** The section heading it sits under, when the source has sections. */
  section?: string;
  /** Option label → where the source sends that answer ("section: X" or "submit"). */
  jumps?: Record<string, string>;
}

export interface SourceForm {
  url: string;
  provider: "google_forms" | "html";
  title: string;
  description: string;
  fields: SourceField[];
}

/** Every reader, most specific first. Null when the page has no form worth copying. */
export function extractSourceForm(html: string, url: string): SourceForm | null {
  return extractGoogleForm(html, url) ?? extractHtmlForm(html, url);
}

// ─── Google Forms ───

/**
 * Google's item type codes. Not documented, but stable for years and visible
 * in every public form: https://theconfuzedsourcecode.wordpress.com/2019/12/15/programmatically-access-your-complete-google-forms-skeleton/
 */
const G = {
  short: 0,
  paragraph: 1,
  choice: 2,
  dropdown: 3,
  checkbox: 4,
  scale: 5,
  text: 6,
  grid: 7,
  section: 8,
  date: 9,
  time: 10,
  upload: 13,
  rating: 18,
} as const;

type Json = unknown;
const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const str = (v: Json): string => (typeof v === "string" ? v : "");

function extractGoogleForm(html: string, url: string): SourceForm | null {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
  if (!m) return null;
  let data: Json[];
  try {
    data = JSON.parse(m[1]!) as Json[];
  } catch {
    return null;
  }
  const body = arr(data[1]);
  const items = arr(body[1]);

  const sectionTitle = new Map<number, string>();
  for (const it of items) {
    const item = arr(it);
    if (item[3] === G.section) sectionTitle.set(item[0] as number, str(item[1]).trim());
  }

  const fields: SourceField[] = [];
  let section: string | undefined;
  for (const it of items) {
    const item = arr(it);
    const type = item[3];
    const title = str(item[1]).trim();
    const description = str(item[2]).trim();
    if (type === G.section) {
      section = title || undefined;
      continue;
    }
    const entries = arr(item[4]);
    const entry = arr(entries[0]);
    const required = entry[2] === 1;
    const rawOptions = arr(entry[1]).map(arr);
    const options = rawOptions.map((o) => str(o[0])).filter((l) => l.length > 0);
    // An option with an empty label and the "other" flag is Google's "Other:" box.
    const allowOther = rawOptions.some((o) => str(o[0]) === "" && o[4] === 1);
    const base = { title, description, options: [] as string[], allowOther: false, required, config: "", scale: 0, section };

    const jumps: Record<string, string> = {};
    for (const o of rawOptions) {
      const to = o[2];
      if (typeof to !== "number" || !str(o[0])) continue;
      if (to === -3) jumps[str(o[0])] = "submit";
      else if (sectionTitle.has(to)) jumps[str(o[0])] = `section: ${sectionTitle.get(to)}`;
    }
    const withJumps = Object.keys(jumps).length > 0 ? { jumps } : {};

    switch (type) {
      case G.short: {
        // Response validation: [[2, 102]] is "text is an email", [[2, 103]] a
        // URL, and category 1 is a number rule. Nothing else changes the type.
        const rule = arr(arr(entry[4])[0]);
        const kind = rule[0] === 2 && rule[1] === 102 ? "email" : rule[0] === 2 && rule[1] === 103 ? "url" : rule[0] === 1 ? "number" : "short_text";
        if (title) fields.push({ ...base, type: kind });
        break;
      }
      case G.paragraph:
        if (title) fields.push({ ...base, type: "long_text" });
        break;
      case G.choice:
      case G.dropdown:
      case G.checkbox:
        if (!title) break;
        fields.push({
          ...base,
          ...withJumps,
          type: type === G.choice ? "single_select" : type === G.dropdown ? "dropdown" : "multi_select",
          options,
          allowOther,
        });
        break;
      case G.scale: {
        const labels = arr(entry[3]);
        const first = Number(options[0]);
        fields.push({
          ...base,
          type: "opinion_scale",
          scale: options.length,
          scaleLabels: {
            low: str(labels[0]) || undefined,
            high: str(labels[1]) || undefined,
            startAt: first === 0 ? 0 : 1,
          },
        });
        break;
      }
      case G.rating:
        fields.push({ ...base, type: "rating", scale: Math.max(3, Math.min(10, options.length || 5)) });
        break;
      case G.grid: {
        // One entry per row: [entryId, columns, required, [rowLabel], …, [1] when a checkbox grid].
        const rows = entries.map((e) => str(arr(arr(e)[3])[0])).filter(Boolean);
        const multiple = entries.some((e) => arr(arr(e)[11])[0] === 1);
        const columns = rawOptions.map((o) => str(o[0])).filter(Boolean);
        if (!title || rows.length === 0 || columns.length < 2) break;
        fields.push({
          ...base,
          type: "matrix",
          options: columns,
          config: `rows=${rows.join("|")}${multiple ? "; multiplePerRow=true" : ""}`,
        });
        break;
      }
      case G.date:
        if (title) fields.push({ ...base, type: "date" });
        break;
      case G.time:
        // No time block; a short answer keeps the question and its wording.
        if (title) fields.push({ ...base, type: "short_text" });
        break;
      case G.upload:
        if (title) fields.push({ ...base, type: "file_upload" });
        break;
      case G.text:
        // A title-and-description item: words for the respondent, no answer.
        if (title || description) fields.push({ ...base, type: "statement", title: title || description, description: title ? description : "", required: false });
        break;
      default:
        // Images and videos: nothing to ask.
        break;
    }
  }

  if (fields.filter((f) => f.type !== "statement").length === 0) return null;
  return {
    url,
    provider: "google_forms",
    title: str(body[8]).trim() || str(data[3]).trim(),
    description: str(body[0]).trim(),
    fields,
  };
}

// ─── Any other page: its <form> markup ───

/** The text inside a fragment of markup, tags removed and entities decoded. */
function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  if (m) return decodeEntities(m[1] ?? m[2] ?? m[3] ?? "");
  return new RegExp(`\\s${name}(?=[\\s/>])`, "i").test(tag) ? "" : null;
}

/** "first_name" → "First name". The last resort for a field with no label at all. */
function humanize(name: string): string {
  const s = name.replace(/\[\]$/, "").replace(/[_\-.[\]]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

/** A trailing "*" is how most pages mark required; it is not part of the question. */
function cleanLabel(label: string): { label: string; starred: boolean } {
  const starred = /\*\s*$/.test(label) || /^\s*\*/.test(label);
  return { label: label.replace(/^\s*\*\s*|\s*\*\s*$/g, "").replace(/\s*\(required\)\s*$/i, "").trim(), starred };
}

const SKIP_INPUTS = new Set(["hidden", "submit", "button", "reset", "image", "search", "password"]);

const INPUT_TYPE: Record<string, string> = {
  email: "email",
  tel: "phone",
  url: "url",
  number: "number",
  range: "number",
  date: "date",
  "datetime-local": "date",
  file: "file_upload",
};

interface Control {
  kind: "input" | "textarea" | "select";
  tag: string;
  /** Where it sits in the form's markup, for the label that precedes it. */
  at: number;
  /** For a select: its option labels. */
  options?: string[];
}

function extractHtmlForm(html: string, url: string): SourceForm | null {
  const clean = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const forms = [...clean.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)];
  let best: SourceForm | null = null;
  for (const f of forms) {
    if (/role\s*=\s*["']?search|action\s*=\s*["'][^"']*search/i.test(f[0].slice(0, 400))) continue;
    const parsed = parseHtmlForm(f[1]!, url, clean);
    if (parsed && (!best || parsed.fields.length > best.fields.length)) best = parsed;
  }
  return best;
}

function parseHtmlForm(markup: string, url: string, page: string): SourceForm | null {
  const labelFor = new Map<string, string>();
  for (const m of markup.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/gi)) {
    const target = attr(`<label${m[1]}>`, "for");
    if (target) labelFor.set(target, textOf(m[2]!));
  }

  const controls: Control[] = [];
  for (const m of markup.matchAll(/<(input|textarea|select)\b[^>]*>/gi)) {
    const kind = m[1]!.toLowerCase() as Control["kind"];
    const control: Control = { kind, tag: m[0], at: m.index! };
    if (kind === "select") {
      const close = markup.indexOf("</select>", m.index!);
      const inner = markup.slice(m.index!, close < 0 ? undefined : close);
      control.options = [...inner.matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/select>|$)/gi)]
        .filter((o) => {
          // The "Select one…" placeholder: empty value, or disabled and selected.
          const value = attr(`<option${o[1]}>`, "value");
          return !(value === "" || (attr(`<option${o[1]}>`, "disabled") !== null && value === null));
        })
        .map((o) => textOf(o[2]!))
        .filter(Boolean);
    }
    controls.push(control);
  }

  /** The label a control's own markup gives it, nearest first. */
  const labelOf = (c: Control): string => {
    const id = attr(c.tag, "id");
    if (id && labelFor.get(id)) return labelFor.get(id)!;
    // Wrapped: <label>Name <input></label>, or <label><input> I agree</label>.
    const before = markup.slice(0, c.at);
    const open = before.lastIndexOf("<label");
    if (open >= 0 && before.lastIndexOf("</label>") < open) {
      const close = markup.indexOf("</label>", c.at);
      const text = textOf(markup.slice(open, close < 0 ? undefined : close));
      if (text) return text;
    }
    return attr(c.tag, "aria-label") || attr(c.tag, "placeholder") || attr(c.tag, "title") || humanize(attr(c.tag, "name") ?? "");
  };

  /** The question a radio or checkbox group asks: its fieldset's legend, else the text just above it. */
  const groupQuestion = (first: Control, name: string): string => {
    const before = markup.slice(0, first.at);
    const fieldset = before.lastIndexOf("<fieldset");
    if (fieldset >= 0 && before.lastIndexOf("</fieldset>") < fieldset) {
      const legend = before.slice(fieldset).match(/<legend\b[^>]*>([\s\S]*?)<\/legend>/i);
      if (legend) return textOf(legend[1]!);
    }
    // The last piece of text before the group that is not itself an option label.
    const tail = textOf(before.slice(Math.max(0, before.length - 600)).replace(/<label\b[\s\S]*?<\/label>/gi, " | "));
    const last = tail.split("|").map((s) => s.trim()).filter(Boolean).at(-1);
    return last || humanize(name);
  };

  const fields: SourceField[] = [];
  const seenGroups = new Set<string>();
  for (const c of controls) {
    const type = (attr(c.tag, "type") ?? "text").toLowerCase();
    if (c.kind === "input" && SKIP_INPUTS.has(type)) continue;
    const required = attr(c.tag, "required") !== null || attr(c.tag, "aria-required") === "true";

    if (c.kind === "input" && (type === "radio" || type === "checkbox")) {
      const name = attr(c.tag, "name") ?? "";
      const group = controls.filter(
        (o) => o.kind === "input" && (attr(o.tag, "type") ?? "").toLowerCase() === type && (attr(o.tag, "name") ?? "") === name,
      );
      if (type === "checkbox" && (group.length === 1 || !name)) {
        // A lone checkbox is agreement: "I accept the terms".
        const { label } = cleanLabel(labelOf(c));
        if (label) fields.push(field({ title: label, type: "yes_no", required }));
        continue;
      }
      if (seenGroups.has(`${type}:${name}`)) continue;
      seenGroups.add(`${type}:${name}`);
      const options = group.map((o) => labelOf(o) || attr(o.tag, "value") || "").filter(Boolean);
      const { label, starred } = cleanLabel(groupQuestion(group[0]!, name));
      if (!label || options.length < 2) continue;
      fields.push(
        field({
          title: label,
          type: type === "radio" ? "single_select" : "multi_select",
          options,
          required: starred || group.some((o) => attr(o.tag, "required") !== null),
        }),
      );
      continue;
    }

    const { label, starred } = cleanLabel(labelOf(c));
    if (!label) continue;
    if (c.kind === "select") {
      if ((c.options ?? []).length < 2) continue;
      const multiple = attr(c.tag, "multiple") !== null;
      fields.push(field({ title: label, type: multiple ? "multi_select" : "dropdown", options: c.options!, required: required || starred }));
      continue;
    }
    const kind = c.kind === "textarea" ? "long_text" : (INPUT_TYPE[type] ?? "short_text");
    fields.push(field({ title: label, type: kind, required: required || starred }));
  }

  // One box is a newsletter signup or a search, not a form to copy.
  if (fields.length < 2) return null;
  const heading = page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = heading ? textOf(heading[1]!) : textOf(page.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  return { url, provider: "html", title, description: "", fields };
}

function field(f: Pick<SourceField, "title" | "type" | "required"> & Partial<SourceField>): SourceField {
  return { description: "", options: [], allowOther: false, config: "", scale: 0, ...f };
}

// ─── Into the prompt, and back out of the draft ───

const srcRef = (i: number) => `src_${i + 1}`;

/**
 * The source form, for the generator: one line per field, with the ref it
 * must use. JSON strings so a label with a quote or a newline in it survives
 * the trip exactly.
 */
export function sourceFormPrompt(form: SourceForm): string {
  const lines: string[] = [];
  let section: string | undefined;
  form.fields.forEach((f, i) => {
    if (f.section !== section) {
      section = f.section;
      if (section) lines.push(`  -- section ${JSON.stringify(section)} --`);
    }
    const parts = [
      `${srcRef(i)}`,
      f.type,
      f.required ? "required" : "optional",
      `title=${JSON.stringify(f.title)}`,
      f.description ? `description=${JSON.stringify(f.description)}` : "",
      f.options.length ? `options=${JSON.stringify(f.options)}` : "",
      f.config ? `config=${JSON.stringify(f.config)}` : "",
      f.allowOther ? "plus an Other box" : "",
      f.jumps ? `jumps=${JSON.stringify(f.jumps)}` : "",
    ].filter(Boolean);
    lines.push(`- ${parts.join(" | ")}`);
  });
  return `

THE FORM AT ${form.url} (read from the page itself, so this is exact):
Title: ${JSON.stringify(form.title)}
${form.description ? `Description: ${JSON.stringify(form.description)}\n` : ""}${lines.join("\n")}

The author wants THIS form. Rules for it, which override the sizing guidance:
- Include every field above as its own question, in this order, with ref exactly as given (src_1, src_2, ...).
- Copy each title, description and option letter for letter, including capitals, punctuation and typos. Do not reword, shorten, merge, split or translate them, and keep required/optional as listed.
- Use the listed type. The words are fixed; conversational tone belongs in the welcome and the endings, not in these questions.
- Where options list jumps, build those as branches: a "section: X" jump goes to the first question of that section, "submit" goes to an ending.
- Add questions, branches or endings only if the author's request asks for something the form does not have, and give those your own refs.`;
}

/**
 * Make the draft's source fields what the source says, before normalizing.
 *
 * The prompt asks for exact copies; this is what makes them exact. A `src_N`
 * block gets the source's type, wording, options and required flag, whatever
 * the model wrote, and one the model left out is put back where it belongs,
 * after the source field before it. Refs are left as `src_N` here and renamed
 * by `applySourceFormToDoc` once the flow is built.
 */
export function applySourceForm(draft: GenerationDraft, form: SourceForm): GenerationDraft {
  const byRef = new Map(form.fields.map((f, i) => [srcRef(i), f]));
  const blocks = draft.blocks.map((b) => {
    const f = byRef.get(b.ref.trim().toLowerCase());
    return f ? { ...b, ref: b.ref.trim().toLowerCase(), ...draftFields(f) } : b;
  });

  const present = new Set(blocks.map((b) => b.ref));
  form.fields.forEach((f, i) => {
    const ref = srcRef(i);
    if (present.has(ref)) return;
    // After the nearest earlier source field that is there; else after the welcome.
    let at = 1;
    for (let j = i - 1; j >= 0; j--) {
      const k = blocks.findIndex((b) => b.ref === srcRef(j));
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    blocks.splice(Math.min(at, blocks.length), 0, { ref, ...draftFields(f) });
    present.add(ref);
  });
  // The first block always becomes the welcome, so a source question there
  // would be turned into a greeting and lose its answer. Give it one.
  if (byRef.has(blocks[0]?.ref ?? "")) {
    blocks.unshift({
      ref: "welcome",
      type: "welcome",
      title: form.title || draft.title,
      description: form.description,
      required: false,
      options: [],
      scale: 0,
      config: "",
    });
  }
  return { ...draft, blocks };
}

function draftFields(f: SourceField): Omit<GenerationDraft["blocks"][number], "ref"> {
  return {
    type: f.type,
    title: f.title,
    description: f.description,
    required: f.required,
    options: f.options,
    scale: f.scale,
    config: f.config,
  };
}

/**
 * The exact values the draft could not carry, and readable refs.
 *
 * After normalizing: a linear scale's end labels and starting number, the
 * "Other" box, and the wording again (the normalizer trims, and folds a
 * trailing "Other" option into the switch). Then `src_3` becomes a ref named
 * after its question, everywhere it is used, because a ref is a column name in
 * the results and a variable in the flow and nobody wants either called src_3.
 */
export function applySourceFormToDoc(doc: FormDoc, form: SourceForm): FormDoc {
  const byRef = new Map(form.fields.map((f, i) => [srcRef(i), f]));
  const taken = new Set(doc.blocks.map((b) => b.ref));
  const rename = new Map<string, string>();

  const blocks = doc.blocks.map((block) => {
    const f = byRef.get(block.ref);
    if (!f) return block;
    let next = { ...block, title: f.title, description: f.description || undefined } as Block;
    if (block.type !== "welcome" && block.type !== "statement" && block.type !== "legal_consent") {
      next = { ...next, required: f.required } as Block;
    }
    if ("allowOther" in next && f.allowOther) next = { ...next, allowOther: true } as Block;
    if (next.type === "opinion_scale" && f.scaleLabels) {
      next = {
        ...next,
        startAt: f.scaleLabels.startAt,
        ...(f.scaleLabels.low ? { labelLow: f.scaleLabels.low.slice(0, 100) } : {}),
        ...(f.scaleLabels.high ? { labelHigh: f.scaleLabels.high.slice(0, 100) } : {}),
      } as Block;
    }
    const readable = uniqueRef(f.title, taken);
    rename.set(block.ref, readable);
    return { ...next, ref: readable } as Block;
  });

  // Refs appear in rules as plain strings; swap them wherever they stand alone.
  const swap = (value: unknown): unknown => {
    if (typeof value === "string") return rename.get(value) ?? value;
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swap(v)]));
    }
    return value;
  };
  const layout = Object.fromEntries(Object.entries(doc.layout ?? {}).map(([k, v]) => [rename.get(k) ?? k, v]));
  return {
    ...doc,
    blocks: swap(blocks) as Block[],
    logic: swap(doc.logic) as FormDoc["logic"],
    endingRules: swap(doc.endingRules) as FormDoc["endingRules"],
    layout,
  };
}

function uniqueRef(title: string, taken: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .split("_")
      .slice(0, 5)
      .join("_")
      .replace(/^[^a-z]+/, "")
      .slice(0, 36) || "question";
  let ref = base.length < 2 ? `q_${base}` : base;
  let n = 2;
  while (taken.has(ref)) ref = `${base}_${n++}`;
  taken.add(ref);
  return ref;
}
