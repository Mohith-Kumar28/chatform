import dynamic from "next/dynamic";
import { BookOpen, ShieldCheck, Target } from "lucide-react";
import { study } from "@/content/research";
import { Band } from "./band";
import { ArrowMark, HandNote } from "./annotate";
import { MOMENT_SCRIPT } from "./chat-demo-scripts";
import { FollowUpDemo, ThinAnswerDemo } from "./difference-demos";
import { InView } from "./in-view";
import { SectionLede, SectionTitle, TextLink } from "./kit";
import { LazySection } from "./lazy-section";

/**
 * Fetched only when someone scrolls near it: the typewriter demo is a 33 KB
 * chunk with its own render loop, several viewports below the fold.
 */
const ChatDemo = dynamic(() => import("./chat-demo").then((m) => m.ChatDemo));

/**
 * What chatform does that a page of boxes cannot, in one place: it asks again
 * when an answer is thin, it follows up with the people who leave, and it
 * answers a respondent's own question from what the owner gave it.
 *
 * These were three sections (the pillars, the knowledge-base demo, the agent
 * brief) that each made part of the same argument. The heading is the question
 * a visitor arrives with, and each card answers it against "other forms".
 *
 * What this must never grow: a recovery percentage. `content/research.ts` says
 * why at more length.
 */

const BRIEF = [
  { icon: BookOpen, title: "A knowledge base it quotes", body: "Your docs, pages and notes. Not the internet." },
  { icon: Target, title: "A goal and a voice", body: "Like “qualify the lead, then book a demo”." },
  { icon: ShieldCheck, title: "Guardrails", body: "Topics it won’t discuss, and how it declines." },
] as const;

function Source({ id }: { id: string }) {
  const s = study(id);
  return (
    <a href={s.url} rel="noopener" className="text-muted-foreground mt-4 inline-block text-xs underline underline-offset-4">
      {s.authors.split(" and ")[0]!.split(",")[0]} et al., {s.venue.split(",")[0]}, {s.year}
    </a>
  );
}

function Card({ tone, art, title, other, ours, source }: { tone: "text" | "choice"; art: React.ReactNode; title: string; other: string; ours: string; source: string }) {
  return (
    <article className="bg-card/60 border-border flex flex-col overflow-hidden rounded-[18px] border">
      <div className="min-h-[23rem] flex-1" style={{ background: `var(--family-${tone}-soft)` }}>
        {art}
      </div>
      <div className="p-7 sm:p-8">
        <h3 className="font-display text-xl font-semibold tracking-tight text-balance">{title}</h3>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          {other} <span className="text-foreground">{ours}</span>
        </p>
        <Source id={source} />
      </div>
    </article>
  );
}

export function HowItsDifferent() {
  return (
    <Band id="how-it-works" hairline>
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <SectionTitle eyebrow="Not another form builder" accent="from other forms?">
          How is this different
        </SectionTitle>
        <SectionLede className="max-w-xl">
          Other forms wait to be filled in. chatform asks again, follows up and answers back.
        </SectionLede>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-2">
        <Card
          tone="text"
          art={<ThinAnswerDemo />}
          title="It asks again when an answer is thin."
          other="Other forms record “it was bad” and move on."
          ours="chatform asks one more question, in plain words, and records the real answer."
          source="xiao-2020"
        />
        <Card
          tone="choice"
          art={<FollowUpDemo />}
          title="It follows up with the people who leave."
          other="Other forms lose them."
          ours="chatform emails them back to the question they stopped on, with their answers kept."
          source="sauermann-2013"
        />

        {/* The third answer, and the loudest: a respondent asks something back. */}
        <article
          className="grid gap-10 rounded-[18px] px-6 py-10 sm:px-10 sm:py-12 md:col-span-2 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14"
          style={{ background: "var(--brand-violet-band-vivid)", color: "var(--on-band-vivid)" }}
        >
          <div className="order-2 lg:order-1">
            {/* The fallback reserves the feature variant's exact height
                (`h-[22rem]` in `chat-demo.tsx`) so the swap shifts nothing. */}
            <LazySection fallback={<div className="h-[22rem]" aria-hidden />} rootMargin="400px">
              <ChatDemo script={MOMENT_SCRIPT} variant="feature" label="Recording" />
            </LazySection>
            <InView className="mt-3 flex items-start gap-2">
              <ArrowMark dir="up-left" positioned={false} draw delay={260} className="size-11 shrink-0 opacity-60" />
              <HandNote tilt={-3} className="cf-a-rise mt-5" style={{ color: "var(--on-band-vivid)", animationDelay: "700ms" }}>
                nobody scripted that answer
              </HandNote>
            </InView>
          </div>

          <div className="order-1 lg:order-2">
            <h3 className="font-display text-[1.75rem] leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-[2rem]">
              It answers their questions, too.
            </h3>
            <p className="mt-3 max-w-md leading-relaxed" style={{ color: "var(--on-band-vivid-muted)" }}>
              Other forms go quiet when someone is unsure. Brief chatform like a person, and it answers, then picks up
              where they were.
            </p>
            <ul className="mt-7 flex flex-col gap-5">
              {BRIEF.map((b) => (
                <li key={b.title} className="flex gap-3.5">
                  <span className="bg-primary text-primary-foreground mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                    <b.icon className="size-4" strokeWidth={2} />
                  </span>
                  <div>
                    <p className="font-semibold">{b.title}</p>
                    <p className="text-[0.9375rem] leading-snug" style={{ color: "var(--on-band-vivid-muted)" }}>
                      {b.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <TextLink href="/why-conversation-works" className="text-[var(--on-band-vivid)] decoration-[var(--on-band-vivid)]">
                Why a conversation works
              </TextLink>
            </div>
          </div>
        </article>
      </div>
    </Band>
  );
}
