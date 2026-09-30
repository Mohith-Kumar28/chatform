import type { Block, FormDoc } from "@repo/form-schema";
import type { GenerationDraft } from "./ai.js";
import { inferTextType } from "./import/text.js";
import type { ImportedForm, ImportProvider } from "./import/types.js";

export { inferTextType };

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
 * So the form is read out of the page by code, not by a model, and by the
 * same code the converter and the dashboard's Import use (`lib/import/`,
 * through `formInPage` in `research.ts`): a builder's own data for Google
 * Forms, Typeform, Tally, Jotform and Youform, and `<form>` markup for any
 * other page. `sourceFormOf` turns that reading into the fields below.
 *
 * The generator is then told to place each one as `src_N`, and `applySourceForm`
 * makes that true whatever the model wrote: wording, type, options and required
 * come from here, and a field the model dropped is put back. The model still
 * decides the welcome, the endings, any branching, and anything the author
 * asked to ADD, which is the part of the job a model is for.
 */

export interface SourceField {
  /** How to ask it: worded for a chat (`wordQuestions`), or the source's own words. */
  title: string;
  /** The source's own words, when `title` was reworded. Refs are made from it. */
  label?: string;
  description: string;
  /** A generation draft block type. */
  type: string;
  /**
   * Whether the source actually said what kind of answer this is.
   *
   * A `<select>`, radio buttons, `type="email"` or a Google dropdown do. A bare
   * text box does not: "Email" on a plain `<input type="text">` is still an
   * email question, and copying "text" literally turned every such field into
   * Short text. When this is false the type here is our best guess from the
   * name, placeholder and label, and the generator's own choice wins.
   */
  typeKnown: boolean;
  /** Exactly as the source wrote them, in its order. */
  options: string[];
  /** The source offered a free-text "Other". */
  allowOther: boolean;
  required: boolean;
  /**
   * Whether the page marked required fields at all. A form that validates in
   * JavaScript marks none, and "optional" on every field would be a guess
   * dressed up as a copy; the generator decides those.
   */
  requiredKnown: boolean;
  /** The box's placeholder text, as the source wrote it. */
  placeholder?: string;
  /** Draft `config`, for the types that need one (matrix rows). */
  config: string;
  /** Draft `scale`: stars, or the number of steps on a linear scale. */
  scale: number;
  /** A linear scale's end labels and first number, applied after normalizing. */
  scaleLabels?: { low?: string; high?: string; startAt: 0 | 1 };
  /** Option label → where the source sends that answer ("question: X" or "submit"). */
  jumps?: Record<string, string>;
  /** Which linked form it came from, when the author linked more than one. */
  form?: string;
}

export interface SourceForm {
  url: string;
  provider: ImportProvider;
  title: string;
  description: string;
  fields: SourceField[];
}

/**
 * Several linked forms as one list of fields, each tagged with the form it
 * came from. An author who links a VC form and a founder form wants both,
 * usually as two paths; using only the first one found dropped the other.
 */
export function mergeSourceForms(forms: SourceForm[]): SourceForm | null {
  if (forms.length === 0) return null;
  if (forms.length === 1) return forms[0]!;
  return {
    url: forms.map((f) => f.url).join(" and "),
    provider: forms[0]!.provider,
    title: forms[0]!.title,
    description: "",
    fields: forms.flatMap((f) => f.fields.map((field) => ({ ...field, form: `${f.title || "Form"} (${f.url})` }))),
  };
}


// ─── A builder's form, read by the importer ───

/**
 * The importer's reading of a form, as the generator's source fields.
 *
 * One reader per builder, shared: `lib/import/` reads Google Forms, Typeform,
 * Tally, Jotform and Youform for the "Switch to chatform" converter, and a
 * link pasted into the AI builder goes through the same code. What the
 * generator needs on top (the `src_N` refs, the model's choice where the
 * source is silent) happens here and in `applySourceForm`.
 */
