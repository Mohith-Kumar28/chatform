import { ShieldCheck, Target, BookOpen } from "lucide-react";
import { study } from "@/content/research";
import { Band } from "./band";
import { AnswersBackDemo, FollowUpDemo, ThinAnswerDemo } from "./difference-demos";
import { SectionLede, SectionTitle, TextLink } from "./kit";

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
      <div className="min-h-[28rem] flex-1" style={{ background: `var(--family-${tone}-soft)` }}>
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
    <Band id="how-it-works">
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

        {/* The third answer, wide: a respondent asks something back. */}
        <article className="bg-card/60 border-border overflow-hidden rounded-[18px] border md:col-span-2 lg:grid lg:grid-cols-[1.25fr_1fr] lg:items-stretch">
          <div className="flex items-center justify-center bg-[var(--family-scale-soft)] px-5 py-8 sm:px-8">
            <AnswersBackDemo />
          </div>
          <div className="flex flex-col justify-center p-7 sm:p-10">
            <h3 className="font-display text-xl font-semibold tracking-tight text-balance">It answers their questions, too.</h3>
            <p className="text-muted-foreground mt-2 leading-relaxed">
              Other forms go quiet when someone is unsure.{" "}
              <span className="text-foreground">chatform answers from what you gave it, then picks up where they were.</span>
            </p>
            <ul className="mt-6 flex flex-col gap-4">
              {BRIEF.map((b) => (
                <li key={b.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--family-scale-soft)] text-[var(--family-scale-ink)]">
                    <b.icon className="size-4" strokeWidth={2} />
                  </span>
                  <div>
                    <p className="text-[0.9375rem] font-semibold">{b.title}</p>
                    <p className="text-muted-foreground text-[0.9375rem] leading-snug">{b.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-7">
              <TextLink href="/why-conversation-works">Why a conversation works</TextLink>
            </div>
          </div>
        </article>
      </div>
    </Band>
  );
}
