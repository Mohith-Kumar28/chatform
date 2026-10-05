import { Band, BandLede, BandTitle } from "@/components/marketing/band";
import { Prose } from "@/components/marketing/prose";

/**
 * The frame the privacy policy and the terms share.
 *
 * Plain on purpose: a heading, the date it last changed, and the text. `Prose` is the blog's
 * typography with the headings taken down a size, because a policy has twenty of them and an
 * essay has four.
 */
export function LegalPage({
  title,
  lede,
  updated,
  children,
}: {
  title: string;
  lede: string;
  /** The day the text last changed, written out. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <Band tone="paper">
      <div className="max-w-2xl">
        <BandTitle as="h1">{title}</BandTitle>
        <BandLede>{lede}</BandLede>
        <p className="text-caption text-muted-foreground mt-4">Last updated {updated}</p>
      </div>
      <Prose className="text-body mt-10 leading-[1.7] [&_h2]:text-h1 [&_h2]:mt-10 [&_h3]:text-h3 [&_h3]:mt-6">
        {children}
      </Prose>
    </Band>
  );
}
