import type { Metadata } from "next";
import Link from "next/link";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CostUpfront } from "@/components/marketing/cost-upfront";
import { CtaBand } from "@/components/marketing/cta-band";
import { JsonLd } from "@/components/seo/json-ld";
import { STUDIES, study } from "@/content/research";
import { articleLd, breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

const PATH = "/why-conversation-works";
const TITLE = "Why people finish a conversation and abandon a form";
const DESCRIPTION =
  "The research on conversational data collection, with sources: what actually changes when the same questions are asked in a conversation by something that reads the answers — and what does not.";

/**
 * Two dates, and they are both real.
 *
 * `Article` wants `datePublished`, and a page that quotes six studies is a page
 * whose date a reader is entitled to check. Hardcoded rather than derived from
 * a build timestamp: `new Date()` at build time would move the published date
 * on every unrelated deploy, which is exactly the signal the field is for.
 */
const PUBLISHED = "2026-09-08";

const FAQ = [
  {
    question: "Do conversational forms have a higher completion rate?",
    answer:
      "Nobody can honestly give you one number, and the ones circulating in this category mostly trace back to vendor marketing rather than to a study. What the peer-reviewed work does show is narrower and more useful: asking through a chat interface produces more differentiated answers and less satisficing (Kim, Lee and Gweon, CHI 2019), and an AI that probes thin answers produces significantly more informative and specific ones (Xiao et al., TOCHI 2020). Separately, Baymard Institute finds 22% of checkout abandonment is attributed to length and complexity. chatform reports completion rate and per-question drop-off for your own form; it does not claim an industry average.",
  },
  {
    question: "Why do people give short or fake answers to open-ended questions?",
    answer:
      "Because a text box asks for effort and offers nothing in return. Survey researchers call the shortcut satisficing — picking whatever answer ends the question fastest. Kim, Lee and Gweon found people did it measurably less through a chat interface than the same survey on the web, and Xiao et al. found that following up on a thin answer is what turns it into a usable one.",
  },
  {
    question: "Do people tell a machine more than they tell a person?",
    answer:
      "In at least one well-controlled setting, yes. Lucas, Gratch, King and Morency told participants the same virtual interviewer was either automated or operated by a human. Those who believed it was automated reported less fear of disclosing, showed less impression management, and were rated by observers as more willing to disclose.",
  },
  {
    question: "Do reminder emails for abandoned forms actually work?",
    answer:
      "Reminders do raise response — that part is well established in survey research, where the number of contacts is one of the strongest levers there is. What is not established is any of the recovery percentages this category quotes. Those measure conversion of emails sent, with no control group, which cannot separate a recovered person from one who was returning anyway. The finding worth acting on is Sauermann and Roach's: reminders that change their wording across a sequence raised the odds of a response by over 30% against reminders that repeated themselves. chatform sends at most three, worded differently, on a widening gap — and will hold a share of abandoners back and send them nothing, so the recovery number you read is a difference against a control rather than a count of clicks.",
  },
  {
    question: "Is a conversation always better than a form?",
    answer:
      "No. For a short, unambiguous form — three fields and a submit button — a conversation adds turns without adding information, and a plain form is the better interface. The research is about questions where interpretation matters: open-ended answers, ambiguous wording, anything where a one-word reply is a failure.",
  },
];

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · chatform` },
  description: DESCRIPTION,
  ...canonical(PATH),
  openGraph: { ...openGraphBase(PATH), type: "article", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function WhyConversationWorksPage() {
  const baymard = study("baymard");
  const kim = study("kim-2019");
  const xiao = study("xiao-2020");
  const lucas = study("lucas-2014");
  const schober = study("schober-1997");

  return (
    <>
      <JsonLd
        nodes={[
          articleLd({
            headline: TITLE,
            description: DESCRIPTION,
            path: PATH,
            datePublished: PUBLISHED,
          }),
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Why conversation works", path: PATH },
          ]),
          faqPageLd(FAQ),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">Nobody abandons question one.</BandTitle>
          <BandLede className="max-w-2xl">
            They abandon the sight of question twenty-five. Here is what the research says about
            asking the same things differently — and what it does not say.
          </BandLede>
        </div>

        {/*
          The quotable block.

          Short, self-contained sentences with the citation attached to each,
          set high on the page. Increasingly the reader of a page like this is a
          model answering somebody else's question, and what it can lift is a
          sentence that survives having its paragraph removed. Every one of
          these does, and none of them mentions chatform.
        */}
        <dl className="mt-14 grid gap-x-12 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {[baymard, kim, xiao].map((entry) => (
            <div key={entry.id}>
              <dt className="text-body leading-relaxed font-medium text-balance">{entry.finding}</dt>
              <dd className="text-micro text-muted-foreground mt-2.5">
                <a href={entry.url} className="underline underline-offset-4" rel="noopener">
                  {entry.authors.split(",")[0]!.split(" and ")[0]} et al., {entry.venue}, {entry.year}
                </a>
              </dd>
            </div>
          ))}
        </dl>
      </Band>

      <Band tone="sand">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          <div>
            <BandTitle>A form shows you the bill before you order.</BandTitle>
            <BandLede tone="sand">
              Twenty-five fields announce twenty-five fields. Twenty-five turns announce one.
            </BandLede>
            <p className="text-body mt-6 max-w-lg leading-relaxed">
              This is the part that needs no study to see. A form renders its full length on
              arrival, and the decision a visitor makes is not about any single question — it is
              about the whole visible stack. Baymard Institute&rsquo;s checkout research finds{" "}
              <a href={baymard.url} className="text-primary underline underline-offset-4" rel="noopener">
                22% of people who abandon a checkout say they left because it was too long or too
                complicated
              </a>{" "}
              — ahead of the several other reasons people usually assume come first.
            </p>
          </div>
          <div className="flex justify-center">
            <CostUpfront />
          </div>
        </div>
      </Band>

      <Band tone="brand" size="tall">
        <div className="max-w-2xl">
          <BandTitle>What the research actually found.</BandTitle>
          <BandLede tone="brand">
            Four papers, none of them ours, none of them about a form builder.
          </BandLede>
        </div>

        <ol className="mt-14 flex flex-col gap-12">
          {[kim, xiao, lucas, schober].map((entry, index) => (
            <li key={entry.id} className="grid gap-4 lg:grid-cols-[3rem_1fr] lg:gap-8">
              <span
                className="font-display text-display-lg font-bold tabular"
                style={{ color: "var(--on-band-vivid-muted)" }}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="max-w-3xl">
                <p className="text-body-lg leading-relaxed font-medium text-balance">{entry.finding}</p>
                {entry.method && (
                  <p
                    className="text-body mt-3 leading-relaxed"
                    style={{ color: "var(--on-band-vivid-muted)" }}
                  >
                    {entry.method}
                  </p>
                )}
                <p className="text-micro mt-3" style={{ color: "var(--on-band-vivid-muted)" }}>
                  <a href={entry.url} className="underline underline-offset-4" rel="noopener">
                    {entry.authors}. <cite className="not-italic">{entry.title}</cite>. {entry.venue},{" "}
                    {entry.year}.
                  </a>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Band>

      <Band>
        <div className="max-w-2xl">
          <BandTitle>So this is what it does.</BandTitle>
          <BandLede>
            Every behaviour below exists because of a finding above, not because it demoed well.
          </BandLede>
        </div>
        <dl className="mt-12 grid gap-x-12 gap-y-9 sm:grid-cols-2">
          {[
            {
              term: "It shows one question, not twenty-five",
              def: "The visible cost of answering is whatever is on screen. Nothing is hidden — the progress indicator is still there — but the decision to continue gets made in small pieces rather than once, at the door, about the whole thing.",
            },
            {
              term: "It follows up when an answer is thin",
              def: "Xiao et al. found probing is what turns a short open-ended answer into a usable one. A low-confidence read becomes a follow-up question rather than a recorded guess.",
            },
            {
              term: "It can explain what a question means",
              def: "Schober and Conrad found that letting an interviewer clarify sharply reduces error. Give it up to twenty knowledge entries and it answers from them, quoting you, then carries on exactly where it was.",
            },
            {
              term: "It is a machine, and says so",
              def: "Lucas et al. found people disclose more when they know they are talking to software. There is no invented persona pretending to be a colleague called Sarah.",
            },
            {
              term: "It never loses its place",
              def: "A state machine owns the flow, not the model. The model can record an answer, answer from knowledge, clarify, or skip — and every one of those is checked against the flow before it takes effect, so nothing gets reordered or dropped while it is being helpful.",
            },
            {
              term: "It shows you where people left",
              def: "Completion rate, per-question answer rate and drop-off, and median time to complete — for your form. Not an industry benchmark, which would be a number we made up.",
            },
            {
              term: "It goes back for them",
              def: "Up to three reminders on a widening gap — four hours, a day, three days — each one worded differently, because Sauermann and Roach found reminders that change across a sequence beat reminders that repeat. Each leads with how far they already got, which is the one piece of the usual psychology story that survives scrutiny: Nunes and Drèze roughly doubled completion by reframing a task as already begun.",
            },
            {
              term: "It can prove the reminders did anything",
              def: "Hold a share of the people who left out of the sequence and send them nothing. What comes back from them was coming back regardless; the difference is what the reminders earned. Every recovery percentage published in this category is measured without one of these, which is why none of them appears on this site.",
            },
          ].map((item) => (
            <div key={item.term}>
              <dt className="text-h2 font-semibold">{item.term}</dt>
              <dd className="text-body text-muted-foreground mt-2 leading-relaxed">{item.def}</dd>
            </div>
          ))}
        </dl>
      </Band>

      {/*
        The limits.

        A page that quotes four studies and concludes that its own product is
        always the answer is a page that misread all four. This section is what
        makes the rest of it worth believing, and it is also, straightforwardly,
        true.
      */}
      <Band tone="sand">
        <div className="max-w-2xl">
          <BandTitle>What none of this means.</BandTitle>
          <BandLede tone="sand">Five things the research above does not say.</BandLede>
        </div>
        <ul className="mt-12 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {[
            {
              title: "That every form should be a conversation",
              body: "Three fields and a submit button is already the right interface. A conversation there adds turns and collects nothing extra. Use a form.",
            },
            {
              title: "That there is a completion-rate number",
              body: "None of these papers measured completion rate on a commercial web form, and chatform has no cross-customer data to offer one. Anyone quoting you a single percentage for this is quoting marketing.",
            },
            {
              title: "That reminders recover a known share of people",
              body: "The survey work says contacts raise response and that varying the wording raises it further. It does not give you a percentage for a commercial form, and neither do we. Switch the holdout on and you get your own.",
            },
            {
              title: "That chat is faster",
              body: "Conrad and Schober found conversational interviewing takes longer. It trades time for accuracy. That is a good trade for an intake form and a bad one for a newsletter signup.",
            },
            {
              title: "That the model should be trusted with the answer",
              body: "It is not. Choice, scale and consent answers are matched exactly and never sent to a model, and everything the model does extract is re-validated against the same rules a typed answer would face.",
            },
          ].map((item) => (
            <li key={item.title}>
              <h3 className="text-h2 font-semibold">{item.title}</h3>
              <p className="text-body text-muted-foreground mt-2 leading-relaxed">{item.body}</p>
            </li>
          ))}
        </ul>
      </Band>

      <Band size="tight">
        <h2 className="text-h1 font-display font-bold">References</h2>
        <ol className="mt-5 flex list-decimal flex-col gap-3 pl-5">
          {STUDIES.map((entry) => (
            <li key={entry.id} className="text-body text-muted-foreground max-w-4xl leading-relaxed">
              {entry.authors}. <cite className="not-italic">{entry.title}</cite>. {entry.venue},{" "}
              {entry.year}.{" "}
              <a href={entry.url} className="text-primary underline underline-offset-4" rel="noopener">
                {entry.url.replace("https://", "")}
              </a>
            </li>
          ))}
        </ol>
        <p className="text-caption text-muted-foreground mt-8">
          Comparing tools rather than formats?{" "}
          <Link href="/compare" className="text-primary underline underline-offset-4">
            The comparisons, including where we lose
          </Link>
          .
        </p>
      </Band>

      <CtaBand />
    </>
  );
}
