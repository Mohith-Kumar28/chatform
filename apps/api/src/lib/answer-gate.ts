import { validateAnswer, type Block } from "@repo/form-schema";
import type { AiCallContext } from "./ai.js";
import { askJev, jevAvailable, type JevAnswer, type JevEnv, type JevQuestion, type JevResult } from "./jev.js";
import { looksLikeQuestion } from "./phrasing.js";

/**
 * Is this reply simply the answer? The question Hybrid and Scripted put to Jev
 * before anything more expensive.
 *
 * Most replies to a form are just the answer: a name, an email, "the second
 * one", "4". Sending each through a full agent turn paid a large model to read
 * the whole conversation and say "Got it!". This settles those with one
 * classifier call and hands everything else (a question, a refusal, a change of
 * subject, an answer with a question tucked in) to whatever the mode does next.
 *
 * ## It can only say yes to something code built
 *
 * Jev cannot write text. Every value it can pick (an option, a span of the
 * reply, a number) is produced here first, and every pick is checked by
 * `validateAnswer` before it is returned, and again by `record()` after. The
 * worst a wrong call can do is choose between values that were all valid.
 *
 * ## Everything unsure is "off script"
 *
 * No OpenRouter key, a timeout, an error, a missing answer, low confidence, a block type
 * this file does not know (including ones added after it was written): all of
 * them return `off_script`, which in Hybrid means the agent turn that would
 * have run anyway and in Scripted means asking again. A missed answer costs one
 * agent turn. A wrongly accepted one puts words in someone's mouth, so the
 * thresholds lean hard towards missing.
 */

/** How sure Jev must be that the reply answers the question at all. */
export const T_DIRECT = 0.8;
/** How sure it must be of which option, level or span. */
export const T_PICK = 0.7;
/** For a multi-select, how sure per option that it was picked. */
export const T_OPT = 0.7;
/** Below this, a multi-select option counts as clearly not picked. Between the two is "unsure". */
export const T_OPT_NO = 0.3;

/** Jev's limit on the options in one Choice, less the `none` we add. */
const MAX_CHOICE_OPTIONS = 254;
/** Longer than this and it is not "simply the answer" to anything but a long-text question. */
const MAX_REPLY_CHARS = 600;
/** Spans offered for a short answer: up to this many words each. */
const MAX_SPAN_WORDS = 6;

export type GateReason =
  | "unsupported"
  | "unavailable"
  | "failed"
  | "question"
  | "not_direct"
  | "no_match"
  | "unsure"
  | "invalid";

export type GateOutcome =
  | { kind: "answer"; value: unknown }
  | { kind: "off_script"; reason: GateReason };

export interface GateResult {
  outcome: GateOutcome;
  /** The Jev call, when one was made, for usage logging. */
  call: JevResult | null;
}

const off = (reason: GateReason): GateOutcome => ({ kind: "off_script", reason });

/** What one block type asks, and how to read the answers back into a value. */
interface Plan {
  questions: Record<string, JevQuestion>;
  decide: (answers: Record<string, JevAnswer>) => GateOutcome;
}

const DIRECT: JevQuestion = {
  type: "noul",
  instructions: "Is `reply` a direct answer to `question`?",
  criteria: {
    true:
      "The reply answers the question and does nothing else. It may be short, casual, misspelled, in other words than the options, " +
      "or wrapped in a few extra words, for example 'my name is Priya', 'the second one', 'yeah', 'probably a 4'.",
    false:
      "The reply does not answer the question, or does more than answer it: it asks something, asks why or what it is for, " +
      "asks for help, says it does not know or will not say, complains, jokes, talks about something else, " +
      "answers a different question, or wants to change an earlier answer.",
  },
};

/**
 * Ask Jev whether `text` answers `block`, and if so, what the answer is.
 *
 * `fetch` is injectable for tests. The DO passes nothing.
 */
export async function gateAnswer(
  env: JevEnv,
  block: Block,
  text: string,
  ctx: Omit<AiCallContext, "kind">,
  opts: { fetch?: typeof fetch } = {},
): Promise<GateResult> {
  const reply = text.trim();
  if (!reply) return { outcome: off("no_match"), call: null };
  const plan = planFor(block, reply);
  if ("kind" in plan) return { outcome: plan, call: null };
  if (!jevAvailable(env)) return { outcome: off("unavailable"), call: null };

  const call = await askJev(env, stateFor(block, reply), { direct: DIRECT, ...plan.questions }, ctx, opts);
  if (!call) return { outcome: off("failed"), call: null };
  const direct = call.answers.direct;
  if (direct?.type !== "noul" || direct.noul < T_DIRECT) return { outcome: off("not_direct"), call };

  const decided = plan.decide(call.answers);
  if (decided.kind === "off_script") return { outcome: decided, call };
  // The gate never hands back something the validator would refuse.
  const checked = validateAnswer(block, decided.value);
  if (!checked.ok) return { outcome: off("invalid"), call };
  return { outcome: { kind: "answer", value: decided.value }, call };
}

