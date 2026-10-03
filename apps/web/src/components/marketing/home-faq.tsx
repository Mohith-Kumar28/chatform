import { Plus } from "lucide-react";
import { PLANS } from "@repo/entitlements";
import { Band } from "./band";
import { SectionTitle, TextLink } from "./kit";

/**
 * Five questions, the ones somebody asks before signing up. The long FAQ is on
 * /pricing. Every answer is checkable against the plans and the product.
 */
const free = PLANS.free.limits;

export const HOME_FAQ = [
  {
    q: "Is it really free?",
    a: `Yes. The free plan has unlimited submissions, up to ${free.forms_count} forms and ${free.ai_conversations_per_month} AI conversations a month, with no card and no time limit. When the AI conversations run out, your forms keep working and simply ask your questions as written.`,
  },
  {
    q: "What can I make with it?",
    a: "Contact and lead forms, intake and onboarding, surveys, feedback and NPS, quizzes, registrations and applications. Start from a sentence, a template or a form you already have.",
  },
  {
    q: "Can I bring my existing forms?",
    a: "Yes. Paste a Typeform, Google Forms, Tally, Jotform or Youform link, or any web page with a form on it, and the questions and logic come across.",
  },
  {
    q: "Will it work on my website?",
    a: "Yes. Share the link, embed it in a page, add a popup button, or put a QR code on a poster. It works with any site builder that lets you paste a snippet.",
  },
  {
    q: "What if I need more?",
    a: "Pro adds verification, partial submissions, follow-up emails, payments, your own fonts and logo, and removes our branding. Every limit is on the pricing page.",
  },
];

export function HomeFaq() {
  return (
    <Band id="faq" hairline>
      <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
        <div>
          <SectionTitle eyebrow="Good questions">Glad you asked.</SectionTitle>
          <div className="mt-6">
            <TextLink href="/contact">Something else on your mind? Ask us</TextLink>
          </div>
        </div>
        <div className="divide-border/70 border-border/70 divide-y border-y">
          {HOME_FAQ.map((item) => (
            <details key={item.q} className="group py-1">
              <summary className="font-display flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="text-muted-foreground size-5 shrink-0 transition-transform duration-200 group-open:rotate-45" />
              </summary>
              <p className="text-muted-foreground animate-message-in pb-5 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Band>
  );
}
