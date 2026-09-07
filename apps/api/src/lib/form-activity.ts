import {
  FormDoc as FormDocSchema,
  diffFormDoc,
  mergeChanges,
  migrateFormDoc,
  summarizeChanges,
  MAX_CHANGES_PER_ENTRY,
  type DocChange,
  type FormDoc,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * The history of a single form: what changed, who changed it, and which publish it
 * went out in.
 *
 * Two things are deliberately not here. This is not `audit_logs` — that answers "who
 * did what in this organization", is read by an admin and is gated at Business, while
 * this is read by whoever is building the form and is free. And it is not a stream of
 * document snapshots — `form_versions` already keeps every published document, and
 * keeping the unpublished ones too would be storing a hundred near-identical copies of
 * a form to answer a question the semantic diff answers in a sentence.
 *
 * Everything here is best-effort. Losing a history row is a worse timeline; failing a
 * save because the timeline could not be written is a lost form.
 */

/**
 * Run history work without making the response wait for it.
 *
 * `c.executionCtx` is a getter that *throws* when there is no execution context — a
 * queue consumer, a scheduled handler, the test harness — so `?.` is not enough. Where
 * there is none the work is awaited instead: left unawaited it would race the assertion
 * in a test and be cancelled with the isolate everywhere else.
 *
 * Callers `await` this. On the real path that await costs nothing, because `waitUntil`
 * returns immediately.
 */
export async function afterResponse(
  // Structural rather than Hono's `Context`: the only thing needed is the getter, and
  // naming the full type would drag every route's generics through this signature.
  c: { executionCtx: { waitUntil(promise: Promise<unknown>): void } },
  work: Promise<unknown>,
): Promise<void> {
  const guarded = work.catch((err) => console.error("form_activity_failed", err));
  try {
    c.executionCtx.waitUntil(guarded);
  } catch {
    await guarded;
  }
}

export type ActivityKind = "created" | "edited" | "published" | "restored" | "unpublished" | "deleted";

export interface Actor {
  type?: "user" | "api_key" | "system" | "ai";
  id?: string | null;
  label?: string | null;
}

/** Which surface made the change. Shown as a badge, and worth knowing when a form drifts. */
export type ActivitySource = "builder" | "api" | "ai" | "template" | "system";

/**
 * How long a sitting stays open for merging.
 *
 * Autosave fires every few seconds, so this is the difference between one entry per
 * session and one entry per keystroke. Ten minutes is long enough to cover thinking
 * time between edits and short enough that coming back after lunch starts a new line
 * in the story.
 */
const COALESCE_WINDOW_MS = 10 * 60_000;

interface ActivityRow {
  id: string;
  form_version_id: string | null;
  kind: string;
  actor_type: string;
  actor_id: string | null;
  actor_label: string | null;
  source: string;
  summary: string;
  changes: string | null;
  change_count: number;
  created_at: number;
  updated_at: number;
}

function newId(): string {
  return `act_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function parseChanges(raw: string | null): DocChange[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as DocChange[]) : [];
  } catch {
    return [];
  }
}

/**
 * Read a document out of the database, or null when it cannot be read.
 *
 * A row that fails to parse is not an error here. The diff exists to describe an edit,
 * and "we could not describe this one" is a fine outcome — refusing the save because
 * its predecessor was malformed would be the history feature breaking the editor.
 */
export function parseStoredDoc(raw: string | null | undefined): FormDoc | null {
  if (!raw) return null;
  try {
    const parsed = FormDocSchema.safeParse(migrateFormDoc(JSON.parse(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Record an edit, folding it into the sitting already in progress when there is one.
 *
 * Returns quietly when nothing meaningful changed. An autosave fired by a click that
 * moved nothing is not an event, and the builder fires plenty of those.
 */
export async function recordDocChange(
  env: Bindings,
  args: {
    formId: string;
    orgId: string;
    before: FormDoc | null;
    after: FormDoc;
    actor?: Actor;
    source?: ActivitySource;
  },
): Promise<void> {
  /**
   * No predecessor means nothing to describe. A form's creation is recorded by
   * `recordFormEvent`, which knows it was a creation; inferring one here from an
   * unreadable previous row would put "Form created" on top of an ordinary edit.
   */
  if (!args.before) return;

  const changes = diffFormDoc(args.before, args.after);
  if (changes.length === 0) return;

  const actorType = args.actor?.type ?? "user";
  const actorId = args.actor?.id ?? null;
  const source = args.source ?? "builder";
  const now = Date.now();

  /**
   * The open sitting: the newest edit on this form, by this same author, that has not
   * yet been published. `IS` rather than `=` so a system actor (null id) matches its
   * own previous row instead of never matching.
   */
  const open = await env.DB.prepare(
    `SELECT id, changes, change_count, created_at FROM form_activity
      WHERE form_id = ? AND kind = 'edited' AND form_version_id IS NULL
        AND actor_id IS ? AND source = ? AND created_at > ?
      ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(args.formId, actorId, source, now - COALESCE_WINDOW_MS)
    .first<{ id: string; changes: string | null; change_count: number; created_at: number }>();

  if (!open) {
    await insertEntry(env, {
      formId: args.formId,
      orgId: args.orgId,
      kind: "edited",
      actorType,
      actorId,
      actorLabel: args.actor?.label ?? null,
      source,
      summary: summarizeChanges(changes),
      changes,
      changeCount: changes.length,
      at: now,
    });
    return;
  }

  const merged = mergeChanges(parseChanges(open.changes), changes);

  /**
   * Everything cancelled out — a question added and deleted again, a switch flipped
   * and flipped back. The sitting produced nothing, so it leaves nothing behind.
   */
  if (merged.length === 0) {
    await env.DB.prepare(`DELETE FROM form_activity WHERE id = ?`).bind(open.id).run();
    return;
  }

  await env.DB.prepare(
    `UPDATE form_activity SET summary = ?, changes = ?, change_count = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(summarizeChanges(merged), JSON.stringify(merged.slice(0, MAX_CHANGES_PER_ENTRY)), merged.length, now, open.id)
    .run();
}

/** Record something that is not a document edit: a publish, a restore, a creation. */
export async function recordFormEvent(
  env: Bindings,
  args: {
    formId: string;
    orgId: string;
    kind: ActivityKind;
    summary: string;
    versionId?: string | null;
    changes?: DocChange[];
    actor?: Actor;
    source?: ActivitySource;
  },
): Promise<void> {
  await insertEntry(env, {
    formId: args.formId,
    orgId: args.orgId,
    kind: args.kind,
    actorType: args.actor?.type ?? "user",
    actorId: args.actor?.id ?? null,
    actorLabel: args.actor?.label ?? null,
    source: args.source ?? "builder",
    summary: args.summary,
    changes: args.changes ?? null,
    changeCount: args.changes?.length ?? 0,
    versionId: args.versionId ?? null,
    at: Date.now(),
  });
}

async function insertEntry(
  env: Bindings,
  e: {
    formId: string;
    orgId: string;
    kind: string;
    actorType: string;
    actorId: string | null;
    actorLabel: string | null;
    source: string;
    summary: string;
    changes: DocChange[] | null;
    changeCount: number;
    versionId?: string | null;
    at: number;
  },
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO form_activity
       (id, form_id, organization_id, form_version_id, kind, actor_type, actor_id, actor_label, source, summary, changes, change_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      newId(),
      e.formId,
      e.orgId,
      e.versionId ?? null,
      e.kind,
      e.actorType,
      e.actorId,
      e.actorLabel,
      e.source,
      e.summary,
      e.changes ? JSON.stringify(e.changes.slice(0, MAX_CHANGES_PER_ENTRY)) : null,
      e.changeCount,
      e.at,
      e.at,
    )
    .run();
}

/**
 * Attribute every open entry to the version that just shipped.
 *
 * This one statement is what makes the timeline a changelog rather than a log. Before
 * it runs, the rows say "someone changed these things"; after it, they say "these are
 * the changes version 4 contains" — and whatever is still null is, by definition, the
 * draft work that has not gone live yet.
 *
 * Written as part of the publish batch so a form can never be published with its
 * changes left looking unpublished.
 */
export function stampVersionStatement(env: Bindings, formId: string, versionId: string) {
  /*
    Every unclaimed entry, not only the edits. A restore is work that ships in the next
    publish exactly as an edit is, and filtering on kind left it stranded in
    "unpublished changes" forever — the one row that could never be cleared.

    The publish event itself is not caught by this: it is written after the batch, with
    its version already set.
  */
  return env.DB.prepare(
    `UPDATE form_activity SET form_version_id = ? WHERE form_id = ? AND form_version_id IS NULL`,
  ).bind(versionId, formId);
}

/**
 * Fill in actor names in one query.
 *
 * Names are resolved on read rather than stored on write because the write is the
 * autosave path: a join per keystroke to render a label nobody is looking at yet is
 * the wrong trade, and a person who changes their name should not leave a timeline
 * that half remembers the old one.
 */
export async function resolveActorNames<T extends { actor_id: string | null; actor_label: string | null }>(
  env: Bindings,
  rows: T[],
): Promise<T[]> {
  const ids = [...new Set(rows.filter((r) => r.actor_id && !r.actor_label).map((r) => r.actor_id!))];
  if (ids.length === 0) return rows;
  const users = await env.DB.prepare(
    `SELECT id, name, email FROM users WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<{ id: string; name: string; email: string }>();
  const byId = new Map((users.results ?? []).map((u) => [u.id, u.name || u.email]));
  return rows.map((r) => (r.actor_label || !r.actor_id ? r : { ...r, actor_label: byId.get(r.actor_id) ?? null }));
}

export interface ActivityEntry {
  id: string;
  kind: string;
  summary: string;
  changes: DocChange[];
  changeCount: number;
  actorType: string;
  actorLabel: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface ActivityGroup {
  /** Null for work that has not been published yet. */
  version: number | null;
  versionId: string | null;
  publishedAt: number | null;
  note: string | null;
  /** True for the version currently being served to respondents. */
  isActive: boolean;
  entries: ActivityEntry[];
}

function toEntry(r: ActivityRow): ActivityEntry {
  return {
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    changes: parseChanges(r.changes),
    changeCount: r.change_count,
    actorType: r.actor_type,
    actorLabel: r.actor_label,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * The form's history, grouped by publish.
 *
 * The grouping is the whole point of the screen: a flat list of edits is a log, and a
 * list of versions with no edits under them is a row of numbers. Together they read as
 * "here is what version 4 changed, and here is what is waiting for version 5".
 */
export async function loadFormHistory(
  env: Bindings,
  formId: string,
  opts: { limit?: number; before?: number } = {},
): Promise<{ groups: ActivityGroup[]; nextBefore: number | null }> {
  const limit = opts.limit ?? 60;

  const [entries, versions, form] = await Promise.all([
    env.DB.prepare(
      `SELECT id, form_version_id, kind, actor_type, actor_id, actor_label, source, summary, changes, change_count, created_at, updated_at
         FROM form_activity
        WHERE form_id = ?1 AND (?2 IS NULL OR created_at < ?2)
        ORDER BY created_at DESC
        LIMIT ?3`,
    )
      .bind(formId, opts.before ?? null, limit)
      .all<ActivityRow>(),
    env.DB.prepare(
      `SELECT id, version, note, published_at, created_at FROM form_versions WHERE form_id = ? ORDER BY version DESC`,
    )
      .bind(formId)
      .all<{ id: string; version: number; note: string | null; published_at: number | null; created_at: number }>(),
    env.DB.prepare(`SELECT active_version_id FROM forms WHERE id = ?`)
      .bind(formId)
      .first<{ active_version_id: string | null }>(),
  ]);

  const rows = await resolveActorNames(env, entries.results ?? []);
  const activeId = form?.active_version_id ?? null;

  const byVersion = new Map<string | null, ActivityEntry[]>();
  for (const r of rows) {
    const key = r.form_version_id;
    const list = byVersion.get(key);
    if (list) list.push(toEntry(r));
    else byVersion.set(key, [toEntry(r)]);
  }

  const groups: ActivityGroup[] = [];

  /**
   * Draft work leads, always — even when there is none. An empty "Unpublished
   * changes" heading is how someone learns the form they are looking at is live
   * exactly as published, which is the question they came to the screen with.
   */
  groups.push({
    version: null,
    versionId: null,
    publishedAt: null,
    note: null,
    isActive: false,
    entries: byVersion.get(null) ?? [],
  });

  for (const v of versions.results ?? []) {
    const entriesForVersion = byVersion.get(v.id) ?? [];
    /**
     * A version with nothing under it is still shown. Versions published before this
     * table existed have no entries and would otherwise vanish from their own history,
     * and so would a republish that changed nothing but the plan it was stripped to.
     */
    groups.push({
      version: v.version,
      versionId: v.id,
      publishedAt: v.published_at ?? v.created_at,
      note: v.note,
      isActive: v.id === activeId,
      entries: entriesForVersion,
    });
  }

  const last = rows.at(-1);
  return { groups, nextBefore: rows.length === limit && last ? last.created_at : null };
}

/**
 * Reconstruct the changelog of versions published before this table existed.
 *
 * Nothing was actually lost when change tracking shipped: `form_versions` has held the
 * full published document since the first release, so the history of an older form is
 * unread rather than gone. Diffing each published document against the one before it
 * recovers exactly what a live recording would have written — which questions arrived,
 * which left, which were reworded — and the alternative was a form whose first four
 * versions say "published before change tracking" forever.
 *
 * Idempotent by construction: each reconstructed row's id is derived from the version it
 * describes, so a second pass inserts nothing and a concurrent one cannot double up. The
 * one-row-per-version shape is also what makes the pass self-terminating — a version with
 * no document changes still gets its row, so it is not re-diffed on every read.
 *
 * Attributed to `system` on purpose. These rows were computed after the fact from two
 * documents; the person named on them is whoever published the version, but the surface
 * that produced the line was this function, and a timeline that claims otherwise is
 * inventing detail it does not have.
 */
export async function backfillVersionActivity(env: Bindings, formId: string, orgId: string): Promise<number> {
  const res = await env.DB.prepare(
    `SELECT v.id, v.version, v.schema_json, v.published_at, v.created_at, v.created_by,
            (SELECT COUNT(*) FROM form_activity a WHERE a.form_version_id = v.id) AS entries
       FROM form_versions v
      WHERE v.form_id = ?
      ORDER BY v.version ASC`,
  )
    .bind(formId)
    .all<{
      id: string;
      version: number;
      schema_json: string;
      published_at: number | null;
      created_at: number;
      created_by: string | null;
      entries: number;
    }>();

  const versions = res.results ?? [];
  // The common path by far: every version already carries its own entries.
  if (versions.length === 0 || versions.every((v) => v.entries > 0)) return 0;

  const statements = [];
  let prev: FormDoc | null = null;

  for (const v of versions) {
    const doc = parseStoredDoc(v.schema_json);
    /*
      A version whose document will not parse breaks the chain rather than ending it: the
      next version has nothing trustworthy to diff against, so it is skipped too, and the
      one after that picks up again. Better a gap than a changelog that reports every
      question as new because its predecessor was unreadable.
    */
    if (!doc) {
      prev = null;
      continue;
    }

    if (v.entries > 0) {
      prev = doc;
      continue;
    }

    const changes = prev
      ? diffFormDoc(prev, doc)
      : v.version === versions[0]!.version
        ? /*
            The earliest version has no predecessor, and "Form created" alone throws away
            the useful part. Every question it shipped with is listed instead, which is
            both true and the thing someone scrolling to the bottom came to see.
          */
          doc.blocks.map((b) => ({ op: "question.added" as const, target: b.id, label: questionLabel(b) }))
        : null;

    // A gap in the chain (see above) — leave the version's changelog unclaimed.
    if (changes === null) {
      prev = doc;
      continue;
    }

    const kind = prev ? (changes.length === 0 ? "published" : "edited") : "created";
    const summary =
      changes.length === 0
        ? "Republished with no changes to the document"
        : prev
          ? summarizeChanges(changes)
          : `Form created with ${doc.blocks.length} ${doc.blocks.length === 1 ? "question" : "questions"}`;

    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO form_activity
           (id, form_id, organization_id, form_version_id, kind, actor_type, actor_id, actor_label, source, summary, changes, change_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'user', ?, NULL, 'system', ?, ?, ?, ?, ?)`,
      ).bind(
        // Derived from the version, so the row can only ever exist once.
        `act_bf_${v.id}`,
        formId,
        orgId,
        v.id,
        kind,
        v.created_by,
        summary,
        changes.length > 0 ? JSON.stringify(changes.slice(0, MAX_CHANGES_PER_ENTRY)) : null,
        changes.length,
        v.published_at ?? v.created_at,
        v.published_at ?? v.created_at,
      ),
    );

    prev = doc;
  }

  if (statements.length === 0) return 0;
  await env.DB.batch(statements);
  return statements.length;
}

/** `blockLabel` from the diff, which is not exported — same rule, same fallbacks. */
function questionLabel(b: { id: string; ref?: string | null; title?: string | null }): string {
  const title = (b.title ?? "").trim();
  if (title) return title.length > 72 ? `${title.slice(0, 71)}…` : title;
  return b.ref || "Untitled question";
}

/**
 * Keep the table bounded.
 *
 * Published entries are kept far longer than draft ones: a stamped row is part of a
 * version's changelog and is expected to still be there when someone asks why version
 * 4 behaved differently, while an unstamped row from a year ago describes a draft that
 * was long since published or abandoned.
 */
export async function pruneFormActivity(env: Bindings, draftDays = 120, publishedDays = 730): Promise<number> {
  const now = Date.now();
  const res = await env.DB.prepare(
    `DELETE FROM form_activity
      WHERE (form_version_id IS NULL AND created_at < ?1)
         OR (form_version_id IS NOT NULL AND created_at < ?2)`,
  )
    .bind(now - draftDays * 86_400_000, now - publishedDays * 86_400_000)
    .run();
  return res.meta?.changes ?? 0;
}
