import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { VectorizeKnowledgeStore } from "../src/lib/knowledge/vectorize-store.js";
import type { Bindings } from "../src/env.js";

/**
 * The Vectorize adapter, against the real D1 and a fake index.
 *
 * Miniflare implements neither Vectorize nor Workers AI, so those two are
 * stubbed and everything else is genuine — the point of these is the
 * bookkeeping between the vector index and `knowledge_chunks`, which is where
 * the bugs that matter live: a vector whose text was deleted retrieves an empty
 * passage, and a chunk row whose vector was deleted is a leak nothing collects.
 */

let t: Tenant;

/** Records what the store asked the index to do. */
function fakeVectorize() {
  const vectors = new Map<string, { namespace?: string }>();
  const deleted: string[] = [];
  return {
    deleted,
    vectors,
    async upsert(rows: { id: string; namespace?: string }[]) {
      for (const row of rows) vectors.set(row.id, { namespace: row.namespace });
      return { count: rows.length };
    },
    async query(_values: number[], opts: { namespace?: string; topK?: number }) {
      // Return everything in the queried namespace, best-score-first by
      // insertion order — enough to prove the namespace is honoured.
      const matches = [...vectors.entries()]
        .filter(([, v]) => v.namespace === opts.namespace)
        .slice(0, opts.topK ?? 10)
        .map(([id], i) => ({ id, score: 1 - i * 0.01 }));
      return { matches, count: matches.length };
    },
    async deleteByIds(ids: string[]) {
      for (const id of ids) {
        vectors.delete(id);
        deleted.push(id);
      }
      return { count: ids.length };
    },
  };
}

/** Deterministic embeddings; no reranker, so the vector order stands. */
function fakeAi() {
  return {
    async run(model: string, _inputs: unknown) {
      if (model.includes("reranker")) throw new Error("no reranker in this test");
      return { data: [[0.1, 0.2, 0.3]] };
    },
    toMarkdown: async () => ({ format: "markdown", data: "", tokens: 0 }),
  };
}

function storeWith(vectorize: ReturnType<typeof fakeVectorize>) {
  const bindings = {
    ...(env as unknown as Bindings),
    VECTORIZE: vectorize as never,
    WORKERS_AI: fakeAi() as never,
  };
  return new VectorizeKnowledgeStore(bindings);
}

