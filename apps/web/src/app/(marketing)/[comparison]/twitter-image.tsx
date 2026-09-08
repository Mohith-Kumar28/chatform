import { notFound } from "next/navigation";
import {
  renderShareCard,
  shareCardContentType,
  shareCardSize,
} from "@/components/brand/share-card";
import { COMPARISONS, getComparison } from "@/content/compare";

/**
 * The card a comparison link unfurls with.
 *
 * Every page on this site used to unfurl the identical card, which wasted the
 * one thing a person sees in a Slack thread before deciding whether to open it.
 * This one names the competitor, because that is the only fact that matters at
 * that size.
 *
 * `alt` is a single static string rather than a per-competitor one. It could be
 * per-competitor via `generateImageMetadata`, but that hook is called during
 * page-data collection with no route params, so every id came back `undefined`
 * and the build failed with "id property is required for every item returned
 * from generateImageMetadata" — an error a long way from its cause. The alt
 * text is read by someone who cannot see the card; naming the category is the
 * job, and the competitor is already in the page title beside it.
 */
export const alt = "chatform compared with another form builder, side by side";
export const size = shareCardSize;
export const contentType = shareCardContentType;

export function generateStaticParams() {
  return COMPARISONS.map((entry) => ({ comparison: entry.slug }));
}

export default async function Image({ params }: { params: Promise<{ comparison: string }> }) {
  const { comparison } = await params;
  const entry = getComparison(comparison);
  if (!entry) notFound();

  return renderShareCard({
    headline: `A ${entry.competitor} alternative.`,
    kicker: entry.lede,
  });
}
