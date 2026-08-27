import { Link2, QrCode, Code2 } from "lucide-react";
import { Reveal } from "./reveal";
import { FlowPreview } from "./flow-preview";

/**
 * Three steps, each showing the surface it describes rather than a numbered
 * circle. The generated question list is the real output shape of
 * `POST /api/ai/generate-form`: blocks, endings and branch rules.
 */

const GENERATED = [
  { label: "What should I call you?", tone: "text" },
  { label: "Work email", tone: "contact" },
  { label: "How big is your team?", tone: "number" },
  { label: "What are you replacing?", tone: "choice" },
] as const;

export function HowItWorks() {
  return (
    <section id="product" className="scroll-mt-20 px-6 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal className="max-w-2xl">
          <p className="text-primary text-micro mb-3 font-semibold tracking-[0.14em] uppercase">
            How it works
          </p>
          <h2 className="text-display-lg text-balance">
            Describe it, shape it, share it.
          </h2>
        </Reveal>

        <ol className="mt-12 grid gap-4 lg:grid-cols-3">
          <Step
            n="01"
            title="Describe it"
            body="One sentence in. A whole form out — questions, options, branches and endings, checked by the linter and retried until it passes."
            delay={0}
          >
            <div className="border-border/70 bg-background rounded-xl border p-3">
              <p className="text-micro text-muted-foreground border-border/60 bg-muted/50 rounded-lg border px-2.5 py-2">
                &ldquo;Qualify inbound leads and book demos for teams over 50&rdquo;
              </p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {GENERATED.map((g) => (
                  <li
                    key={g.label}
                    className="text-micro flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                    style={{
                      background: `var(--family-${g.tone}-soft)`,
                      color: `var(--family-${g.tone}-ink)`,
                    }}
                  >
                    <span className="size-1.5 rounded-full bg-current opacity-60" />
                    {g.label}
                  </li>
                ))}
              </ul>
            </div>
          </Step>

          <Step
            n="02"
            title="Shape it"
            body="Drag questions onto the canvas and draw the conditions between them. Publish is blocked if a path can never be reached."
            delay={0.06}
          >
            <div className="border-border/70 bg-background rounded-xl border p-2">
              <FlowPreview />
            </div>
          </Step>

          <Step
            n="03"
            title="Share it"
            body="A link, a QR code you can download, or four kinds of embed — popup, side tab, inline and full page."
            delay={0.12}
          >
            <div className="border-border/70 bg-background flex flex-col gap-2 rounded-xl border p-3">
              {[
                { icon: Link2, label: "chatform.dev/f/team-onboarding" },
                { icon: QrCode, label: "Downloadable QR, generated locally" },
                { icon: Code2, label: "<script src=\"…/embed.js\" data-mode=\"side-tab\">" },
              ].map((row) => (
                <div
                  key={row.label}
                  className="border-border/60 flex items-center gap-2.5 rounded-lg border px-2.5 py-2"
                >
                  <row.icon className="text-primary size-3.5 shrink-0" strokeWidth={1.75} />
                  <span className="text-micro text-muted-foreground truncate font-mono">
                    {row.label}
                  </span>
                </div>
              ))}
            </div>
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  body,
  children,
  delay,
}: {
  n: string;
  title: string;
  body: string;
  children: React.ReactNode;
  delay: number;
}) {
  return (
    <Reveal as="li" delay={delay}>
      <div className="bg-card border-border/70 shadow-xs flex h-full flex-col rounded-2xl border p-6">
        <p className="text-micro text-primary font-display font-bold tracking-[0.18em]">{n}</p>
        <h3 className="text-h2 mt-2">{title}</h3>
        <p className="text-body text-muted-foreground mt-2 leading-relaxed">{body}</p>
        <div className="mt-5 flex-1">{children}</div>
      </div>
    </Reveal>
  );
}
