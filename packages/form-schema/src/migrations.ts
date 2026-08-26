import { z } from "zod";
import { FormDoc, SCHEMA_VERSION } from "./form-doc";

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
