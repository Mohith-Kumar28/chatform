import type { Bindings } from "../env.js";
import { knowledgeStore, type KnowledgeKind, type KnowledgeSourceInput } from "./knowledge/index.js";
import { ExtractionError } from "./knowledge/extract.js";
import { fetchSiteText } from "./research.js";

/**
 * The knowledge base's row lifecycle.
 *
 * Everything an author does creates a `knowledge_sources` row first and does
 * the work second, on a queue. Extraction of a large PDF is a `toMarkdown`
 * call, possibly an OCR pass, and dozens of embedding calls — far past what a
 * request can hold open, and far past what an author should watch a spinner
 * for.
 *
 * The row is therefore the contract with the UI: it exists immediately, it
 * carries a `status`, and it ends at `ready` or at `failed` with a sentence
 * explaining why. There is no state in which an author is told nothing.
 */

export type SourceStatus = "pending" | "extracting" | "indexing" | "ready" | "failed";

export interface KnowledgeSourceRow {
  id: string;
  formId: string;
  kind: KnowledgeKind;
  title: string;
  origin: string | null;
  status: SourceStatus;
  error: string | null;
  bytes: number;
  chunkCount: number;
  createdAt: number;
  indexedAt: number | null;
}

/** How many pages one crawl request may ingest. */
export const CRAWL_PAGE_CAP = 25;

export function newSourceId(): string {
  return `kbs_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export async function listSources(env: Bindings, formId: string): Promise<KnowledgeSourceRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, form_id, kind, title, origin, status, error, bytes, chunk_count, created_at, indexed_at
       FROM knowledge_sources WHERE form_id = ? ORDER BY created_at DESC`,
  )
    .bind(formId)
    .all<Record<string, unknown>>();

  return (results ?? []).map((r) => ({
    id: r.id as string,
    formId: r.form_id as string,
    kind: r.kind as KnowledgeKind,
    title: r.title as string,
    origin: (r.origin as string | null) ?? null,
    status: r.status as SourceStatus,
    error: (r.error as string | null) ?? null,
    bytes: Number(r.bytes ?? 0),
    chunkCount: Number(r.chunk_count ?? 0),
    createdAt: Number(r.created_at ?? 0),
    indexedAt: r.indexed_at == null ? null : Number(r.indexed_at),
  }));
}

/** Total indexed size for a form — what the plan cap meters. */
export async function knowledgeBytes(env: Bindings, formId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(SUM(bytes), 0) AS total FROM knowledge_sources WHERE form_id = ? AND status != 'failed'`,
  )
    .bind(formId)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function countSources(env: Bindings, formId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM knowledge_sources WHERE form_id = ? AND status != 'failed'`,
  )
    .bind(formId)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * Register a source and hand the work to the queue.
 *
 * `fileId` is set for uploads, `rawText` for pasted text and seeds, `origin`
 * for links — never more than one of them, because which is present is how the
 * consumer knows where to read the bytes from.
 */
export async function createSource(
  env: Bindings,
  input: {
    id?: string;
    organizationId: string;
    formId: string;
    kind: KnowledgeKind;
    title: string;
    origin?: string | null;
    fileId?: string | null;
    rawText?: string | null;
    /** Skip the queue — the ingest sweep will pick it up. Used by seeds. */
    defer?: boolean;
  },
): Promise<string> {
  const id = input.id ?? newSourceId();
  await env.DB.prepare(
    `INSERT INTO knowledge_sources
       (id, organization_id, form_id, kind, title, origin, file_id, raw_text, status, bytes, chunk_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?)`,
  )
    .bind(
      id,
      input.organizationId,
      input.formId,
      input.kind,
      input.title.slice(0, 200),
      input.origin ?? null,
      input.fileId ?? null,
      input.rawText ?? null,
      Date.now(),
    )
    .run();

  if (!input.defer) await enqueue(env, id);
  return id;
}

export async function enqueue(env: Bindings, sourceId: string): Promise<void> {
  try {
    await env.Q_KNOWLEDGE.send({ sourceId });
  } catch (err) {
    // The row stays `pending`, and `sweepStuckKnowledgeIngest` re-enqueues it.
    // Losing the message must not lose the source.
    console.error("knowledge_enqueue_failed", sourceId, err);
  }
}

/**
 * Do the work for one source: read it, index it, record what happened.
 *
 * Never throws for a source it simply could not read — that is a `failed` row
 * with a readable reason, not a queue retry, because retrying a corrupt PDF
 * three times produces the same corrupt PDF. It does throw on infrastructure
 * failure, which is what the queue's retries are for.
 */
export async function ingestSource(env: Bindings, sourceId: string): Promise<void> {
  const row = await env.DB.prepare(
    `SELECT id, organization_id, form_id, kind, title, origin, file_id, raw_text
       FROM knowledge_sources WHERE id = ?`,
  )
    .bind(sourceId)
    .first<Record<string, unknown>>();

  if (!row) return; // Deleted while queued. Nothing to do and nothing wrong.

  await setStatus(env, sourceId, "extracting");

  try {
    const input = await buildInput(env, row);
    await setStatus(env, sourceId, "indexing");
    const result = await knowledgeStore(env).ingest(input);

    await env.DB.prepare(
      `UPDATE knowledge_sources
          SET status = 'ready', error = NULL, bytes = ?, chunk_count = ?, external_id = ?, indexed_at = ?
        WHERE id = ?`,
    )
      .bind(result.bytes, result.chunkCount, result.externalId ?? null, Date.now(), sourceId)
      .run();
  } catch (err) {
    const readable =
      err instanceof ExtractionError
        ? err.message
        : "We couldn't index that source. Try again, or remove it and add it another way.";
    console.error("knowledge_ingest_failed", sourceId, err);
    await env.DB.prepare(`UPDATE knowledge_sources SET status = 'failed', error = ? WHERE id = ?`)
      .bind(readable, sourceId)
      .run();
  }
}

