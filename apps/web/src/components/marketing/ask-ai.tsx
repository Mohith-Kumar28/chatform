"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Band } from "./band";
import { SectionLede, SectionTitle } from "./kit";

/**
 * "Ask your favourite AI about chatform": four assistants, each opened with
 * the same question already typed. The question points them at /ai-info, the
 * page written for exactly this, so the answer starts from our own facts.
 */
const QUESTION =
  "What is chatform (chatform.in), and is it a good choice for conversational forms compared with Typeform, Tally and Google Forms? Read https://chatform.in/ai-info first, then give me an honest view of where it is strong and where it is not.";

const q = encodeURIComponent(QUESTION);

const ASSISTANTS = [
  { name: "ChatGPT", href: `https://chatgpt.com/?q=${q}`, ground: "#212121", ink: "#ffffff" },
  { name: "Claude", href: `https://claude.ai/new?q=${q}`, ground: "#d97757", ink: "#1f1e1b" },
  { name: "Perplexity", href: `https://www.perplexity.ai/search?q=${q}`, ground: "#20808d", ink: "#ffffff" },
  { name: "Google AI", href: `https://www.google.com/search?udm=50&q=${q}`, ground: "#1a73e8", ink: "#ffffff" },
];

export function AskAi() {
  const [copied, setCopied] = useState(false);

  return (
    <Band id="ask-ai" hairline size="tight">
      <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionTitle eyebrow="An outside opinion" accent="about chatform.">
            Ask your favourite AI
          </SectionTitle>
          <SectionLede>Do not take our word for it. Each button opens the assistant with the question already asked.</SectionLede>

          <details className="group mt-6 max-w-lg">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm font-semibold">What are we asking?</summary>
            <div className="mt-3">
              <textarea readOnly value={QUESTION} rows={4} className="bg-card border-border w-full resize-none rounded-xl border p-3 text-sm" />
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard?.writeText(QUESTION).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1600);
                  })
                }
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy question"}
              </button>
            </div>
          </details>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {ASSISTANTS.map((a) => (
            <a
              key={a.name}
              href={a.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: a.ground, color: a.ink }}
              className="flex h-16 items-center justify-center rounded-xl text-[0.9375rem] font-semibold shadow-[0_3px_0_oklch(0.25_0.02_65/0.16)] transition-transform hover:-translate-y-px motion-reduce:transform-none"
            >
              Ask {a.name}
            </a>
          ))}
        </div>
      </div>
    </Band>
  );
}
