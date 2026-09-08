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
 */
export const FAQ_ITEMS = [
  {
    question: "Is this just a chatbot bolted onto a form?",
    answer: "No. The conversation runs against a state machine that owns the form. The model gets six verbs — record an answer, answer from your knowledge base, ask, clarify, skip, end — and every one of them is checked against the machine before it takes effect. A rejected call goes back to the model as a tool result so it corrects itself mid-turn. The model phrases things; it never decides what counts as an answer.",
  },
  {
    question: "What if the model goes off the rails?",
    answer: "Three rejected tool calls and the session drops permanently to fixed, deterministic questions — and keeps collecting. The same happens when a workspace runs out of AI conversations for the month. A form never fails because the AI did; it just gets less clever.",
  },
  {
    question: "Can I guarantee the exact wording of a question?",
    answer: "Yes. Turn off question rephrasing and the machine emits your text verbatim while the model is instructed not to ask it. The wording is guaranteed rather than requested, which is what compliance work and research instruments need.",
  },
  {
    question: "Do respondents have to type?",
    answer: "Never. Every question type renders its own control in the thread — chips, stars, a calendar, a ranking list, a signature pad — and the text box stays open beside it. Tap the fourth star or type “four out of five”; both land the same answer.",
  },
  {
    question: "What happens if someone leaves halfway?",
    answer: "Their answers are already saved server-side, and the session is remembered on their device. Reopening the link offers to continue where they left off or start over. They can also change any earlier answer, and nothing counts as submitted until they review the whole thing and press submit.",
  },
  {
    question: "Can I drive it from my own backend?",
    answer: "Yes. Create an API key, start a session against a form, and post messages to it — you get the assistant's replies, the next question and the completion state back synchronously. There is an OpenAPI spec and generated docs. Respondent sign-in works over the same API, so a headless integration is not a second-class one.",
  },
  {
    question: "Which model runs the interview?",
    answer: "Gemini 3.7 Flash handles the conversation, because turn latency is the thing respondents feel, and it drafts forms in the builder too. A smaller model, Gemini 3.1 Flash Lite, does the narrow job of turning free text into a structured answer. You do not currently choose the model yourself.",
  },
  {
    question: "Where does it run, and where does the data sit?",
    answer: "Cloudflare Workers, with one Durable Object per conversation holding the session state, D1 for the records and R2 for uploads. Answers are stored for you to read and export; they are not used to train anything.",
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
