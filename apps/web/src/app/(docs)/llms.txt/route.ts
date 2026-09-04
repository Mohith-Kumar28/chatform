import { source } from "@/lib/source";

/**
 * An index of the documentation, for the assistants developers actually use.
 *
 * Static: it changes on deploy, never per request.
 */
export const dynamic = "force-static";

export function GET() {
  const pages = source.getPages();
  const body = [
    "# Chatform",
    "",
    "> Conversational forms. Embed one, drive it from your backend, or build your own interface on the same engine.",
    "",
    "The OpenAPI spec is at https://api.chatform.in/openapi.json.",
    "Every page below is also available as markdown by appending `.md` to its URL.",
    "",
    "## Documentation",
    "",
    ...pages
      .filter((page) => !page.data.llmsExclude)
      .map((page) => `- [${page.data.title}](https://chatform.in${page.url}): ${page.data.description ?? ""}`),
  ].join("\n");

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
