import { renderFormCard } from "@/components/brand/share-card";

/**
 * The default share card for a hosted form.
 *
 * A route rather than an `opengraph-image.tsx` beside the page, because
 * file-convention metadata *overrides* what `generateMetadata` returns — the
 * card would have won over an author's own uploaded image, which is the one
 * thing it must never do. As a plain route it is just a URL the page falls back
 * to, and the upload keeps priority.
 *
 * It is also what the Link & social preview points at, so the card an author
 * sees while typing the title is the same bytes a crawler will fetch.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = (params.get("title") ?? "").trim().slice(0, 120) || "A form that answers back";
  const description = (params.get("description") ?? "").trim().slice(0, 160) || undefined;

  const image = renderFormCard({ title, description });
  // Crawlers refetch this on every unfurl; a day at the edge is plenty, and the
  // URL carries the title so a changed title is a changed URL.
  image.headers.set("cache-control", "public, max-age=3600, s-maxage=86400, immutable");
  return image;
}
