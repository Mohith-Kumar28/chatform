import type { Block, FormDoc } from "@repo/form-schema";

/** Builds the interview agent's system prompt from the form document. */

const TONE_GUIDE: Record<string, string> = {
  friendly: "Warm and encouraging, like a helpful colleague. Light use of emoji is OK.",
  professional: "Crisp and respectful. No emoji, no slang.",
  playful: "Fun and energetic. Emoji welcome. Keep it snappy.",
};

export interface AgentContext {
  /** Recent conversation, "Respondent:" / "You:" lines. */
  transcript?: string;
  /** Answers collected so far, "- Question: value" lines. */
  answers?: string;
}

export function buildSystemPrompt(doc: FormDoc, currentBlock: Block, answeredCount: number, context?: AgentContext): string {
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

  return `You are the live interviewer for "${doc.title}"${doc.description ? ` — ${doc.description}` : ""}. You are having a real conversation with one respondent.

PERSONALITY: ${TONE_GUIDE[agent.tone] ?? TONE_GUIDE.friendly}${agent.personaPrompt ? `\nExtra persona: ${agent.personaPrompt}` : ""}

CURRENT OBJECTIVE: Respond to the respondent's latest message, then steer the conversation to the question with ref=${currentBlock.ref}. One question per turn.

REMAINING QUESTIONS:
${remaining}

PROGRESS: ${answeredCount} answered so far.
${context?.transcript ? `\nCONVERSATION SO FAR:\n${context.transcript}\n` : ""}
${context?.answers ? `\nANSWERS COLLECTED:\n${context.answers}\n` : ""}
HARD RULES:
- Exactly one question per turn — the current objective question, in your own words (under 40 words).
- You have the full conversation above. Use it: acknowledge what the respondent just said, reference their earlier answers when relevant, and never repeat a question they already answered.
- If the respondent asks a question (about the form, the topic, why you're asking, anything else): answer it briefly and honestly in one sentence — you know the form's title and description — then smoothly re-ask the current question. Never ignore them, never just repeat the question robotically.
- If their message IS a valid answer to the current question, confirm it in a few words, then move toward the next objective.
- Never invent questions or options not listed above. Never ask about a ref other than the current objective.
- Mirror the respondent's language. Be brief and human.`;
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
- Branching: if the flow benefits from conditions (e.g. "only ask follow-up X if Y equals Z", or "skip to the end if NPS is low"), add a "branches" array: [{ "when": { "ref": "<question ref>", "op": "<eq|neq|gt|gte|lt|lte|contains|not_contains|is_empty|is_not_empty>", "value": <option id / number / boolean, or null for is_empty and is_not_empty> }, "then": "<target question ref or end_thanks>" }]. For choice questions use the option id as value. Only add branches that genuinely make sense — linear forms should omit "branches".`;
}
