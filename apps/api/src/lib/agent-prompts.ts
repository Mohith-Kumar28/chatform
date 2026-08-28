import { ADDABLE_BLOCK_TYPES, renderBlockCatalog, type Block, type FormDoc } from "@repo/form-schema";

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

  const verbatim = agent.rephraseQuestions === false;

  parts.push(`HOW YOU BEHAVE
${
    verbatim
      ? "- Do NOT reword the questions. Their exact wording matters. You acknowledge answers and respond to what the respondent says, but the question itself is delivered separately, word for word — never restate, paraphrase or preview it yourself."
      : "- Exactly one question per turn, in your own words, under 40 words."
  }
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

  // When rephrasing is off the question is emitted verbatim by the FSM right
  // after this turn, so the model must not attempt to ask it at all.
  parts.push(
    doc.settings.agent.rephraseQuestions === false
      ? `NOW: ${answeredCount} answered. Respond to their latest message in one or two sentences — acknowledge what they said and answer anything they asked. Do NOT ask the next question; it will be shown immediately after you, exactly as written. End on your reply, not on a question.`
      : `NOW: ${answeredCount} answered. Respond to their latest message, then ask ref=${currentBlock.ref} — "${currentBlock.title}" (${currentBlock.type}). Ask ONLY that question.`,
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

/**
 * The generator's prompt.
 *
 * Two things here are load-bearing and were both missing.
 *
 * The type list: this used to gesture at types by example ("email for contact,
 * single_select for choices") and never state the set. So the model invented
 * plausible neighbours — `single_choice`, `multiple_choice`, `text` — and the
 * normalizer dropped every block it could not recognise. A request that
 * explicitly asked for an email question came back without one, and nothing
 * anywhere said why. The set is now enumerated; the normalizer's alias table is
 * the second line of defence, not the first.
 *
 * The research brief: without it the model has the URL as a string and nothing
 * more, and writes the same generic questions it would for no URL at all.
 */
export function buildFlowGeneratorPrompt(
  prompt: string,
  questionCount: number,
  research?: { brief: string; sources: string[] } | null,
): string {
  const context = research?.brief
    ? `

WHAT WE FOUND OUT ABOUT THEIR PRODUCT (from their own site and a web search):
${research.brief}

Use this. Ask about the platforms, plans and concepts this product actually has, in its own words — not generic equivalents. Never contradict it, and never ask a question that only makes sense for a product this is not.`
    : "";

  return `Design a conversational form as a JSON document.

Request: ${prompt}${context}

Requirements:
- Exactly ${questionCount} answerable questions (plus one welcome block first)
- Start with a "welcome" block

- "type" MUST be one of exactly these, spelled exactly like this. Any other word — "text", "single_choice", "boolean" — is wrong; pick the closest from this list:
${renderBlockCatalog()}
- Match the type to the answer, and reach past the text types. A price, a fee, a ticket or a UPI id means "payment". A time or a date means "date". A file means "file_upload". An address means "address". Asking for those as short_text is the single most common mistake here — a question titled "Payment Confirmation" that takes typed text collects nothing and takes no money.
- "config": the setup for types that need it, as "key=value; key=value" using exactly the keys listed above — e.g. "method=upi; upi=acme@okhdfcbank; amount=499; currency=INR". Put "" when the type needs none. Take the values from the request: if it names a price, an id or a link, they belong here rather than in the question's wording.
- refs: lowercase snake_case, unique, prefixed by topic (e.g. q_email, q_role, q_rating)
- "options": the choices as the respondent reads them — ["Android", "iPhone", "Chrome extension"]. Plain labels, no ids, no prefixes. Use [] for every type that is not a choice.
- Every block MUST include: description (use "" if none), options (use [] when not a choice) and scale (5 for rating, 10 otherwise)
- "endings": one entry per distinct outcome, each { "ref": "end_<slug>", "title": <warm title>, "body": "" }. Most forms need exactly one (ref "end_thanks"). Add more ONLY when the request describes different destinations for different answers — e.g. a sales hand-off versus a self-serve trial. Never invent outcomes the request did not ask for.

BRANCHING — this is the part that makes it a conversation rather than a form, so do not skip it.
Read the request for "if", "when", "only for", "depending on", "otherwise", or any two groups of people who should be asked different things. Whenever you find one, add it to "branches":
  [{ "whenRef": "<the ref of the question that decides it>", "op": "<eq|neq|gt|gte|lt|lte|contains|not_contains|is_empty|is_not_empty>", "value": "<the option's LABEL, exactly as you wrote it in options — or a number, or "" for is_empty/is_not_empty>", "then": "<the ref of the question or ending to jump to>" }]
Worked example — the request says "if they are on Android ask for their Play Store email, if iOS any email is fine":
  q_platform is a single_select with options ["Android", "iPhone or iPad", "Chrome extension"]
  branches: [
    { "whenRef": "q_platform", "op": "eq", "value": "Android", "then": "q_play_store_email" },
    { "whenRef": "q_platform", "op": "eq", "value": "iPhone or iPad", "then": "q_any_email" },
    { "whenRef": "q_platform", "op": "eq", "value": "Chrome extension", "then": "q_any_email" }
  ]
Note that every answer gets its own branch, including the ones going to the shared question. Return "branches": [] only when the form is genuinely linear for everyone.

Order blocks so that branching works by position. Questions run top to bottom, and after a question the respondent falls through to the very next block unless a branch says otherwise. So:
- Put the follow-ups for a branch immediately after the question that triggers it, one arm after another, and put the questions everyone answers below all of them.
- When a question sends different answers down different paths, give EVERY path a branch — including the common one. "yes → q_which_competitor" alone still sends the "no" answers there too, because it is the next block.
- To end the form early for some answers, branch straight to an ending ref.`;
}


/**
 * Editing a form that already exists.
 *
 * The old version of this passed `ref (type): title` and nothing else — no
 * option ids, no existing logic, no notion of position — then appended
 * whatever came back. So the model could not have written a condition even if
 * it wanted to: it had no option id to compare against. Everything it needs to
 * reuse the flow is in the manifest below.
 *
 * The manifest now also states where each question already sits in the flow —
 * "only asked when platform = Android" — because the most common request is to
 * change exactly that, and a model shown a flat list will re-derive the routing
 * from scratch and contradict what is there.
 */
export interface BuilderTurn {
  role: "user" | "assistant";
  text: string;
}

export function buildEditPrompt(
  doc: FormDoc,
  request: string,
  /**
   * What has already been said in this builder's AI bar, oldest first.
   *
   * Without it every message was a cold start, and the bar looked broken in a
   * very specific way: an author who said "even if it's iOS, we still need
   * their email" got a question about iOS devices, because the model had never
   * seen the sentence that "even" was referring to. The thread was on screen
   * the whole time and only the client knew about it.
   */
  history: BuilderTurn[] = [],
): string {
  const gotos = doc.logic.filter((r) => r.action_kind === "goto");

  /** How each question is reached, in the same words the builder sees. */
  const reachedBy = new Map<string, string[]>();
  for (const r of gotos) {
    if (!r.from) continue;
    const c = r.when?.conditions?.[0];
    const source = doc.blocks.find((b) => b.ref === r.from);
    let how: string;
    if (!c) {
      how = `everyone who reaches ${r.from} continues to`;
    } else {
      const value = "value" in c ? c.value : undefined;
      const option =
        source && "options" in source && source.options
          ? (source.options as { id: string; label: string }[]).find((o) => o.id === value)
          : undefined;
      how = `${r.from} ${c.op} ${option ? `"${option.label}"` : JSON.stringify(value)} →`;
    }
    const list = reachedBy.get(r.target);
    if (list) list.push(how);
    else reachedBy.set(r.target, [how]);
  }

  const blocks = doc.blocks
    .map((b, i) => {
      const options = "options" in b && b.options?.length
        ? ` options: [${(b.options as { id: string; label: string }[]).map((o) => `"${o.label}"`).join(", ")}]`
        : "";
      const routed = reachedBy.get(b.ref);
      const reach = routed?.length ? `  ← reached by: ${routed.join("; ")}` : "";
      return `  ${i + 1}. ${b.ref} (${b.type}${b.required ? ", required" : ""}): "${b.title}"${options}${reach}`;
    })
    .join("\n");

  const rules = gotos.length
    ? gotos
        .map((r) => {
          const c = r.when?.conditions?.[0];
          const left = c && c.left.kind === "ref" ? c.left.ref : "?";
          const cond = c ? `${left} ${c.op}${"value" in c ? ` ${JSON.stringify(c.value)}` : ""}` : "always";
          return `  from ${r.from ?? "(any)"} — if ${cond} → ${r.target}`;
        })
        .join("\n")
    : "  (none — the form runs straight through)";

  // Only the recent turns, and only their text. The proposals themselves are
  // already reflected in the form manifest above when they were applied, and
  // repeating their payloads here would crowd out the form itself.
  const conversation = history.length
    ? `\nEARLIER IN THIS CONVERSATION (oldest first) — the request below continues it, so resolve "it", "that one", "also" and "instead" against these:\n${history
        .slice(-8)
        .map((t) => `  ${t.role === "user" ? "Builder" : "You"}: ${t.text.replace(/\s+/g, " ").slice(0, 400)}`)
        .join("\n")}\n`
    : "";

  return `You are editing an EXISTING conversational form.

FORM: "${doc.title}"

QUESTIONS, in the order they are asked:
${blocks}

ENDINGS: ${doc.endings.map((e) => e.ref).join(", ")}

EXISTING BRANCHING RULES:
${rules}
${conversation}
WHAT THE BUILDER ASKED FOR:
${request}

WORK OUT WHAT KIND OF EDIT THIS IS FIRST. Most requests about a working form change the ROUTING, not the questions — who gets asked what, in which order. Those need NO new questions.

- "addBlocks": [] is a correct and common answer. Never invent a question to have something to return. If every question the request needs is already in the form, add nothing.
- "rewireRefs": the refs of questions whose routing this edit changes. List them, then state their branches below.
- "branches": every branch this edit asserts. Each one REPLACES the existing rule for that same question and the same answer, and leaves every other route untouched. So restate the routes you are changing, in full — including an answer whose destination stays the same but whose neighbours are moving. A route you do not mention keeps working exactly as it does now.
- If a question has three options and you are changing where one of them goes, you may state just that one. But if the change means the other two should go somewhere different too, state those as well — they will not move on their own.
- "removeRefs": only when the request actually asks for a question to go.

Rules for "branches": [{ "whenRef": "<question ref>", "op": "<eq|neq|gt|gte|lt|lte|contains|not_contains|is_empty|is_not_empty>", "value": "<for a choice question, the option's LABEL exactly as listed above; otherwise the literal value; "" for is_empty and is_not_empty>", "then": "<question ref or ending ref>" }].

Where a branch can point: a question BELOW the deciding one, or an ending. A branch pointing at a question above it would loop, and is dropped. So if the request needs a question asked only for some answers, that question has to sit below the one that decides it — say so by adding it with "insertAfter", or by rewiring around where it already is.

If a new question is needed, "type" MUST be one of exactly these:
${renderBlockCatalog(ADDABLE_BLOCK_TYPES)}

Pick the type that actually collects the thing. A price, a fee, a ticket or a UPI id is "payment", not a text question asking them to confirm they paid. A time or a date is "date". A booking link of the builder's own is "scheduling". Reaching for short_text because it is simpler produces a question that collects nothing.

"config" carries the setup for the types that need it, as "key=value; key=value" with exactly the keys listed above — "method=upi; upi=acme@okhdfcbank; amount=499; currency=INR" — and "" for the types that need none. If the request gives you an amount, an id or a URL, it goes in "config", not into the title.

"options" are plain labels as the respondent reads them — ["Android", "iPhone"] — and [] when the type is not a choice. "insertAfter" is the ref it goes directly after, "" for the end; a question only asked in some cases MUST sit immediately below the question that decides it.

"summary" is one plain sentence telling the builder what you changed. Describe only what you actually returned — if you added nothing and only rewired, say that.`;
}
