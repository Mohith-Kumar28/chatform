import type { FormDoc } from "./form-doc";

/**
 * One form, several languages.
 *
 * A form is written once, in `settings.language`. `settings.languages` lists the
 * others it is offered in. Nothing about a translation lives in the document:
 * translations are a memory keyed by the source text itself (see the API's
 * `lib/translations.ts`), so an edited question simply stops matching its old
 * translation and is translated again, and a publish, a checksum and a version
 * are exactly what they were before this existed.
 *
 * What makes that safe is that an answer is never text. A choice is stored as
 * its option id, a rating as a number, a matrix as row and column ids, so a
 * respondent reading Hindi and one reading English write the same answer and
 * land in the same results column. The only thing a language changes is what is
 * on screen, which is why everything here is a function from one document to
 * another with the same ids and refs.
 */

export interface FormLanguage {
  /** ISO 639-1, the same two letters `settings.language` holds. */
  code: string;
  /** In English, for the builder. */
  name: string;
  /** In itself, for the respondent's switcher. */
  native: string;
  rtl?: boolean;
}

export const FORM_LANGUAGES: readonly FormLanguage[] = [
  { code: "en", name: "English", native: "English" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", name: "Assamese", native: "অসমীয়া" },
  { code: "ur", name: "Urdu", native: "اردو", rtl: true },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ar", name: "Arabic", native: "العربية", rtl: true },
  { code: "he", name: "Hebrew", native: "עברית", rtl: true },
  { code: "fa", name: "Persian", native: "فارسی", rtl: true },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "tl", name: "Filipino", native: "Filipino" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "da", name: "Danish", native: "Dansk" },
  { code: "nb", name: "Norwegian", native: "Norsk" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "ro", name: "Romanian", native: "Română" },
];

const BY_CODE = new Map(FORM_LANGUAGES.map((l) => [l.code, l]));

export function formLanguage(code: string | null | undefined): FormLanguage | null {
  return code ? (BY_CODE.get(code.toLowerCase()) ?? null) : null;
}

/** "Hindi" for "hi"; the code itself for anything not on the list. */
export function languageName(code: string): string {
  return formLanguage(code)?.name ?? code;
}

export function isRtlLanguage(code: string): boolean {
  return formLanguage(code)?.rtl === true;
}

/** The most languages one form is offered in, its own included. */
export const MAX_FORM_LANGUAGES = 12;

/**
 * Every language a form is offered in, its own first.
 *
 * Tolerant of what a stored document may hold: an unknown code, a duplicate, or
 * the form's own language listed again are dropped rather than refused, because
 * this runs on every read and a bad entry must not take a form down.
 */
export function formLanguages(doc: Pick<FormDoc, "settings">): string[] {
  const base = doc.settings.language;
  const out = [base];
  for (const code of doc.settings.languages ?? []) {
    if (BY_CODE.has(code) && !out.includes(code)) out.push(code);
  }
  return out.slice(0, MAX_FORM_LANGUAGES);
}

/**
 * Which of a form's languages this respondent gets.
 *
 * `wanted` is in order of preference: a language asked for by name (the
 * switcher, a `?lang=` on the link), then the browser's own list. Region is
 * ignored, so `hi-IN` reads the Hindi version. Nothing matching is the form's
 * own language, which is what everyone got before there was a choice.
 */
export function pickFormLanguage(available: readonly string[], wanted: readonly (string | null | undefined)[]): string {
  for (const tag of wanted) {
    const code = tag?.trim().slice(0, 2).toLowerCase();
    if (code && available.includes(code)) return code;
  }
  return available[0] ?? "en";
}

/** The language tags of an `Accept-Language` header, most wanted first. */
export function acceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag ?? "", q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((p) => p.tag && p.tag !== "*")
    .sort((a, b) => b.q - a.q)
    .map((p) => p.tag);
}

/** The plain string fields a block may carry that a respondent reads. */
const BLOCK_TEXT = [
  "title",
  "description",
  "buttonLabel",
  "placeholder",
  "labelLow",
  "labelHigh",
  "yesLabel",
  "noLabel",
  "itemLabel",
  "consentText",
  "agreeLabel",
  "declineLabel",
] as const;

/** The lists of `{ id, label }` a block may carry. */
const BLOCK_LISTS = ["options", "items", "rows", "columns"] as const;

