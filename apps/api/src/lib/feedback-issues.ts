import { generateObject } from "ai";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { MODELS, chatModel, reportedUsage, tagged, type TokenUsage } from "./ai.js";
import { logAiGeneration } from "./ai-usage.js";
import {
  ISSUE_CANDIDATES,
  ISSUE_DECIDE_SYSTEM,
  ISSUE_FLOOR,
  ISSUE_TITLE_MAX,
  ISSUE_WINDOW_DAYS,
  issueDecidePrompt,
} from "./feedback-issue-prompt.js";
import { bindChunks, holesFor } from "./d1-bindings.js";

/**
 * Bug reports, grouped into the problems they describe.
 *
 * Each report with a note is matched once, when it arrives: its note is embedded,
 * the few nearest open issues are shortlisted by similarity, and a small model
 * reads the shortlist and says which one it is — or that it is a new problem, and
 * what to call it. `feedback-issue-prompt.ts` holds the measurements behind that
 * split of labour.
 *
 * Runs only from the `q-feedback` consumer, which is strictly serial. Matching
 * reads the open issues and then writes one; two reports of the same new bug
 * handled at once would each find nothing and open two. One at a time, D1 reads
 * its own writes and that cannot happen — there is no lock here because the
 * queue is the lock.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function newIssueId(): string {
  return `fis_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// ───────────────────────────── vectors ─────────────────────────────

/** Unit length, so cosine similarity is a plain dot product whatever the model returns. */
export function normalise(values: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]! * values[i]!;
  const norm = Math.sqrt(sum) || 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i]! / norm;
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * Little-endian Float32 as base64 — TEXT, because remote D1 and local Miniflare
 * return BLOB columns in different shapes and TEXT is the same in both.
 */
export function encodeVector(v: Float32Array): string {
  const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function decodeVector(text: string): Float32Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4));
}

/** The normalised mean of several unit vectors — an issue's centroid. */
export function meanOf(vectors: Float32Array[]): Float32Array {
  const dim = vectors[0]?.length ?? 0;
  const sum = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) sum[i]! += v[i]!;
  return normalise(sum);
}

// ───────────────────────────── the two model calls ─────────────────────────────

export type Embedder = (text: string) => Promise<ArrayLike<number>>;
export type Decider = (input: {
  note: string;
  candidates: { id: string; title: string; examples: string[] }[];
}) => Promise<{ match: string | null; title: string; usage?: TokenUsage }>;

const EMBEDDING_MODEL = "@cf/baai/bge-m3";

const workersAiEmbedder =
  (env: Bindings): Embedder =>
  async (text) => {
    if (!env.WORKERS_AI) throw new Error("Embedding is not configured.");
    const result = (await env.WORKERS_AI.run(EMBEDDING_MODEL, { text: [text] })) as { data?: number[][] };
    const vector = result?.data?.[0];
    if (!vector?.length) throw new Error("The embedding came back empty.");
    return vector;
  };

const Decision = z.object({
  match: z.string().nullable(),
  title: z.string().max(200),
});

const modelDecider =
  (env: Bindings): Decider =>
  async ({ note, candidates }) => {
    const result = await generateObject({
      model: chatModel(env, MODELS.extraction),
      schema: Decision,
      system: ISSUE_DECIDE_SYSTEM,
      prompt: issueDecidePrompt(note, candidates),
      providerOptions: tagged({}, "feedback_issue", "platform"),
      abortSignal: AbortSignal.timeout(15_000),
      temperature: 0,
    });
    const decision = result.object as z.infer<typeof Decision>;
    return { ...decision, usage: reportedUsage(result) };
  };

export interface IssueDeps {
  embed?: Embedder;
  decide?: Decider;
}

/**
 * The real model calls — or nothing, under test.
 *
 * Workers AI has no local emulation and nothing in this suite mocks the SDK, so
 * a default that always called out would spend money and flake on every test
 * that files a report. Tests that care hand in their own.
 */