/**
 * The state Jev reads: the question and the reply, nothing else.
 *
 * Not the conversation. TypeSafe's own guidance is that unrelated context costs
 * accuracy, and "is this the answer to this question" needs only the two.
 */
function stateFor(block: Block, reply: string) {
  const state: Record<string, unknown> = { question: block.title, reply };
  if (block.description) state.question_details = block.description.slice(0, 500);
  return state;
}

/**
 * Exported for tests: the questions a block produces, or the reason it never
 * reaches Jev. Pure.
 */
export function planFor(block: Block, reply: string): Plan | GateOutcome {
  if (reply.length > MAX_REPLY_CHARS && block.type !== "long_text") return off("not_direct");
  /*
   * A reply that reads as a question goes straight on, with no call. It is the
   * single commonest off-script turn, it is the case the gate most needs to
   * get right, and the check is free. A false positive ("Is fine") costs one
   * agent turn; that is the right way round to be wrong.
   */
  if (looksLikeQuestion(reply)) return off("question");

  switch (block.type) {
    case "single_select":
    case "dropdown":
    case "poll":
      return optionPlan(block.options, reply, block.type === "single_select" && block.allowOther);
    case "picture_choice":
      return block.multiSelect ? multiPlan(block.options) : optionPlan(block.options, reply, false);
    case "multi_select":
      return multiPlan(block.options);
    case "yes_no":
      return yesNoPlan(block.yesLabel, block.noLabel, (yes) => yes);
    case "legal_consent":
      // The validator stamps the consent text and time; the gate only says which way.
      return yesNoPlan("I agree", "I do not agree", (yes) => yes);
    case "rating":
      return scalePlan(1, block.scale, reply, "1 is the lowest");
    case "nps":
      return scalePlan(0, 10, reply, `0 is "${block.labelLow}", 10 is "${block.labelHigh}"`);
    case "opinion_scale": {
      const lo = block.startAt;
      const hi = block.startAt + block.steps - 1;
      const ends = [block.labelLow && `${lo} is "${block.labelLow}"`, block.labelHigh && `${hi} is "${block.labelHigh}"`]
        .filter(Boolean)
        .join(", ");
      return scalePlan(lo, hi, reply, ends || `${lo} is the lowest`);
    }
    case "long_text":
      // The whole reply is the answer; the only question is whether it is one.
      return { questions: {}, decide: () => ({ kind: "answer", value: reply }) };
    case "short_text":
      return spanPlan(block, reply);
    case "email":
      /*
       * Only an address that stands on its own. Unbounded, this read
       * "respondent@example.comasha@example.com" (a pre-filled address with a second one typed
       * onto its end) as "respondent@example.comasha", which is a valid-looking address nobody
       * owns, and saved it. Now a candidate glued to another @ or to more letters is no
       * candidate at all, so the reply is asked about instead of trimmed into something wrong.
       */
      return candidatePlan(
        block,
        matches(reply, /(?<![^\s<>(),;:"'])[^\s@<>(),;:"']+@[^\s@<>(),;:"']+\.[a-z]{2,}(?![^\s<>(),;:"'.!?])/gi),
      );
    case "url":
      return candidatePlan(block, matches(reply, /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,;]*)?/gi));
    case "phone":
      return candidatePlan(block, matches(reply, /\+?\d[\d\s().-]{5,}\d/g));
    case "number":
      return candidatePlan(block, matches(reply, /-?\d[\d,]*(?:\.\d+)?/g).map((n) => n.replace(/,/g, "")));
    case "date":
      // Dates are arithmetic, which Jev is documented to be bad at. Only a reply
      // the validator already reads as a date is taken; anything looser is the
      // extractor's job, on the agent path.
      return candidatePlan(block, [reply]);
    default:
      /*
       * Ranking, matrix, contact and address cards, groups, uploads, payments,
       * bookings, and every type added after this was written. Their answers
       * have structure a single reply rarely carries, and the controls on
       * screen already record them without a model.
       */
      return off("unsupported");
  }
}

// ── Choices ──────────────────────────────────────────────────────────────────

type Opt = { id: string; label: string; description?: string | null };

/**
 * One of a list, by meaning rather than spelling: "the blue one", "keys", "piano mostly".
 *
 * Keys are positional (`o1`, `o2`, …) rather than option ids, because the ids
 * are `opt_x7f…` noise and Jev reads its option keys as part of the question.
 */
function optionPlan(options: Opt[], reply: string, allowOther: boolean): Plan | GateOutcome {
  if (options.length === 0 || options.length > MAX_CHOICE_OPTIONS - 1) return off("unsupported");
  const criteria: Record<string, unknown> = {};
  options.forEach((o, i) => {
    criteria[`o${i + 1}`] = o.description ? `${o.label}: ${o.description}` : o.label;
  });
  if (allowOther) criteria.other = "Something specific that is not one of the listed options";
  criteria.none = "No option: the reply does not pick anything, or is unclear";

  const questions: Record<string, JevQuestion> = {
    pick: { type: "choice", instructions: "Which option does `reply` choose, in answer to `question`?", criteria },
  };
  const spans = allowOther ? spanCriteria(reply) : null;
  if (spans) {
    questions.other_text = {
      type: "choice",
      instructions: "If `reply` names its own answer to `question`, which part of the reply is that answer, exactly?",
      criteria: spans.criteria,
    };
  }

  return {
    questions,
    decide: (a) => {
      const pick = a.pick;
      if (pick?.type !== "choice" || pick.confidence < T_PICK) return off("unsure");
      if (pick.choice === "none") return off("no_match");
      if (pick.choice === "other") {
        const span = a.other_text;
        if (!spans || span?.type !== "choice" || span.confidence < T_PICK) return off("unsure");
        const text = spans.values[span.choice];
        return text ? { kind: "answer", value: text } : off("no_match");
      }
      const opt = options[Number(pick.choice.slice(1)) - 1];
      return opt ? { kind: "answer", value: opt.id } : off("no_match");
    },
  };
}

/**
 * Several of a list. One yes/no per option, because a single Choice can only
 * name one, and the per-option answers are what say "both of those".
 */
function multiPlan(options: Opt[]): Plan | GateOutcome {
  // One question each. Jev fans out, but past a point the request is the cost.
  if (options.length === 0 || options.length > 40) return off("unsupported");
  const questions: Record<string, JevQuestion> = {};
  options.forEach((o, i) => {
    questions[`o${i + 1}`] = {
      type: "noul",
      instructions: { option: o.label, question: "Does `reply` choose `option` as one of its answers to `question`?" },
    };
  });
  // Something outside the list. Even where "Other" is allowed, a mix of listed
  // and unlisted answers is more than this gate should settle: the agent does.
  questions.unlisted = {
    type: "noul",
    instructions: {
      options: options.map((o) => o.label),
      question: "Does `reply` also name an answer that is not in `options`?",
    },
  };

  return {
    questions,
    decide: (a) => {
      const unlisted = a.unlisted;
      if (unlisted?.type !== "noul" || unlisted.noul >= T_OPT_NO) return off("no_match");
      const ids: string[] = [];
      for (let i = 0; i < options.length; i++) {
        const q = a[`o${i + 1}`];
        if (q?.type !== "noul") return off("failed");
        if (q.noul >= T_OPT) ids.push(options[i]!.id);
        else if (q.noul > T_OPT_NO) return off("unsure");
      }
      return ids.length > 0 ? { kind: "answer", value: ids } : off("no_match");
    },
  };
}

function yesNoPlan(yesLabel: string, noLabel: string, value: (yes: boolean) => unknown): Plan {
  return {
    questions: {
      pick: {
        type: "choice",
        instructions: "Does `reply` answer `question` with yes or with no?",
        criteria: { yes: `Yes (${yesLabel})`, no: `No (${noLabel})`, none: "Neither: unclear, undecided, or not an answer" },
      },
    },
    decide: (a) => {
      const pick = a.pick;
      if (pick?.type !== "choice" || pick.confidence < T_PICK) return off("unsure");
      if (pick.choice === "yes") return { kind: "answer", value: value(true) };
      if (pick.choice === "no") return { kind: "answer", value: value(false) };
      return off("no_match");
    },
  };
}

// ── Scales ───────────────────────────────────────────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11,
};

/**
 * The number in a reply, when it holds exactly one: "4", "a 4", "four stars",
 * "8 out of 10", "7/10". Code rather than Jev, per TypeSafe: numbers belong in code.
 */
export function numberIn(reply: string): number | null {
  const t = reply.toLowerCase();
  const outOf = t.match(/(-?\d+(?:\.\d+)?)\s*(?:\/|out of|of)\s*\d+/);
  if (outOf) return Number(outOf[1]);
  const found = [
    ...[...t.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])),
    ...[...t.matchAll(/\b[a-z]+\b/g)].flatMap((m) => (m[0] in NUMBER_WORDS ? [NUMBER_WORDS[m[0]]!] : [])),
  ];
  const distinct = [...new Set(found)];
  return distinct.length === 1 ? distinct[0]! : null;
}