type Loose = Record<string, unknown>;

function mapKeys(target: Loose, keys: readonly string[], fn: (text: string) => string): void {
  for (const key of keys) {
    const value = target[key];
    if (typeof value === "string" && value.trim()) target[key] = fn(value);
  }
}

function mapLabelled(list: unknown, fn: (text: string) => string): void {
  if (!Array.isArray(list)) return;
  for (const entry of list) {
    if (entry && typeof entry === "object") mapKeys(entry as Loose, ["label", "description"], fn);
  }
}

/**
 * The document with every respondent-facing string passed through `fn`.
 *
 * One walk for both jobs: collecting what there is to translate (an `fn` that
 * records and returns its input) and applying a translation (an `fn` that looks
 * one up). Two walks would be two lists of "what counts as text", and the day
 * they disagreed a field would be translated and never shown, or shown and
 * never translated.
 *
 * Ids, refs, keys, logic, scores and URLs are never touched, so the result
 * validates, branches and stores exactly like the original.
 */
export function mapFormText(doc: FormDoc, fn: (text: string) => string): FormDoc {
  const out = JSON.parse(JSON.stringify(doc)) as FormDoc;
  mapKeys(out as unknown as Loose, ["title", "description"], fn);

  for (const block of out.blocks) {
    const b = block as unknown as Loose;
    mapKeys(b, BLOCK_TEXT, fn);
    for (const key of BLOCK_LISTS) mapLabelled(b[key], fn);
    // `fields` is a list of names on a contact or address block and a list of
    // columns on a group; only the second has anything to read.
    if (block.type === "field_group" && Array.isArray(b.fields)) {
      for (const field of b.fields) {
        if (!field || typeof field !== "object") continue;
        mapKeys(field as Loose, ["label", "placeholder"], fn);
        mapLabelled((field as Loose).options, fn);
      }
    }
  }

  for (const ending of out.endings) {
    mapKeys(ending as unknown as Loose, ["title", "bodyMd", "ctaLabel"], fn);
    mapLabelled(ending.requirements, fn);
  }

  mapKeys(out.settings.closeRules as unknown as Loose, ["closedMessageMd"], fn);
  mapKeys(out.settings.requireAuth as unknown as Loose, ["message"], fn);
  return out;
}

/** Every distinct respondent-facing string in the document, in reading order. */
export function formTexts(doc: FormDoc): string[] {
  const seen = new Set<string>();
  mapFormText(doc, (text) => {
    seen.add(text);
    return text;
  });
  return [...seen];
}

/**
 * The form as one language's respondent reads it.
 *
 * A string with no translation yet is left as written, so a half-translated
 * form is a form with a few lines in its own language rather than a broken one.
 * The document's own language moves with it: the interviewer is told to speak
 * `settings.language`, and the page lays itself out by `settings.rtl`.
 */
export function localizeFormDoc(doc: FormDoc, language: string, translations: ReadonlyMap<string, string>): FormDoc {
  if (language === doc.settings.language) return doc;
  const out = mapFormText(doc, (text) => translations.get(text) ?? text);
  out.settings.language = language;
  out.settings.agent.language = language;
  out.settings.rtl = isRtlLanguage(language);
  return out;
}

const TOKEN = /\{\{[^}]*\}\}|\{[a-zA-Z]+\}/g;

/**
 * Whether a translation kept every token of its source: `{{recall}}` in a
 * form's own text, `{count}` in chatform's interface text.
 *
 * A token is a reference to an earlier answer, a variable or a number, filled
 * in when the line is shown. A translator that reworded or dropped one would print the
 * braces at a respondent, so such a translation is refused and the source line
 * is used instead.
 */
export function keepsTokens(source: string, translated: string): boolean {
  const want = (source.match(TOKEN) ?? []).slice().sort();
  const got = (translated.match(TOKEN) ?? []).slice().sort();
  return want.length === got.length && want.every((token, i) => token === got[i]);
}

/** A lookup from an English interface sentence to the same sentence in another language. */
export type Translate = (text: string, vars?: Record<string, string | number>) => string;

/** Fill `{name}` placeholders. A placeholder with no value is left as written. */
export function fillText(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;
}

/** English as written: what every caller gets when it passes no translator. */
export const untranslated: Translate = fillText;
