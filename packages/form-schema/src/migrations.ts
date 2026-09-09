import { z } from "zod";
import { FormDoc, SCHEMA_VERSION } from "./form-doc";
import { DEFAULT_CONFIRMATION_BODY, DEFAULT_CONFIRMATION_SUBJECT } from "./settings";

/**
 * Form document migrations.
 *
 * Published versions are immutable: `form_versions.schema_json` is written once
 * and must render forever. So migration happens on READ, never as a rewrite of
 * a stored row. Every migration must be:
 *
 *   - idempotent — `migrate(migrate(x))` equals `migrate(x)`
 *   - total      — it may not throw on a document that parsed under its own
 *                  schema version, however old
 *   - additive   — prefer new fields with defaults over reshaping old ones
 *
 * Call this in exactly two places: when the API reads a doc out of D1, and when
 * SessionDO hydrates one. Everything downstream can then assume the current
 * shape.
 */

/** A doc with only the fields migration needs to branch on. */
const Versioned = z.object({ schemaVersion: z.number().int().optional() }).loose();

type AnyDoc = Record<string, unknown>;

/** Ordered chain. Index i migrates a doc at version i+1 to version i+2. */
const MIGRATIONS: ((doc: AnyDoc) => AnyDoc)[] = [
  // ── v1 → v2 ────────────────────────────────────────────────────────────
  // Adds the agent layer (goal, knowledge, guardrails, model) and per-block
  // agent hints plus cover-image/prefill fields. Purely additive: every new
  // field carries a schema default, so the only work here is stamping the
  // version and letting `FormDoc.parse` materialize the rest.
  (doc) => ({ ...doc, schemaVersion: 2 }),

  // ── v2 → v3 ────────────────────────────────────────────────────────────
  // Replaces the image-only `coverImageKey`/`coverLayout`/`coverPosition`
  // triple with a single `media` object that can also carry a video or a
  // downloadable file.
  (doc) => {
    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    return {
      ...doc,
      schemaVersion: 3,
      blocks: blocks.map((raw) => {
        const block = raw as Record<string, unknown>;
        const { coverImageKey, coverLayout, coverPosition, ...rest } = block;
        if (block.media || typeof coverImageKey !== "string" || !coverImageKey) return rest;
        return { ...rest, media: { kind: "image", key: coverImageKey, url: null } };
      }),
    };
  },

  // ── v3 → v4 ────────────────────────────────────────────────────────────
  // `settings.requireAuth` was a bare boolean that no code read. Widened to an
  // object, because "require auth" says nothing without naming which methods
  // are acceptable. A doc that had it on keeps it on, defaulting to Google.
  (doc) => {
    const settings = (doc.settings ?? {}) as Record<string, unknown>;
    const prior = settings.requireAuth;
    const requireAuth =
      typeof prior === "boolean"
        ? { enabled: prior, methods: ["google"] }
        : (prior ?? { enabled: false });
    return { ...doc, schemaVersion: 4, settings: { ...settings, requireAuth } };
  },

  // ── v4 → v5 ────────────────────────────────────────────────────────────
  // `settings.duplicates` was `{ strategy: "none" | "ip_daily" | "field" }`,
  // one of which ("field") no code ever enforced. Collapsed to the boolean the
  // author was actually choosing between.
  //
  // Anything that was not "none" was an author asking for one response per
  // person, however they had been made to spell it — including the "field"
  // strategy that silently did nothing. All of them become
  // `allowResubmissions: false`, which is the first time a form set to "field"
  // gets the protection it was already claiming.
  (doc) => {
    const settings = (doc.settings ?? {}) as Record<string, unknown>;
    const { duplicates, ...rest } = settings;
    const strategy = (duplicates as { strategy?: unknown } | undefined)?.strategy;
    const allowResubmissions =
      typeof rest.allowResubmissions === "boolean"
        ? rest.allowResubmissions
        : typeof strategy === "string"
          ? strategy === "none"
          : true;
    return { ...doc, schemaVersion: 5, settings: { ...rest, allowResubmissions } };
  },

  // ── v5 → v6 ────────────────────────────────────────────────────────────
  // `settings.requireAuth.methods` was a list, and the builder let an author
  // switch on both Google and phone at once. Two doors into one form produce
  // two different identities for the same human, which is precisely what the
  // gate exists to prevent — so it is a single `method` now.
  //
  // A document that accepted both keeps the first, which is the order the
  // builder listed them in and therefore the one the author saw first. An
  // empty or missing list becomes Google, the schema's own default.
  (doc) => {
    const settings = (doc.settings ?? {}) as Record<string, unknown>;
    const prior = (settings.requireAuth ?? {}) as Record<string, unknown>;
    const { methods, ...auth } = prior;
    const first = Array.isArray(methods) ? methods.find((m) => m === "google" || m === "phone") : undefined;
    const method = typeof auth.method === "string" ? auth.method : (first ?? "google");
    return {
      ...doc,
      schemaVersion: 6,
      settings: { ...settings, requireAuth: { ...auth, method } },
    };
  },

  // ── v6 → v7 ────────────────────────────────────────────────────────────
  // `settings.agent.knowledge` leaves the document.
  //
  // It was an array of title/body entries inlined into the system prompt, which
  // is why it was capped at twenty of them and twenty thousand characters. The
  // knowledge base is now uploaded documents, links and recordings, extracted
  // and indexed in `knowledge_sources` — far too large to version inside a form
  // and far too large to put in a prompt.
  //
  // Dropping the key here rather than leaving it to be ignored keeps published
  // versions honest: a v6 document rendered today should not still carry a
  // knowledge base that nothing reads. The entries themselves are not lost —
  // `tooling/backfill-knowledge-sources.mjs` copies them into the new tables
  // before this ships, reading the stored JSON directly.
  (doc) => {
    const settings = (doc.settings ?? {}) as Record<string, unknown>;
    const agent = settings.agent as Record<string, unknown> | undefined;
    if (!agent || !("knowledge" in agent)) return { ...doc, schemaVersion: 7 };
    const { knowledge: _dropped, ...rest } = agent;
    return { ...doc, schemaVersion: 7, settings: { ...settings, agent: rest } };
  },

  // ── v7 → v8 ────────────────────────────────────────────────────────────
  // The respondent's confirmation email turns on.
  //
  // It existed at v7 as `autoReplyEmail`, defaulted off, and had no control
  // anywhere in the builder — the only way to switch it on was to write the
  // JSON. So a stored `enabled: false` is not an author's decision to decline
  // it; it is the absence of a decision, and every one of those becomes yes.
  // This is the one migration in the chain that changes what a published form
  // *does* rather than how it is spelled, which is defensible only because the
  // thing it starts doing is sending a receipt to the person who just wrote in
  // — and because the author can turn it off in one click now that there is a
  // switch to turn.
  //
  // Copy the author did write survives: anyone who reached these fields through
  // the API meant what they typed, so a non-empty subject or body is kept and
  // only the blanks are filled.
  (doc) => {
    const settings = (doc.settings ?? {}) as Record<string, unknown>;
    const onComplete = (settings.onComplete ?? {}) as Record<string, unknown>;
    const prior = (onComplete.autoReplyEmail ?? {}) as Record<string, unknown>;
    const kept = (key: string, fallback: string) =>
      typeof prior[key] === "string" && (prior[key] as string).trim() ? (prior[key] as string) : fallback;
    return {
      ...doc,
      schemaVersion: 8,
      settings: {
        ...settings,
        onComplete: {
          ...onComplete,
          autoReplyEmail: {
            ...prior,
            enabled: true,
            subject: kept("subject", DEFAULT_CONFIRMATION_SUBJECT),
            bodyMd: kept("bodyMd", DEFAULT_CONFIRMATION_BODY),
            includeAnswers: typeof prior.includeAnswers === "boolean" ? prior.includeAnswers : true,
          },
        },
      },
    };
  },
];

