import Link from "next/link";
import { GradientField } from "@/components/brand/gradient-field";
import { ArrowRight, GitBranch, MessageCircle, Share2, Sparkles } from "lucide-react";
import { GOALS, ROLES, byGoal, byRole, getTemplate, goalPath, rolePath, typePath, type TemplateType } from "@/content/templates";

/** Named examples for each kind, linked, so the advice points somewhere real. */
const KINDS: { type: TemplateType; title: string; body: string; examples: string[] }[] = [
  {
    type: "form",
    title: "A form, when you need details you will act on",
    body: "Requests, registrations, orders, applications and contact details. One person, one set of answers, and a clear next step for you once they arrive.",
    examples: ["contact-us", "client-intake", "job-application", "quote-request"],
  },
  {
    type: "survey",
    title: "A survey, when you want to understand many people",
    body: "Experiences, opinions and needs, asked the same way of everyone so the answers can be compared. Keep it short and ask why after every score.",
    examples: ["nps-survey", "csat-survey", "engagement-pulse", "product-market-fit"],
  },
  {
    type: "quiz",
    title: "A quiz, when each person should leave with a result",
    body: "A score, a recommendation or a type. Decide the result first, then write the questions that lead to it.",
    examples: ["geography-quiz", "personality-quiz", "product-recommendation-quiz", "trivia-quiz"],
  },
];

const FEATURES = [
  {
    icon: MessageCircle,
    title: "One question at a time",
    body: "Every template runs as a conversation, so people answer the way they would talk, and more of them reach the end.",
    href: "/conversational-forms",
    link: "Why conversation works",
  },
  {
    icon: GitBranch,
    title: "The right follow-up",
    body: "Branches send each answer to the question that fits it, and a vague answer gets a short follow-up from the AI.",
    href: "/why-conversation-works",
    link: "How follow-ups work",
  },
  {
    icon: Sparkles,
    title: "Or describe your own",
    body: "Nothing here quite right? Tell the AI form builder what you need and it drafts the whole form, branches included.",
    href: "/ai-form-builder",
    link: "Try the AI builder",
  },
  {
    icon: Share2,
    title: "Share it anywhere",
    body: "Send the link, embed it on your site, read the answers in your dashboard and export them to CSV.",
    href: "/pricing",
    link: "See what is included",
  },
];

/**
 * The gallery's long-form guide: how to pick a starting point, what to do once
 * you have one, what the product adds, and where to go next. Every part links
 * into the catalogue, so a reader (and a crawler) always has somewhere to go.
 */
export function GalleryGuide() {
  const goals = GOALS.filter((g) => byGoal(g.slug).length > 0);
  const roles = ROLES.filter((r) => byRole(r.slug).length > 0);

  return (
    <section id="template-guide" className="border-border/70 mt-20 scroll-mt-24 border-t pt-16">
      <div className="grid gap-10 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-14">
        <div>
          <div className="xl:sticky xl:top-8">
            <p className="text-primary text-xs font-bold tracking-[0.14em] uppercase">A little guidance</p>
            <p className="font-display text-foreground mt-2 text-2xl leading-snug font-semibold">Make the most of your next ask.</p>
          </div>
        </div>

        <div className="space-y-16">
          <p className="text-foreground/85 max-w-2xl text-[1.0625rem] leading-relaxed">
            Choose a free form, survey or quiz template for the job in front of you. Browse by goal, role or type, try the
            template as a respondent right on its page, then copy it into your account and change anything.
          </p>

          <div>
            <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">Choose the right starting point</h2>
            <div className="mt-6 grid max-w-2xl gap-5">
              {KINDS.map((k) => {
                const examples = k.examples.map((s) => getTemplate(s)).filter((t) => t !== undefined);
                return (
                  <div key={k.type} className="border-border/70 bg-card rounded-2xl border p-5">
                    <h3 className="font-display text-foreground text-lg leading-snug font-semibold">{k.title}</h3>
                    <p className="text-foreground/75 mt-2 text-[0.9375rem] leading-relaxed">{k.body}</p>
                    <ul className="mt-4 space-y-1.5 text-[0.9375rem]">
                      {examples.map((t) => (
                        <li key={t.slug}>
                          <Link prefetch={false} href={t.path} className="text-foreground hover:text-primary underline-offset-4 hover:underline">
                            {t.searchName}
                          </Link>
                        </li>
                      ))}
                    </ul>
                    <Link prefetch={false} href={typePath(k.type)} className="text-primary mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                      All {k.type === "quiz" ? "quizzes" : `${k.type}s`}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="max-w-2xl">
            <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">Make the answers useful</h2>
            <p className="text-foreground/85 mt-4 text-[1.0625rem] leading-relaxed">
              Start from the template closest to what you will do with the answers, then cut every question you would not act
              on. Keep the branches that save people from questions that do not apply to them, and say on the ending what
              happens next. Answer it yourself on a phone before you share it: if a question feels odd to you, it will feel odd
              to everyone you send it to.
            </p>
          </div>

          <div className="max-w-2xl">
            <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">How to customize and share a template</h2>
            <ol className="mt-5 space-y-4">
              {[
                "Open the template and try it as a respondent. Note what you would change.",
                "Press Use this template. It is copied into your account and opens in the builder, where every question, branch and ending can be edited.",
                "Publish it, then share the link, embed it on your site, and read the answers in your dashboard.",
              ].map((step, i) => (
                <li key={step} className="flex gap-4">
                  <span className="bg-foreground text-background grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold">{i + 1}</span>
                  <span className="text-foreground/85 pt-1 text-[1.0625rem] leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">Make it yours with chatform</h2>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <span className="bg-primary/10 text-primary grid size-10 shrink-0 place-items-center rounded-xl">
                    <f.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-foreground text-lg font-semibold">{f.title}</h3>
                    <p className="text-foreground/75 mt-1 text-[0.9375rem] leading-relaxed">{f.body}</p>
                    <Link prefetch={false} href={f.href} className="text-foreground hover:text-primary mt-2 inline-flex items-center gap-1 text-sm font-semibold">
                      {f.link}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight">Explore related templates</h2>
            <div className="mt-6 grid gap-8 sm:grid-cols-2">
              <div>
                <p className="text-foreground/60 text-xs font-semibold tracking-wide uppercase">By goal</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {goals.map((g) => (
                    <li key={g.slug}>
                      <Link prefetch={false} href={goalPath(g.slug)} className="border-border/80 hover:border-foreground/40 text-foreground inline-flex rounded-full border px-3 py-1 text-sm transition-colors">
                        {g.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-foreground/60 text-xs font-semibold tracking-wide uppercase">By role</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {roles.map((r) => (
                    <li key={r.slug}>
                      <Link prefetch={false} href={rolePath(r.slug)} className="border-border/80 hover:border-foreground/40 text-foreground inline-flex rounded-full border px-3 py-1 text-sm transition-colors">
                        {r.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-foreground text-background flex flex-col items-start gap-5 rounded-3xl p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div>
              <p className="font-display text-3xl font-semibold tracking-tight">A starting point. Make it your own.</p>
              <p className="text-background/75 mt-2">Pick a template, change anything, share it today. Free, with unlimited responses.</p>
            </div>
            <Link
              prefetch={false}
              href="/signin"
              className="relative isolate inline-flex h-12 shrink-0 items-center gap-2 overflow-hidden rounded-md px-6 font-semibold text-[var(--on-band-vivid)]"
            >
              <GradientField tier="vivid" size="160%" interactive={false} className="-z-10" />
              Create your free form
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
