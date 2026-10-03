import { Bell } from "lucide-react";
import { PLANS } from "@repo/entitlements";
import { Band } from "./band";
import { Eyebrow } from "./band";
import { CheckItem, PrimaryCta } from "./kit";

/**
 * "Unlimited submissions. Free forever." in a contained orange panel, with
 * the infinity sign, a sticker and a notification slip as its picture.
 *
 * Says submissions and never forms: Free has unlimited responses but a form
 * count, and the number shown is read from the plan rather than typed.
 */
export function UnlimitedBand() {
  const free = PLANS.free;

  return (
    <Band id="unlimited">
      <div className="bg-primary-soft text-primary-soft-foreground relative grid items-center gap-10 overflow-hidden rounded-[18px] border border-[color-mix(in_oklch,var(--primary)_22%,transparent)] px-7 py-12 sm:px-14 sm:py-16 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative z-10">
          <Eyebrow className="text-primary-soft-foreground">No caps on what you collect</Eyebrow>
          <h2 className="font-display mt-4 text-[clamp(2.5rem,1.4rem+3.6vw,4rem)] leading-[1] font-bold tracking-[-0.045em]">
            Unlimited
            <br />
            submissions.
            <span className="font-hand text-primary block text-[1.12em] leading-[1.05] font-normal tracking-normal">Free forever.</span>
          </h2>
          <p className="mt-6 max-w-md text-[1.0625rem] leading-relaxed opacity-85">
            Responses are the whole point of a form, so the free plan keeps every one of them: no monthly cap on
            submissions, and no card to start.
          </p>
          <ul className="mt-7 grid gap-3 text-[0.9375rem] font-medium sm:grid-cols-2">
            <CheckItem>Unlimited submissions</CheckItem>
            <CheckItem>{free.limits.forms_count} forms on the free plan</CheckItem>
          </ul>
          <div className="mt-8">
            <PrimaryCta>Start collecting free</PrimaryCta>
          </div>
          <p className="mt-6 text-xs opacity-70">A fair-use limit applies to unusually high volume. Details on the pricing page.</p>
        </div>

        <div aria-hidden className="relative hidden h-80 lg:block">
          <span className="font-display text-primary/80 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[9deg] text-[18rem] leading-none font-bold">
            ∞
          </span>
          <span className="bg-brand-violet text-brand-violet-foreground absolute top-2 right-10 grid size-24 rotate-12 place-items-center rounded-full text-center text-[0.7rem] leading-tight font-extrabold tracking-wide uppercase shadow-md">
            No cap.
            <br />
            No card.
          </span>
          <div className="bg-card text-foreground absolute bottom-4 left-4 flex -rotate-[4deg] items-center gap-3 rounded-xl border px-4 py-3 shadow-[0_6px_0_color-mix(in_oklch,var(--primary)_18%,transparent)]">
            <span className="bg-primary-soft text-primary grid size-9 place-items-center rounded-full">
              <Bell className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Another response. Still free.</span>
              <span className="text-muted-foreground block text-xs">New submission · just now</span>
            </span>
          </div>
        </div>
      </div>
    </Band>
  );
}
