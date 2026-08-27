import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatDemo } from "./chat-demo";
import { HERO_SCRIPT } from "./chat-demo-scripts";
import { Reveal } from "./reveal";

/**
 * `NEXT_PUBLIC_DEMO_FORM_SLUG` replaces the hardcoded `/f/test-waitlist` the
 * old hero pointed at — a seed row that may or may not exist in any given
 * environment. With no slug configured the button is simply not rendered,
 * rather than shipping a link to a 404.
 */
const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_FORM_SLUG;

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div
        aria-hidden
        className="bg-primary/8 pointer-events-none absolute inset-0 -top-32 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(var(--foreground)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_20%,black,transparent)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <Reveal>
            <span className="border-primary/25 bg-primary-soft text-primary text-micro inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium">
              <Sparkles className="size-3" strokeWidth={2} />
              Agentic forms · free forever plan
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="text-display-2xl mt-6 text-balance">
              The first form that <span className="text-primary">answers back</span>.
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="text-body-lg text-muted-foreground mt-6 max-w-xl text-balance">
              Every other builder renders fields and waits. chatform runs an interview — it
              asks, it listens, and when someone asks <em>you</em> a question mid-form, it
              answers from your knowledge base and picks up exactly where it left off.
            </p>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" shape="pill" className="px-7">
                <Link href="/signin">Start free</Link>
              </Button>
              <Button asChild size="lg" shape="pill" variant="outline" className="px-7">
                <Link href="#the-moment">
                  Watch it answer back
                  <ArrowRight className="size-4" strokeWidth={2} />
                </Link>
              </Button>
            </div>
          </Reveal>

          <Reveal delay={0.24}>
            <p className="text-caption text-muted-foreground mt-5">
              No card · unlimited responses · 200 AI conversations a month, free
              {DEMO_SLUG && (
                <>
                  {" · "}
                  <Link href={`/f/${DEMO_SLUG}`} className="hover:text-foreground underline underline-offset-4">
                    try a real one
                  </Link>
                </>
              )}
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <ChatDemo script={HERO_SCRIPT} variant="hero" />
        </Reveal>
      </div>
    </section>
  );
}
