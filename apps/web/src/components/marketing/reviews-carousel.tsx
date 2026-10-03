"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { REVIEWS } from "@/content/social-proof";
import { Band } from "./band";
import { SectionTitle } from "./kit";
import { Stars } from "./social-proof";
import { cn } from "@/lib/utils";

/**
 * Reviews, three to a view on a desktop, one on a phone. Native scroll-snap
 * does the sliding, so a swipe works without any of this script; the arrows
 * and dots only scroll the track.
 */
export function ReviewsCarousel() {
  const track = useRef<HTMLUListElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setPages(Math.max(1, Math.round(el.scrollWidth / el.clientWidth)));
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  if (REVIEWS.length === 0) return null;

  const go = (to: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(pages - 1, to)) * el.clientWidth, behavior: "smooth" });
  };

  return (
    <Band id="reviews" hairline>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionTitle eyebrow="Good forms, happy people" accent="from the people asking.">
          Hear it
        </SectionTitle>
        <div className="flex gap-2">
          <button type="button" onClick={() => go(page - 1)} aria-label="Previous reviews" className="border-border hover:bg-primary-soft grid size-11 place-items-center rounded-full border transition-colors">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(page + 1)} aria-label="Next reviews" className="border-border hover:bg-primary-soft grid size-11 place-items-center rounded-full border transition-colors">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </div>

      <ul ref={track} onScroll={measure} className="mt-10 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2 [scrollbar-width:none]">
        {REVIEWS.map((r) => (
          <li key={r.name + r.title} className="bg-card border-border flex w-full shrink-0 snap-start flex-col rounded-[18px] border p-8 sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]">
            <Stars count={r.stars} />
            <h3 className="font-display mt-5 text-lg font-semibold">{r.title}</h3>
            <p className="text-muted-foreground mt-3 flex-1 leading-relaxed">{r.quote}</p>
            <p className="mt-6 text-sm">
              <span className="block font-semibold">{r.name}</span>
              <span className="text-muted-foreground">{r.role}</span>
            </p>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Reviews page ${i + 1}`}
              aria-current={i === page}
              className={cn("size-2.5 rounded-full transition-colors", i === page ? "bg-foreground" : "bg-foreground/20")}
            />
          ))}
        </div>
      )}
    </Band>
  );
}