/**
 * A number in the reply is taken as said, and Jev only confirms it is an
 * answer. Without one ("pretty good", "terrible"), Jev picks the level.
 */
function scalePlan(lo: number, hi: number, reply: string, ends: string): Plan | GateOutcome {
  const n = numberIn(reply);
  if (n !== null) {
    if (!Number.isInteger(n) || n < lo || n > hi) return off("invalid");
    return { questions: {}, decide: () => ({ kind: "answer", value: n }) };
  }
  const criteria: Record<string, unknown> = {};
  for (let v = lo; v <= hi; v++) criteria[`l${v}`] = `${v}`;
  criteria.none = "No level: the reply does not say how they rate it";
  return {
    questions: {
      pick: {
        type: "choice",
        instructions: { scale: `${lo} to ${hi}; ${ends}`, question: "Which level on `scale` does `reply` give?" },
        criteria,
      },
    },
    decide: (a) => {
      const pick = a.pick;
      if (pick?.type !== "choice" || pick.confidence < T_PICK) return off("unsure");
      if (pick.choice === "none") return off("no_match");
      return { kind: "answer", value: Number(pick.choice.slice(1)) };
    },
  };
}

// ── Text ─────────────────────────────────────────────────────────────────────

/**
 * Every run of up to `MAX_SPAN_WORDS` words in the reply, plus the reply itself.
 *
 * Jev cannot cut "Priya" out of "my name is Priya", but it can say which of the
 * spans code already cut is the answer. That is TypeSafe's recommended shape for
 * extraction, and it means the stored value is always the respondent's own words.
 */
