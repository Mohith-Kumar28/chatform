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
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The closing date, as a card reads it.
 *
 * UTC and hand-built rather than `toLocaleDateString`: this renders on a worker
 * with no viewer and no timezone to render for, so a locale would only pick one
 * arbitrarily. The time of day is dropped — "Closes Sep 20" is the fact that
 * makes someone click, and an hour in a timezone they are not in is not.
 *
 * A date already past renders nothing: the form is closed, and a card promising
 * a deadline that has gone is worse than one with no deadline at all.
 */
function formatDeadline(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const at = Date.parse(raw);
  if (!Number.isFinite(at) || at <= Date.now()) return undefined;
  const d = new Date(at);
  const month = MONTHS[d.getUTCMonth()];
  const now = new Date();
  const year = d.getUTCFullYear() === now.getUTCFullYear() ? "" : `, ${d.getUTCFullYear()}`;
  return `${month} ${d.getUTCDate()}${year}`;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = (params.get("title") ?? "").trim().slice(0, 120) || "A form that answers back";
  const description = (params.get("description") ?? "").trim().slice(0, 160) || undefined;
  const deadline = formatDeadline(params.get("closeAt"));

  const image = renderFormCard({ title, description, deadline });
  // Crawlers refetch this on every unfurl; a day at the edge is plenty, and the
  // URL carries the title so a changed title is a changed URL.
  image.headers.set("cache-control", "public, max-age=3600, s-maxage=86400, immutable");
  return image;
}
