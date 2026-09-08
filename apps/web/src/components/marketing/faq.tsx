import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Every answer here is checkable against the codebase. Nothing aspirational.
 *
 * Exported, and shaped as `question`/`answer`, because `/pricing` now emits
 * these as a `FAQPage` graph as well as rendering them. That raises the cost of
 * a stale answer — prose nobody re-reads is one thing, a machine-readable claim
 * a search engine may quote back is another — so the rule above is now enforced
 * by the fact that this array has two consumers.
 *
 * Written for the person asking, which is almost never an engineer. These
 * answers used to say "state machine", "Durable Object", "three rejected tool
 * calls" and "Cloudflare Workers, D1 and R2" — all true, all the wrong
 * vocabulary for somebody who runs a clinic and wants to know whether their
 * data is safe. The one question a developer would ask is still answered in
 * their language, because that is who is asking it. Everything else is in
 * plain English, and the same facts are written up properly in the docs.
 */
export const FAQ_ITEMS = [
  {
    question: "Is this just a chatbot bolted onto a form?",
    answer: "No, and the difference matters. Your form is still in charge. The AI is allowed to do six things — write down an answer, answer a question from your notes, ask again, rephrase, skip, or finish — and your form checks each one before it happens. It can make a question sound friendlier. It cannot decide what counts as an answer, reorder your questions, or invent one you never wrote.",
  },
  {
    question: "What if the AI goes wrong?",
    answer: "The form carries on without it. If the AI misbehaves a few times in a row, it stops improvising for the rest of that conversation and simply asks your questions exactly as you wrote them. The same thing happens if you use up your AI conversations for the month. Nobody sees an error, nothing gets lost, and you still get the answers — they just arrive from a plainer conversation.",
  },
  {
    question: "Can I guarantee my questions are asked word for word?",
    answer: "Yes. There is a switch that turns off rephrasing, and then everyone is asked exactly what you typed, every time. It still greets people, still answers their questions, still reads what they write — it just stops rewording you. If you work somewhere that signs off on question wording, this is the setting you want.",
  },
  {
    question: "Do respondents have to type?",
    answer: "Never. Every question type renders its own control in the thread — chips, stars, a calendar, a ranking list, a signature pad — and the text box stays open beside it. Tap the fourth star or type “four out of five”; both land the same answer.",
  },
  {
    question: "What happens if someone gets interrupted halfway?",
    answer: "Their answers are already saved server-side, and the session is remembered on their device. Reopening the link offers to continue where they left off or start over. They can also change any earlier answer, and nothing counts as submitted until they review the whole thing and press submit.",
  },
  {
    question: "I have a developer. Can they build on this?",
    answer: "Yes, and properly. There is a full REST API that lets your developer run the whole conversation inside your own app or product, an OpenAPI spec they can generate a client from, and two ready-made SDKs. Everything the hosted form can do, their code can do. Point them at the documentation — you do not need to understand any of it to use chatform yourself.",
  },
  {
    question: "Which AI is behind it?",
    answer: "Google's Gemini. The fast version runs the conversation, because a reply that takes too long is a person who has already closed the tab, and it also drafts your form when you describe it. A smaller one does the quiet job of turning what somebody typed into a tidy answer. You do not pick the model yourself, and you do not need to think about any of this.",
  },
  {
    question: "Where do my answers live, and who can see them?",
    answer: "On our servers, for you to read, filter and export whenever you want, and for nobody else. Your answers are never used to train an AI model — not ours, not anyone's. Uploads and signatures are stored the same way and only reachable through links we sign. You can delete a response, or all of them, at any time.",
  },
] as const;

export function Faq() {
  return (
    <Accordion type="single" collapsible className="mx-auto max-w-3xl">
      {FAQ_ITEMS.map((item) => (
        <AccordionItem key={item.question} value={item.question}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