export function migrateFormDoc(raw: unknown): unknown {
  const parsed = Versioned.safeParse(raw);
  if (!parsed.success) return raw; // let FormDoc.parse produce the real error

  const doc = parsed.data as AnyDoc;
  let version = typeof doc.schemaVersion === "number" && doc.schemaVersion > 0 ? doc.schemaVersion : 1;

  // A doc from the future is left untouched: we cannot know how to downgrade,
  // and guessing would corrupt it.
  if (version > SCHEMA_VERSION) return doc;

  let out = doc;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version - 1];
    if (!step) break;
    out = step(out);
    version += 1;
  }
  return { ...out, schemaVersion: SCHEMA_VERSION };
}

/**
 * Migrate a stored document AND validate it.
 *
 * Casting the migration's output with `as FormDoc` was silently skipping every
 * Zod default, so any field added after a version was published came back
 * `undefined` — `settings.onComplete.requireSubmit` was missing from the public
 * config for exactly this reason. Parsing is what makes defaults real; the cast
 * only made TypeScript stop asking.
 *
 * Throws on a document that cannot be parsed, which is the correct outcome:
 * a form we cannot read must not be served as if it were fine.
 */
export function readFormDoc(raw: unknown): FormDoc {
  return FormDoc.parse(migrateFormDoc(raw));
}

/** Non-throwing variant for paths that can degrade rather than 500. */
export function safeReadFormDoc(raw: unknown): FormDoc | null {
  const parsed = FormDoc.safeParse(migrateFormDoc(raw));
  return parsed.success ? parsed.data : null;
}

/** True when the doc would be changed by migration — useful for lazy re-saves. */
export function needsMigration(raw: unknown): boolean {
  const parsed = Versioned.safeParse(raw);
  if (!parsed.success) return false;
  const v = parsed.data.schemaVersion ?? 1;
  return v < SCHEMA_VERSION;
}
