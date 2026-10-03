"use client";

import { useEffect, useRef, useState } from "react";
import { Band } from "./band";
import { PrimaryCta, SectionLede, SectionTitle, Split, TextLink } from "./kit";

const PROMPT =
  "A client intake form for my interior design studio. Ask about the space, the budget and the timeline, and if they have photos, ask them to upload a few.";

/**
 * The prompt types itself the first time the card is on screen, the way you
 * would type it. Without script, or with reduced motion, the whole sentence is
 * just there.
 */
function TypedPrompt() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let timer = 0;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        let n = 0;
        setShown(0);
        timer = window.setInterval(() => {
          n += 1;
          setShown(n);
          if (n >= PROMPT.length) window.clearInterval(timer);
        }, 28);
      },
      { rootMargin: "0px 0px -20% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const typing = shown !== null && shown < PROMPT.length;

  return (
    <p ref={ref} className="font-hand text-primary-soft-foreground relative mt-5 text-[clamp(1.6rem,1.2rem+1.1vw,2.1rem)] leading-[1.15]">
      {/* The full sentence holds the height, so typing never moves the page. */}
      <span aria-hidden className="invisible">&ldquo;{PROMPT}&rdquo;</span>
      <span className="absolute inset-0">
        &ldquo;{shown === null ? PROMPT : PROMPT.slice(0, shown)}
        {typing ? <span className="animate-caret">|</span> : <>&rdquo;</>}
      </span>
    </p>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className={className}>
      <path d="M24 3c1.3 11 5 15.7 17 17-12 1.3-15.7 6-17 17-1.3-11-5-15.7-17-17 12-1.3 15.7-6 17-17z" fill="var(--primary)" stroke="var(--on-primary)" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function AiBuilderSection() {
  return (
    <Band id="ai-builder" hairline>
      <Split cols="lg:grid-cols-2">
        <div>
          <SectionTitle eyebrow="Meet your AI form builder" accent="AI builds it.">
            Describe your form.
          </SectionTitle>
          <SectionLede>
            Write a sentence, paste your website, or drop in an old form. You get the questions, the wording, the order
            and the branching, ready to edit and publish.
          </SectionLede>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <PrimaryCta>Build a form with AI</PrimaryCta>
            <TextLink href="/ai-form-builder">How the AI builder works</TextLink>
          </div>
        </div>

        <div className="relative rounded-[18px] border border-[color-mix(in_oklch,var(--primary)_22%,transparent)] bg-[color-mix(in_oklch,var(--primary-soft)_70%,var(--card))] p-8 sm:p-12">
          <Sparkle className="absolute -top-7 -right-5 size-16 rotate-12" />
          <p className="text-primary-soft-foreground text-xs font-bold tracking-[0.09em] uppercase">It starts with a sentence</p>
          <TypedPrompt />
          <ol className="border-primary/15 mt-8 grid grid-cols-3 gap-3 border-t pt-6 text-sm font-semibold">
            {["Describe it", "Make it yours", "Share it"].map((step, i) => (
              <li key={step} className="flex items-center gap-2">
                <span className="bg-card text-foreground grid size-6 shrink-0 place-items-center rounded-full text-xs shadow-xs">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </Split>
    </Band>
  );
}
