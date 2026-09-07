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
 */

/** Real families, so the tinting matches what the builder would draw. */
const DRAFTED = [
  { label: "What should I call you?", type: "Short text", tone: "text" },
  { label: "Work email", type: "Email", tone: "contact" },
  { label: "How big is your team?", type: "Number", tone: "number" },
  { label: "Rough budget?", type: "Single select", tone: "choice" },
] as const;

export function AiBuildPreview() {
  return (
    <div className="border-border/70 bg-background text-foreground overflow-hidden rounded-xl border shadow-sm">
      {/* The prompt bar, in the state just after you hit send. */}
      <div className="border-border/60 flex items-center gap-2 border-b px-3 py-2.5">
        <Sparkles className="text-primary size-3.5 shrink-0" strokeWidth={2} />
        <p className="text-caption min-w-0 flex-1 truncate">
          Onboarding for a design agency
        </p>
        <span className="bg-primary text-primary-foreground grid size-6 shrink-0 place-items-center rounded-md">
          <ArrowUp className="size-3.5" strokeWidth={2.5} />
        </span>
      </div>

      {/* The URL it read before drafting. This is the step people do not
          expect, so it gets its own line rather than being folded into the
          prompt. */}
      <div className="border-border/60 text-muted-foreground flex items-center gap-2 border-b px-3 py-2">
        <Link2 className="size-3 shrink-0" strokeWidth={2} />
        <p className="text-micro min-w-0 flex-1 truncate font-mono">
          read northwind.co — 6 pages
        </p>
        <Check className="text-[var(--success)] size-3 shrink-0" strokeWidth={3} />
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        <p className="text-micro text-muted-foreground mb-0.5 font-semibold tracking-[0.1em] uppercase">
          Drafted 4 questions
        </p>
        {DRAFTED.map((q) => (
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
