import { decodeEntities } from "../research.js";
import { inferTextType } from "./text.js";
import type { ImportedForm, ImportedItem } from "./types.js";

/**
 * A form on any web page, from its `<form>` markup: labels, input types,
 * `<select>` options, radio and checkbox groups, rows of choice buttons, and
 * `required`. A contact page, an application on a company site, a signup.
 *
 * The one reader for pages that are not a form builder's, shared like the
 * others: the converter, the dashboard's Import, and a link pasted into the
 * AI builder all reach it through `formInPage` in `read.ts`.
 *
 * A page says less than a builder does. A plain text box labelled "Email"
 * gets its type from the label (`typeGuessed`), and a page that marks no
 * field required checks in script (`requiredUnknown`); the AI builder lets
 * its model decide both, and an import takes the guess.
 */


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

export function readHtmlForm(html: string, url: string): ImportedForm | null {
  const clean = html.replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ");
  const forms = [...clean.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)];
  let best: ImportedForm | null = null;
  for (const f of forms) {
    if (/role\s*=\s*["']?search|action\s*=\s*["'][^"']*search/i.test(f[0].slice(0, 400))) continue;
    const parsed = parseHtmlForm(f[1]!, url, clean);
    if (parsed && (!best || parsed.items.length > best.items.length)) best = parsed;
  }
  return best;
}

function parseHtmlForm(markup: string, url: string, page: string): ImportedForm | null {
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

  // Found in markup order; button groups are found separately, so each field
  // keeps where it sat and the list is sorted at the end.
  const found: { at: number; field: Field }[] = [];
  const push = (at: number, f: Field) => found.push({ at, field: f });
  const seenGroups = new Set<string>();
  for (const c of controls) {
    const type = (attr(c.tag, "type") ?? "text").toLowerCase();
    if (c.kind === "input" && SKIP_INPUTS.has(type)) continue;
    // A honeypot: a field hidden from people so only bots fill it in. Never a question.
    if (attr(c.tag, "aria-hidden") === "true" || attr(c.tag, "tabindex") === "-1" || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(c.tag, "style") ?? "")) continue;
    const required = attr(c.tag, "required") !== null || attr(c.tag, "aria-required") === "true";
    const placeholder = attr(c.tag, "placeholder")?.trim() || undefined;

    if (c.kind === "input" && (type === "radio" || type === "checkbox")) {
      const name = attr(c.tag, "name") ?? "";
      const group = controls.filter(
        (o) => o.kind === "input" && (attr(o.tag, "type") ?? "").toLowerCase() === type && (attr(o.tag, "name") ?? "") === name,
      );
      if (type === "checkbox" && (group.length === 1 || !name)) {
        // A lone checkbox is agreement: "I accept the terms".
        const { label } = cleanLabel(labelOf(c));
        if (label) push(c.at, field({ title: label, type: "yes_no", required }));
        continue;
      }
      if (seenGroups.has(`${type}:${name}`)) continue;
      seenGroups.add(`${type}:${name}`);
      const options = group.map((o) => labelOf(o) || attr(o.tag, "value") || "").filter(Boolean);
      const { label, starred } = cleanLabel(groupQuestion(group[0]!, name));
      if (!label || options.length < 2) continue;
      push(
        c.at,
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
      push(c.at, field({ title: label, type: multiple ? "multi_select" : "dropdown", options: c.options!, required: required || starred }));
      continue;
    }
    if (c.kind === "textarea") {
      push(c.at, field({ title: label, type: "long_text", required: required || starred, placeholder }));
      continue;
    }
    // `type="email"` says so. `type="text"` says nothing, so read the rest.
    const declared = INPUT_TYPE[type];
    const guessed = declared ?? inferTextType({ name: attr(c.tag, "name"), autocomplete: attr(c.tag, "autocomplete"), placeholder, label });
    push(
      c.at,
      field({ title: label, type: guessed ?? "short_text", typeGuessed: guessed === null, required: required || starred, placeholder }),
    );
  }

  /*
   * Choices drawn as a row of buttons: <span>Pick one</span><button>A</button><button>B</button>.
   * The commonest custom choice control there is, and invisible to a reader
   * that only knows <select> and radios. The question is the text between the
   * previous field and the first button. Whether one or several can be picked
   * lives in the page's script, so the type is left to the generator.
   */
  for (const run of markup.matchAll(/(?:<button\b(?:(?!type\s*=\s*["']?submit)[^>])*>(?:(?!<\/?button\b)[\s\S]){1,160}<\/button>(?:\s|<\/?(?:div|span|li|ul)\b[^>]*>)*){2,}/gi)) {
    const options = [...run[0].matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map((b) => textOf(b[1]!)).filter(Boolean);
    if (options.length < 2 || options.some((o) => o.length > 80)) continue;
    const before = markup.slice(Math.max(0, run.index! - 800), run.index!);
    const cut = Math.max(before.lastIndexOf("</label>"), before.lastIndexOf("/>"), before.lastIndexOf("</select>"), before.lastIndexOf("</textarea>"), before.lastIndexOf("</button>"));
    const { label, starred } = cleanLabel(textOf(before.slice(cut + 1).replace(/^[^<]*>/, "")));
    if (!label || label.length > 200) continue;
    const other = options.length > 2 && OTHER_LABEL.test(options.at(-1)!);
    push(
      run.index!,
      field({
        title: label,
        type: "multi_select",
        typeGuessed: true,
        options: other ? options.slice(0, -1) : options,
        allowOther: other,
        required: starred,
      }),
    );
  }

  const fields = found.sort((a, b) => a.at - b.at).map((f) => f.field);
  // One box is a newsletter signup or a search, not a form to copy.
  if (fields.length < 2) return null;
  // No field marked required anywhere means the page checks in script, and
  // "optional" everywhere would be invented. The generator decides those.
  const marksRequired = fields.some((f) => f.required);
  const heading = page.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title = heading ? textOf(heading[1]!) : textOf(page.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  return {
    provider: "website",
    url,
    // A page with no heading or title is named for its site, not "Imported form".
    title: title || hostOf(url),
    description: "",
    items: fields.map((f, i) => ({ ...f, key: `h${i + 1}`, ...(marksRequired ? {} : { requiredUnknown: true }) })),
    endings: [],
    jumps: [],
    hiddenFields: [],
    notCopied: [],
    closed: false,
  };
}

/** "Other", "Others", "Other (please specify)": the label of a free-text escape hatch. */
const OTHER_LABEL = /^others?\b/i;

type Field = Omit<ImportedItem, "key">;

function field(f: Pick<Field, "title" | "type" | "required"> & Partial<Field>): Field {
  return { description: "", options: [], allowOther: false, config: "", scale: 0, ...f };
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