async function seedSource(id: string, formId: string, orgId: string, text: string) {
  await env.DB.prepare(
    `INSERT INTO knowledge_sources (id, organization_id, form_id, kind, title, raw_text, status, bytes, chunk_count, created_at)
     VALUES (?, ?, ?, 'text', ?, ?, 'pending', 0, 0, ?)`,
  )
    .bind(id, orgId, formId, `Title ${id}`, text, Date.now())
    .run();
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("kbstore");
});

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM knowledge_chunks`).run();
  await env.DB.prepare(`DELETE FROM knowledge_sources`).run();
});

describe("VectorizeKnowledgeStore", () => {
  it("indexes a source into chunks and vectors under the form's namespace", async () => {
    const vectorize = fakeVectorize();
    const store = storeWith(vectorize);
    await seedSource("kbs_a", t.formId, t.orgId, `# Pricing\n\n${"Pro is $24 a month. ".repeat(60)}`);

    const result = await store.ingest({
      sourceId: "kbs_a",
      formId: t.formId,
      kind: "text",
      title: "Pricing",
      text: `# Pricing\n\n${"Pro is $24 a month. ".repeat(60)}`,
    });

    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.bytes).toBeGreaterThan(0);

    const { results } = await env.DB.prepare(`SELECT id FROM knowledge_chunks WHERE source_id = 'kbs_a'`).all();
    expect(results!.length).toBe(result.chunkCount);
    // Every vector carries the form as its namespace — the tenancy boundary.
    for (const [, v] of vectorize.vectors) expect(v.namespace).toBe(t.formId);
  });

  it("re-ingesting replaces rather than appends", async () => {
    // A retried or edited source must not leave its old chunks behind to be
    // retrieved alongside the new ones.
    const vectorize = fakeVectorize();
    const store = storeWith(vectorize);
    const text = `# A\n\n${"first version. ".repeat(60)}`;
    await seedSource("kbs_b", t.formId, t.orgId, text);

    const first = await store.ingest({ sourceId: "kbs_b", formId: t.formId, kind: "text", title: "A", text });
    const second = await store.ingest({ sourceId: "kbs_b", formId: t.formId, kind: "text", title: "A", text });

    const { results } = await env.DB.prepare(`SELECT id FROM knowledge_chunks WHERE source_id = 'kbs_b'`).all();
    expect(results!.length).toBe(second.chunkCount);
    expect(results!.length).toBe(first.chunkCount);
    expect(vectorize.deleted.length).toBeGreaterThan(0);
  });

  it("returns passages with the text and title behind them", async () => {
    const store = storeWith(fakeVectorize());
    const text = `# Refunds\n\n${"We refund within 30 days. ".repeat(60)}`;
    await seedSource("kbs_c", t.formId, t.orgId, text);
    await store.ingest({ sourceId: "kbs_c", formId: t.formId, kind: "text", title: "Refunds", text });

    const hits = await store.search(t.formId, "refund window");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.text).toContain("refund");
    expect(hits[0]!.title).toBe("Title kbs_c");
    expect(hits[0]!.sourceId).toBe("kbs_c");
  });

  it("never returns another form's passages", async () => {
    const vectorize = fakeVectorize();
    const store = storeWith(vectorize);
    const other = await seedTenant("kbstore2");
    const text = `# Secret\n\n${"other tenant material. ".repeat(60)}`;

    await seedSource("kbs_mine", t.formId, t.orgId, "# Mine\n\nmine. ".repeat(30));
    await seedSource("kbs_theirs", other.formId, other.orgId, text);
    await store.ingest({ sourceId: "kbs_theirs", formId: other.formId, kind: "text", title: "Secret", text });

    const hits = await store.search(t.formId, "material");
    expect(hits).toEqual([]);
  });

  it("deleting a source clears its chunks and its vectors", async () => {
    const vectorize = fakeVectorize();
    const store = storeWith(vectorize);
    const text = `# Gone\n\n${"soon to be deleted. ".repeat(60)}`;
    await seedSource("kbs_d", t.formId, t.orgId, text);
    await store.ingest({ sourceId: "kbs_d", formId: t.formId, kind: "text", title: "Gone", text });

    await store.deleteSource(t.formId, "kbs_d");

    const { results } = await env.DB.prepare(`SELECT id FROM knowledge_chunks WHERE source_id = 'kbs_d'`).all();
    expect(results).toEqual([]);
    expect(vectorize.vectors.size).toBe(0);
    expect(await store.search(t.formId, "deleted")).toEqual([]);
  });

  it("deleting a form clears every source it had", async () => {
    const vectorize = fakeVectorize();
    const store = storeWith(vectorize);
    for (const id of ["kbs_e1", "kbs_e2"]) {
      const text = `# ${id}\n\n${"content here. ".repeat(60)}`;
      await seedSource(id, t.formId, t.orgId, text);
      await store.ingest({ sourceId: id, formId: t.formId, kind: "text", title: id, text });
    }

    await store.deleteForm(t.formId);

    const { results } = await env.DB.prepare(`SELECT id FROM knowledge_chunks WHERE form_id = ?`)
      .bind(t.formId)
      .all();
    expect(results).toEqual([]);
    expect(vectorize.vectors.size).toBe(0);
  });

  it("refuses a source with nothing worth indexing", async () => {
    const store = storeWith(fakeVectorize());
    await seedSource("kbs_f", t.formId, t.orgId, "");
    await expect(
      store.ingest({ sourceId: "kbs_f", formId: t.formId, kind: "text", title: "Empty", text: "   " }),
    ).rejects.toThrow();
  });

  it("deleting a source that was never indexed is a no-op, not an error", async () => {
    const store = storeWith(fakeVectorize());
    await expect(store.deleteSource(t.formId, "kbs_never")).resolves.toBeUndefined();
  });
});
