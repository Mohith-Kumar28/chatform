import { createOpenAPI } from "fumadocs-openapi/server";
import spec from "./spec.json";

/**
 * The spec, imported rather than read.
 *
 * A committed copy that the generator keeps in step, so nothing in the docs
 * pipeline touches the filesystem inside a worker and Next's tracer has nothing
 * to miss.
 */
export const openapi = createOpenAPI({
  input: { chatform: spec as never },
});
