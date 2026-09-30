"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Band } from "./band";
import { SwitchPanel } from "@/components/import/switch-panel";
import { SourceLogo } from "@/components/import/source-logo";
import type { ImportSource } from "@/components/import/import-client";
import { IMPORT_PAGES } from "@/content/import-sources";
import { cn } from "@/lib/utils";

/**
 * "Already using something else?" The importer, on the home page.
 *
 * Laid out after Youform's switch section, which is the clearest version of
 * this we found: a tab per builder with a one-line promise, then one panel
 * with the pitch and the steps. Ours converts inside the panel, so a visitor
 * with a form elsewhere talks to theirs as a conversation before any account.
 */
export function SwitchBand() {
  const [active, setActive] = useState<ImportSource>("typeform");
  const page = IMPORT_PAGES.find((p) => p.source === active)!;

  return (
    <Band id="import" size="tall">
      <div className="max-w-2xl">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.14em] uppercase">Already using something else?</p>
        <h2 className="font-display mt-4 text-4xl leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl">
          Switch to chatform.
          <span className="font-hand text-primary block text-[1.1em] leading-[1.05] font-normal">Bring your questions with you.</span>
        </h2>
        <p className="text-muted-foreground mt-5 max-w-xl text-lg leading-relaxed text-pretty">
          Paste a Typeform, Google Forms, Tally, Jotform or Youform link, or any page with a form on it. We copy the questions and the logic, and you can talk to it before you sign up.
        </p>
      </div>

      <div role="tablist" aria-label="Your current form builder" className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {IMPORT_PAGES.map((p) => {
          const selected = p.source === active;
          return (
            <button
              key={p.source}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="switch-panel"
              onClick={() => setActive(p.source)}
              className={cn(
                // Every state is a ring (box-shadow), never a border or a lift,
                // so picking a tab changes its colour and nothing moves.
                "bg-card flex items-center gap-3 rounded-2xl p-3.5 text-left ring-inset sm:p-4",
                "transition-shadow duration-[var(--duration-standard)] ease-[var(--ease-out)]",
                selected ? "ring-foreground ring-2" : "ring-border hover:ring-foreground/30 ring-1",
              )}
            >
              <SourceLogo source={p.source} className="text-foreground size-7 sm:size-8" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{p.name}</span>
                <span className="text-muted-foreground block text-xs leading-snug">{p.band.tagline}</span>
              </span>
              <Check className={cn("size-4 shrink-0 transition-opacity", selected ? "opacity-100" : "opacity-0")} aria-hidden />
            </button>
          );
        })}
      </div>

      <div id="switch-panel" role="tabpanel" aria-label={`${page.name} to chatform`} className="mt-4">
        {/* No `key`: pasting a Google Forms link under the Typeform tab moves the
            tab, and a remount there would wipe the link that moved it. */}
        <SwitchPanel page={page} onDetect={setActive} />
      </div>
    </Band>
  );
}
