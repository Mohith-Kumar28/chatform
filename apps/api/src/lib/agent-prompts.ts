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
- The answer controls are on screen, directly under your message: a question's options are already there as buttons the respondent can tap. Ask the question and stop. Never list, bullet, number or restate the options in your text — printing the same four choices the respondent is looking at is the one thing that makes this read like a form pretending to be a chat.
- Acknowledge what they just said before moving on. Reference earlier answers when it is natural.
- If they ask you something, answer it in one sentence, then re-ask the current question. Never ignore them; never repeat a question robotically.
- If their message already answers the current question, confirm it briefly and move on.
- Never ask about a ref other than the current objective. Never invent options.
- Mirror the respondent's language. Be brief and human.`);

  return parts.join("\n\n");
}

/**
 * What the respondent can already see under this question, phrased as the one
 * thing the agent must not do with it.
 *
 * The options are in the system prompt twice over — the question manifest
 * lists them so the agent knows what an answer may be, and the tool schema
 * takes their ids — and a model given a set of choices and asked to "ask the
 * question in your own words" will helpfully write them out as a bulleted
 * list. Which then renders directly above the same four choices as buttons:
 * the respondent reads the set, reads it again, and taps the second copy.
 *
 * So it is said per-question, next to the question, rather than trusted to the
 * standing rule in the persona alone. Only for the types whose labels are
 * actually on screen — a `short_text` has nothing to duplicate.
 */
