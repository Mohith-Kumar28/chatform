"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Band } from "./band";
import { PrimaryCta, SectionLede, SectionTitle, TextLink } from "./kit";
import { cn } from "@/lib/utils";

/**
 * "Ask your data": the MCP connector, which lets Claude or ChatGPT read a
 * form's responses. The conversation below is drawn in HTML, the way each
 * assistant shows a connector at work (the tool call, then the answer), and
 * labelled as illustrative; the numbers in it are made up for the picture.
 */

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="#D97757">
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function ChatGptLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  );
}

const APPS = {
  claude: { label: "Claude", Logo: ClaudeLogo, ground: "#262624", panel: "#30302e", bubble: "#141413", accent: "#d97757", font: "ui-serif, Georgia, serif" },
  chatgpt: { label: "ChatGPT", Logo: ChatGptLogo, ground: "#212121", panel: "#2a2a2a", bubble: "#303030", accent: "#ffffff", font: "inherit" },
} as const;

function Bars({ rows, accent }: { rows: { label: string; value: string; width: number; color?: string; strong?: boolean }[]; accent: string }) {
  return (
    <ul className="mt-4 space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="text-xs">
          <div className={cn("flex justify-between gap-4", r.strong ? "font-semibold text-white" : "text-white/70")}>
            <span>{r.label}</span>
            <span className="tabular">{r.value}</span>
          </div>
          <div className="mt-1.5 h-2.5 rounded-full bg-white/10">
            <div className="h-full rounded-full" style={{ width: `${r.width}%`, background: r.color ?? accent }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, children, panel }: { title: string; children: React.ReactNode; panel: string }) {
  return (
    <div className="rounded-xl p-5" style={{ background: panel, fontFamily: "var(--font-sans, inherit)" }}>
      <p className="text-sm font-semibold">{title}</p>
      {children}
    </div>
  );
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SLOTS = ["Morning", "Midday", "Evening", "Night"];
/* Replies per slot, 0 to 4, for the picture. */
const HEAT = [
  [4, 4, 3, 4, 3, 1, 1],
  [2, 3, 3, 2, 2, 1, 0],
  [2, 2, 1, 2, 1, 2, 2],
  [0, 1, 0, 0, 1, 1, 0],
];

type Look = (typeof APPS)[keyof typeof APPS];

const ASKS: { q: string; tool: string; intro: string; body: (look: Look) => React.ReactNode; takeaways: string[] }[] = [
  {
    q: "How is my contact form doing? Show me a chart and what to fix.",
    tool: "get_form_analytics",
    intro: "Here is your contact form over the last 30 days.",
    body: (look) => (
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="From visit to submit" panel={look.panel}>
          <Bars
            accent={look.accent}
            rows={[
              { label: "Views", value: "4,210", width: 100 },
              { label: "Started", value: "1,874", width: 62 },
              { label: "Completed", value: "1,312", width: 44 },
            ]}
          />
          <p className="mt-5 text-3xl font-semibold tracking-tight">
            70%<span className="ml-2 text-sm font-normal text-white/70">of starters finish</span>
          </p>
        </Card>
        <Card title="Why people got in touch" panel={look.panel}>
          <Bars
            accent={look.accent}
            rows={[
              { label: "Pricing questions", value: "38%", width: 91, color: "#76adfa" },
              { label: "Booking a call", value: "27%", width: 65, color: "#f7a66f" },
              { label: "Support", value: "21%", width: 50, color: "#65c7a1" },
              { label: "Something else", value: "14%", width: 34, color: "#edcd6b" },
            ]}
          />
        </Card>
      </div>
    ),
    takeaways: [
      "Most people who leave do it at the budget question. Try making it optional.",
      "Pricing comes up in a third of chats. Add your price list to the knowledge base.",
    ],
  },
  {
    q: "Which question do people quit on most?",
    tool: "get_question_dropoff",
    intro: "The budget question. Nearly one in five people who reach it stop there.",
    body: (look) => (
      <Card title="People who left, by question" panel={look.panel}>
        <Bars
          accent="rgb(255 255 255 / 0.35)"
          rows={[
            { label: "1. What should I call you?", value: "2%", width: 10 },
            { label: "2. Work email", value: "4%", width: 20 },
            { label: "3. How big is your team?", value: "3%", width: 15 },
            { label: "4. Rough monthly budget?", value: "19%", width: 95, color: look.accent === "#ffffff" ? "#f7a66f" : look.accent, strong: true },
            { label: "5. When do you want to start?", value: "5%", width: 25 },
          ]}
        />
      </Card>
    ),
    takeaways: [
      "Offer ranges to pick from instead of a number to type.",
      "Or move it after the timeline question, once they have said they are serious.",
    ],
  },
  {
    q: "Sum up what people asked about pricing this month.",
    tool: "search_responses",
    intro: "214 conversations mentioned pricing. Three things came up again and again.",
    body: (look) => (
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { n: "96", theme: "Is there a free plan?", quote: "can I try it before paying anything" },
          { n: "71", theme: "Price per seat or per team?", quote: "we're 12 people, is that 12 licences" },
          { n: "47", theme: "Discount for paying yearly?", quote: "do you do annual billing" },
        ].map((t) => (
          <Card key={t.theme} title={t.theme} panel={look.panel}>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {t.n}
              <span className="ml-2 text-sm font-normal text-white/70">people</span>
            </p>
            <p className="mt-3 border-l-2 border-white/20 pl-3 text-xs text-white/70 italic">&ldquo;{t.quote}&rdquo;</p>
          </Card>
        ))}
      </div>
    ),
    takeaways: ["Put the free plan and the per-seat price in the knowledge base, so the form answers these itself."],
  },
  {
    q: "When do most replies come in?",
    tool: "get_form_analytics",
    intro: "Weekday mornings, by a wide margin. Weekends are quiet until the evening.",
    body: (look) => (
      <Card title="Replies by day and time" panel={look.panel}>
        <div className="mt-4 grid grid-cols-[auto_repeat(7,1fr)] items-center gap-1.5 text-[0.6875rem] text-white/60">
          <span />
          {DAYS.map((d) => (
            <span key={d} className="text-center">
              {d}
            </span>
          ))}
          {SLOTS.map((slot, r) => (
            <div key={slot} className="contents">
              <span className="pr-2">{slot}</span>
              {HEAT[r]!.map((v, c) => (
                <span
                  key={c}
                  className="h-7 rounded-md"
                  style={{ background: look.accent === "#ffffff" ? "#76adfa" : look.accent, opacity: 0.12 + v * 0.22 }}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>
    ),
    takeaways: ["Post the link on a weekday before 10am.", "Send follow-up emails in the morning too."],
  },
  {
    q: "Do people on phones finish as often as people on computers?",
    tool: "get_form_analytics",
    intro: "More often, in fact. Half your visitors are on a phone, and they finish at a higher rate.",
    body: (look) => (
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { device: "Phone", rate: 74, started: "937 started", time: "2m 10s to finish" },
          { device: "Computer", rate: 66, started: "937 started", time: "3m 05s to finish" },
        ].map((d) => (
          <Card key={d.device} title={d.device} panel={look.panel}>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {d.rate}%<span className="ml-2 text-sm font-normal text-white/70">finish</span>
            </p>
            <div className="mt-3 h-2.5 rounded-full bg-white/10">
              <div className="h-full rounded-full" style={{ width: `${d.rate}%`, background: look.accent === "#ffffff" ? "#65c7a1" : look.accent }} />
            </div>
            <p className="mt-3 text-xs text-white/70">
              {d.started} · {d.time}
            </p>
          </Card>
        ))}
      </div>
    ),
    takeaways: ["Keep sharing it where people are on their phones.", "On computers, the file upload question is where most people stop."],
  },
];

export function AskYourData() {
  const [app, setApp] = useState<keyof typeof APPS>("claude");
  const [pick, setPick] = useState(0);
  const look = APPS[app];
  const ask = ASKS[pick]!;

  return (
    <Band id="ask-your-data">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <SectionTitle eyebrow="Talk to your responses" accent="See the bigger picture.">
            Ask your data.
          </SectionTitle>
          <SectionLede>
            Add chatform to Claude or ChatGPT with one link, then ask about your responses in plain words. Charts,
            summaries and takeaways, from the assistant you already use.
          </SectionLede>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <PrimaryCta href="/docs/mcp">Connect your AI assistant</PrimaryCta>
            <TextLink href="/docs/mcp">Explore the MCP</TextLink>
          </div>
        </div>
        <div className="lg:pt-10">
          <p className="font-display text-lg font-semibold">Pick a question.</p>
          <div className="mt-4 flex flex-col items-start gap-2.5">
            {ASKS.map((a, i) => (
              <button
                key={a.q}
                type="button"
                aria-pressed={pick === i}
                onClick={() => setPick(i)}
                className={cn(
                  "font-hand flex items-center gap-3 rounded-2xl border px-4 py-2 text-left text-[1.4rem] leading-tight transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98]",
                  pick === i
                    ? "bg-primary-soft text-primary-soft-foreground border-primary shadow-[0_3px_0_color-mix(in_oklch,var(--primary)_35%,transparent)]"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-card",
                )}
              >
                {/* The dot says which question the answer below belongs to. */}
                <span
                  aria-hidden
                  className={cn(
                    "size-2.5 shrink-0 rounded-full border-2 transition-[background-color,border-color,transform] duration-150 ease-out",
                    pick === i ? "bg-primary border-primary scale-110" : "border-border",
                  )}
                />
                <span>&ldquo;{a.q}&rdquo;</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-12 overflow-hidden rounded-2xl text-[#ecebe6] transition-colors duration-300" style={{ background: look.ground }}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <div role="radiogroup" aria-label="Assistant" className="flex gap-2 text-sm font-semibold">
            {(Object.keys(APPS) as (keyof typeof APPS)[]).map((k) => {
              const { Logo, label } = APPS[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={app === k}
                  onClick={() => setApp(k)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3.5 py-1.5 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                    app === k ? "bg-white text-[#1b1a18]" : "bg-white/10 text-white/75 hover:bg-white/15 hover:text-white",
                  )}
                >
                  <Logo className="size-4" />
                  {label}
                </button>
              );
            })}
          </div>
          <span className="flex items-center gap-2 text-xs font-medium text-white/70">
            <span className="size-1.5 rounded-full bg-[#65c7a1]" />
            <LogoMark className="size-4" />
            chatform connected (MCP)
          </span>
        </div>

        <div className="space-y-6 px-5 py-8 sm:px-10">
          <div className="flex justify-end">
            <p className="max-w-md rounded-2xl px-4 py-2.5 text-[0.9375rem]" style={{ background: look.bubble }}>
              {ask.q}
            </p>
          </div>

          <div key={`${app}-${pick}`} className="animate-message-in flex gap-3.5">
            <look.Logo className="mt-0.5 size-6 shrink-0" />
            <div className="min-w-0 flex-1">
              {/* The tool call, the way the assistant shows a connector at work. */}
              <span className="inline-flex items-center gap-2 rounded-lg border border-white/12 px-2.5 py-1.5 text-xs text-white/70">
                <LogoMark className="size-4" />
                <span>
                  Used <span className="font-semibold text-white">chatform</span>
                </span>
                <span className="font-mono text-[0.6875rem] text-white/50 max-sm:hidden">{ask.tool}</span>
                <ChevronRight className="size-3.5 text-white/40" />
              </span>

              <p className="mt-4 text-[1.0625rem] leading-relaxed" style={{ fontFamily: look.font }}>
                {ask.intro}
              </p>
              <div className="mt-5">{ask.body(look)}</div>
              <p className="mt-6 text-sm font-semibold" style={{ fontFamily: look.font }}>
                What I would change
              </p>
              <ul className="mt-2 space-y-1.5 text-[0.9375rem] leading-relaxed text-white/85" style={{ fontFamily: look.font }}>
                {ask.takeaways.map((t) => (
                  <li key={t} className="flex gap-2.5">
                    <span className="mt-[0.6em] size-1 shrink-0 rounded-full bg-white/50" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <p className="text-muted-foreground mt-3 text-center text-xs">Illustrative. Your assistant answers from your own responses.</p>
    </Band>
  );
}
