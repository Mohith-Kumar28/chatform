"use client";

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";

/**
 * One quiet line under the describe box, rotating through ways to get a
 * better first draft.
 *
 * A tip with `knowledge` set ends in a link that opens the knowledge dialog,
 * because "add your docs" is advice the author can take right here.
 */

type Tip = { text: string; knowledge?: true };

const TIPS: Tip[] = [
  { text: "Describe the form in detail. Who fills it in, and what you need to learn from them." },
  { text: "Paste your website URL into the brief. We read it and add it to the form's knowledge." },
  { text: "Add your website, PDFs or docs so the form can answer respondents' questions.", knowledge: true },
  { text: "Say who the respondents are: customers, candidates, students, event guests." },
  { text: "Mention the tone you want. Friendly and casual reads very differently from formal." },
  { text: "List the must-have questions. Everything else can be suggested for you." },
  { text: "Say what happens after someone submits, like booking a call or getting a quote." },
  { text: "Upload a pricing sheet or FAQ so the form can answer \"how much?\" on the spot.", knowledge: true },
  { text: "Name the fields you need exactly, like \"work email\" or \"company size\"." },
  { text: "Ask for branching: \"if they're a business, ask about team size\"." },
  { text: "Keep it short by saying so: \"no more than 6 questions\"." },
  { text: "Mention file uploads if you need them, like a resume or a photo." },
  { text: "Need payment? Say the amount and what it's for." },
  { text: "Tell it what to skip. \"Don't ask for a phone number\" works." },
  { text: "Paste an old form's questions and ask for a conversational version." },
  { text: "Say the language. Forms can be written in any language you describe." },
  { text: "Add your product docs so respondents get real answers, not guesses.", knowledge: true },
  { text: "Mention scoring or qualification if you want to rank the responses." },
  { text: "Say where responses should go, and connect it later from the Integrate tab." },
  { text: "Give it context: the event, product or job this form is for." },
  { text: "Use the mic to talk it through. Describing a form out loud is often faster." },
  { text: "Include ratings or scales by name: NPS, 1 to 5 stars, a slider." },
  { text: "Say if people need to sign in first, like an email code before they start." },
  { text: "Paste a policy or terms page so the form can answer eligibility questions.", knowledge: true },
  { text: "Ask for a welcome message that explains why you're asking." },
  { text: "Mention deadlines or dates so the form can ask about availability." },
  { text: "The first draft isn't final. Ask the builder's AI to change anything after." },
  { text: "Add a link to a specific page, like /pricing or /faq, for focused answers." },
];

const ROTATE_MS = 20_000;

export function PromptTips({ onOpenKnowledge }: { onOpenKnowledge: () => void }) {
  // Start somewhere different each time, so a returning author does not read
  // the same first tip on every visit.
  const [index, setIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const t = window.setInterval(() => setIndex((i) => (i + 1) % TIPS.length), ROTATE_MS);
    return () => window.clearInterval(t);
  }, []);

  const tip = TIPS[index]!;

  return (
    <p className="text-muted-foreground mt-2 flex items-start gap-1.5 px-1 text-xs leading-relaxed">
      <Lightbulb className="mt-px size-3.5 shrink-0" strokeWidth={1.75} />
      {/* Keyed so each tip fades in on its own; polite so a screen reader
          hears the new one without being interrupted. */}
      <span key={index} aria-live="polite" className="animate-in fade-in duration-500 motion-reduce:animate-none">
        {tip.text}
        {tip.knowledge && (
          <>
            {" "}
            <button
              type="button"
              onClick={onOpenKnowledge}
              className="text-foreground underline underline-offset-2 hover:no-underline"
            >
              Add knowledge
            </button>
          </>
        )}
      </span>
    </p>
  );
}