export function affordanceNote(block: Block): string | null {
  if ("options" in block && block.options && block.options.length > 0) {
    return `Its ${block.options.length} options are ALREADY on screen as buttons under your message. Ask the question and stop — do not list, bullet, number or spell them out, and do not write "choose one of the following". Naming one option inside a sentence is fine when it genuinely helps; reprinting the set is not.`;
  }
  switch (block.type) {
    case "yes_no":
    case "legal_consent":
      return "Its buttons are ALREADY on screen under your message. Ask the question and stop — do not spell out the choices or tell them to reply yes or no.";
    case "rating":
    case "nps":
    case "opinion_scale":
      return "Its scale is ALREADY on screen under your message, one button per number. Saying the range in a sentence is fine; listing the numbers is not.";
    default:
      return null;
  }
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
  const lines: string[] = [];
  const affordance = affordanceNote(currentBlock);
  if (affordance) lines.push(affordance);
  if (hint?.askStyle) lines.push(`Ask it like this: ${hint.askStyle}`);
  if (hint?.whyWeAsk) lines.push(`If they ask why: ${hint.whyWeAsk}`);
  if (hint?.examples.length) lines.push(`Example answers: ${hint.examples.join(", ")}`);
  if (lines.length > 0) parts.push(`ABOUT THIS QUESTION\n${lines.map((l) => `- ${l}`).join("\n")}`);

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
 * The form designer's craft, as a system prompt.
 *
 * Split out of the request for two reasons, one of them measurable.
 *
 * The measurable one: this text is byte-identical for every generation, so as a
 * `system` message it sits in front of a prompt cache instead of being re-billed
 * as fresh input tokens on every draft.
 *
 * The other is that the old prompt was a single blob of instructions about the
 * JSON, and read as one — a schema with adjectives. Nothing in it said what a
 * good form is, so the model optimised for the only quality signal present,
 * which was "obey the count". Asked for a detailed waitlist with per-platform
 * flows, it returned six questions and a linear flow, twice, and the author's
 * only recourse was to say "you generated too few" in the chat afterwards.
 *
 * What is here now is the judgement: how long a form of this kind should be,
 * when a branch is worth having, and the specific wrong shapes that keep coming
 * back — spelled out as anti-patterns, because a rule stated positively
 * ("branch when the request describes two groups") was already there and did not
 * stop `is_not_empty → the next question` from being drawn on the canvas as a
 * decision the form never makes.
 */
export const FORM_DESIGNER_SYSTEM = `You are a senior conversational-form designer. You design the forms that other people fill in: waitlists, applications, intakes, qualification flows, feedback surveys, registrations, onboarding.

You are not a schema filler. Someone describes what they need to find out, and you decide what to ask, in what order, of whom — then express that as a JSON document. The document is the output; the design is the work.

HOW YOU THINK, BEFORE YOU WRITE ANYTHING

1. Who fills this in, and what does the author DO with the answers? A waitlist that segments by platform needs the platform; a waitlist that just counts people does not. Every question has to earn its place by changing something the author will do.
2. Are these respondents all the same? If the request describes two kinds of people — iOS and Android, current customers and prospects, attending and not attending, big teams and solo — they should not be asked the same things. That is a branch, and it is the whole reason this is a conversation and not a static form.
3. What is the shortest path through this for one respondent? Branching means nobody answers every question. A twenty-question form where each person answers eight is a better form than an eight-question one that asks everybody everything.
4. What order makes it feel like a conversation? Cheap and identifying first (who are you, how do we reach you), then the substance, then anything sensitive or effortful (long text, uploads, payment) once they are invested.

HOW LONG THE FORM SHOULD BE

There is no default length. Length is a consequence of what has to be found out, and getting it wrong in the short direction is the more common failure — a form that is too thin is one the author has to finish by hand.

Read the request for its ambition and size accordingly:
- A single-purpose capture — newsletter signup, "email me at launch", a one-question poll: 3-6 questions.
- An ordinary signup, feedback survey or lead form with no stated depth: 6-10 questions.
- Anything the request calls detailed, thorough, in-depth, comprehensive, multi-step, or that names several topics to cover: 12-18 questions.
- Qualification, application, intake, onboarding, screening, diagnostic, medical or legal history, event registration with options: 12-18 questions.
- Add questions for structure the request implies: every distinct segment ("for iOS users…", "for enterprise…") needs its own 2-4 questions, on top of the ones everyone answers. A request naming three platforms and asking for different flows per platform is asking for at least three arms, so it is a 12+ question form even if it sounds small.

The absolute range is 3 to 19 answerable questions. Both ends are real: do not pad a newsletter signup to twelve, and do not compress a detailed multi-segment intake into six.

If the author states a number — "8 questions", "keep it to five" — that number wins over everything above. Otherwise the number is yours to choose, and choosing it well is part of the job.

Never pad. A question that exists to reach a count is worse than a shorter form: "Is there anything else you'd like us to know?" is a fine closing question and a terrible filler question, and "What is your name?" next to "What is your full name?" is how a padded form announces itself.

BRANCHING

Branching is the point. A form that asks everyone the same eleven questions in the same order should have been a spreadsheet.

Branch when, and only when, the answer to one question changes what is worth asking next:
- Different products, platforms, plans or ecosystems, each with their own follow-ups.
- A qualifying answer that should end the form early, or route to a different ending.
- A yes/no where "yes" opens a topic and "no" closes it.
- A segment (role, team size, customer vs prospect) that deserves different substance.

When you branch, you branch completely:
- EVERY option of the deciding question gets its own branch entry, including the ones that need no follow-up at all. Point those at the first question everyone answers. This is not paperwork: two or more answers naming the same question is what says "this is where the paths meet again", and without it the flow has to guess where the last arm ends. A deciding question with four options and two branches also routes the other two answers by falling through to whatever block happens to sit next, which is almost never what you meant.
- The arms go immediately below the deciding question, one whole arm after another, in the SAME ORDER as that question's options. Everything the respondent answers regardless of the branch goes below all of the arms.
- A branch may only point DOWNWARDS — at a question below the deciding one, or at an ending. A branch pointing upwards is a loop and is discarded, taking your design with it.

ANTI-PATTERNS — every one of these has shipped to a real author, and each is worse than no branch at all:

- Saying "and then" as a condition. Falling through to the next question is already what happens, so a rule that says so adds nothing to the flow and draws a decision node on the author's canvas with one live arm and one dead one, over a choice the form never makes. There is no operator for "and then" and you must not look for one; leave the branch out. (The emptiness operators are not available to you for this reason — they are the shape this mistake kept taking.)
- A branch pointing at the block that comes next anyway. It changes nothing. If you want some answers to SKIP a question, branch the answers that skip it past that question — do not branch the ones that reach it.
- One branch on a multi-option question. "Android → q_play_email" alone also sends iPhone and Chrome users to q_play_email, because that is simply the next block.
- A branch invented to look thorough. If the request describes one kind of person doing one thing, return \`"branches": []\` and be right.
- Follow-ups scattered through the form. An arm whose questions are interleaved with another arm's cannot be drawn, cannot be read, and routes people into the middle of somebody else's path.
- Asking a question whose answer you already routed on. If the branch is on \`q_platform\` = Android, the Android arm does not open by asking which platform they are on.

WRITING THE QUESTIONS

- One thing per question. "What's your name and company?" is two questions in one box.
- The respondent's words, not the author's. Ask "which phone do you use?", not "specify device platform".
- Options must be exhaustive and mutually exclusive for the people being asked, and short enough to scan. Add the escape hatch the set needs — "Something else", "Not sure yet" — when one honestly exists.
- \`description\` is where the reassurance goes: why you are asking, what happens next, what format you want. Leave it "" rather than restating the title.
- Mark a question required only when the form is useless without it. Everything optional is a question fewer people abandon on.`;

/**
 * The generator's request.
 *
 * The type list and the research brief are both load-bearing, and both were
 * once missing.
 *
 * The type list: this used to gesture at types by example ("email for contact,
 * single_select for choices") and never state the set. So the model invented
 * plausible neighbours — `single_choice`, `multiple_choice`, `text` — and the
 * normalizer dropped every block it could not recognise. A request that
 * explicitly asked for an email question came back without one, and nothing
 * anywhere said why. The set is enumerated; the normalizer's alias table is the
 * second line of defence, not the first.
 *
 * The research brief: without it the model has the URL as a string and nothing
 * more, and writes the same generic questions it would for no URL at all.
 *
 * `questionCount` is optional, and the difference is the point. It used to
 * arrive as a number with a default of 6, so every form was six questions long
 * — the dashboard never sent one, so the default was not a default, it was the
 * answer. A request that described three platform-specific flows got six
 * questions and no branches, and the author had to ask for more in the chat.
 * Absent, the model sizes the form itself against the guidance in the system
 * prompt; present, it is an instruction from the author and is obeyed exactly.
 */
export function buildFlowGeneratorPrompt(
  prompt: string,
  questionCount: number | undefined,
  research?: { brief: string; sources: string[] } | null,
): string {
  const context = research?.brief
    ? `

WHAT WE FOUND OUT ABOUT THEIR PRODUCT (from their own site and a web search):
${research.brief}

Use this. Ask about the platforms, plans and concepts this product actually has, in its own words — not generic equivalents. Never contradict it, and never ask a question that only makes sense for a product this is not.`
    : "";

  const sizing =
    questionCount === undefined
      ? `- Decide how many questions this form needs, using the sizing guidance. Between 3 and 19; err towards covering the request rather than towards brevity, and give every segment the request names its own arm.`
      : `- Exactly ${questionCount} answerable questions — the author asked for this number, so hit it exactly.`;

  return `Design a conversational form as a JSON document.

Request: ${prompt}${context}

Shape of the document:
${sizing}
- One "welcome" block first, before the questions. It does not count towards the number above.

- "type" MUST be one of exactly these, spelled exactly like this. Any other word — "text", "single_choice", "boolean" — is wrong; pick the closest from this list:
${renderBlockCatalog()}
- Match the type to the answer, and reach past the text types. A price, a fee, a ticket or a UPI id means "payment". A time or a date means "date". A file means "file_upload". An address means "address". Asking for those as short_text is the single most common mistake here — a question titled "Payment Confirmation" that takes typed text collects nothing and takes no money.
- "config": the setup for types that need it, as "key=value; key=value" using exactly the keys listed above — e.g. "method=upi; upi=acme@okhdfcbank; amount=499; currency=INR". Put "" when the type needs none. Take the values from the request: if it names a price, an id or a link, they belong here rather than in the question's wording.
- refs: lowercase snake_case, unique, prefixed by topic (e.g. q_email, q_role, q_rating)
- "options": the choices as the respondent reads them — ["Android", "iPhone", "Chrome extension"]. Plain labels, no ids, no prefixes. Use [] for every type that is not a choice.
- Every block MUST include: description (use "" if none), options (use [] when not a choice) and scale (5 for rating, 10 otherwise)
- "endings": one entry per distinct outcome, each { "ref": "end_<slug>", "title": <warm title>, "body": "" }. Most forms need exactly one (ref "end_thanks"). Add more when different answers deserve different sign-offs — a sales hand-off versus a self-serve trial, an accepted application versus a "not this time". Never invent outcomes the request did not ask for.

BRANCHING — write it as "branches", and follow the doctrine you were given:
  [{ "whenRef": "<the ref of the question that decides it>", "op": "<eq|neq|gt|gte|lt|lte|contains|not_contains>", "value": "<the option's LABEL, exactly as you wrote it in options, or a number>", "then": "<the ref of the question or ending to jump to>" }]

Worked example — "a waitlist, and ask iOS, Android and extension users different things":

  blocks, in this order:
    q_email          email        (everyone)
    q_platform       single_select  options ["iPhone (iOS)", "Android", "Chrome extension"]
    q_ios_version    single_select  ← iOS arm
    q_ios_testflight yes_no         ← iOS arm
    q_android_device short_text     ← Android arm
    q_android_beta   yes_no         ← Android arm
    q_ext_browser    single_select  ← extension arm
    q_use_case       long_text    (everyone, below all three arms)
    q_referral       single_select (everyone)

  branches:
    { "whenRef": "q_platform", "op": "eq", "value": "iPhone (iOS)",     "then": "q_ios_version" }
    { "whenRef": "q_platform", "op": "eq", "value": "Android",          "then": "q_android_device" }
    { "whenRef": "q_platform", "op": "eq", "value": "Chrome extension", "then": "q_ext_browser" }

Three options, three branches, three contiguous arms in the same order as the options, and the questions everyone answers sitting below all of them. Note what is NOT there: no branch off q_ios_testflight carrying the iOS arm back to the trunk, no branch off q_ext_browser at all. The ends of the arms are joined back to q_use_case automatically — you do not write those, and writing them is the mistake.

Second example — when some answers need no follow-up, say where they go:

  q_role       single_select  options ["Engineer", "Designer", "Product", "Something else"]
  q_languages  short_text     ← engineers only
  q_portfolio  url            ← designers only
  q_why        long_text    (everyone)

  branches:
    { "whenRef": "q_role", "op": "eq", "value": "Engineer",       "then": "q_languages" }
    { "whenRef": "q_role", "op": "eq", "value": "Designer",       "then": "q_portfolio" }
    { "whenRef": "q_role", "op": "eq", "value": "Product",        "then": "q_why" }
    { "whenRef": "q_role", "op": "eq", "value": "Something else", "then": "q_why" }

The last two look redundant and are the most important ones: two answers naming q_why is what says q_why is where the arms meet again. Leave them out and the engineer's arm has no way to know where it stops.

Return "branches": [] only when the form is genuinely linear for everyone.`;
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

Rules for "branches": [{ "whenRef": "<question ref>", "op": "<eq|neq|gt|gte|lt|lte|contains|not_contains>", "value": "<for a choice question, the option's LABEL exactly as listed above; otherwise the literal value>", "then": "<question ref or ending ref>" }].

Where a branch can point: a question BELOW the deciding one, or an ending. A branch pointing at a question above it would loop, and is dropped. So if the request needs a question asked only for some answers, that question has to sit below the one that decides it — say so by adding it with "insertAfter", or by rewiring around where it already is.

If a new question is needed, "type" MUST be one of exactly these:
${renderBlockCatalog(ADDABLE_BLOCK_TYPES)}

Pick the type that actually collects the thing. A price, a fee, a ticket or a UPI id is "payment", not a text question asking them to confirm they paid. A time or a date is "date". A booking link of the builder's own is "scheduling". Reaching for short_text because it is simpler produces a question that collects nothing.

"config" carries the setup for the types that need it, as "key=value; key=value" with exactly the keys listed above — "method=upi; upi=acme@okhdfcbank; amount=499; currency=INR" — and "" for the types that need none. If the request gives you an amount, an id or a URL, it goes in "config", not into the title.

"options" are plain labels as the respondent reads them — ["Android", "iPhone"] — and [] when the type is not a choice. "insertAfter" is the ref it goes directly after, "" for the end; a question only asked in some cases MUST sit immediately below the question that decides it.

"summary" is one plain sentence telling the builder what you changed. Describe only what you actually returned — if you added nothing and only rewired, say that.`;
}
