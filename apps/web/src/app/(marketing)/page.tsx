import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Workflow, BarChart3, Code2, Sparkles, ShieldCheck } from "lucide-react";

const FEATURES = [
  { icon: MessageCircle, title: "Interviews, not forms", body: "An AI host greets every respondent, asks questions one at a time, validates answers and adapts — like a great interviewer would." },
  { icon: Workflow, title: "Branching logic", body: "Visual flow editor with conditional jumps, variables and scores. Design paths without writing a line." },
  { icon: Sparkles, title: "Generate with AI", body: "Describe the form you need in one sentence. Get a complete, lint-checked, publish-ready form in seconds." },
  { icon: BarChart3, title: "See every conversation", body: "Completion rates, drop-off per question, partial responses and the full chat transcript of every submission." },
  { icon: Code2, title: "Headless developer API", body: "API keys, a synchronous chat endpoint and an embeddable widget — build your own UI on top of ours." },
  { icon: ShieldCheck, title: "Yours, branded", body: "Custom themes, your logo, remove our badge on Pro. Hosted on Cloudflare's global edge." },
];

export default function Home() {
  return (
    <main className="min-h-svh">
      {/* nav */}
      <header className="bg-background/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="bg-primary flex size-7 items-center justify-center rounded-lg text-sm font-bold text-white">c</span>
            <span className="font-display font-semibold">chatform</span>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/templates">Templates</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link href="/signin">Start free</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden px-6 py-24 text-center">
        <div className="bg-primary/5 pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl">
          <Badge variant="secondary" className="rounded-full px-4 py-1.5">
            <Sparkles className="mr-1 size-3" /> Powered by AI · free forever plan
          </Badge>
          <h1 className="font-display mt-6 text-5xl font-semibold tracking-tight text-balance sm:text-7xl">
            Forms that talk back.
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg text-balance">
            chatform turns boring forms into AI interviews. Higher completion rates, richer answers,
            zero friction — with a dashboard your team will actually enjoy.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full px-8">
              <Link href="/signin">Start free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-8">
              <Link href="/f/test-waitlist">Try a live form →</Link>
            </Button>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">No credit card · unlimited forms · 100 free responses/mo</p>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="border-transparent bg-[var(--muted)]/50 shadow-none transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="bg-primary/10 text-primary mb-3 flex size-10 items-center justify-center rounded-xl">
                  <f.icon className="size-5" />
                </div>
                <h3 className="font-display text-base font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="border-y bg-[var(--muted)]/40 px-6 py-20">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Three steps. That&apos;s it.</h2>
          <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
            {[
              { n: "1", t: "Describe it", d: "Type what you need — the AI builds the whole form, logic included." },
              { n: "2", t: "Make it yours", d: "Tune questions in the builder, theme it, flip branching on the flow canvas." },
              { n: "3", t: "Share & watch", d: "Send a link or embed it anywhere. Watch conversations land in real time." },
            ].map((s) => (
              <div key={s.n}>
                <div className="bg-primary mx-auto flex size-10 items-center justify-center rounded-full font-display text-base font-bold text-white">
                  {s.n}
                </div>
                <h3 className="font-display mt-3 text-base font-semibold">{s.t}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-24 text-center">
        <h2 className="font-display text-4xl font-semibold tracking-tight">Ready to stop collecting forms and start having conversations?</h2>
        <Button asChild size="lg" className="mt-8 rounded-full px-8">
          <Link href="/signin">Create your first form — free</Link>
        </Button>
      </section>

      <footer className="text-muted-foreground border-t px-6 py-8 text-center text-xs">
        chatform — built on Cloudflare Workers, D1 and Durable Objects.
      </footer>
    </main>
  );
}
