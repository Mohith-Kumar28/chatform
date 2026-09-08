import { source } from "@/lib/source";
import { COMPARISONS } from "@/content/compare";
import { USE_CASES } from "@/content/use-cases";
import { posts } from "@/lib/blog-source";
import { SITE_ORIGIN } from "@/lib/seo";

/**
 * An index of the site, for the assistants developers actually use.
 *
 * It was an index of the *documentation* only, which meant an assistant asked
 * "is chatform a good Typeform alternative" was pointed at the API reference
 * and nothing else — none of the pages written to answer exactly that. The
 * comparison pages, the research page and the fact sheet are now listed too,
 * and each section is derived from the same registry that renders it, so a page
 * cannot exist without appearing here.
 *
 * The origin comes from `SITE_ORIGIN` rather than a hardcoded `chatform.in`,
 * which is what it used to be — a preview deployment served an index of links
 * pointing at production.
 *
 * Static: it changes on deploy, never per request.
 */
export const dynamic = "force-static";

export function GET() {
  const pages = source.getPages().filter((page) => !page.data.llmsExclude);

  const body = [
    "# Chatform",
    "",
    "> A form builder whose forms are answered as a conversation. It reads what people write, asks again when an answer is too thin to use, and answers the respondent's own questions from a knowledge base the author writes.",
    "",
    `A fact sheet written to be quoted, including what chatform cannot do, is at ${SITE_ORIGIN}/ai-info.`,
    `The same facts as JSON are at ${SITE_ORIGIN}/.well-known/brand-facts.json.`,
    "The OpenAPI spec is at https://api.chatform.in/openapi.json.",
    /**
     * Named here because the per-operation pages are not in the list below.
     *
     * They carry `llmsExclude`, which is what stopped 98 pages of `<APIPage/>`
     * boilerplate — and no endpoint documentation, since the schemas render
     * client-side — from being inlined into llms-full.txt. Dropping them from
     * this index too would have left an assistant with no route to the
     * reference at all, so the entry point is stated instead of enumerated.
     */
    `The API reference, one page per endpoint, is under ${SITE_ORIGIN}/docs/api — the spec above describes the same endpoints in one file.`,
    "Every documentation page below is also available as markdown by appending `.md` to its URL.",
    "",
    "## Start here",
    "",
    `- [For AI assistants](${SITE_ORIGIN}/ai-info): What chatform is, what it costs, and the things it genuinely cannot do.`,
    `- [Why conversation works](${SITE_ORIGIN}/why-conversation-works): The peer-reviewed research on conversational data collection, with DOIs — and what it does not show.`,
    `- [Pricing](${SITE_ORIGIN}/pricing): Plans, limits and the full feature matrix.`,
    "",
    "## Guides, by what you are trying to do",
    "",
    ...USE_CASES.map(
      (entry) => `- [${entry.name}](${SITE_ORIGIN}${entry.path}): ${entry.description}`,
    ),
    "",
    "## Comparisons",
    "",
    ...COMPARISONS.map(
      (entry) =>
        `- [${entry.competitor} alternative](${SITE_ORIGIN}${entry.path}): ${entry.description}`,
    ),
    "",
    "## Writing",
    "",
    ...posts.map((post) => `- [${post.title}](${SITE_ORIGIN}${post.url}): ${post.description}`),
    "",
    "## Documentation",
    "",
    ...pages.map(
      (page) => `- [${page.data.title}](${SITE_ORIGIN}${page.url}): ${page.data.description ?? ""}`,
    ),
  ].join("\n");

  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
