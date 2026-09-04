import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

/**
 * Search, as a prerendered asset.
 *
 * `staticGET`, not `GET`: a route handler would build the index inside the
 * worker on every cold start and carry the whole corpus in its bundle. This
 * emits one JSON file the browser searches locally, which is also the only shape
 * that works with a read-only incremental cache.
 */
export const { staticGET: GET } = createFromSource(source);

export const revalidate = false;