function spanCriteria(reply: string): { criteria: Record<string, unknown>; values: Record<string, string> } | null {
  const words = reply.split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const list: string[] = [];
  const add = (s: string) => {
    const v = s.replace(/^[\s"'“‘(]+|[\s"'”’).,!;:]+$/g, "");
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      list.push(v);
    }
  };
  add(reply);
  for (let len = 1; len <= Math.min(MAX_SPAN_WORDS, words.length); len++) {
    for (let i = 0; i + len <= words.length; i++) add(words.slice(i, i + len).join(" "));
  }
  if (list.length > MAX_CHOICE_OPTIONS) return null;
  const criteria: Record<string, unknown> = {};
  const values: Record<string, string> = {};
  list.forEach((s, i) => {
    criteria[`s${i + 1}`] = s;
    values[`s${i + 1}`] = s;
  });
  criteria.none = "None of these is the answer";
  return { criteria, values };
}

function spanPlan(block: Block, reply: string): Plan | GateOutcome {
  const spans = spanCriteria(reply);
  if (!spans) return off("unsupported");
  // Spans the validator would refuse (too short, a pattern) are never offered.
  for (const [key, value] of Object.entries(spans.values)) {
    if (!validateAnswer(block, value).ok) {
      delete spans.values[key];
      delete spans.criteria[key];
    }
  }
  const keys = Object.keys(spans.values);
  if (keys.length === 0) return off("invalid");
  return {
    questions: {
      span: {
        type: "choice",
        instructions: "Which part of `reply` is exactly the answer to `question`, with no extra words?",
        criteria: spans.criteria,
      },
    },
    decide: (a) => {
      const pick = a.span;
      if (pick?.type !== "choice" || pick.confidence < T_PICK) return off("unsure");
      const value = spans.values[pick.choice];
      return value ? { kind: "answer", value } : off("no_match");
    },
  };
}

function matches(reply: string, re: RegExp): string[] {
  return [...reply.matchAll(re)].map((m) => m[0].replace(/[.,!;:)]+$/, "").trim()).filter(Boolean);
}

/**
 * Formatted values (email, phone, URL, number, date): code finds them, the
 * validator vets them, and Jev only chooses when there is more than one.
 */
function candidatePlan(block: Block, found: string[]): Plan | GateOutcome {
  const valid = [...new Set(found)].filter((c) => validateAnswer(block, c).ok);
  if (valid.length === 0) return off(found.length > 0 ? "invalid" : "no_match");
  if (valid.length === 1) return { questions: {}, decide: () => ({ kind: "answer", value: valid[0] }) };
  if (valid.length > MAX_CHOICE_OPTIONS) return off("unsupported");
  const criteria: Record<string, unknown> = {};
  valid.forEach((c, i) => (criteria[`c${i + 1}`] = c));
  criteria.none = "None of these is the answer";
  return {
    questions: {
      pick: { type: "choice", instructions: "Which of these values in `reply` is the answer to `question`?", criteria },
    },
    decide: (a) => {
      const pick = a.pick;
      if (pick?.type !== "choice" || pick.confidence < T_PICK) return off("unsure");
      const value = valid[Number(pick.choice.slice(1)) - 1];
      return value !== undefined && pick.choice !== "none" ? { kind: "answer", value } : off("no_match");
    },
  };
}