export function sourceFormOf(form: ImportedForm): SourceForm | null {
  const byKey = new Map(form.items.map((it) => [it.key, it]));
  const fields: SourceField[] = form.items.map((it) => {
    const jumps: Record<string, string> = {};
    for (const j of form.jumps) {
      const c = j.fromKey === it.key && j.when?.op === "and" && j.when.conditions.length === 1 && j.when.groups.length === 0 ? j.when.conditions[0] : undefined;
      const optionKey = c?.op === "eq" && typeof c.value === "object" && c.value !== null && "optionKey" in c.value ? c.value.optionKey : undefined;
      const label = optionKey === undefined ? undefined : it.options[(it.optionKeys ?? it.options).indexOf(optionKey)];
      if (!label) continue;
      const target = j.to.kind === "item" ? byKey.get(j.to.key)?.title : undefined;
      jumps[label] = j.to.kind === "ending" ? "submit" : target ? `question: ${target}` : "submit";
    }
    return {
      title: it.title,
      description: it.description,
      type: it.type,
      typeKnown: !it.typeGuessed,
      options: it.options,
      allowOther: it.allowOther,
      required: it.required,
      requiredKnown: !it.requiredUnknown,
      ...(it.placeholder ? { placeholder: it.placeholder } : {}),
      config: it.config,
      scale: it.scale,
      ...(it.exact && it.type === "opinion_scale"
        ? { scaleLabels: { low: it.exact.labelLow, high: it.exact.labelHigh, startAt: it.exact.startAt === 0 ? (0 as const) : (1 as const) } }
        : {}),
      ...(Object.keys(jumps).length > 0 ? { jumps } : {}),
    };
  });
  if (fields.filter((f) => f.type !== "statement").length === 0) return null;
  return { url: form.url, provider: form.provider, title: form.title, description: form.description, fields };
}


// ─── Into the prompt, and back out of the draft ───

const srcRef = (i: number) => `src_${i + 1}`;

/**
 * The source form, for the generator: one line per field, with the ref it
 * must use. JSON strings so a label with a quote or a newline in it survives
 * the trip exactly.
 */
/** The linked form, one line per field under its `src_N` ref: shared by generation and edits. */
function sourceFormListing(form: SourceForm): string {
  const lines: string[] = [];
  let from: string | undefined;
  form.fields.forEach((f, i) => {
    if (f.form !== from) {
      from = f.form;
      if (from) lines.push(`  == form ${from} ==`);
    }
    const parts = [
      `${srcRef(i)}`,
      f.typeKnown ? f.type : `${f.type}?`,
      !f.requiredKnown ? "required?" : f.required ? "required" : "optional",
      `title=${JSON.stringify(f.title)}`,
      f.placeholder ? `placeholder=${JSON.stringify(f.placeholder)}` : "",
      f.description ? `description=${JSON.stringify(f.description)}` : "",
      f.options.length ? `options=${JSON.stringify(f.options)}` : "",
      f.config ? `config=${JSON.stringify(f.config)}` : "",
      f.allowOther ? "plus an Other box" : "",
      f.jumps ? `jumps=${JSON.stringify(f.jumps)}` : "",
    ].filter(Boolean);
    lines.push(`- ${parts.join(" | ")}`);
  });
  return `THE FORM${form.fields.some((f) => f.form) ? "S" : ""} AT ${form.url} (read from the page itself, so the words are exact):
Title: ${JSON.stringify(form.title)}
${form.description ? `Description: ${JSON.stringify(form.description)}\n` : ""}${lines.join("\n")}`;
}

/**
 * A linked form, for the model: what it is, and only the choices that are the
 * model's to make. Shared by the AI box (`create`) and the builder chat
 * (`edit`). Options, required settings and descriptions are not asked for:
 * `applySourceFields` copies them from the source whatever the model writes.
 */
