import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Band, BandTitle, BandLede } from "@/components/marketing/band";
import { CtaBand } from "@/components/marketing/cta-band";
import { Prose } from "@/components/marketing/prose";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/seo/json-ld";
import { study } from "@/content/research";
import { getTemplate } from "@/content/templates";
import { articleLd, breadcrumbLd, canonical, faqPageLd, openGraphBase } from "@/lib/seo";

/**
 * The category page: what a conversational form is, for someone deciding
 * whether they want one.
 *
 * It exists because nothing on the site answered the category search itself.
 * "Conversational forms" is the phrase this product is positioned on, and the
 * results for it are WordPress plugin docs and vendor listicles — none of which
 * separate the two very different things the phrase now means, and none of
 * which say when a normal form is the better choice. This page does both, and
 * then hands off to the pages that go deeper: the research, the templates, the
 * comparisons.
 */

const PATH = "/conversational-forms";
const TITLE = "Conversational forms: what they are and when they work";
const DESCRIPTION =
  "A conversational form asks one question at a time, as a chat. The newer kind also reads each answer and follows up when it is too thin. What that changes, what the research shows, when a normal form is better, and how to build one.";
const PUBLISHED = "2026-09-18";
const AUTHOR = "Mohith Kumar";

const FAQ = [
  {
    question: "What is a conversational form?",
    answer:
      "A conversational form is a form that asks its questions one at a time, in the style of a chat, instead of showing every field on one page. The newer, AI-powered kind also reads each answer as it arrives, asks a follow-up when an answer is too vague to use, and can answer the respondent's own questions before carrying on.",
  },
  {
    question: "Are conversational forms better than traditional forms?",
    answer:
      "For long forms and open-ended questions, usually yes: peer-reviewed studies found chat-style surveys produce more differentiated answers (Kim, Lee and Gweon, CHI 2019) and that probing thin answers makes them more informative and specific (Xiao et al., 2020). For a short form of two or three obvious fields, a plain form is faster and just as good.",
  },
  {
    question: "What is the difference between a conversational form and a chatbot?",
    answer:
      "A chatbot is open-ended: it tries to handle whatever the person says. A conversational form has a fixed job, collecting specific answers in a defined order with validation, and uses the conversation only as the way of asking. The answers come out as structured fields, like any form's, not as a transcript you have to read.",
  },
  {
    question: "Is there a free conversational form builder?",
    answer:
      "Yes. chatform's free plan has unlimited forms and unlimited responses, with 200 AI conversations a month. Tally and Youform are free one-question-at-a-time builders without the AI follow-ups, and Jotform's AI Agents have a free tier of 100 conversations.",
  },
  {
    question: "Can I put a conversational form on my website or WordPress site?",
    answer:
      "Yes. A chatform form can be shared as a link, embedded on any page with one script tag — inline, as a popup, as a side tab or full page — which works on WordPress, Webflow, Framer, Shopify or a hand-built site without a plugin.",
  },
];

