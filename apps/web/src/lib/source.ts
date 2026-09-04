import { loader } from "fumadocs-core/source";
import { docs } from "../../.source/server";

/** The page tree and lookup, built from the MDX collection at compile time. */
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
