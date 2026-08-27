import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

/**
 * Every answer here is checkable against the codebase. Nothing aspirational.
 */
const ITEMS = [
  {
    q: "Is this just a chatbot bolted onto a form?",
    a: "No. The conversation runs against a state machine that owns the form. The model gets six verbs — record an answer, answer from your knowledge base, ask, clarify, skip, end — and every one of them is checked against the machine before it takes effect. A rejected call goes back to the model as a tool result so it corrects itself mid-turn. The model phrases things; it never decides what counts as an answer.",
  },
  {
    q: "What if the model goes off the rails?",
    a: "Three rejected tool calls and the session drops permanently to fixed, deterministic questions — and keeps collecting. The same happens when a workspace runs out of AI conversations for the month. A form never fails because the AI did; it just gets less clever.",
  },
  {
    q: "Can I guarantee the exact wording of a question?",
    a: "Yes. Turn off question rephrasing and the machine emits your text verbatim while the model is instructed not to ask it. The wording is guaranteed rather than requested, which is what compliance work and research instruments need.",
  },
  {
    q: "Do respondents have to type?",
    a: "Never. Every question type renders its own control in the thread — chips, stars, a calendar, a ranking list, a signature pad — and the text box stays open beside it. Tap the fourth star or type “four out of five”; both land the same answer.",
  },
  {
    q: "What happens if someone leaves halfway?",
    a: "Their answers are already saved server-side, and the session is remembered on their device. Reopening the link offers to continue where they left off or start over. They can also change any earlier answer, and nothing counts as submitted until they review the whole thing and press submit.",
  },
  {
    q: "Can I drive it from my own backend?",
    a: "Yes. Create an API key, start a session against a form, and post messages to it — you get the assistant's replies, the next question and the completion state back synchronously. There is an OpenAPI spec and generated docs. Respondent sign-in works over the same API, so a headless integration is not a second-class one.",
  },
  {
    q: "Which model runs the interview?",
    a: "Gemini 3.7 Flash handles the conversation, because turn latency is the thing respondents feel. Claude Sonnet 5 generates forms in the builder, where quality matters more than speed. On Business you pick your own.",
  },
  {
    q: "Where does it run, and where does the data sit?",
    a: "Cloudflare Workers, with one Durable Object per conversation holding the session state, D1 for the records and R2 for uploads. Answers are stored for you to read and export; they are not used to train anything.",
  },
] as const;

export function Faq() {
  return (
    <Accordion type="single" collapsible className="mx-auto max-w-3xl">
      {ITEMS.map((item) => (
        <AccordionItem key={item.q} value={item.q}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