export function linkedFormSection(form: SourceForm, purpose: "create" | "edit"): string {
  const what =
    purpose === "create"
      ? "The author wants this form: include every field as its own question, in this order. Add anything else only if the request asks for it."
      : "Do with it what the request asks: add all or some of its questions, replace this form's questions with them, or only use it as a reference. When the request only pastes the link, a form with no real questions yet takes it whole, and one that has questions gets its questions added after its own.";
  return `

THE AUTHOR LINKED A FORM. ${sourceFormListing(form)}

${what}
- Give every field you take the ref shown (src_1, src_2, ...). Its options, required setting and description are copied from the source for you.
- ${QUESTION_WORDING}
- A type ending in "?" is our guess from a plain box: choose the type that collects that answer. Any other type is the source's. "required?" means the source does not say: decide.
- Jumps on an option are the source's branches: build them. "question: X" goes to that question, "submit" to an ending.
- Several forms are several paths: follow the request for how respondents reach each one.`;
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
  const blocks = applySourceFields(draft.blocks, form);

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
    blocks.splice(Math.min(at, blocks.length), 0, { ref, ...draftFields(f), title: titleFor(f) });
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

/**
 * The source's facts on every drafted block that names a source field by its
 * `src_N` ref: type where the page stated one, options, required, description.
 * The words are the model's. Shared by a new form (`applySourceForm`) and an
 * edit's added questions, so a linked form is copied the same way in both.
 */
export function applySourceFields<B extends GenerationDraft["blocks"][number]>(blocks: B[], form: SourceForm): B[] {
  const byRef = new Map(form.fields.map((f, i) => [srcRef(i), f]));
  return blocks.map((b) => {
    const ref = b.ref.trim().toLowerCase();
    const f = byRef.get(ref);
    return f ? { ...b, ref, ...mergeField(b, f) } : b;
  });
}

const CHOICE_TYPES = new Set(["single_select", "multi_select", "dropdown", "poll", "ranking", "picture_choice"]);

/**
 * What the source fixes and what the generator keeps.
 *
 * The words are the model's (the source's when it wrote none). The type is
 * the source's only when the page stated one; otherwise the generator's pick stands (an email block for
 * "Email", a choice for "Where did you hear about us?"), except that options
 * the page did list are kept, so a guessed choice type still gets them. The
 * required flag is the source's only when the page marked any.
 */
function mergeField(model: GenerationDraft["blocks"][number], f: SourceField): Omit<GenerationDraft["blocks"][number], "ref"> {
  const exact = { ...draftFields(f), title: titleFor(f, model.title) };
  const type = f.typeKnown
    ? f.type
    : f.options.length > 0
      ? CHOICE_TYPES.has(model.type)
        ? model.type
        : f.type
      : model.type;
  const keepModelShape = !f.typeKnown && f.options.length === 0;
  return {
    ...exact,
    type,
    required: f.requiredKnown ? f.required : model.required,
    options: keepModelShape ? model.options : exact.options,
    scale: keepModelShape ? model.scale : exact.scale,
    config: keepModelShape ? model.config : exact.config,
  };
}

/**
 * How every copied question is worded, for the three places a model words
 * one: a linked form in the AI box, one in the builder chat, and an import
 * (`lib/import/phrase.ts`). The words come from the model, judged per field;
 * code never rewrites a title into a template.
 */
export const QUESTION_WORDING =
  "A source's title is the label it put beside a box, not always what to ask. Word each one as a person would naturally ask it in a chat, judged by what that field collects: same meaning, same language, nothing added or left out. Keep one that already reads well as it is.";

/** Words for the respondent (a statement) are shown as written; everything else is asked. */
function titleFor(f: SourceField, model?: string): string {
  return f.type === "statement" ? f.title : model?.trim() || f.title;
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
  return finishSourceForm(doc, form).doc;
}

/** `applySourceFormToDoc`, plus which `src_N` ref became which readable one, for an edit's change list. */
export function finishSourceForm(doc: FormDoc, form: SourceForm): { doc: FormDoc; rename: Map<string, string> } {
  const byRef = new Map(form.fields.map((f, i) => [srcRef(i), f]));
  const taken = new Set(doc.blocks.map((b) => b.ref));
  const rename = new Map<string, string>();

  const blocks = doc.blocks.map((block) => {
    const f = byRef.get(block.ref);
    if (!f) return block;
    let next = { ...block, title: titleFor(f, block.title), description: f.description || undefined } as Block;
    if (f.requiredKnown && block.type !== "welcome" && block.type !== "statement" && block.type !== "legal_consent") {
      next = { ...next, required: f.required } as Block;
    }
    // Only the text boxes have one; a placeholder on a choice has nowhere to go.
    if (f.placeholder && (next.type === "short_text" || next.type === "long_text")) {
      next = { ...next, placeholder: f.placeholder.slice(0, 200) } as Block;
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
    const readable = uniqueRef(f.label ?? f.title, taken);
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
    doc: {
      ...doc,
      blocks: swap(blocks) as Block[],
      logic: swap(doc.logic) as FormDoc["logic"],
      endingRules: swap(doc.endingRules) as FormDoc["endingRules"],
      layout,
    },
    rename,
  };
}

export function uniqueRef(title: string, taken: Set<string>): string {
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
