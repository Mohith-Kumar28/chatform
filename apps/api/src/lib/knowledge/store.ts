/**
 * The knowledge base's one seam.
 *
 * Nothing outside this directory may import Vectorize, Workers AI or a vendor
 * SDK. Callers get a `KnowledgeStore` from `knowledgeStore(env)` and speak only
 * these four verbs, so swapping the backend is a new file plus an env var
 * rather than an edit in ten places.
 *
 * ## Why the seam is here and not lower
 *
 * The obvious port is narrower — `embed(chunks)`, `upsert(vectors)` — and it is
 * wrong. Vectorize is a bare vector index: extraction, chunking and embedding
 * are all ours. A hosted memory service is the opposite; you hand it a file and
 * it chunks and embeds with its own strategy. A port that took chunks would
 * bake our chunking into a backend that does its own, and swapping would mean
 * either fighting it or bypassing the port.
 *
 * So the port says only "make this source searchable" and "find me passages".
 * Everything between those two — parsing, OCR, chunk size, embedding model,
 * reranking, what gets stored where — is an implementation detail of whichever
 * adapter is mounted.
 */

/** How a source arrived. Decides which extractor runs, nothing else. */
export type KnowledgeKind = "file" | "text" | "link" | "image" | "audio" | "crawl";

export interface KnowledgeSourceInput {
  /** Our `knowledge_sources.id`. Also the adapter's key back to our rows. */
  sourceId: string;
  /**
   * The tenancy boundary, and the only one.
   *
   * Every write is partitioned by it and every read is filtered by it. A
   * retrieval path that forgets it is a cross-tenant leak, which is why it is a
   * required argument on `search` rather than something carried in options.
   */
  formId: string;
  kind: KnowledgeKind;
  title: string;
  /** Pasted text, and the text seeded rows carry. */
  text?: string;
  /** Uploaded bytes, for `file`, `image` and `audio`. */
  blob?: Blob;
  filename?: string;
  mime?: string;
  /** The page to read, for `link` and the seed of a `crawl`. */
  url?: string;
}

export interface IngestResult {
  chunkCount: number;
  /** Extracted text size, which is what the plan caps meter. */
  bytes: number;
  /** The backend's own handle, when it has one. Vectorize does not. */
  externalId?: string;
}

export interface KnowledgeHit {
  sourceId: string;
  title: string;
  text: string;
  score: number;
}

export interface KnowledgeStore {
  /**
   * Extract → chunk → embed → index. Everything between is adapter-internal.
   *
   * Throws on a source it cannot read. The caller records the reason on the row
   * and shows it to the author — a knowledge base that silently indexes nothing
   * is the failure this contract exists to make impossible.
   */
  ingest(input: KnowledgeSourceInput): Promise<IngestResult>;

  /** Passages relevant to `query`, from this form and no other. */
  search(formId: string, query: string, opts?: { topK?: number }): Promise<KnowledgeHit[]>;

  /** Forget one source. Safe to call for a source that was never indexed. */
  deleteSource(formId: string, sourceId: string): Promise<void>;

  /** Forget a whole form, for the delete sweep. */
  deleteForm(formId: string): Promise<void>;
}
