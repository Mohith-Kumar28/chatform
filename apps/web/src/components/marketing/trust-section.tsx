import { Band } from "./band";
import { SectionLede, SectionTitle, Split, TextLink } from "./kit";

/**
 * Verification, teams and data: three plain articles, no cards, the way the
 * quieter end of Youform's page reads.
 */
const ARTICLES = [
  {
    title: "Email, phone and Google verification",
    body: "Ask people to confirm who they are before they answer: a code by email, a code by SMS, or Google sign-in.",
  },
  {
    title: "Workspaces and team roles",
    body: "Keep forms in workspaces and invite your team as admins, editors or viewers.",
  },
  {
    title: "Your data stays yours",
    body: "Read, filter and export your responses whenever you like, and delete any of them at any time. Your answers are never used to train an AI model.",
  },
];

export function TrustSection() {
  return (
    <Band id="trust">
      <Split cols="lg:grid-cols-[0.9fr_1.1fr]" className="items-start">
        <div>
          <SectionTitle accent="Work together.">Verify contacts.</SectionTitle>
          <SectionLede>For the forms where it matters who answered, and who on your team can see it.</SectionLede>
          <div className="mt-7">
            <TextLink href="/pricing">Find the right plan</TextLink>
          </div>
        </div>
        <div className="divide-border/70 divide-y">
          {ARTICLES.map((a) => (
            <article key={a.title} className="py-6 first:pt-0 last:pb-0">
              <h3 className="font-display text-xl font-semibold tracking-tight">
                {a.title}
              </h3>
              <p className="text-muted-foreground mt-2 leading-relaxed">{a.body}</p>
            </article>
          ))}
        </div>
      </Split>
    </Band>
  );
}
