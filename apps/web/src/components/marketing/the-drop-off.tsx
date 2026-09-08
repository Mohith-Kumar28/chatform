import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Band, BandTitle, BandLede } from "./band";
import { CostUpfront } from "./cost-upfront";
import { study } from "@/content/research";

/**
 * The band that earns the headline.
 *
 * The hero now makes a claim about *outcome* — people give up on long forms —
 * and a claim like that either gets evidence immediately or reads as the same
 * unsupported assertion every other form builder in this category opens with.
 * This is the evidence, three sentences of it, each one linked to a primary
 * source rather than to a vendor blog post.
 *
 * What it deliberately does not do is quote a completion-rate percentage.
 * There is no cross-customer conversion data in this product — analytics
 * computes completion rate and per-question drop-off for one form at a time,
 * for its own owner — so any industry number here would be invented or
 * borrowed from somebody who invented it. The honest version of the claim is
 * narrower and, read carefully, stronger.
 */
export function TheDropOff() {
  const baymard = study("baymard");
  const kim = study("kim-2019");
  const xiao = study("xiao-2020");

  return (
    <Band id="drop-off">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div>
          <BandTitle>A long form is a list of reasons to leave.</BandTitle>
          <BandLede>
            It shows someone the whole cost before they have answered anything.
          </BandLede>

          <ul className="mt-9 flex flex-col gap-5">
            {[
              {
                study: baymard,
                text: "22% of people who abandon a checkout say they left because it was too long or too complicated.",
              },
              {
                study: kim,
                text: "Asked through a chat interface, the same people gave more differentiated answers and were less likely to satisfice.",
              },
              {
                study: xiao,
                text: "An AI that follows up on a thin answer got significantly more informative and more specific ones.",
              },
            ].map((item) => (
              <li key={item.study.id} className="max-w-lg">
                <p className="text-body leading-relaxed">{item.text}</p>
                <p className="text-micro text-muted-foreground mt-1">
                  <a href={item.study.url} className="underline underline-offset-4" rel="noopener">
                    {item.study.venue}, {item.study.year}
                  </a>
                </p>
              </li>
            ))}
          </ul>

          <Link
            href="/why-conversation-works"
            className="text-caption text-primary group mt-8 inline-flex items-center gap-1.5 font-medium"
          >
            The research behind this, in full
            <ArrowRight className="size-4 transition-transform duration-[var(--duration-micro)] group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
          </Link>
        </div>

        <div className="flex justify-center">
          <CostUpfront />
        </div>
      </div>
    </Band>
  );
}
