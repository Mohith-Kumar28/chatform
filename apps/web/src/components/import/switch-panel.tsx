import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ImportSourcePage } from "@/content/import-sources";
import { cn } from "@/lib/utils";
import { ConvertField } from "./convert-field";
import type { ImportSource } from "./import-client";
import { SourceLogo } from "./source-logo";

/**
 * One builder's switch story: what you get, the converter, and the three
 * steps. Two halves like Youform's, the pitch on a tinted ground and the
 * steps on plain card, except the left half converts in place instead of
 * sending you to another page to paste the link.
 */
export function SwitchPanel({
  page,
  onDetect,
  headingLevel = "h3",
}: {
  page: ImportSourcePage;
  onDetect?: (source: ImportSource) => void;
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;
  const family = page.band.family;
  return (
    <div className="border-border bg-card grid overflow-hidden rounded-[1.75rem] border shadow-sm lg:grid-cols-[1.45fr_1fr]">
      <div
        className="relative p-6 sm:p-9"
        style={{ background: `var(--family-${family}-soft)` }}
      >
        <p
          className="flex items-center gap-2 text-xs font-semibold tracking-wide"
          style={{ color: `var(--family-${family}-ink)` }}
        >
          <SourceLogo source={page.source} className="text-foreground size-5" />
          {page.name}
          <ArrowRight className="size-3.5" aria-hidden />
          chatform
        </p>
        <Heading className="font-display mt-4 text-3xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-[2.6rem]">
          {page.band.title}
          <span className="font-hand block text-[1.15em] leading-[1.1] font-normal" style={{ color: `var(--family-${family}-ink)` }}>
            {page.band.accent}
          </span>
        </Heading>
        {/* Every builder's body is written to two lines at this width, and the
            floor holds them there, so switching tabs moves nothing below it.
            Foreground at a step down, not the muted grey, which went ashen on
            the tinted ground. */}
        <p className="text-foreground/75 mt-4 max-w-xl text-[0.95rem] leading-relaxed text-pretty sm:min-h-[3.25em]">
          {page.band.body}
        </p>
        <ConvertField source={page.source} onDetect={onDetect} className="mt-7 max-w-xl" />
        {/* No comparison page (a website) keeps the line empty, so the panel is no shorter. */}
        {page.band.compare ? (
          <Link
            href={page.band.compare}
            className="text-foreground/80 hover:text-foreground mt-2 inline-flex items-center gap-1.5 px-2 text-sm font-medium underline-offset-4 hover:underline"
          >
            chatform vs {page.name}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <span aria-hidden className="invisible mt-2 inline-flex items-center gap-1.5 px-2 text-sm font-medium">
            chatform
            <ArrowRight className="size-3.5" />
          </span>
        )}
      </div>

      <div className="flex flex-col p-6 sm:p-9">
        <p className="text-sm font-semibold">How to switch</p>
        <ol className="mt-5 flex-1">
          {page.band.steps.map((step, i) => (
            <li key={step} className={cn("flex gap-4 py-4 text-sm", i > 0 && "border-border border-t")}>
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums"
                style={{ background: `var(--family-${family}-soft)`, color: `var(--family-${family}-ink)` }}
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-muted-foreground border-border mt-4 border-t pt-4 text-xs leading-relaxed">
          Your original form keeps working. Responses stay where they are, so export them before you switch.
        </p>
      </div>
    </div>
  );
}
