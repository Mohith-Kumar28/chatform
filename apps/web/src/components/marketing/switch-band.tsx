import Link from "next/link";
import { Band, BandTitle, BandLede } from "./band";
import { ImportWidget } from "@/components/import/import-widget";
import { IMPORT_PAGES } from "@/content/import-sources";

/**
 * "Already using something else?" The importer, on the home page.
 *
 * A visitor with a form elsewhere does not have to imagine theirs as a
 * conversation: they paste the link and talk to it, before any account.
 */
export function SwitchBand() {
  return (
    <Band id="import" tone="sand">
      <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <p className="text-caption text-muted-foreground">Already using something else?</p>
          <BandTitle className="mt-3">Switch in one paste.</BandTitle>
          <BandLede tone="sand">
            Paste a Typeform, Google Forms or Tally link and talk to your own form as a conversation. No account needed to try it.
          </BandLede>
          <p className="text-muted-foreground mt-5 text-sm">
            {IMPORT_PAGES.map((p, i) => (
              <span key={p.slug}>
                {i > 0 && " · "}
                <Link href={`/import/${p.slug}`} className="hover:text-foreground underline-offset-2 hover:underline">
                  {p.name} to chatform
                </Link>
              </span>
            ))}
          </p>
        </div>
        <ImportWidget />
      </div>
    </Band>
  );
}
