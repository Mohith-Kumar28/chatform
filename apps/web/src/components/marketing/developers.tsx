import { KeyRound, Radio, ScrollText } from "lucide-react";
import { CodeTabs } from "./code-tabs";
import { Reveal } from "./reveal";

const POINTS = [
  {
    icon: KeyRound,
    title: "Scoped API keys",
    body: "sk_live_ keys, hashed at rest, shown once, revocable, with last-used tracking.",
  },
  {
    icon: Radio,
    title: "Streamed or synchronous",
    body: "The hosted form streams over SSE. The headless API answers in one request, so your backend does not need an event loop.",
  },
  {
    icon: ScrollText,
    title: "An OpenAPI spec you can generate from",
    body: "Published at /openapi.json with browsable docs. Our own web client is generated from it, so it cannot quietly go stale.",
  },
] as const;

export function Developers() {
  return (
    <section
      id="developers"
      className="bg-foreground text-background dark:bg-card dark:text-foreground scroll-mt-20 px-6 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
          <div>
            <Reveal>
              <p className="text-primary text-micro mb-3 font-semibold tracking-[0.14em] uppercase">
                Developers
              </p>
              <h2 className="text-display-lg text-balance">Every form is an API.</h2>
              <p className="text-body-lg mt-4 text-balance opacity-70">
                Drive the whole conversation from your own backend, or drop it into a page with
                one script tag. Both routes hit the same runtime — there is no cut-down version.
              </p>
            </Reveal>

            <ul className="mt-8 flex flex-col gap-5">
              {POINTS.map((p, i) => (
                <Reveal as="li" key={p.title} delay={i * 0.06} className="flex gap-3.5">
                  <span className="bg-primary/15 text-primary mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
                    <p.icon className="size-4" strokeWidth={1.75} />
                  </span>
                  <div>
                    <h3 className="text-h3">{p.title}</h3>
                    <p className="text-body mt-1 leading-relaxed opacity-70">{p.body}</p>
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>

          <Reveal delay={0.1} className="min-w-0">
            <div className="[&_pre]:text-foreground dark:[&_pre]:text-foreground">
              <CodeTabs />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
