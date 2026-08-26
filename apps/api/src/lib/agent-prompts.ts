import type { Block, FormDoc } from "@repo/form-schema";

/**
 * The interview agent's prompts.
 *
 * Ordering matters for cost. The system prompt is assembled STABLE FIRST —
 * identity, persona, goal, knowledge base, question manifest — and volatile
 * content (transcript, current objective, progress) last. That prefix is
 * byte-identical across every turn of a session, so the provider's prompt
 * cache can serve it, and the knowledge base is usually the largest part.
 */

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
  /** Turns used so far, for the maxTurns guardrail. */
  turnCount?: number;
}

/**
 * The stable half of the system prompt: everything that does not change within
 * a session. Cache-friendly by construction.
 */
export function buildStablePrefix(doc: FormDoc): string {
  const agent = doc.settings.agent;
  const parts: string[] = [];

  parts.push(
    `You are the live interviewer for "${doc.title}"${doc.description ? ` — ${doc.description}` : ""}. You are having a real conversation with one respondent, one question at a time.`,
  );

  parts.push(
    `PERSONALITY: ${TONE_GUIDE[agent.tone] ?? TONE_GUIDE.friendly}${
      agent.personaPrompt ? `\n${agent.personaPrompt}` : ""
    }${agent.displayName ? `\nYou go by "${agent.displayName}".` : ""}`,
  );

  if (agent.goal) {
    parts.push(
      `GOAL: ${agent.goal}${agent.successCriteria ? `\nA conversation went well when: ${agent.successCriteria}` : ""}`,
    );
  }

  // The knowledge base is what lets the agent answer questions back instead of
  // deflecting — the single biggest behavioural difference from a normal form.
  if (agent.knowledge.length > 0) {
    const kb = agent.knowledge
      .filter((k) => k.title.trim() || k.body.trim())
      .map((k) => `### ${k.title}\n${k.body}`)
      .join("\n\n");
    if (kb) {
      parts.push(
        `WHAT YOU KNOW\nUse this to answer the respondent's questions. Quote it faithfully; never invent details it does not contain.\n\n${kb}`,
      );
    }
  }

  const guards = agent.guardrails;
  const guardLines: string[] = [];
  guardLines.push(
    guards.answerOffTopic
      ? "If the respondent asks something outside the material above, answer briefly and honestly from general knowledge, and say when you are not certain."
      : `If the respondent asks something the material above does not cover, do not guess. Say: "${guards.refusalMessage}"`,
  );
  if (guards.forbiddenTopics.length > 0) {
    guardLines.push(
      `Never discuss: ${guards.forbiddenTopics.join(", ")}. If asked, decline briefly and return to the form.`,
    );
  }
  parts.push(`BOUNDARIES\n${guardLines.map((l) => `- ${l}`).join("\n")}`);

  const remaining = doc.blocks
    .filter((b) => !["welcome", "statement"].includes(b.type))
    .map((b) => {
      const hints: string[] = [b.type];
      if ("options" in b && b.options) hints.push(`options: ${b.options.map((o) => o.label).join(" | ")}`);
      if (b.type === "rating") hints.push(`1-${"scale" in b ? b.scale : 5} scale`);
      if (b.type === "nps") hints.push("0-10 scale");
      if (b.type === "number" && "min" in b && b.min !== undefined) hints.push(`min ${b.min}`);
      if (b.type === "number" && "max" in b && b.max !== undefined) hints.push(`max ${b.max}`);
      return `- ref=${b.ref} (${hints.join("; ")})${b.required ? " [required]" : ""}: ${b.title}`;
    })
    .join("\n");

  parts.push(`THE QUESTIONS YOU MAY ASK (never invent others)\n${remaining}`);

  parts.push(`HOW YOU BEHAVE
- Exactly one question per turn, in your own words, under 40 words.
- Acknowledge what they just said before moving on. Reference earlier answers when it is natural.
- If they ask you something, answer it in one sentence, then re-ask the current question. Never ignore them; never repeat a question robotically.
- If their message already answers the current question, confirm it briefly and move on.
- Never ask about a ref other than the current objective. Never invent options.
- Mirror the respondent's language. Be brief and human.`);

  return parts.join("\n\n");
}

/** The volatile half: what is true only for this turn. */
export function buildTurnSuffix(
  doc: FormDoc,
  currentBlock: Block,
  answeredCount: number,
  context?: AgentContext,
): string {
  const parts: string[] = [];

  const hint = currentBlock.agentHints;
  if (hint) {
    const lines: string[] = [];
    if (hint.askStyle) lines.push(`Ask it like this: ${hint.askStyle}`);
    if (hint.whyWeAsk) lines.push(`If they ask why: ${hint.whyWeAsk}`);
    if (hint.examples.length > 0) lines.push(`Example answers: ${hint.examples.join(", ")}`);
    if (lines.length > 0) parts.push(`ABOUT THIS QUESTION\n${lines.map((l) => `- ${l}`).join("\n")}`);
  }

  if (context?.transcript) parts.push(`CONVERSATION SO FAR\n${context.transcript}`);
  if (context?.answers) parts.push(`ANSWERS COLLECTED\n${context.answers}`);

  const maxTurns = doc.settings.agent.guardrails.maxTurns;
  const turns = context?.turnCount ?? 0;
  if (turns > maxTurns * 0.75) {
    parts.push(
      `PACING: this conversation is running long (${turns} of ~${maxTurns} turns). Be more direct and stop making small talk.`,
    );
  }

  parts.push(
    `NOW: ${answeredCount} answered. Respond to their latest message, then ask ref=${currentBlock.ref} — "${currentBlock.title}" (${currentBlock.type}). Ask ONLY that question.`,
  );

  return parts.join("\n\n");
}

/** Convenience for callers that want the whole prompt in one string. */
export function buildSystemPrompt(
  doc: FormDoc,
  currentBlock: Block,
  answeredCount: number,
  context?: AgentContext,
): string {
  return `${buildStablePrefix(doc)}\n\n${buildTurnSuffix(doc, currentBlock, answeredCount, context)}`;
}

/** Retry phrasing when an answer failed validation. */
export function buildRetryObjective(block: Block, attempt: number, hint?: string): string {
  const custom = block.agentHints?.retryHint;
  const base = `Their answer didn't work${hint ? `: ${hint}` : ""}. Acknowledge it kindly, explain what you need in plain words, and ask again.`;
  if (custom) return `${base}\nGuidance from the form's author: ${custom}`;
  if (attempt >= 2) return `${base} They have tried ${attempt} times — be concrete and give an example.`;
  return base;
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