async function setStatus(env: Bindings, sourceId: string, status: SourceStatus): Promise<void> {
  await env.DB.prepare(`UPDATE knowledge_sources SET status = ? WHERE id = ?`).bind(status, sourceId).run();
}

/** Assemble the store's input, fetching the uploaded bytes when there are any. */
async function buildInput(env: Bindings, row: Record<string, unknown>): Promise<KnowledgeSourceInput> {
  const kind = row.kind as KnowledgeKind;
  const base = {
    sourceId: row.id as string,
    formId: row.form_id as string,
    kind,
    title: row.title as string,
  };

  if (row.file_id) {
    const file = await env.DB.prepare(`SELECT r2_key, filename, mime FROM files WHERE id = ?`)
      .bind(row.file_id as string)
      .first<{ r2_key: string; filename: string; mime: string }>();
    if (!file) throw new ExtractionError("That upload is no longer available.");

    const object = await env.R2.get(file.r2_key);
    if (!object) throw new ExtractionError("That upload is no longer available.");

    return {
      ...base,
      blob: await object.blob(),
      filename: file.filename,
      mime: file.mime,
    };
  }

  if (kind === "link" || kind === "crawl") {
    return { ...base, url: (row.origin as string | null) ?? undefined };
  }

  return { ...base, text: (row.raw_text as string | null) ?? "" };
}

export async function deleteSource(env: Bindings, formId: string, sourceId: string): Promise<void> {
  await knowledgeStore(env).deleteSource(formId, sourceId).catch((err: unknown) =>
    console.error("knowledge_delete_vectors_failed", sourceId, err),
  );

  const row = await env.DB.prepare(`SELECT file_id FROM knowledge_sources WHERE id = ? AND form_id = ?`)
    .bind(sourceId, formId)
    .first<{ file_id: string | null }>();

  await env.DB.prepare(`DELETE FROM knowledge_sources WHERE id = ? AND form_id = ?`).bind(sourceId, formId).run();

  if (row?.file_id) await deleteFileObject(env, row.file_id);
}

/**
 * Drop the R2 object and its `files` row, in that order.
 *
 * `files` is the only index of what is in R2, so it is cleared last — the same
 * ordering `delete-account.ts` documents. A failure between the two leaves a
 * row pointing at nothing, which is recoverable; the reverse leaves bytes
 * nothing will ever find.
 */
async function deleteFileObject(env: Bindings, fileId: string): Promise<void> {
  const file = await env.DB.prepare(`SELECT r2_key FROM files WHERE id = ?`)
    .bind(fileId)
    .first<{ r2_key: string }>();
  if (!file) return;
  await env.R2.delete(file.r2_key).catch((err: unknown) => console.error("knowledge_r2_delete_failed", fileId, err));
  await env.DB.prepare(`DELETE FROM files WHERE id = ?`).bind(fileId).run();
}

/**
 * Expand a crawl seed into one source per page.
 *
 * Bounded hard and deliberately shallow: same origin only, depth 2, and a page
 * cap. An unbounded crawl is a way to spend an author's whole storage
 * allowance on a site's pagination, and a way to hammer someone else's server
 * from our IP range.
 */
export async function expandCrawl(
  env: Bindings,
  args: { organizationId: string; formId: string; seedUrl: string; cap?: number },
): Promise<string[]> {
  const cap = Math.min(args.cap ?? CRAWL_PAGE_CAP, CRAWL_PAGE_CAP);
  const seed = new URL(args.seedUrl);
  const seen = new Set<string>([normalizeUrl(seed.href)]);
  const queue: { url: string; depth: number }[] = [{ url: seed.href, depth: 0 }];
  const pages: string[] = [];

  while (queue.length > 0 && pages.length < cap) {
    const next = queue.shift()!;
    const page = await fetchSiteText(next.url);
    if (!page) continue;
    pages.push(next.url);

    if (next.depth >= 2) continue;
    for (const href of sameOriginLinks(page.text, next.url, seed.origin)) {
      const key = normalizeUrl(href);
      if (seen.has(key) || seen.size >= cap * 4) continue;
      seen.add(key);
      queue.push({ url: href, depth: next.depth + 1 });
    }
  }

  const ids: string[] = [];
  for (const url of pages) {
    ids.push(
      await createSource(env, {
        organizationId: args.organizationId,
        formId: args.formId,
        kind: "crawl",
        title: titleFromUrl(url),
        origin: url,
      }),
    );
  }
  return ids;
}

/**
 * `fetchSiteText` returns text, not markup, so links come from the markdown it
 * leaves behind. Anything it did not preserve is not reachable from here — a
 * deliberate ceiling on how far a crawl can wander.
 */
function sameOriginLinks(text: string, base: string, origin: string): string[] {
  const out: string[] = [];
  const re = /\]\(([^)\s]+)\)|(https?:\/\/[^\s)<>"']+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    try {
      const url = new URL(raw, base);
      if (url.origin !== origin) continue;
      if (!/^https?:$/.test(url.protocol)) continue;
      url.hash = "";
      out.push(url.href);
    } catch {
      // A malformed href in someone else's page is not our problem.
    }
  }
  return out;
}

function normalizeUrl(href: string): string {
  try {
    const url = new URL(href);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return href;
  }
}

function titleFromUrl(href: string): string {
  try {
    const url = new URL(href);
    const path = url.pathname.replace(/\/$/, "");
    return path ? `${url.hostname}${path}` : url.hostname;
  } catch {
    return href.slice(0, 200);
  }
}
