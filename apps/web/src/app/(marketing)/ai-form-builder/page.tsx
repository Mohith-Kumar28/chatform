import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLANS } from "@repo/entitlements";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { ChatDemo } from "@/components/marketing/chat-demo";
import { CtaBand } from "@/components/marketing/cta-band";
import { UseCaseFigure } from "@/components/marketing/use-case-figure";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { getUseCase } from "@/content/use-cases";
import { breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

/**
 * "AI form builder", on a page of its own.
 *
 * The home page does not use the phrase in its headline, deliberately: in this
 * market it means the AI that writes a form from a prompt, which chatform does
 * and which is the least distinctive thing it does (see the positioning note
 * in memory and docs/KEYWORD-RESEARCH.md). This page takes the search anyway
 * and makes the home page's argument from the other side — drafting is table
 * stakes; what matters is that the AI keeps working once the form is live.
 *
 * Aimed first at the winnable long tail ("AI form that asks follow-up
 * questions"), not the head term, which Jotform, Typeform and Fillout hold.
 * Every limit on the page is read from `@repo/entitlements`, so it cannot
 * drift from what the product enforces.
 */

const PATH = "/ai-form-builder";
const TITLE = "AI Form Builder That Asks Follow-Up Questions | chatform";
const DESCRIPTION =
  "Describe a form or paste your site's URL. chatform's AI drafts it, then runs it as a conversation, asking follow-ups when an answer is thin. Free plan.";

const free = PLANS.free.limits;
const pro = PLANS.pro.limits;

const FAQ = [
  {
    question: "Is chatform's AI form builder free?",
    answer: `Yes. The free plan includes ${free.ai_generations_per_month} AI drafts a month, ${free.ai_conversations_per_month} AI-run conversations a month, up to ${free.forms_count} forms and unlimited responses under a fair-use ceiling of ${free.responses_ceiling_per_month?.toLocaleString()} a month. Pro raises that to ${pro.ai_generations_per_month} drafts and ${pro.ai_conversations_per_month?.toLocaleString()} conversations for $16 a month billed yearly.`,
  },
  {
    question: "Can an AI form ask follow-up questions?",
    answer:
      "chatform's can. It reads each free-text answer as it arrives, and when one is too vague to use — \"growth\", \"n/a\", a single word to an open question — it asks a follow-up and records the reply as the answer. Follow-ups are capped per question, and choice, scale and consent answers are matched exactly and never sent to a model.",
  },
  {
    question: "Can it build a form from my website?",
    answer:
      "Yes. Paste the URL of your site or the page the form will live on, and it reads the page to draft questions in your own vocabulary — the services you actually list, the words your customers use.",
  },
  {
    question: "Can it build a survey or a quiz?",
    answer:
      "Yes. Describe it and it drafts the questions, answer options and branching; scoring and variables are available for quizzes. There are also free survey and quiz templates to start from.",
  },
  {
    question: "Is my data used to train AI?",
    answer:
      "No. Answers are stored for you to read, filter and export, and are never used to train an AI model — ours or anyone's.",
  },
];

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  ...canonical(PATH),
  openGraph: { ...openGraphBase(PATH), title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function AiFormBuilderPage() {
  const example = getUseCase("contact-form-alternative");

  return (
    <>
      <JsonLd
        nodes={[
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "AI form builder", path: PATH },
          ]),
          faqPageLd(FAQ),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <p className="text-caption text-muted-foreground">AI form builder</p>
          <BandTitle as="h1" className="mt-3">
            An AI form builder that keeps working after you publish.
          </BandTitle>
          <BandLede className="max-w-2xl">
            Every AI form builder writes the form. chatform then runs it as a conversation: it
            reads each answer, asks a follow-up when one is too thin to use, and answers the
            respondent&rsquo;s own questions before carrying on.
          </BandLede>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" shape="pill" className="h-12 px-8">
              <Link href="/signin">
                Build one free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" shape="pill" variant="outline" className="h-12 px-8">
              <Link href="/form-templates">Start from a template</Link>
            </Button>
          </div>
          <p className="text-caption text-muted-foreground mt-5">
            Free: {free.ai_generations_per_month} AI drafts and {free.ai_conversations_per_month} AI
            conversations a month · No card
          </p>
        </div>
      </Band>

      {/* The same form, twice: what the builder drafts, and what a respondent
          then experiences. The two real components the use-case guides use,
          fed from one guide, so the pair cannot disagree. */}
      {example && (
        <Band tone="sand" size="tall">
          <div className="max-w-2xl">
            <BandTitle>The same form, twice.</BandTitle>
            <BandLede tone="sand">
              On the left, what the AI drafts from one line and a link. On the right, what somebody
              filling it in actually gets.
            </BandLede>
          </div>
          <div className="mt-12 grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <div>
              <h2 className="text-h2 font-semibold">1. It drafts the form</h2>
              <p className="text-body text-muted-foreground mt-2 mb-6 leading-relaxed">
                Describe it in a sentence, or paste your website, and the questions, wording, order
                and branching are written for you to edit.
              </p>
              <UseCaseFigure figure="prompt" useCase={example} />
            </div>
            <div>
              <h2 className="text-h2 font-semibold">2. Then it runs it</h2>
              <p className="text-body text-muted-foreground mt-2 mb-6 leading-relaxed">
                One question at a time. A vague answer gets a follow-up; a question from the
                respondent gets an answer.
              </p>
              <ChatDemo script={example.demo} variant="feature" label="Playing" />
            </div>
          </div>
        </Band>
      )}

      <Band>
        <div className="max-w-2xl">
          <BandTitle>What the AI does once the form is live.</BandTitle>
          <BandLede>The part most AI form builders stop before.</BandLede>
        </div>
        <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          {[
            {
              term: "Follows up on thin answers",
              def: "It reads free-text answers and, when one is too vague to act on, asks one more question and records the reply. A low-confidence read becomes a follow-up rather than a guess, and follow-ups are capped per question so it never interrogates anyone.",
            },
            {
              term: "Answers the respondent's questions (Pro)",
              def: `Give it your documents, pages or notes — 3 knowledge sources on Free, up to ${pro.knowledge_sources_count} on Pro — and it answers mid-form, quoting you, then returns to the question it was on.`,
            },
            {
              term: "Accepts answers however they are typed",
              def: "Tap the fourth star or type \"four out of five\" — both land as the same valid answer, checked against the same rules a typed answer would face.",
            },
            {
              term: "Goes back for people who leave (Pro)",
              def: "Up to three reminders, worded differently, each linking back to the exact question they stopped on with their answers intact.",
            },
          ].map((item) => (
            <div key={item.term}>
              <dt className="text-h2 font-semibold">{item.term}</dt>
              <dd className="text-body text-muted-foreground mt-2 leading-relaxed">{item.def}</dd>
            </div>
          ))}
        </dl>
      </Band>

      <Band tone="sand">
        <div className="max-w-2xl">
          <BandTitle>What the AI is not allowed to do.</BandTitle>
          <BandLede tone="sand">Your form stays in charge, whatever the model says.</BandLede>
        </div>
        <ul className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {[
            {
              title: "Skip or reorder your questions",
              body: "A state machine owns the flow. The model can record an answer, answer from knowledge, clarify, skip where you allow it, request an upload or end — and each is checked before it takes effect.",
            },
            {
              title: "Interpret choices, scales or consent",
              body: "Those are matched exactly and never sent to a model. Only free text is interpreted.",
            },
            {
              title: "Reword you, if you say so",
              body: "One switch turns off rephrasing, and everyone is asked exactly what you typed — it still reads answers and follows up.",
            },
            {
              title: "Break the form when it misbehaves",
              body: "If it goes wrong a few times in a row, or the month's AI conversations run out, the form keeps collecting and asks your questions as written.",
            },
          ].map((item) => (
            <li key={item.title}>
              <h3 className="text-h2 font-semibold">{item.title}</h3>
              <p className="text-body text-muted-foreground mt-2 leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="text-body text-muted-foreground mt-10 max-w-2xl leading-relaxed">
          A draft is a first draft. Read it before you publish: the AI does not know your policies
          unless you tell it, and a two-field signup form is still better as a plain form than as a
          conversation. More on{" "}
          <Link href="/conversational-forms" className="text-primary underline underline-offset-4">
            when a conversational form is worth it
          </Link>
          .
        </p>
      </Band>

      <Band>
        <div className="max-w-2xl">
          <BandTitle>Drafting and conversation, compared.</BandTitle>
          <BandLede>
            Every tool here drafts forms with AI. What differs is what happens after.
          </BandLede>
        </div>
        <div className="border-border/70 mt-12 max-w-4xl overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">AI form builders compared on drafting and conversation</caption>
            <thead>
              <tr className="bg-muted/50">
                <th scope="col" className="text-caption px-5 py-3 font-semibold" />
                <th scope="col" className="text-caption px-4 py-3 font-semibold">Drafts forms with AI</th>
                <th scope="col" className="text-caption px-4 py-3 font-semibold">AI in the live form</th>
                <th scope="col" className="text-caption px-4 py-3 font-semibold">Free responses a month</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["chatform", "Yes", "Conversation with follow-ups, every plan", "Unlimited (fair use 10,000)"],
                ["Typeform", "Yes", "Follow-ups on open-text answers; full conversation is Formless, sold separately", "10"],
                ["Jotform", "Yes", "AI Agents hold a conversation, 100 free a month", "100"],
                ["Fillout", "Yes", "Not documented", "1,000"],
              ].map(([name, drafts, live, responses]) => (
                <tr key={name} className="border-border/50 border-t align-top">
                  <th scope="row" className="text-body px-5 py-3 font-medium">
                    {name}
                  </th>
                  <td className="text-body text-muted-foreground px-4 py-3">{drafts}</td>
                  <td className="text-body text-muted-foreground px-4 py-3">{live}</td>
                  <td className="text-body text-muted-foreground px-4 py-3">{responses}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-muted-foreground mt-4 max-w-4xl">
          Read from each vendor&rsquo;s own pages in September 2026. &ldquo;Not documented&rdquo;
          means we could not find it, not that it is confirmed absent. Full detail:{" "}
          <Link href="/typeform-alternative" className="text-primary underline underline-offset-4">
            vs Typeform
          </Link>
          ,{" "}
          <Link href="/jotform-alternative" className="text-primary underline underline-offset-4">
            vs Jotform
          </Link>
          ,{" "}
          <Link href="/fillout-alternative" className="text-primary underline underline-offset-4">
            vs Fillout
          </Link>
          .
        </p>
      </Band>

      <Band tone="content">
        <div className="max-w-2xl">
          <BandTitle>Questions about AI form builders.</BandTitle>
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-9 lg:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.question}>
              <h3 className="text-h2 font-semibold text-balance">{item.question}</h3>
              <p className="text-body mt-2.5 leading-relaxed" style={{ color: "var(--on-band-vivid-muted)" }}>
                {item.answer}
              </p>
            </div>
          ))}
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
