"use client";

import { useState } from "react";
import { McpMark } from "@/components/integrations/provider-logo";
import { Band } from "./band";
import { SectionLede, SectionTitle, TextLink } from "./kit";
import { cn } from "@/lib/utils";

/**
 * "Ask your data": the MCP connector, which lets Claude or ChatGPT read a
 * form's responses. The chat below is drawn in HTML and labelled as
 * illustrative; the numbers in it are made up for the picture and say so.
 */

const APPS = {
  claude: { label: "Claude", ground: "#1f1e1b", bubble: "#393733", accent: "#e8956f" },
  chatgpt: { label: "ChatGPT", ground: "#212121", bubble: "#303030", accent: "#ffffff" },
} as const;

const FUNNEL = [
  { label: "Views", value: 4210, width: 100 },
  { label: "Started", value: 1874, width: 62 },
  { label: "Completed", value: 1312, width: 44 },
];

const REASONS = [
  { label: "Pricing questions", share: 38, color: "#76adfa" },
  { label: "Booking a call", share: 27, color: "#f7a66f" },
  { label: "Support", share: 21, color: "#65c7a1" },
  { label: "Something else", share: 14, color: "#edcd6b" },
];

export function AskYourData() {
  const [app, setApp] = useState<keyof typeof APPS>("claude");
  const look = APPS[app];

  return (
    <Band id="ask-your-data" hairline>
      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <SectionTitle eyebrow="Talk to your responses" accent="See the bigger picture.">
            Ask your data.
          </SectionTitle>
          <SectionLede>
            Add chatform to Claude or ChatGPT with one link, then ask about your responses in plain words. Charts,
            summaries and takeaways, from the assistant you already use.
          </SectionLede>
          <div className="mt-7">
            <TextLink href="/docs/mcp">How the AI connector works</TextLink>
          </div>
        </div>
        <div className="lg:pt-10">
          <p className="font-display text-lg font-semibold">Start with a question.</p>
          {["Which question do people quit on most?", "Sum up what people asked about pricing this month."].map((q) => (
            <p key={q} className="font-hand text-primary-soft-foreground border-border/70 mt-4 border-t pt-4 text-[1.6rem] leading-tight">
              &ldquo;{q}&rdquo;
            </p>
          ))}
        </div>
      </div>

      <div
        className="mt-12 overflow-hidden rounded-2xl text-[#ecebe6] transition-colors duration-300"
        style={{ background: look.ground }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <McpMark className="size-4" />
            chatform connector
          </span>
          <div role="radiogroup" aria-label="Assistant" className="flex rounded-full bg-white/10 p-1 text-xs font-semibold">
            {(Object.keys(APPS) as (keyof typeof APPS)[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={app === k}
                onClick={() => setApp(k)}
                className={cn("rounded-full px-3 py-1 transition-colors", app === k ? "bg-white text-[#1b1a18]" : "text-white/70 hover:text-white")}
              >
                {APPS[k].label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6 px-5 py-8 sm:px-10">
          <div className="flex justify-end">
            <p className="max-w-md rounded-2xl px-4 py-2.5 text-[0.9375rem]" style={{ background: look.bubble }}>
              How is my contact form doing? Show me a chart and what to fix.
            </p>
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold">
              <McpMark className="size-3" />
              Used chatform
            </span>

            <div className="mt-5 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl bg-white/5 p-5">
                <p className="text-sm font-semibold">From visit to submit</p>
                <ul className="mt-4 space-y-3">
                  {FUNNEL.map((f) => (
                    <li key={f.label}>
                      <div className="flex justify-between text-xs text-white/70">
                        <span>{f.label}</span>
                        <span className="tabular">{f.value.toLocaleString("en-US")}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${f.width}%`, background: look.accent }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-3xl font-semibold tracking-tight">
                  70%<span className="ml-2 text-sm font-normal text-white/70">of starters finish</span>
                </p>
              </div>

              <div className="rounded-xl bg-white/5 p-5">
                <p className="text-sm font-semibold">Why people got in touch</p>
                <ul className="mt-4 space-y-3">
                  {REASONS.map((r) => (
                    <li key={r.label} className="text-xs">
                      <div className="flex justify-between text-white/70">
                        <span>{r.label}</span>
                        <span className="tabular">{r.share}%</span>
                      </div>
                      <div className="mt-1.5 h-2.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${r.share * 2.4}%`, background: r.color }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <ol className="mt-6 space-y-2 text-[0.9375rem] text-white/85">
              <li>1. Most people who leave do it at the budget question. Try making it optional.</li>
              <li>2. Pricing comes up in a third of chats. Add your price list to the knowledge base.</li>
              <li>3. Weekday mornings bring the most replies, so post the link then.</li>
            </ol>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-center text-xs">Illustrative. Your assistant answers from your own responses.</p>
    </Band>
  );
}
