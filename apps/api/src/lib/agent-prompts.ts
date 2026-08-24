import type { Block, FormDoc } from "@repo/form-schema";

/** Builds the interview agent's system prompt from the form document. */

const TONE_GUIDE: Record<string, string> = {
  friendly: "Warm and encouraging, like a helpful colleague. Light use of emoji is OK.",
  professional: "Crisp and respectful. No emoji, no slang.",
  playful: "Fun and energetic. Emoji welcome. Keep it snappy.",
};

export function buildSystemPrompt(doc: FormDoc, currentBlock: Block, answeredCount: number): string {
  const agent = doc.settings.agent;
  const remaining = doc.blocks
    .filter((b) => !["welcome", "statement"].includes(b.type))
    .map((b) => {
      const hints: string[] = [b.type];
      if ("options" in b && b.options) hints.push(`options: ${b.options.map((o) => o.label).join(" | ")}`);
      if (b.type === "rating") hints.push(`1-${"scale" in b ? b.scale : 5} scale`);
      if (b.type === "number" && "min" in b && b.min !== undefined) hints.push(`min ${b.min}`);
      return `- ref=${b.ref} (${hints.join("; ")})${b.required ? " [required]" : ""}: ${b.title}`;
    })
    .join("\n");

  const collected = Object.entries(currentBlock ? {} : {})
    .length; // answers digest is injected separately by the DO

  return `You are the interviewer for "${doc.title}". You ask ONE question at a time using the ask_question tool, and record answers with record_answer.

PERSONALITY: ${TONE_GUIDE[agent.tone] ?? TONE_GUIDE.friendly}${agent.personaPrompt ? `\nExtra persona: ${agent.personaPrompt}` : ""}

CURRENT OBJECTIVE: Ask the question with ref=${currentBlock.ref}. Do not ask anything else.

REMAINING QUESTIONS:
${remaining}

PROGRESS: ${answeredCount} answered so far.

HARD RULES:
- Exactly one question per turn. Never ask about a ref other than the current objective.
- Never invent questions or options not listed above.
- Rephrase the question naturally in your own words — do not read it robotically. Keep it under 40 words.
- If the user's last message contains the answer, call record_answer first, then your next output will handle the transition.
- If the user's message is unclear or invalid for this question, use clarify with a helpful hint (max ${agent.maxClarificationsPerBlock} times).
- Mirror the respondent's language. Be brief.`;
}

export function buildValidationPrompt(block: Block, answer: string): string {
  return `A form respondent was asked:
"${block.title}"${block.description ? `\nContext: ${block.description}` : ""}

They answered: "${answer}"

Is this a valid, serious answer to the question (not spam, not nonsense, not off-topic)?
Reply with JSON: {"acceptable": boolean, "reason": "one short sentence"}`;
}

export function buildFlowGeneratorPrompt(prompt: string, questionCount: number): string {
  return `Design a conversational form as a JSON document.

Request: ${prompt}

Requirements:
- Exactly ${questionCount} answerable questions (plus one welcome block first)
- Start with a "welcome" block; vary question types appropriately (email for contact, single_select for choices, rating for satisfaction, long_text for open feedback)
- refs: lowercase snake_case, unique, prefixed by topic (e.g. q_email, q_role, q_rating)
- Every option needs a stable id like opt_<slug> (options array MUST be present on every block — use [] when the type has no options)
- Every block MUST include: description (use "" if none) and scale (use 5 for rating, 10 otherwise)
- One ending titled warmly (endingBody "" if none)
- Do not include logic rules unless the request explicitly needs branching`;
}