export const metadata: Metadata = {
  title: { absolute: `${TITLE} · chatform` },
  description: DESCRIPTION,
  ...canonical(PATH),
  openGraph: { ...openGraphBase(PATH), type: "article", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image" },
};

export default function ConversationalFormsPage() {
  const kim = study("kim-2019");
  const xiao = study("xiao-2020");
  const schober = study("schober-1997");
  const conrad = study("conrad-2000");
  const baymard = study("baymard");
  const sauermann = study("sauermann-2013");

  const examples = ["client-intake", "job-application", "nps-survey", "event-rsvp", "quote-request", "exit-interview"]
    .map((slug) => getTemplate(slug))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return (
    <>
      <JsonLd
        nodes={[
          articleLd({
            headline: TITLE,
            description: DESCRIPTION,
            path: PATH,
            datePublished: PUBLISHED,
            author: AUTHOR,
          }),
          breadcrumbLd([
            { name: "chatform", path: "/" },
            { name: "Conversational forms", path: PATH },
          ]),
          faqPageLd(FAQ),
        ]}
      />

      <Band size="tall">
        <div className="max-w-3xl">
          <BandTitle as="h1">Conversational forms, and when they are worth it.</BandTitle>
          <BandLede className="max-w-2xl">
            What the phrase means now, what changes for the person answering, what the research
            actually shows, and the cases where a plain form is still the better tool.
          </BandLede>
          <p className="text-caption text-muted-foreground mt-6">
            By {AUTHOR}, founder of chatform · 18 September 2026
          </p>
        </div>

        <Prose className="mt-14">
          {/* The definition, first, in one paragraph that survives being quoted
              on its own — it is the answer to the query this page targets. */}
          <p>
            <strong>
              A conversational form is a form that asks its questions one at a time, as a chat,
              instead of showing every field on one page.
            </strong>{" "}
            The newer kind goes a step further: it reads each answer as it arrives, asks a
            follow-up when the answer is too thin to use, and answers the respondent&rsquo;s own
            questions before carrying on. Both kinds are sold under the same name, and they are
            not the same product.
          </p>

          <h2>The two things &ldquo;conversational form&rdquo; means</h2>
          <p>
            Search for a conversational form builder and you will find two categories filed under
            one label.
          </p>
          <p>
            <strong>The first is presentation.</strong> One question per screen, a progress bar,
            a friendly tone, Enter to continue. Typeform made this style famous, and WordPress
            plugins such as WPForms, Gravity Forms and Fluent Forms now offer it as an add-on. The
            form is exactly as fixed as before; it is just revealed a piece at a time. That alone
            helps, because a visitor judges a form by how long it looks, and one question looks
            short.
          </p>
          <p>
            <strong>The second reads the answers.</strong> An AI sits between the question and
            the record. When somebody types &ldquo;growth&rdquo; into &ldquo;what are you hoping
            to get out of this?&rdquo;, it asks which kind of growth, and records the reply as
            the answer. When they ask &ldquo;is parking included?&rdquo; halfway through, it
            answers from what you told it and returns to the question it was on. This is what
            chatform is, and what Typeform sells separately as Formless and Jotform as AI Agents.
          </p>

          <div className="not-prose -mx-1 overflow-x-auto">
            <table className="text-body w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-border border-b">
                  <th className="py-3 pr-4 font-semibold" />
                  <th className="py-3 pr-4 font-semibold">Traditional form</th>
                  <th className="py-3 pr-4 font-semibold">One question at a time</th>
                  <th className="py-3 font-semibold">AI conversational form</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {[
                  ["What the visitor sees first", "Every field", "One question", "One question"],
                  ["A one-word answer to an open question", "Accepted", "Accepted", "Followed up"],
                  ["The respondent asks something", "Nowhere to ask", "Nowhere to ask", "Answered, then back on track"],
                  ["Answers come out as", "Fields", "Fields", "Fields, plus the transcript"],
                  ["Best for", "2–5 obvious fields", "Medium forms, surveys", "Intake, applications, feedback"],
                ].map(([label, ...cells]) => (
                  <tr key={label} className="border-border/60 border-b align-top">
                    <th scope="row" className="text-foreground py-3 pr-4 font-medium">
                      {label}
                    </th>
                    {cells.map((cell, i) => (
                      <td key={i} className="py-3 pr-4">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2>What changes for the person answering</h2>
          <p>
            Picture a new-client intake form: twenty fields on one page. The visitor scrolls to
            the bottom before typing anything, sees the budget question and the free-text box
            labelled &ldquo;describe your project&rdquo;, and leaves. Nothing about any single
            question put them off. The whole stack did.
          </p>
          <p>
            Baymard Institute&rsquo;s checkout research puts a number on that for shopping:{" "}
            <a href={baymard.url} rel="noopener">
              22% of people who abandon a checkout say it was too long or too complicated
            </a>
            . A conversation spends that cost in small pieces, so the decision to leave gets made
            one question at a time instead of once, at the door.
          </p>
          <p>
            The quality of the answers changes too, and that is the part people underestimate. A
            text box asks for effort and gives nothing back, so people write the least that will
            let them continue. Survey researchers call it satisficing. In a{" "}
            <a href={kim.url} rel="noopener">
              2019 CHI study
            </a>
            , Kim, Lee and Gweon found people answering through a chat interface satisficed less
            and gave more differentiated answers than people answering the same survey on the
            web. And in a{" "}
            <a href={xiao.url} rel="noopener">
              600-person experiment published in 2020
            </a>
            , Xiao and colleagues found a chatbot that probed thin open-ended answers got
            responses that were significantly more informative, relevant, specific and clear than
            an ordinary Qualtrics survey.
          </p>
          <p>
            A third effect is older than chatbots. Schober and Conrad showed in the 1990s that
            when an interviewer is allowed to{" "}
            <a href={schober.url} rel="noopener">
              explain what a question means
            </a>
            , answers get much more accurate. A form cannot explain itself. A conversation can,
            which is why the ability to answer the respondent&rsquo;s questions matters as much
            as asking better ones. We keep the full set of studies, with DOIs, on{" "}
            <Link href="/why-conversation-works">why conversation works</Link>.
          </p>

          <h2>When a normal form is the better choice</h2>
          <p>
            This part gets left out of most pages selling conversational forms, so here it is
            plainly. A newsletter signup, a login, a three-field contact form where every field
            is obvious: use a normal form. A conversation adds turns there and collects nothing
            extra.
          </p>
          <p>
            Conversation is also slower. Conrad and Schober&rsquo;s follow-up{" "}
            <a href={conrad.url} rel="noopener">
              household telephone survey
            </a>{" "}
            found clarifying questions improved accuracy at the cost of longer interviews. That
            is a good trade for an intake form, a job application or a feedback survey, where a
            vague answer costs you a follow-up email later. It is a bad trade anywhere speed is
            the whole point.
          </p>
          <p>
            A rough rule we use: if any question on the form could reasonably be answered with
            &ldquo;it depends&rdquo;, or you have ever emailed someone back to ask what they
            meant, it is a conversation. If not, it is a form.
          </p>

          <h2>What a real form taught us</h2>
          <p>
            In September 2026 a university hackathon ran its team registration on chatform: nine
            questions covering the team, the problem statement it was taking on, the leader&rsquo;s
            contact details, the other members, an eligibility check and a declaration, with
            sign-in required before the first one so each student could register only once. Over
            the week it was open, 129 people started a registration and 55 finished it, a 43%
            completion rate for a form that needed a whole team&rsquo;s details from one person.
          </p>
          <p>
            Two things in that data were more useful than the headline number. First, most of
            the people who never registered were lost before question one. Roughly three in four
            sessions ended without a single answer, on a form whose first step was a sign-in
            screen. (Sessions include reloads and repeat visits, so treat that as a direction
            rather than a precise rate.) No amount of good conversation fixes a door people will
            not walk through, and if you require sign-in, that is the first place to look.
          </p>
          <p>
            Second, 98 people who left partway were sent at least one reminder, and 24 of them
            finished after it arrived. We do not call that &ldquo;24 recovered&rdquo;, because
            the form ran without a holdout group and some of those students were always coming
            back before the deadline. The research that does hold up is narrower:{" "}
            <a href={sauermann.url} rel="noopener">
              Sauermann and Roach found
            </a>{" "}
            that reminders which change their wording raised the odds of a response by over 30%
            against reminders that repeat themselves. That is why chatform&rsquo;s reminders (on the Pro plan and above) are worded
            differently each time, and why it can hold a share of people back so the number you
            read has a control behind it.
          </p>

          <h2>What to look for in a conversational form builder</h2>
          <p>Whichever product you pick, these are the questions worth asking before you commit:</p>
          <ul>
            <li>
              <strong>Does it follow up on thin answers, or only display them nicely?</strong>{" "}
              This is the line between the two categories above, and the one that changes what
              you collect.
            </li>
            <li>
              <strong>Can the AI change the order or skip a required question?</strong> It should
              not be able to. In chatform the flow is owned by a state machine and the model can
              only act inside it; we wrote up{" "}
              <Link href="/blog/the-model-never-owns-the-conversation">why the model never owns the conversation</Link>.
            </li>
            <li>
              <strong>Is the branching checked before you publish?</strong> Conditional logic
              breaks quietly. A good builder refuses to publish{" "}
              <Link href="/blog/logic-that-cannot-ship-broken">a flow with a dead end</Link>.
            </li>
            <li>
              <strong>Are half-finished answers kept, and can you go back for them?</strong> Most
              tools either drop partial answers or send one reminder at most.
            </li>
            <li>
              <strong>What does it cost per response?</strong> Typeform&rsquo;s free plan stops
              at 10 responses a month and Jotform&rsquo;s at 100; chatform, Tally and Youform do
              not cap responses on the free plan. Our{" "}
              <Link href="/compare">side-by-side comparison</Link> has the full table, with the
              date each price was read.
            </li>
            <li>
              <strong>Can you embed it where your visitors already are?</strong> Inline, as a
              popup or a side tab, or as a link in a WhatsApp message or a QR code.
            </li>
          </ul>

          <h2>How to build a conversational form</h2>
          <ol>
            <li>
              <strong>Start from what you need to know, not from fields.</strong> Write down the
              decisions the answers have to support (&ldquo;can we take this job?&rdquo;,
              &ldquo;which session should they join?&rdquo;), then the questions that settle
              them.
            </li>
            <li>
              <strong>Describe it, or pick a template.</strong> In chatform you can paste a
              description and get a draft, or start from one of the{" "}
              <Link href="/form-templates">free form templates</Link>, each with its questions
              and branching already written.
            </li>
            <li>
              <strong>Ask the open questions openly.</strong> &ldquo;What should we know
              before the first session?&rdquo; is where a follow-up on a thin answer pays off,
              so do not turn it into a dropdown. Choice and consent answers are matched exactly
              and never go to the model.
            </li>
            <li>
              <strong>Give it something to answer questions from.</strong> Prices, opening hours,
              what happens next. Without it, the respondent&rsquo;s question is a dead end.
            </li>
            <li>
              <strong>Share it and read the drop-off.</strong> Per-question drop-off tells you
              which question is losing people; fix that one first.
            </li>
          </ol>
          <p>
            If you want the whole job for one situation, the{" "}
            <Link href="/use-cases">guides by use case</Link> walk through bookings, quotes,
            intake, feedback and hiring end to end.
          </p>
        </Prose>
      </Band>

      <Band tone="sand">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <BandTitle>Conversational form examples.</BandTitle>
            <BandLede tone="sand">
              Real templates, with every question and branch visible. Open one to see how it asks.
            </BandLede>
          </div>
          <Button asChild size="lg" shape="pill" variant="outline" className="h-12 px-7">
            <Link href="/form-templates">
              All templates
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {examples.map((template) => (
            <li key={template.slug}>
              <Link
                href={template.path}
                className="border-border/70 bg-card group flex h-full flex-col rounded-xl border p-5 shadow-xs transition-shadow duration-[var(--duration-standard)] hover:shadow-md"
              >
                <span className="text-h2 font-display font-bold">{template.searchName}</span>
                <span className="text-body text-muted-foreground mt-1.5 flex-1 leading-relaxed">
                  {template.description}
                </span>
                <span className="text-micro text-muted-foreground tabular mt-4">
                  {template.blockCount} questions · ~{template.estMinutes} min
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Band>

      <Band>
        <div className="max-w-2xl">
          <BandTitle>Questions people ask about conversational forms.</BandTitle>
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-9 lg:grid-cols-2">
          {FAQ.map((item) => (
            <div key={item.question}>
              <h3 className="text-h2 font-semibold text-balance">{item.question}</h3>
              <p className="text-body text-muted-foreground mt-2.5 leading-relaxed">{item.answer}</p>
            </div>
          ))}
        </div>
      </Band>

      <CtaBand />
    </>
  );
}
