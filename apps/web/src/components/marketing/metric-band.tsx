import { Reveal } from "./reveal";

/**
 * What sits where a logo wall normally goes.
 *
 * We have no customers to name, and inventing a "trusted by" strip is the one
 * thing a landing page must never do. Four true numbers instead — each one
 * checkable against the codebase.
 */
const METRICS = [
  { value: "26", label: "question types" },
  { value: "2–5s", label: "typical agent turn" },
  { value: "4", label: "ways to embed" },
  { value: "330+", label: "Cloudflare cities" },
] as const;

export function MetricBand() {
  return (
    <section className="border-border/60 border-y px-6 py-10">
      <dl className="mx-auto grid max-w-5xl grid-cols-2 gap-8 sm:grid-cols-4">
        {METRICS.map((m, i) => (
          <Reveal key={m.label} delay={i * 0.06} className="text-center">
            <dt className="text-display font-display tabular">{m.value}</dt>
            <dd className="text-caption text-muted-foreground mt-1">{m.label}</dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
