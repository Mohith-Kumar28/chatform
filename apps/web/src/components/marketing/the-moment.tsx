import { BookOpen, CornerDownLeft, Zap } from "lucide-react";
import { Band, BandTitle, BandLede } from "./band";
import { ChatDemo } from "./chat-demo";
import { MOMENT_SCRIPT } from "./chat-demo-scripts";

/**
 * The differentiator, given the loudest band on the page.
 *
 * This exchange is the acceptance test for the whole product thesis — the
 * respondent interrupts with a question of their own, the agent answers it out
 * of the creator's knowledge base and returns to the question it was asking,
 * inside a single turn. A form can only ask.
 *
 * Which is why the copy here got cut hardest. The old version explained that
 * three times: a two-sentence lede, three callouts of two-to-three sentences
 * each, and then a closing paragraph that restated the heading in different
 * words. The demo already proves it in four bubbles. Everything else is now
 * one line per point — a caption on the evidence rather than a substitute for
 * looking at it.
 */

const CALLOUTS = [
  {
    icon: BookOpen,
    title: "Quotes your knowledge base",
    body: "Twenty entries you write. It quotes you, not the internet.",
  },
  {
    icon: CornerDownLeft,
    title: "Never loses its place",
    body: "The state machine still owns the form. Nothing gets skipped or reordered.",
  },
  {
    icon: Zap,
    title: "One turn, both jobs",
    body: "Records the answer and replies to the question in the same breath.",
  },
] as const;

export function TheMoment() {
  return (
    <Band id="the-moment" tone="scale" size="tall">
      <div className="max-w-2xl">
        <BandTitle>It answers their questions, too.</BandTitle>
        <BandLede tone="scale">
          Watch the respondent stop answering and start asking.
        </BandLede>
      </div>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:gap-14">
        <ChatDemo script={MOMENT_SCRIPT} variant="feature" label="Recording" />

        <ul className="flex flex-col gap-7">
          {CALLOUTS.map((c) => (
            <li key={c.title} className="flex gap-4">
              {/* Orange on violet: the mark's two hues, doing the same job here
                  that they do in the logo. */}
              <span className="bg-primary text-primary-foreground mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl">
                <c.icon className="size-4.5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-h3">{c.title}</h3>
                <p
                  className="text-body mt-1 leading-relaxed"
                  style={{ color: "var(--family-scale-band-muted)" }}
                >
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
}
