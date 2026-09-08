import { ArrowUp, Check, Link2, Sparkles } from "lucide-react";

/**
 * What "describe it and it builds it" actually looks like.
 *
 * Static, and deliberately so. A live generator on the landing page would be a
 * model call on first paint for every crawler and every bounce, and the thing
 * being demonstrated takes several seconds — the honest version of that is a
 * spinner, which sells nothing. This is the finished state, drawn: the prompt
 * somebody typed, and the questions that came back with their real family
 * colours.
 *
 * The questions are the ones this prompt genuinely produces: a name, a work
 * email, a team size, a budget band. Nothing here claims a question type the
 * builder does not have — every `tone` below is a real family and every label
 * is a question you can actually make.
 *
 * It takes props now, with the landing page's values as the defaults. The
 * use-case guides each show *their own* form being drafted — a booking form on
 * the booking page, a testimonial form on the testimonial page — because a
 * reader who came looking for one specific thing should see that thing, not a
 * design agency's onboarding. Same component, same rules: every `tone` must be
 * a real family and every question must be one the builder can actually make.
 */

/** A family key, so the tint matches what the builder would draw. */
export type DraftedTone = "content" | "text" | "contact" | "number" | "choice" | "scale" | "advanced";

export interface DraftedQuestion {
  label: string;
  /** The type as the builder names it — "Short text", "Rating", "Date". */
  type: string;
  tone: DraftedTone;
}

export interface AiBuildPreviewProps {
  /** What was typed into the prompt bar. */
  prompt?: string;
  /** The page it read first, if the story includes one. Omit to hide the row. */
  readUrl?: string;
  readPages?: number;
  questions?: readonly DraftedQuestion[];
}

/** Real families, so the tinting matches what the builder would draw. */
const DRAFTED = [
  { label: "What should I call you?", type: "Short text", tone: "text" },
  { label: "Work email", type: "Email", tone: "contact" },
  { label: "How big is your team?", type: "Number", tone: "number" },
  { label: "Rough budget?", type: "Single select", tone: "choice" },
] as const;

export function AiBuildPreview({
  prompt = "Onboarding for a design agency",
  /**
   * No default. It used to be `"northwind.co"`, which meant every use-case
   * guide that did not mention reading a website inherited one anyway — the
   * hair salon guide claimed the builder had read six pages of a design
   * agency's site. A default that is wrong wherever it is not overridden is a
   * default that should not exist.
   */
  readUrl,
  readPages = 6,
  questions = DRAFTED,
}: AiBuildPreviewProps = {}) {
  return (
    <div className="border-border/70 bg-background text-foreground overflow-hidden rounded-xl border shadow-sm">
      {/* The prompt bar, in the state just after you hit send. */}
      <div className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5">
        <Sparkles className="text-primary size-3.5 shrink-0" strokeWidth={2} />
        <p className="text-caption min-w-0 flex-1 truncate">{prompt}</p>
        <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md">
          <ArrowUp className="size-3.5" strokeWidth={2.5} />
        </span>
      </div>

      {/* The URL it read before drafting. This is the step people do not
          expect, so it gets its own line rather than being folded into the
          prompt. Hidden entirely when the story does not involve a site — a
          row saying "read nothing" would be worse than no row. */}
      {readUrl && (
        <div className="border-border/60 text-muted-foreground flex items-center gap-2 border-b px-3 py-2">
          <Link2 className="size-3 shrink-0" strokeWidth={2} />
          <p className="text-micro min-w-0 flex-1 truncate font-mono">
            read {readUrl} — {readPages} pages
          </p>
          <Check className="text-[var(--success)] size-3 shrink-0" strokeWidth={3} />
        </div>
      )}

      <div className="flex flex-col gap-1.5 p-3">
        <p className="text-micro text-muted-foreground mb-0.5 font-semibold tracking-[0.1em] uppercase">
          Drafted {questions.length} questions
        </p>
        {questions.map((q) => (
          <div
            key={q.label}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
            style={{ background: `var(--family-${q.tone}-soft)` }}
          >
            <span
              aria-hidden
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: `var(--family-${q.tone})` }}
            />
            <p
              className="text-caption min-w-0 flex-1 truncate font-medium"
              style={{ color: `var(--family-${q.tone}-ink)` }}
            >
              {q.label}
            </p>
            <p
              className="text-micro shrink-0 opacity-70"
              style={{ color: `var(--family-${q.tone}-ink)` }}
            >
              {q.type}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
