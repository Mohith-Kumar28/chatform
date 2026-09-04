"use client";

import { createOpenAPIPage } from "fumadocs-openapi/ui";
import { createCodeUsageGeneratorRegistry } from "fumadocs-openapi/requests/generators";
import { registerDefault } from "fumadocs-openapi/requests/generators/all";
import "fumadocs-openapi/css/preset.css";

/**
 * The rendered reference for one operation.
 *
 * A factory rather than a plain import, because the client component it builds
 * carries the rendering options — here the full set of code-sample languages, so
 * a reader can copy a request in whatever they are actually writing.
 *
 * `"use client"` is required: the factory itself is client-side, and calling it
 * during a server render fails outright.
 */
export const OpenAPIPageClient = createOpenAPIPage({
  codeUsages: registerDefault(createCodeUsageGeneratorRegistry()),
});
