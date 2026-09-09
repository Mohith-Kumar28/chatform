import type { Bindings } from "../../env.js";
import { chunkMarkdown } from "./chunk.js";
import { extract } from "./extract.js";
import type { IngestResult, KnowledgeHit, KnowledgeSourceInput, KnowledgeStore } from "./store.js";

/**
 * The `KnowledgeStore` built out of Cloudflare primitives.
 *
 * Workers AI extracts and embeds, Vectorize indexes, D1 holds the chunk text.
 * All three are bindings, so a retrieval during a respondent's turn is a
 * same-datacenter call rather than a hop to a third party — which is the whole
 * reason this is the default adapter.
 *
 * ## Tenancy
 *
 * One index, one namespace per form. Vectorize allows 50,000 namespaces per
 * index but only 50,000 indexes per *account*, so an index per form would spend
 * the entire account ceiling on one customer. Every write sets the namespace
 * and every read filters by it; there is no code path that queries across
 * namespaces, because that path would be a cross-tenant leak.
 *
 * ## Why the chunk text lives in D1
 *
 * Vectorize allows 10 KiB of metadata per vector and indexes only the first 64
 * bytes of a string, so metadata is no place for a passage. It carries the form
 * and source ids — enough to filter and to delete — and the text is fetched
 * from `knowledge_chunks` by vector id after the search returns.
 */

/**
 * bge-m3: 1024 dimensions, under Vectorize's 1536 ceiling, 100+ languages, and
 * the cheapest per token of the embedding tier.
 *
 * Multilingual matters more than it looks: a form's knowledge and a
 * respondent's question are frequently not in the same language, and an
 * English-only model retrieves nothing for either.
 */
const EMBEDDING_MODEL = "@cf/baai/bge-m3";

/** Cross-encoder rerank over the vector hits. Cheap, and much better at "is this actually the answer". */
const RERANK_MODEL = "@cf/baai/bge-reranker-base";

/** Vectors per upsert. Vectorize accepts 1,000 from a Worker; this stays well inside it. */
const UPSERT_BATCH = 100;

/** Chunks per embedding call. */
const EMBED_BATCH = 50;

/**
 * Candidates pulled before reranking.
 *
 * Wider than what is returned, because the reranker's job is to reorder a pool
 * — handing it exactly the number we want makes it a no-op.
 */
const CANDIDATE_K = 12;

/** Passages handed to the agent. More than three crowds out the conversation. */
const DEFAULT_TOP_K = 3;

interface EmbeddingResponse {
  data?: number[][];
}

export class VectorizeKnowledgeStore implements KnowledgeStore {
  constructor(private readonly env: Bindings) {}

