import { htmlToMarkdown, inferTextType } from "./text.js";
import type { ImportedForm, ImportedItem, ImportedJump } from "./types.js";

/**
 * A Google Form, from `FB_PUBLIC_LOAD_DATA_`, the JSON its own page renders from.
 *
 * The type codes are undocumented but have been stable for years (see the
 * table in `form-import.ts`, which reads the same data to hand a linked form to
 * the generator). This reader goes further, because an import has no model to
 * fill gaps: it keeps each item's id, so "go to section X" on an answer
 * becomes a jump to that section's first question, exactly.
 *
 * Google does not publish where a section goes after its last question (the
 * field that looks like it does holds the section's own id in real forms), so
 * only the per-answer jumps are copied. Those are what branching Google Forms
 * are built from.
 */

type Json = unknown;
const arr = (v: Json): Json[] => (Array.isArray(v) ? v : []);
const str = (v: Json): string => (typeof v === "string" ? v : "");

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
  image: 11,
  video: 12,
  upload: 13,
  rating: 18,
} as const;

/** Google's "Submit form" as an answer's destination. */
const SUBMIT = -3;
export const GOOGLE_END = "end";

export function parseGoogleData(html: string): Json[] | null {
  const m = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*([\s\S]*?);\s*<\/script>/);
  if (!m) return null;
  try {
    const data = JSON.parse(m[1]!) as Json;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * `html` is the viewform page the data came from. Google keeps image items and
 * question images as blob ids with no public URL, but the page renders each
 * one as an `<img>` inside its item's `data-item-id` container, and that URL
 * is public. Without the page, images are reported as not copied.
 */
export function readGoogleForm(data: Json[], url: string, html = ""): ImportedForm {
  const body = arr(data[1]);
  const images = googleImages(html);
  const raw = arr(body[1]).map(arr);
  const notCopied = new Set<string>();
  const items: ImportedItem[] = [];
  const jumps: ImportedJump[] = [];

  /** Section id → the first item after its header, filled in as items are read. */
  const sectionStart = new Map<number, string | null>();
  const pendingSections: number[] = [];
  /** Jumps whose section target is resolved once every item is read. */
  const toSection: { fromKey: string; optionKey: string; section: number }[] = [];
  let pendingImage: string | undefined;

  for (const item of raw) {
    const type = item[3];
    const id = typeof item[0] === "number" ? item[0] : items.length;
    const key = `g${id}`;
    const title = str(item[1]).trim();
    // The formatted description (bold, links, paragraphs) sits beside the plain one.
    const description = richOr(item[12], item[2]);
    const imageUrl = images.get(id);

    if (type === G.section) {
      sectionStart.set(id, null);
      pendingSections.push(id);
      // A section's title and description are words for the respondent.
      if (title || description) {
        pushItem({ key, type: "statement", title: title || description, description: title ? description : "", required: false, options: [], allowOther: false, scale: 0, config: "" });
      }
      continue;
    }
    if (type === G.image) {
      if (!imageUrl) notCopied.add("Images");
      // With words it is a message of its own; a bare picture rides on the next question.
      else if (title || description) pushItem({ key, type: "statement", title: title || description, description: title ? description : "", required: false, options: [], allowOther: false, scale: 0, config: "", imageUrl });
      else pendingImage ??= imageUrl;
      continue;
    }
    if (type === G.video) {
      const youtube = str(arr(item[6])[3]);
      if (/^[\w-]{11}$/.test(youtube)) {
        pushItem({ key, type: "statement", title: title || "Watch this", description: `${description ? `${description}\n\n` : ""}https://www.youtube.com/watch?v=${youtube}`, required: false, options: [], allowOther: false, scale: 0, config: "" });
      } else {
        notCopied.add("Videos");
      }
      continue;
    }

    const entries = arr(item[4]);
    const entry = arr(entries[0]);
    const required = entry[2] === 1;
    const rawOptions = arr(entry[1]).map(arr);
    const named = rawOptions.filter((o) => str(o[0]).length > 0);
    const options = named.map((o) => str(o[0]));
    // An option with an empty label and the "other" flag is Google's "Other:" box.
    const allowOther = rawOptions.some((o) => str(o[0]) === "" && o[4] === 1);
    const base: ImportedItem = { key, type: "short_text", title, description, required, options: [], allowOther: false, scale: 0, config: "", ...(imageUrl ? { imageUrl } : {}) };

    switch (type) {
      case G.short: {
        // Response validation: [[2, 102]] is "text is an email", [[2, 103]] a URL, category 1 a number.
        const rule = arr(arr(entry[4])[0]);
        const kind = rule[0] === 2 && rule[1] === 102 ? "email" : rule[0] === 2 && rule[1] === 103 ? "url" : rule[0] === 1 ? "number" : null;
        if (title) pushItem({ ...base, type: kind ?? inferTextType({ label: title }) ?? "short_text", ...(kind ? {} : { typeGuessed: true }) });
        break;
      }
      case G.paragraph:
        if (title) pushItem({ ...base, type: "long_text" });
        break;
      case G.choice:
      case G.dropdown:
      case G.checkbox: {
        if (!title) break;
        pushItem({
          ...base,
          type: type === G.choice ? "single_select" : type === G.dropdown ? "dropdown" : "multi_select",
          options,
          optionKeys: options,
          allowOther,
        });
        for (const o of named) {
          const to = o[2];
          if (typeof to !== "number") continue;
          if (to === SUBMIT) jumps.push({ fromKey: key, when: eq(key, str(o[0])), to: { kind: "ending", key: GOOGLE_END } });
          else if (to > 0) toSection.push({ fromKey: key, optionKey: str(o[0]), section: to });
        }
        break;
      }
      case G.scale: {
        const labels = arr(entry[3]);
        pushItem({
          ...base,
          type: "opinion_scale",
          scale: options.length,
          exact: {
            startAt: Number(options[0]) === 0 ? 0 : 1,
            labelLow: str(labels[0]) || undefined,
            labelHigh: str(labels[1]) || undefined,
          },
        });
        break;
      }
      case G.rating:
        pushItem({ ...base, type: "rating", scale: Math.max(3, Math.min(10, options.length || 5)) });
        break;
      case G.grid: {
        // One entry per row: [entryId, columns, required, [rowLabel], …, [1] when a checkbox grid].
        const rows = entries.map((e) => str(arr(arr(e)[3])[0])).filter(Boolean);
        const multiple = entries.some((e) => arr(arr(e)[11])[0] === 1);
        if (!title || rows.length === 0 || options.length < 2) break;
        pushItem({
          ...base,
          type: "matrix",
          options,
          config: `rows=${rows.map((r) => r.replace(/[|;]/g, " ")).join("|")}${multiple ? "; multiplePerRow=true" : ""}`,
        });
        break;
      }
      case G.date:
        if (title) pushItem({ ...base, type: "date" });
        break;
      case G.time:
        // No time-only question; a short answer keeps the question and its wording.
        if (title) pushItem({ ...base, type: "short_text", placeholder: "HH:MM", typeGuessed: true });
        break;
      case G.upload:
        if (title) pushItem({ ...base, type: "file_upload" });
        break;
      case G.text:
        if (title || description) pushItem({ ...base, type: "statement", title: title || description, description: title ? description : "", required: false });
        break;
      default:
        break;
    }
  }

  for (const j of toSection) {
    const start = sectionStart.get(j.section);
    if (start) jumps.push({ fromKey: j.fromKey, when: eq(j.fromKey, j.optionKey), to: { kind: "item", key: start } });
    // A section with nothing in it: the jump lands on whatever follows, which
    // is the next section's first question, or the end.
    else jumps.push({ fromKey: j.fromKey, when: eq(j.fromKey, j.optionKey), to: nextAfterSection(j.section) });
  }

  const confirmation = str(arr(body[2])[0]).trim();

  return {
    provider: "google_forms",
    url,
    title: str(body[8]).trim() || str(data[3]).trim(),
    description: richOr(body[24], body[0]),
    items,
    endings: [
      {
        key: GOOGLE_END,
        title: confirmation || "Your response has been recorded.",
        body: "",
      },
    ],
    jumps,
    hiddenFields: [],
    notCopied: [...notCopied],
    closed: false,
  };

  function pushItem(item: ImportedItem) {
    if (pendingImage && !item.imageUrl) {
      item.imageUrl = pendingImage;
      pendingImage = undefined;
    }
    items.push(item);
    while (pendingSections.length > 0) sectionStart.set(pendingSections.shift()!, item.key);
  }

  function nextAfterSection(section: number): ImportedJump["to"] {
    const order = [...sectionStart.keys()];
    for (let i = order.indexOf(section) + 1; i < order.length; i++) {
      const start = sectionStart.get(order[i]!);
      if (start) return { kind: "item", key: start };
    }
    return { kind: "ending", key: GOOGLE_END };
  }
}

function eq(itemKey: string, optionKey: string) {
  return { op: "and" as const, conditions: [{ itemKey, op: "eq" as const, value: { optionKey } }], groups: [] };
}

/** A `[null, "<p>…</p>"]` rich-text pair as markdown, else the plain text. */
function richOr(rich: Json, plain: Json): string {
  const html = str(arr(rich)[1]);
  return (html ? htmlToMarkdown(html) : "") || str(plain).trim();
}

/** Item id → the image its container renders, full width rather than Google's thumbnail. */
function googleImages(html: string): Map<number, string> {
  const found = new Map<number, string>();
  if (!html) return found;
  const parts = html.split(/data-item-id="(\d+)"/);
  for (let i = 1; i < parts.length; i += 2) {
    const src = parts[i + 1]?.match(/<img[^>]+src="(https:\/\/docs\.google\.com\/forms-images-[a-z]+\/[^"]+)"/)?.[1];
    if (src) found.set(Number(parts[i]), src.replace(/&amp;/g, "&").replace(/=w\d+$/, "=w1200"));
  }
  return found;
}
