import { Band } from "./band";
import { ProPill, SectionTitle, TextLink } from "./kit";

/**
 * Partial submissions, in a tinted panel: the story in three numbered beats.
 * Every answer is saved the moment it is given, so leaving halfway loses
 * nothing, and the follow-up sequence is how they come back.
 */
const BEATS = [
  {
    title: "A conversation starts",
    body: "Each answer is saved the moment it is given, not when somebody reaches the end.",
  },
  {
    title: "Life happens. Answers stay.",
    body: "If they close the tab at question six, you still see the first five, marked as partial.",
  },
  {
    title: "There is a way back",
    body: "Reopening the link offers to pick up where they left off, and a follow-up email can remind them.",
  },
];

export function PartialsSection() {
  return (
    <Band id="partials">
      <div className="grid gap-10 rounded-[18px] border border-[color-mix(in_oklch,var(--family-text)_24%,transparent)] bg-[var(--family-text-soft)] px-7 py-12 sm:px-12 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div>
          <SectionTitle
            eyebrow={
              <>
                Partial submissions <ProPill className="ml-1" />
              </>
            }
            accent="Even before they submit."
          >
            Keep every answer.
          </SectionTitle>
          <p className="mt-5 max-w-md text-[1.0625rem] leading-relaxed text-[var(--family-text-ink)]">
            Most people who leave a form had already told you something. chatform keeps it, so a half-finished response is
            still a lead.
          </p>
          <div className="mt-7">
            <TextLink href="/pricing">See what Pro includes</TextLink>
          </div>
        </div>

        <ol className="divide-y divide-[color-mix(in_oklch,var(--family-text)_22%,transparent)]">
          {BEATS.map((b, i) => (
            <li key={b.title} className="flex gap-5 py-5 first:pt-0 last:pb-0">
              <span className="font-display tabular w-11 shrink-0 text-3xl font-bold tracking-tight text-[var(--family-text-ink)] opacity-60">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-display text-lg font-semibold">{b.title}</h3>
                <p className="text-muted-foreground mt-1 leading-relaxed">{b.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Band>
  );
}
