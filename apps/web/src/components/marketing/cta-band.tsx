import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "./reveal";

export function CtaBand() {
  return (
    <section className="px-6 py-24">
      <Reveal className="border-primary/25 bg-primary-soft relative mx-auto max-w-4xl overflow-hidden rounded-3xl border px-8 py-16 text-center">
        <div
          aria-hidden
          className="bg-primary/10 pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_50%_0%,black,transparent_70%)]"
        />
        <div className="relative">
          <h2 className="text-display-lg text-balance">
            Ask better questions. Get better answers.
          </h2>
          <p className="text-body-lg text-muted-foreground mx-auto mt-4 max-w-lg text-balance">
            Build your first interview in a couple of minutes. Unlimited responses and 200 AI
            conversations a month, free, with no card.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" shape="pill" className="px-8">
              <Link href="/signin">Start free</Link>
            </Button>
            <Button asChild size="lg" shape="pill" variant="outline" className="px-8">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
