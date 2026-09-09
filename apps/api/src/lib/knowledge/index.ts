import type { Bindings } from "../../env.js";
import type { KnowledgeStore } from "./store.js";
import { VectorizeKnowledgeStore } from "./vectorize-store.js";

export type { KnowledgeStore, KnowledgeHit, KnowledgeSourceInput, KnowledgeKind, IngestResult } from "./store.js";
export { ExtractionError } from "./extract.js";
export { chunkMarkdown, CHUNK_CHARS, CHUNK_OVERLAP_CHARS } from "./chunk.js";

/**
 * Build the knowledge store this deployment runs on.
 *
 * The one place a backend is named. Everything else in the codebase depends on
 * the `KnowledgeStore` interface, so adding a hosted backend later is a new
 * file beside `vectorize-store.ts`, a case in this switch, and an environment
 * variable — no route, tool, queue consumer or sweep changes.
 *
 * The likely second implementation is a hosted memory service (Supermemory and
 * its peers), which would chunk and embed on their side; that is why the port
 * takes a source rather than chunks. Its `deleteForm` would map onto a
 * container-tag delete, and it would leave `knowledge_chunks` unused.
 */
export function knowledgeStore(env: Bindings): KnowledgeStore {
  switch (env.KNOWLEDGE_BACKEND ?? "vectorize") {
    case "vectorize":
      return new VectorizeKnowledgeStore(env);
    default:
      // An unknown value is a deployment mistake, and silently falling back
      // would hide it until someone noticed retrieval was pointing at the
      // wrong store.
      throw new Error(`Unknown KNOWLEDGE_BACKEND: ${env.KNOWLEDGE_BACKEND}`);
  }
}

/**
 * Whether retrieval can run at all.
 *
 * Miniflare implements neither Vectorize nor Workers AI, so a local dev run has
 * no knowledge base. Callers use this to degrade — the agent falls back to
 * saying it does not know — rather than to throw at a respondent.
 */
export function knowledgeAvailable(env: Bindings): boolean {
  return Boolean(env.VECTORIZE && env.WORKERS_AI);
}
