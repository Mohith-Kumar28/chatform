import { generateObject } from "ai";
import { z } from "zod";
import {
  INTERFACE_TEXT,
  formLanguages,
  formTexts,
  FORM_LANGUAGES,
  keepsTokens,
  languageName,
  localizeFormDoc,
  sha256Hex,
  type FormDoc,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { MODELS, chatModel, reportedUsage, telemetry } from "./ai.js";
import { logAiGeneration } from "./ai-usage.js";

/**
 * One form in several languages.
 *
 * The form is written once. Everything here turns it into another language on
 * the way to a respondent, from a memory of translations keyed by the source
 * text (migration 0063). The memory is filled by a model the first time a
 * string is needed in a language, and never again for that string: an unchanged
 * form costs nothing to serve in any of its languages.
 *
 * The author is in charge of when. A language they add says "Translation
 * needed" until they translate it, with AI or by filling in a spreadsheet, and
 * a respondent is only offered a language that has been translated. A question
 * edited afterwards is shown as written until they translate again.
 *
 * Two rules hold everywhere in this file. A respondent never waits on a
 * translation and is never refused for want of one. And a translation an author
 * wrote by hand is never overwritten by the AI.
 */

/** Workers Logs print an Error object as `{}`; this is the part worth keeping. */
function describe(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

/** chatform's own interface text is written in English. */
const INTERFACE_LANGUAGE = "en";
/** The owner of interface text in `form_translations`. */
const INTERFACE_SCOPE = "";

/** Strings per model call. Small enough that one bad item costs one batch. */
const BATCH_ITEMS = 40;
const BATCH_CHARS = 6000;
const BATCH_TIMEOUT_MS = 45_000;
/** How long a fill in flight keeps a second one from starting. */
const BUSY_TTL_SECONDS = 90;

export function textHash(text: string): string {
  return sha256Hex(text).slice(0, 32);
}

/** Source text to its translation: the form's own rows over the shared interface rows. */
export async function readTranslations(env: Bindings, formId: string, lang: string): Promise<Map<string, string>> {
  const { results } = await env.DB.prepare(
    `SELECT form_id, source, text FROM form_translations WHERE form_id IN (?, '') AND lang = ?`,
  )
    .bind(formId, lang)
    .all<{ form_id: string; source: string; text: string }>();
  const out = new Map<string, string>();
  for (const row of results) if (row.form_id === INTERFACE_SCOPE) out.set(row.source, row.text);
  for (const row of results) if (row.form_id !== INTERFACE_SCOPE) out.set(row.source, row.text);
  return out;
}

const Translated = z.object({
  items: z.array(z.object({ i: z.number().int(), t: z.string() })),
});

function batches(texts: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const text of texts) {
    if (current.length >= BATCH_ITEMS || (current.length > 0 && chars + text.length > BATCH_CHARS)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(text);
    chars += text.length;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/**
 * Translate a list of strings. Returns only the ones that came back usable.
 *
 * Never throws: a failed batch is simply missing from the result, and whatever
 * is missing is shown in the form's own language and tried again next time.
 */
async function translate(
  env: Bindings,
  opts: { texts: string[]; from: string; to: string; organizationId: string; formId: string | null },
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // No model to ask: nothing is translated, and everything reads as written.
  if (!env.OPENROUTER_API_KEY) return out;
  const from = languageName(opts.from);
  const to = languageName(opts.to);
  await Promise.all(
    batches(opts.texts).map(async (batch) => {
      const started = Date.now();
      try {
        const result = await generateObject({
          model: chatModel(env, MODELS.generation),
          schema: Translated,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(BATCH_TIMEOUT_MS),
          system:
            `You translate the text of an online form from ${from} to ${to}. ` +
            "Each item is one piece of the form a person reads while filling it in: a question, an answer option, a button, a hint, a closing message. " +
            `Translate each item on its own, worded the way a native ${to} speaker would naturally put it on a form, keeping its meaning, its tone and roughly its length. ` +
            "Leave these exactly as they are: anything inside {{double braces}} or {single braces}, markdown and HTML markup, links, email addresses, numbers, and the names of people, organisations, brands and products. " +
            `An item that is already in ${to}, or that is a code or a name with nothing to translate, comes back unchanged. ` +
            "Return every item, each under the index it was given.",
          prompt: batch.map((text, i) => `[${i}] ${JSON.stringify(text)}`).join("\n"),
          providerOptions: telemetry(env, {}, { kind: "translate", organizationId: opts.organizationId, formId: opts.formId, source: "system" }),
        });
        for (const item of result.object.items) {
          const source = batch[item.i];
          const text = item.t.trim();
          if (source === undefined || !text) continue;
          // A translation that lost a token would print braces at a respondent.
          out.set(source, keepsTokens(source, text) ? text : source);
        }
        await logAiGeneration(env, {
          organizationId: opts.organizationId,
          formId: opts.formId,
          kind: "translate",
          model: MODELS.generation,
          usage: reportedUsage(result),
          latencyMs: Date.now() - started,
        });
      } catch (err) {
        console.error("translate_failed", { formId: opts.formId, to: opts.to, items: batch.length, message: describe(err) });
      }
    }),
  );
  return out;
}

async function store(env: Bindings, scope: string, lang: string, pairs: Map<string, string>): Promise<void> {
  if (pairs.size === 0) return;
  const now = Date.now();
  const insert = env.DB.prepare(
    // IGNORE, not REPLACE: a row already there is either the same translation
    // or an author's correction, and neither should be written over.
    `INSERT OR IGNORE INTO form_translations (form_id, lang, source_hash, source, text, edited, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  );
  const statements = [...pairs].map(([source, text]) => insert.bind(scope, lang, textHash(source), source, text, now));
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
}

export interface LocalizedForm {
  /** The document as this language's respondent reads it. Same ids, same refs. */
  doc: FormDoc;
  /** chatform's interface text in this language, keyed by the English. Empty for English. */
  messages: Record<string, string>;
}

/**
 * The form in one of its languages, from what has already been translated.
 *
 * Never calls a model for the form's own text: that is the author's button.
 * chatform's interface text is ours rather than theirs, so whatever of it is
 * missing in this language is translated behind the response through `defer`,
 * normally `ctx.waitUntil`, and is there for the next visitor.
 */
export async function localizedForm(
  env: Bindings,
  opts: {
    formId: string;
    organizationId: string;
    doc: FormDoc;
    lang: string;
    defer?: (work: Promise<unknown>) => void;
  },
): Promise<LocalizedForm> {
  const base = opts.doc.settings.language;
  const lang = formLanguages(opts.doc).includes(opts.lang) ? opts.lang : base;
  // English, as written: nothing to look up, which is every form before this existed.
  if (lang === base && lang === INTERFACE_LANGUAGE) return { doc: opts.doc, messages: {} };

  let have: Map<string, string>;
  try {
    have = await readTranslations(env, opts.formId, lang);
  } catch (err) {
    console.error("translations_read_failed", { formId: opts.formId, lang, message: describe(err) });
    return { doc: opts.doc, messages: {} };
  }

  if (opts.defer && lang !== INTERFACE_LANGUAGE && INTERFACE_TEXT.some((text) => !have.has(text))) {
    opts.defer(fillInterface(env, { lang, organizationId: opts.organizationId, formId: opts.formId, have }));
  }

  const messages: Record<string, string> = {};
  for (const text of INTERFACE_TEXT) {
    const translated = have.get(text);
    if (translated && translated !== text) messages[text] = translated;
  }
  return { doc: localizeFormDoc(opts.doc, lang, have), messages };
}

/** chatform's own interface text in one language, held to one fill at a time. */
async function fillInterface(
  env: Bindings,
  opts: { lang: string; organizationId: string; formId: string; have: ReadonlyMap<string, string>; force?: boolean },
): Promise<void> {
  if (opts.lang === INTERFACE_LANGUAGE) return;
  const missing = INTERFACE_TEXT.filter((text) => !opts.have.has(text));
  if (missing.length === 0) return;
  const key = `tr:busy:${opts.lang}`;
  try {
    if (!opts.force && (await env.KV_CONFIG.get(key))) return;
    await env.KV_CONFIG.put(key, "1", { expirationTtl: BUSY_TTL_SECONDS });
    const done = await translate(env, { texts: missing, from: INTERFACE_LANGUAGE, to: opts.lang, organizationId: opts.organizationId, formId: opts.formId });
    await store(env, INTERFACE_SCOPE, opts.lang, done);
    await env.KV_CONFIG.delete(key);
  } catch (err) {
    console.error("interface_translate_failed", { lang: opts.lang, message: describe(err) });
  }
}

export interface LanguageStatus {
  lang: string;
  name: string;
  /** Strings in the form as it stands. */
  total: number;
  /** How many of them have a translation. Fewer than `total` reads "Translation needed". */
  translated: number;
}

/** Where each of the form's other languages stands against the form as it is now. */
export async function translationStatus(env: Bindings, opts: { formId: string; doc: FormDoc }): Promise<LanguageStatus[]> {
  const base = opts.doc.settings.language;
  const texts = formTexts(opts.doc);
  return Promise.all(
    formLanguages(opts.doc)
      .filter((lang) => lang !== base)
      .map(async (lang) => {
        const have = await readTranslations(env, opts.formId, lang);
        return { lang, name: languageName(lang), total: texts.length, translated: texts.filter((text) => have.has(text)).length };
      }),
  );
}

/**
 * The languages a respondent may choose between: the form's own, and each other
 * one that has been translated at all. An added language nobody has translated
 * yet would be a switch that changes nothing.
 */
export async function offeredLanguages(env: Bindings, opts: { formId: string; doc: FormDoc }): Promise<string[]> {
  const all = formLanguages(opts.doc);
  if (all.length < 2) return all;
  try {
    const { results } = await env.DB.prepare(`SELECT DISTINCT lang FROM form_translations WHERE form_id = ?`)
      .bind(opts.formId)
      .all<{ lang: string }>();
    const translated = new Set(results.map((row) => row.lang));
    return all.filter((lang, i) => i === 0 || translated.has(lang));
  } catch (err) {
    console.error("translations_read_failed", { formId: opts.formId, message: describe(err) });
    return all.slice(0, 1);
  }
}

/**
 * The AI translation button: everything in the form that has no translation in
 * this language yet. Strings already translated, by the AI or by hand, are left
 * alone, so pressing it again after an edit only translates what changed.
 */
export async function aiTranslate(
  env: Bindings,
  opts: { formId: string; organizationId: string; doc: FormDoc; lang: string },
): Promise<LanguageStatus> {
  const base = opts.doc.settings.language;
  const have = await readTranslations(env, opts.formId, opts.lang);
  const texts = formTexts(opts.doc);
  const missing = texts.filter((text) => !have.has(text));
  const [done] = await Promise.all([
    missing.length
      ? translate(env, { texts: missing, from: base, to: opts.lang, organizationId: opts.organizationId, formId: opts.formId })
      : new Map<string, string>(),
    fillInterface(env, { lang: opts.lang, organizationId: opts.organizationId, formId: opts.formId, have, force: true }),
  ]);
  await store(env, opts.formId, opts.lang, done);
  for (const [source, text] of done) have.set(source, text);
  return { lang: opts.lang, name: languageName(opts.lang), total: texts.length, translated: texts.filter((text) => have.has(text)).length };
}

// ─── the spreadsheet ─────────────────────────────────────────────────────────

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The manual translation file: an id, the original, and the translation to fill
 * in. The id is the hash of the original, which is what makes a file edited in
 * a spreadsheet land on the right strings when it comes back.
 */
export async function translationsCsv(env: Bindings, opts: { formId: string; doc: FormDoc; lang: string }): Promise<string> {
  const have = await readTranslations(env, opts.formId, opts.lang);
  const lines = [["id", languageName(opts.doc.settings.language), languageName(opts.lang)].map(csvCell).join(",")];
  for (const source of formTexts(opts.doc)) {
    lines.push([textHash(source), source, have.get(source) ?? ""].map(csvCell).join(","));
  }
  // A BOM, so Excel reads the file as UTF-8 instead of mangling every script but Latin.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

/** RFC 4180, quoted cells with embedded commas, quotes and newlines included. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = input.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * A filled-in file, taken back.
 *
 * Only the third column is read. A row is matched by its id, and only against
 * strings the form has now, so a file from an older draft updates what still
 * exists and ignores the rest. An empty translation leaves that string as it
 * was. A translation that lost a `{{token}}` is skipped and counted.
 */
export async function importTranslationsCsv(
  env: Bindings,
  opts: { formId: string; organizationId: string; doc: FormDoc; lang: string; csv: string; defer?: (work: Promise<unknown>) => void },
): Promise<{ saved: number; skipped: number; status: LanguageStatus }> {
  const byHash = new Map(formTexts(opts.doc).map((source) => [textHash(source), source]));
  const now = Date.now();
  const upsert = env.DB.prepare(
    `INSERT INTO form_translations (form_id, lang, source_hash, source, text, edited, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT (form_id, lang, source_hash) DO UPDATE SET text = excluded.text, edited = 1, updated_at = excluded.updated_at`,
  );
  const statements: D1PreparedStatement[] = [];
  let skipped = 0;
  for (const cells of parseCsv(opts.csv)) {
    const source = byHash.get((cells[0] ?? "").trim());
    const text = (cells[2] ?? "").trim();
    if (!source || !text) continue;
    if (!keepsTokens(source, text)) {
      skipped++;
      continue;
    }
    statements.push(upsert.bind(opts.formId, opts.lang, textHash(source), source, text, now));
  }
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));

  const have = await readTranslations(env, opts.formId, opts.lang);
  // The interface text is ours to translate, whichever way the form's was done.
  opts.defer?.(fillInterface(env, { lang: opts.lang, organizationId: opts.organizationId, formId: opts.formId, have }));
  const texts = formTexts(opts.doc);
  return {
    saved: statements.length,
    skipped,
    status: { lang: opts.lang, name: languageName(opts.lang), total: texts.length, translated: texts.filter((t) => have.has(t)).length },
  };
}

/** Whether a code is one a form can be offered in. */
export function isFormLanguage(code: string): boolean {
  return FORM_LANGUAGES.some((l) => l.code === code);
}

/**
 * `waitUntil`, where there is one.
 *
 * A request handled outside a worker's fetch (the test app, a direct call) has
 * no execution context, and reading it throws. The work is started either way;
 * there is just nobody to keep the isolate alive for it.
 */
export function deferOn(c: { executionCtx: { waitUntil(work: Promise<unknown>): void } }): (work: Promise<unknown>) => void {
  return (work) => {
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      void work.catch(() => {});
    }
  };
}
