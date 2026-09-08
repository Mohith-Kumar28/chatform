/**
 * The transcript-first Results view, in miniature.
 *
 * This is the actual shape of `results-client.tsx`'s detail pane: the
 * conversation on the left, the values extracted out of it on the right. Every
 * other form tool can only ever show you the right-hand column.
 *
 * It takes props now, with the landing page's B2B example as the default. The
 * use-case guides each pass their own conversation, because a hospice
 * volunteer guide ending with a screenshot of somebody being qualified as a
 * software lead is the kind of detail that tells a reader the page was not
 * written for them.
 */

export interface ResultsTranscriptTurn {
  role: "bot" | "user";
  text: string;
}

export interface ResultsField {
  label: string;
  value: string;
  /** A question family, so the tint matches the builder. */
  tone: string;
}
const TRANSCRIPT = [
  { role: "bot", text: "How big is the team you're setting this up for?" },
  { role: "user", text: "we're about a dozen people right now" },
  { role: "bot", text: "Twelve — noted. What brings you to Northwind?" },
  { role: "user", text: "Replacing a tool" },
] as const;

const FIELDS = [
  { label: "Team size", value: "12", tone: "number" },
  { label: "Reason", value: "Replacing a tool", tone: "choice" },
  { label: "Email", value: "maya@northwind.co", tone: "contact" },
] as const;

export function ResultsPreview({
  transcript = TRANSCRIPT,
  fields = FIELDS,
  reference = "CF-4821",
}: {
  transcript?: readonly ResultsTranscriptTurn[];
  fields?: readonly ResultsField[];
  reference?: string;
} = {}) {
  return (
    <div className="border-border/70 bg-background text-foreground overflow-hidden rounded-xl border">
      <div className="border-border/60 flex items-center justify-between border-b px-3 py-2">
        <p className="text-micro font-medium">Response #{reference}</p>
        <span className="bg-success-soft text-success-soft-foreground text-micro rounded-full px-2 py-0.5 font-medium">
          Completed
        </span>
      </div>
      <div className="grid gap-0 sm:grid-cols-[1.35fr_1fr]">
        <div className="border-border/60 flex flex-col gap-1.5 p-3 sm:border-r">
          {transcript.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <p
                className={
                  m.role === "user"
                    ? "bg-primary text-primary-foreground text-micro max-w-[85%] rounded-lg rounded-br-sm px-2.5 py-1.5"
                    : "bg-muted text-micro max-w-[85%] rounded-lg rounded-bl-sm px-2.5 py-1.5"
                }
              >
                {m.text}
              </p>
            </div>
          ))}
        </div>
        <dl className="flex flex-col gap-2.5 p-3">
          {fields.map((f) => (
            <div key={f.label}>
              <dt
                className="text-micro font-medium"
                style={{ color: `var(--family-${f.tone}-ink)` }}
              >
                {f.label}
              </dt>
              <dd className="text-caption mt-0.5 font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
