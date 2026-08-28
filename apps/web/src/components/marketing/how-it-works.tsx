import { Link2, QrCode, Code2 } from "lucide-react";
import { Band, BandTitle } from "./band";
import { FlowPreview } from "./flow-preview";

/**
 * Three beats, each showing the surface it names rather than describing it.
 *
 * The numbers are gone. "01 / 02 / 03" over three side-by-side cards labels a
 * sequence the layout already states, and the heading states it a third time —
 * three tellings of an ordering nobody was going to get wrong. Each beat also
 * lost a sentence: the body is one line, because the picture under it is the
 * real explanation and a paragraph competing with a picture loses.
 *
 * The generated question list is the real output shape of
 * `POST /api/ai/generate-form`: blocks, endings and branch rules.
 */

const GENERATED = [
  { label: "What should I call you?", tone: "text" },
  { label: "Work email", tone: "contact" },
  { label: "How big is your team?", tone: "number" },
  { label: "What are you replacing?", tone: "choice" },
] as const;

const SHARE = [
  { icon: Link2, label: "chatform.in/f/team-onboarding" },
  { icon: QrCode, label: "Downloadable QR, generated locally" },
  { icon: Code2, label: '<script src="…/embed.js" data-mode="side-tab">' },
] as const;

export function HowItWorks() {
  return (
    <Band id="product">
      <BandTitle className="max-w-3xl">Describe it. Shape it. Share it.</BandTitle>

      <ol className="mt-12 grid gap-4 lg:grid-cols-3">
        <Beat tone="content" title="Describe it" body="One sentence in. A whole form out.">
          <Panel>
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
          </Panel>
        </Beat>

        <Beat
          tone="number"
          title="Shape it"
          body="Drag the questions, draw the conditions between them."
        >
          <Panel className="p-2">
            <FlowPreview />
          </Panel>
        </Beat>

        <Beat
          tone="contact"
          title="Share it"
          body="A link, a QR code, or four kinds of embed."
        >
          <Panel className="flex flex-col gap-2">
            {SHARE.map((row) => (
              <div
                key={row.label}
                className="border-border/60 flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2"
              >
                <row.icon className="text-primary size-3.5 shrink-0" strokeWidth={2} />
                <span className="text-micro text-muted-foreground truncate font-mono">
                  {row.label}
                </span>
              </div>
            ))}
          </Panel>
        </Beat>
      </ol>
    </Band>
  );
}

/** The graphics are product surfaces, so they sit on the page colour rather than
    on the tile's tint — a chat panel tinted pink is not what the builder looks
    like, and the point of drawing these is that they match. */
function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "border-border/70 bg-background rounded-xl border p-3",
        className ?? "",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Beat({
  tone,
  title,
  body,
  children,
}: {
  tone: "content" | "number" | "contact";
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <li
      style={{ background: `var(--family-${tone}-band)` }}
      className="flex h-full min-w-0 flex-col rounded-2xl p-6"
    >
      <h3 className="text-h1 font-bold tracking-[-0.02em]">{title}</h3>
      <p
        className="text-body mt-1.5 leading-relaxed"
        style={{ color: `var(--family-${tone}-band-muted)` }}
      >
        {body}
      </p>
      <div className="mt-5 flex-1">{children}</div>
    </li>
  );
}