  async ingest(input: KnowledgeSourceInput): Promise<IngestResult> {
    const orgRow = await this.env.DB.prepare(`SELECT organization_id FROM knowledge_sources WHERE id = ?`)
      .bind(input.sourceId)
      .first<{ organization_id: string }>();

    const { markdown } = await extract(this.env, input, {
      organizationId: orgRow?.organization_id ?? "",
    });

    const chunks = chunkMarkdown(markdown);
    if (chunks.length === 0) {
      throw new Error("That source had nothing worth indexing.");
    }

    // Re-ingest is an overwrite, not an append: a source edited or retried must
    // not leave its previous chunks behind to be retrieved alongside the new
    // ones.
    await this.deleteSource(input.formId, input.sourceId);

    const rows = chunks.map((chunk) => ({
      id: `kch_${input.sourceId.replace(/^kbs_/, "")}_${chunk.ordinal}`,
      ...chunk,
    }));

    // D1 first. A vector whose text is missing retrieves as an empty passage,
    // which is worse than a chunk that is not yet searchable.
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const slice = rows.slice(i, i + UPSERT_BATCH);
      await this.env.DB.batch(
        slice.map((row) =>
          this.env.DB.prepare(
            `INSERT INTO knowledge_chunks (id, source_id, form_id, ordinal, text, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          ).bind(row.id, input.sourceId, input.formId, row.ordinal, row.text, Date.now()),
        ),
      );
    }

    const vectors: { id: string; values: number[]; metadata: Record<string, string> }[] = [];
    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      const slice = rows.slice(i, i + EMBED_BATCH);
      const values = await this.embed(slice.map((r) => r.text));
      slice.forEach((row, j) => {
        const vector = values[j];
        if (!vector) return;
        vectors.push({
          id: row.id,
          values: vector,
          metadata: { formId: input.formId, sourceId: input.sourceId },
        });
      });
    }

    const index = this.index();
    for (let i = 0; i < vectors.length; i += UPSERT_BATCH) {
      await index.upsert(
        vectors.slice(i, i + UPSERT_BATCH).map((v) => ({ ...v, namespace: input.formId })) as never,
      );
    }

    return { chunkCount: rows.length, bytes: byteLength(markdown) };
  }

  async search(formId: string, query: string, opts?: { topK?: number }): Promise<KnowledgeHit[]> {
    const topK = opts?.topK ?? DEFAULT_TOP_K;
    if (!this.env.VECTORIZE || !this.env.WORKERS_AI) return [];

    const [embedding] = await this.embed([query]);
    if (!embedding) return [];

    const matches = await this.env.VECTORIZE.query(embedding, {
      topK: CANDIDATE_K,
      namespace: formId,
      /*
       * "none", not `false`. Vectorize v1 took a boolean here; v2 takes an
       * enum — "none" | "indexed" | "all" — and rejects the whole query with
       * `VECTOR_QUERY_ERROR (code = 40026): Failed to parse the request body
       * as JSON: returnMetadata: expected value` when handed a boolean.
       *
       * It failed silently in the worst way. `answer_from_knowledge` treats a
       * throwing search as a miss, deliberately, so the respondent never sees
       * an error — which meant a fully indexed knowledge base (rows `ready`,
       * vectors present, namespaces correct) produced an agent that improvised
       * "we haven't announced our final pricing yet" on the public demo. Every
       * layer looked healthy; only `wrangler tail` showed the parse error.
       *
       * The `as never` below is what let it ship: it casts away the very
       * options type that would have rejected a boolean at compile time.
       * Narrow it when the installed workers-types has the v2 shape.
       */
      returnMetadata: "none",
    } as never);

    const ids = (matches?.matches ?? []).map((m) => m.id);
    if (ids.length === 0) return [];

    // The namespace already scoped the query; `form_id` here is belt and
    // braces against a vector that outlived its row.
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await this.env.DB.prepare(
      `SELECT c.id, c.text, c.source_id, s.title
         FROM knowledge_chunks c
         JOIN knowledge_sources s ON s.id = c.source_id
        WHERE c.id IN (${placeholders}) AND c.form_id = ?`,
    )
      .bind(...ids, formId)
      .all<{ id: string; text: string; source_id: string; title: string }>();

    const byId = new Map((results ?? []).map((r) => [r.id, r]));
    const candidates = (matches?.matches ?? [])
      .map((m) => {
        const row = byId.get(m.id);
        return row ? { sourceId: row.source_id, title: row.title, text: row.text, score: m.score ?? 0 } : null;
      })
      .filter((c): c is KnowledgeHit => c !== null);

    return await this.rerank(query, candidates, topK);
  }

  async deleteSource(formId: string, sourceId: string): Promise<void> {
    const { results } = await this.env.DB.prepare(
      `SELECT id FROM knowledge_chunks WHERE source_id = ? AND form_id = ?`,
    )
      .bind(sourceId, formId)
      .all<{ id: string }>();

    const ids = (results ?? []).map((r) => r.id);
    if (ids.length > 0 && this.env.VECTORIZE) {
      for (let i = 0; i < ids.length; i += UPSERT_BATCH) {
        // A delete that fails must not strand the D1 rows — an orphan vector is
        // recoverable (it retrieves nothing once its text is gone), an orphan
        // row is a passage nothing will ever clean up.
        await this.env.VECTORIZE.deleteByIds(ids.slice(i, i + UPSERT_BATCH)).catch((err: unknown) =>
          console.error("vectorize_delete_failed", sourceId, err),
        );
      }
    }
    await this.env.DB.prepare(`DELETE FROM knowledge_chunks WHERE source_id = ?`).bind(sourceId).run();
  }

  async deleteForm(formId: string): Promise<void> {
    const { results } = await this.env.DB.prepare(`SELECT id FROM knowledge_chunks WHERE form_id = ?`)
      .bind(formId)
      .all<{ id: string }>();

    const ids = (results ?? []).map((r) => r.id);
    if (ids.length > 0 && this.env.VECTORIZE) {
      for (let i = 0; i < ids.length; i += UPSERT_BATCH) {
        await this.env.VECTORIZE.deleteByIds(ids.slice(i, i + UPSERT_BATCH)).catch((err: unknown) =>
          console.error("vectorize_delete_form_failed", formId, err),
        );
      }
    }
    await this.env.DB.prepare(`DELETE FROM knowledge_chunks WHERE form_id = ?`).bind(formId).run();
  }

  private index() {
    if (!this.env.VECTORIZE) throw new Error("Vector search is not configured.");
    return this.env.VECTORIZE;
  }

  private async embed(texts: string[]): Promise<number[][]> {
    if (!this.env.WORKERS_AI) throw new Error("Embedding is not configured.");
    const result = (await this.env.WORKERS_AI.run(EMBEDDING_MODEL, { text: texts })) as EmbeddingResponse;
    return result?.data ?? [];
  }

  /**
   * Reorder the candidate pool with a cross-encoder.
   *
   * Vector similarity answers "is this about the same topic"; a reranker
   * answers "does this passage contain the answer", which is the question a
   * respondent actually asked. A failure here is not worth failing the turn
   * over — the vector order is still a reasonable order.
   */
  private async rerank(query: string, candidates: KnowledgeHit[], topK: number): Promise<KnowledgeHit[]> {
    if (candidates.length <= 1 || !this.env.WORKERS_AI) return candidates.slice(0, topK);
    try {
      const result = (await this.env.WORKERS_AI.run(RERANK_MODEL, {
        // `query` is cast in because Cloudflare's generated types drop it:
        // `Ai_Cf_Baai_Bge_Reranker_Base_Input` carries the JSDoc for "A query
        // you wish to perform against the provided contexts" but no matching
        // property, so the interface describes a reranker with nothing to rank
        // against. The API does take it — without it there is no ranking at all.
        query,
        contexts: candidates.map((c) => ({ text: c.text })),
      } as never)) as { response?: { id: number; score: number }[] };

      const ranked = result?.response;
      if (!ranked?.length) return candidates.slice(0, topK);

      return ranked
        .map((r) => {
          const hit = candidates[r.id];
          return hit ? { ...hit, score: r.score } : null;
        })
        .filter((h): h is KnowledgeHit => h !== null)
        .slice(0, topK);
    } catch (err) {
      console.error("knowledge_rerank_failed", err);
      return candidates.slice(0, topK);
    }
  }
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
