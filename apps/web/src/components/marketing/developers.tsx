import { KeyRound, Radio, ScrollText } from "lucide-react";
import { Band, BandTitle, BandLede } from "./band";
import { CodeTabs } from "./code-tabs";

/**
 * The dark band, and the only one on the page. After five bands of cream and
 * pastel it lands as a change of register rather than another tint — which is
 * what a developer section should feel like anyway.
 *
 * The three facts that used to sit in `MetricBand` as a hero-metric strip live
 * here now. "330+ Cloudflare cities" is meaningless above the fold and load
 * bearing next to a curl command, which is the whole argument against the
 * big-number strip: those numbers were never headline material, they were
 * captions looking for the right paragraph.
 */

const POINTS = [
  {
    icon: KeyRound,
    title: "Scoped API keys",
    body: "sk_live_ keys, hashed at rest, shown once, revocable, last-used tracked.",
  },
  {
    icon: Radio,
    title: "Streamed or synchronous",
    body: "SSE for the hosted form. One request and one reply for your backend.",
  },
  {
    icon: ScrollText,
    title: "An OpenAPI spec you can generate from",
    body: "At /openapi.json. Our own web client is generated from it, so it cannot go stale.",
  },
] as const;

const FACTS = ["4 ways to embed", "330+ Cloudflare cities", "2–5s typical agent turn"] as const;

export function Developers() {
  return (
    <Band id="developers" tone="ink" size="tall">
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
        <div>
          <BandTitle>Every form is an API.</BandTitle>
          <BandLede tone="ink">
            Drive the conversation from your own backend, or drop it in with one script
            tag. Same runtime either way.
          </BandLede>

          <ul className="mt-9 flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg"
                  style={{
                    background: "var(--primary)",
                    color: "var(--primary-foreground)",
                  }}
                >
                  <p.icon className="size-4" strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-h3">{p.title}</h3>
                  <p className="text-body mt-1 leading-relaxed opacity-65">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>

          <ul className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-2">
            {FACTS.map((fact) => (
              <li key={fact} className="text-caption tabular opacity-55">
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 [&_pre]:text-foreground dark:[&_pre]:text-foreground">
          <CodeTabs />
        </div>
      </div>
    </Band>
  );
}
