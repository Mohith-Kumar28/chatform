import type { OpenAPIPageProps } from "fumadocs-openapi/ui";
import { openapi } from "@/lib/openapi/client";
import { OpenAPIPageClient } from "./openapi-page";

/**
 * The bridge between the generated reference pages and the renderer.
 *
 * The renderer is a client component and the document lives on the server, so a
 * server component in between loads it and hands it over. The generated pages
 * name the document `chatform`, which resolves to the spec copy imported into
 * the app — nothing here reads the filesystem, so there is nothing for Next's
 * tracer to miss and nothing machine-specific in the committed output.
 */
export async function ApiPage({
  document = "chatform",
  ...rest
}: {
  document?: string;
  // Typed from the renderer's own props so the method union stays exact —
  // these values come from generated MDX, not from anything hand-written.
  operations?: OpenAPIPageProps["operations"];
  webhooks?: OpenAPIPageProps["webhooks"];
}) {
  const { bundled } = await openapi.getSchema(document);
  return <OpenAPIPageClient {...rest} payload={{ bundled }} />;
}
