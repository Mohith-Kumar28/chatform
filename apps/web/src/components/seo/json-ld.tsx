import type { LdNode } from "@/lib/seo";

/**
 * One `<script>` per page, holding a `@graph` of every node that page declares.
 *
 * Two separate graphs on one page is legal and worse: crawlers merge them
 * anyway, and the merge is where a second, `@id`-less Organization node
 * quietly appears. So callers pass an array and get one script.
 *
 * `<` is escaped because a JSON string containing `</script>` ends the script
 * element, and several of these graphs carry author-written copy. Nothing else
 * needs escaping — `JSON.stringify` already handles quoting — and `<`
 * parses back to `<`, so the payload a crawler reads is unchanged.
 *
 * This is a server component with no interactivity, so the script is in the
 * static HTML rather than written in after hydration. That is the whole point:
 * the crawlers and the model-facing fetchers that matter here do not run our
 * JavaScript.
 */
export function JsonLd({ nodes }: { nodes: readonly LdNode[] }) {
  const graph = { "@context": "https://schema.org", "@graph": nodes };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  );
}