function resolveDeps(env: Bindings, deps?: IssueDeps): Required<IssueDeps> | null {
  if (deps?.embed && deps?.decide) return deps as Required<IssueDeps>;
  if (env.ENVIRONMENT === "test") return null;
  return { embed: deps?.embed ?? workersAiEmbedder(env), decide: deps?.decide ?? modelDecider(env) };
}

// ───────────────────────────── matching ─────────────────────────────

interface Candidate {
  id: string;
  title: string;
  centroid: Float32Array;
  score: number;
}

/**
 * Open issues nearest to a vector, best first.
 *
 * "Open" for matching means not merged away and with a report in the window —
 * a bug quiet for a quarter is treated as a new bug. Resolved issues stay in: a
 * report of a problem somebody marked fixed is exactly the report that should
 * land on it, and reopen it.
 */
async function nearest(env: Bindings, vector: Float32Array, limit: number, exclude?: string | null): Promise<Candidate[]> {
  const since = Date.now() - ISSUE_WINDOW_DAYS * DAY_MS;
  const rows = await env.DB.prepare(
    `SELECT i.id, i.title, i.centroid FROM feedback_issues i
      WHERE i.merged_into IS NULL
        AND EXISTS (SELECT 1 FROM respondent_feedback r
                     WHERE r.issue_id = i.id AND r.created_at >= ?1 AND r.status != 'spam')`,
  )
    .bind(since)
    .all<{ id: string; title: string; centroid: string }>();

  return (rows.results ?? [])
    .filter((r) => r.id !== exclude)
    .map((r) => {
      const centroid = decodeVector(r.centroid);
      return { id: r.id, title: r.title, centroid, score: dot(vector, centroid) };
    })
    .filter((c) => c.score >= ISSUE_FLOOR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Two recent notes per issue, so the model reads what the issue actually is and not only its title. */
async function examplesFor(env: Bindings, issueIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const id of issueIds) {
    const rows = await env.DB.prepare(
      `SELECT message FROM respondent_feedback
        WHERE issue_id = ?1 AND message IS NOT NULL AND message != '' AND status != 'spam'
        ORDER BY created_at DESC LIMIT 2`,
    )
      .bind(id)
      .all<{ message: string }>();
    out.set(id, (rows.results ?? []).map((r) => r.message.slice(0, 280)));
  }
  return out;
}

export interface Assignment {
  issueId: string;
  created: boolean;
  similarity: number | null;
}

/**
 * Put one report on the issue it describes, or open one.
 *
 * Never throws, and safe to run twice. A report that already has an issue is left
 * alone — that is the whole retry rule — and the final write lands the
 * embedding, the issue and the report's pointer in one batch, so a failure
 * part-way leaves nothing half done for the retry to trip on. Returns null for a
 * report with nothing to match: no note, no model available, or a model error.
 */
export async function assignIssue(env: Bindings, feedbackId: string, deps?: IssueDeps): Promise<Assignment | null> {
  const row = await env.DB.prepare(
    `SELECT fb.message, fb.topic, fb.issue_id, fb.session_id, fb.form_id, fb.organization_id, e.vector
       FROM respondent_feedback fb
       LEFT JOIN feedback_embeddings e ON e.feedback_id = fb.id
      WHERE fb.id = ?1`,
  )
    .bind(feedbackId)
    .first<{
      message: string | null;
      topic: string | null;
      issue_id: string | null;
      session_id: string | null;
      form_id: string | null;
      organization_id: string | null;
      vector: string | null;
    }>();
  if (!row) return null;
  if (row.issue_id) return { issueId: row.issue_id, created: false, similarity: null };
  const note = row.message?.trim();
  if (!note) return null;

  const run = resolveDeps(env, deps);
  if (!run) return null;

  const started = Date.now();
  try {
    // A retry reuses the stored vector rather than paying for the same embedding twice.
    const vector = row.vector ? decodeVector(row.vector) : normalise(await run.embed(note));
    const shortlist = await nearest(env, vector, ISSUE_CANDIDATES);
    const examples = await examplesFor(env, shortlist.map((c) => c.id));

    const decision = await run.decide({
      note,
      candidates: shortlist.map((c) => ({ id: c.id, title: c.title, examples: examples.get(c.id) ?? [] })),
    });
    if (decision.usage) {
      await logAiGeneration(env, {
        organizationId: "platform",
        sessionId: row.session_id,
        formId: row.form_id,
        kind: "feedback_issue",
        model: MODELS.extraction,
        usage: decision.usage,
        latencyMs: Date.now() - started,
      });
    }

    // Only an id that was actually offered counts; anything else is a new issue.
    const joined = shortlist.find((c) => c.id === decision.match) ?? null;
    const now = Date.now();
    const writes: D1PreparedStatement[] = [
      env.DB.prepare(`INSERT OR REPLACE INTO feedback_embeddings (feedback_id, vector, created_at) VALUES (?1, ?2, ?3)`).bind(
        feedbackId,
        encodeVector(vector),
        now,
      ),
    ];

    let issueId: string;
    let similarity: number | null;
    if (joined) {
      issueId = joined.id;
      similarity = joined.score;
      /*
        The centroid moves towards the new report as a running mean. Exact would
        re-read every member's vector on every report; the running mean is the
        same direction to within rounding, and merge, move and rebuild all
        recompute it exactly from the stored vectors anyway.
      */
      const current = await env.DB.prepare(`SELECT centroid, centroid_n FROM feedback_issues WHERE id = ?1`)
        .bind(issueId)
        .first<{ centroid: string; centroid_n: number }>();
      const n = Number(current?.centroid_n ?? 1);
      const base = current ? decodeVector(current.centroid) : vector;
      const next = new Float32Array(vector.length);
      for (let i = 0; i < vector.length; i++) next[i] = base[i]! * n + vector[i]!;
      writes.push(
        env.DB.prepare(`UPDATE feedback_issues SET centroid = ?1, centroid_n = ?2 WHERE id = ?3`).bind(
          encodeVector(normalise(next)),
          n + 1,
          issueId,
        ),
      );
    } else {
      issueId = newIssueId();
      similarity = null;
      const title = cleanTitle(decision.title, note);
      writes.push(
        env.DB.prepare(
          `INSERT INTO feedback_issues (id, title, title_edited, topic, centroid, centroid_n, created_at)
           VALUES (?1, ?2, 0, ?3, ?4, 1, ?5)`,
        ).bind(issueId, title, row.topic, encodeVector(vector), now),
      );
    }
    writes.push(
      env.DB.prepare(
        `UPDATE respondent_feedback SET issue_id = ?1, issue_similarity = ?2 WHERE id = ?3 AND issue_id IS NULL`,
      ).bind(issueId, similarity, feedbackId),
    );
    await env.DB.batch(writes);
    return { issueId, created: !joined, similarity };
  } catch (err) {
    // Flattened: Workers Logs serialise an Error object to `{}`.
    console.error("feedback_issue_failed", { feedbackId, err: String(err) });
    return null;
  }
}

/** A title the console can print: the model's, trimmed — or the note's opening words if it gave none. */
function cleanTitle(title: string | null | undefined, note: string): string {
  const t = (title ?? "").replace(/\s+/g, " ").trim().replace(/^["'“”]+|["'“”.]+$/g, "");
  const fallback = note.replace(/\s+/g, " ").trim();
  const chosen = t || fallback;
  return chosen.length > ISSUE_TITLE_MAX ? `${chosen.slice(0, ISSUE_TITLE_MAX - 1).trimEnd()}…` : chosen;
}

// ───────────────────────────── corrections ─────────────────────────────

/**
 * Rebuild an issue's centroid exactly from its members' stored vectors.
 *
 * An issue left with no members is deleted: nothing points at it, and it would
 * otherwise keep being offered to the matcher as a ghost.
 */
export async function recomputeIssue(env: Bindings, issueId: string): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT e.vector FROM respondent_feedback fb JOIN feedback_embeddings e ON e.feedback_id = fb.id WHERE fb.issue_id = ?1`,
  )
    .bind(issueId)
    .all<{ vector: string }>();
  const vectors = (rows.results ?? []).map((r) => decodeVector(r.vector));
  if (vectors.length === 0) {
    const members = await env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_feedback WHERE issue_id = ?1`)
      .bind(issueId)
      .first<{ n: number }>();
    if (Number(members?.n ?? 0) === 0) {
      // The issues merged into it go too: a tombstone pointing at nothing leads nowhere.
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM feedback_issues WHERE merged_into = ?1`).bind(issueId),
        env.DB.prepare(`DELETE FROM feedback_issues WHERE id = ?1 AND merged_into IS NULL`).bind(issueId),
      ]);
    }
    return;
  }
  await env.DB.prepare(`UPDATE feedback_issues SET centroid = ?1, centroid_n = ?2 WHERE id = ?3`)
    .bind(encodeVector(meanOf(vectors)), vectors.length, issueId)
    .run();
}

/**
 * Fold one issue into another — the correction for "these two are the same bug".
 *
 * The loser is tombstoned rather than deleted so a link to it still leads
 * somewhere, and the survivor's centroid is recomputed from every member.
 */
export async function mergeIssues(env: Bindings, fromId: string, intoId: string): Promise<boolean> {
  if (fromId === intoId) return false;
  const both = await env.DB.prepare(
    `SELECT id FROM feedback_issues WHERE id IN (?1, ?2) AND merged_into IS NULL`,
  )
    .bind(fromId, intoId)
    .all<{ id: string }>();
  if ((both.results ?? []).length !== 2) return false;
  await env.DB.batch([
    env.DB.prepare(`UPDATE respondent_feedback SET issue_id = ?1 WHERE issue_id = ?2`).bind(intoId, fromId),
    env.DB.prepare(`UPDATE feedback_issues SET merged_into = ?1 WHERE id = ?2`).bind(intoId, fromId),
    env.DB.prepare(`UPDATE feedback_issues SET merged_into = ?1 WHERE merged_into = ?2`).bind(intoId, fromId),
  ]);
  await recomputeIssue(env, intoId);
  return true;
}

/**
 * Move one report — the correction for "this one is not that bug".
 *
 * To an existing issue, or to a new one of its own titled from its note. Both
 * sides' centroids are recomputed, and an issue left empty disappears.
 */
export async function moveReport(env: Bindings, feedbackId: string, target: string): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT issue_id, message, topic FROM respondent_feedback WHERE id = ?1`)
    .bind(feedbackId)
    .first<{ issue_id: string | null; message: string | null; topic: string | null }>();
  if (!row) return null;
  const previous = row.issue_id;

  let issueId = target;
  if (target === "new") {
    const vector = await env.DB.prepare(`SELECT vector FROM feedback_embeddings WHERE feedback_id = ?1`)
      .bind(feedbackId)
      .first<{ vector: string }>();
    if (!vector) return null;
    issueId = newIssueId();
    await env.DB.prepare(
      `INSERT INTO feedback_issues (id, title, title_edited, topic, centroid, centroid_n, created_at)
       VALUES (?1, ?2, 0, ?3, ?4, 1, ?5)`,
    )
      .bind(issueId, cleanTitle(null, row.message ?? "Untitled issue"), row.topic, vector.vector, Date.now())
      .run();
  } else {
    const exists = await env.DB.prepare(`SELECT id FROM feedback_issues WHERE id = ?1 AND merged_into IS NULL`)
      .bind(target)
      .first<{ id: string }>();
    if (!exists) return null;
  }

  await env.DB.prepare(`UPDATE respondent_feedback SET issue_id = ?1, issue_similarity = NULL WHERE id = ?2`)
    .bind(issueId, feedbackId)
    .run();
  await recomputeIssue(env, issueId);
  if (previous && previous !== issueId) await recomputeIssue(env, previous);
  return issueId;
}

/** The issues a report could be moved to, nearest first — the move menu's short list. */
export async function nearestIssuesFor(
  env: Bindings,
  feedbackId: string,
  limit = 5,
): Promise<{ id: string; title: string; score: number }[]> {
  const row = await env.DB.prepare(
    `SELECT fb.issue_id, e.vector FROM respondent_feedback fb
       LEFT JOIN feedback_embeddings e ON e.feedback_id = fb.id WHERE fb.id = ?1`,
  )
    .bind(feedbackId)
    .first<{ issue_id: string | null; vector: string | null }>();
  if (!row?.vector) return [];
  const found = await nearest(env, decodeVector(row.vector), limit, row.issue_id);
  return found.map((c) => ({ id: c.id, title: c.title, score: Math.round(c.score * 1000) / 1000 }));
}

/**
 * Delete bug reports outright — the report, its snapshot, its vector — and any
 * issue left with nothing in it.
 *
 * The vector would cascade with the report anyway; it is deleted by name so the
 * rule does not hang on a foreign key nobody reading this can see. Snapshots
 * first, the same ordering `delete-account.ts` explains: the row is the only
 * record of the key, so it goes last.
 */
export async function deleteReports(env: Bindings, ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const found: { id: string; issue_id: string | null; snapshot_key: string | null }[] = [];
  for (const chunk of bindChunks(ids)) {
    const page = await env.DB.prepare(
      `SELECT id, issue_id, snapshot_key FROM respondent_feedback WHERE id IN (${holesFor(chunk)})`,
    )
      .bind(...chunk)
      .all<{ id: string; issue_id: string | null; snapshot_key: string | null }>();
    found.push(...(page.results ?? []));
  }
  if (found.length === 0) return 0;

  const keys = found.flatMap((r) => (r.snapshot_key ? [r.snapshot_key] : []));
  for (const chunk of bindChunks(keys, 1000)) await env.R2.delete(chunk);

  const chunks = bindChunks(found.map((r) => r.id));
  await env.DB.batch(
    chunks.flatMap((chunk) => [
      env.DB.prepare(`DELETE FROM feedback_embeddings WHERE feedback_id IN (${holesFor(chunk)})`).bind(...chunk),
      env.DB.prepare(`DELETE FROM respondent_feedback WHERE id IN (${holesFor(chunk)})`).bind(...chunk),
    ]),
  );

  const issues = new Set(found.flatMap((r) => (r.issue_id ? [r.issue_id] : [])));
  for (const issueId of Array.from(issues)) await recomputeIssue(env, issueId);
  return found.length;
}

/** Every report filed against one organization's forms — for when the organization goes. */
export async function deleteOrganizationReports(env: Bindings, orgId: string): Promise<void> {
  for (;;) {
    const page = await env.DB.prepare(`SELECT id FROM respondent_feedback WHERE organization_id = ?1 LIMIT 500`)
      .bind(orgId)
      .all<{ id: string }>();
    const ids = (page.results ?? []).map((r) => r.id);
    if (ids.length === 0) return;
    await deleteReports(env, ids);
  }
}

/**
 * How long a deleted form's bug reports outlive it — the same week its knowledge
 * gets, and for the same reason: a form delete is soft and can be a mis-click.
 */
export const FEEDBACK_RETENTION_MS = 7 * DAY_MS;

/** Delete the reports of forms deleted longer ago than the retention window. */
export async function sweepDeletedFormFeedback(env: Bindings, limit = 200): Promise<number> {
  const cutoff = Date.now() - FEEDBACK_RETENTION_MS;
  const page = await env.DB.prepare(
    `SELECT fb.id FROM respondent_feedback fb JOIN forms f ON f.id = fb.form_id
      WHERE f.deleted_at IS NOT NULL AND f.deleted_at < ?1 LIMIT ?2`,
  )
    .bind(cutoff, limit)
    .all<{ id: string }>();
  return deleteReports(env, (page.results ?? []).map((r) => r.id));
}
