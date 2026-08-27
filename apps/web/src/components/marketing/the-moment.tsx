import { BookOpen, CornerDownLeft, Zap } from "lucide-react";
import { ChatDemo } from "./chat-demo";
import { MOMENT_SCRIPT } from "./chat-demo-scripts";
import { Reveal } from "./reveal";

/**
 * The differentiator, given a whole band to itself.
 *
 * This exchange is the acceptance test for the entire product thesis — the
 * respondent interrupts with a question of their own, the agent answers it out
 * of the creator's knowledge base and returns to the question it was asking,
 * inside a single turn. A form can only ask.
 */
const CALLOUTS = [
  {
    icon: BookOpen,
    title: "Reads your knowledge base",
    body: "Up to 20 entries and 20,000 characters you write — pricing, policies, timelines. It quotes you, not the internet.",
  },
  {
    icon: CornerDownLeft,
    title: "Never loses its place",
    body: "The state machine still owns the form. Answering a question off to the side cannot skip, reorder or lose a question.",
  },
  {
    icon: Zap,
    title: "One turn, both jobs",
    body: "It records what was an answer and replies to what was a question in the same breath — not two round trips and a repeated greeting.",
  },
] as const;

export function TheMoment() {
  return (
    <section id="the-moment" className="bg-muted/40 scroll-mt-20 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="max-w-2xl">
          <p className="text-primary text-micro mb-3 font-semibold tracking-[0.14em] uppercase">
            The difference
          </p>
          <h2 className="text-display-lg text-balance">It answers their questions, too.</h2>
          <p className="text-body-lg text-muted-foreground mt-4 text-balance">
            People hesitate halfway through a form and there is nobody to ask. Here there is.
            Watch what happens when the respondent stops answering and starts asking.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-14">
          <Reveal>
            <ChatDemo script={MOMENT_SCRIPT} variant="feature" label="Recording" />
          </Reveal>

          <ul className="flex flex-col gap-6">
            {CALLOUTS.map((c, i) => (
              <Reveal as="li" key={c.title} delay={i * 0.06} className="flex gap-4">
                <span className="bg-primary-soft text-primary-soft-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl">
                  <c.icon className="size-4.5" strokeWidth={1.75} />
                </span>
                <div>
                  <h3 className="text-h3">{c.title}</h3>
                  <p className="text-body text-muted-foreground mt-1 leading-relaxed">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <Reveal delay={0.1}>
          <p className="text-body-lg text-muted-foreground mt-12 max-w-3xl text-balance">
            A form can only ask. An interviewer can answer — from a knowledge base you write,
            without ever losing its place in the conversation.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
