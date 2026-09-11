import { z } from "zod";
import { tool, type ToolSet } from "ai";
import { resolveNext, validateAnswer, type Block, type EvalState, type FormDoc } from "@repo/form-schema";
import type { KnowledgeHit } from "../lib/knowledge/index.js";

/**
 * The interview agent's toolset.
 *
 * PLAN.md's rule holds: the LLM is a constrained actor, never the controller.
 * The finite state machine in SessionDO decides what is legal; these tools are
 * the only verbs the model gets, and every one of them is checked against the
 * FSM before it takes effect. A rejected call comes back to the model as a
 * tool result explaining why, so it can correct itself inside the same turn
 * rather than producing a plausible-looking lie.
 *
 * Before this, `runAgentTurn` and the guard helpers existed but nothing
 * imported them — the "agent" was a phrasing layer over a fixed script.
 */

/** Where the flow goes after the current question is settled. */
export type NextStep = { kind: "block"; ref: string; title: string } | { kind: "ending" };

/**
 * Where the flow will go if `value` is recorded for `block` — resolved mid-turn,
 * before the agent writes the message that asks the next question.
 *
 * The agent is told to record an answer and go straight on in the same message,
 * and the only list of questions it has is in document order, with nothing in it
 * about branching — because a branch cannot be described until the answer it
 * reads has been given. So on a branching form it asked whatever came next in
 * the list while the FSM routed somewhere else, and `suppressNextAsk` — which
 * exists precisely because the agent has already asked — then silenced the
 * question the flow had actually chosen. The respondent read one question with
 * another one's answer controls underneath, and what they typed was recorded
 * against a question they never saw. An age branch that sends 6-25 onwards and
 * everyone else to a referral question did exactly that to a 23-year-old.
 *
 * Answered on a copy of the state, never the session's own: the model may call
 * this twice, or never record the answer at all, so nothing here may leave a
 * trace. `applyLogicRules` writes variables as it goes, hence cloning those too.
 *
 * Called with no value for a skip. A value the FSM would refuse resolves to
 * null: the turn ends in a retry on this same question, and there is no next
 * one to promise.
 */
export function nextStepAfter(
  doc: FormDoc,
  block: Block,
  state: EvalState,
  value?: unknown,
): NextStep | null {
  const probe: EvalState = {
    answers: { ...state.answers },
    variables: { ...state.variables },
    hidden: state.hidden,
  };
  if (value !== undefined) {
    const validated = validateAnswer(block, value);
    if (!validated.ok) return null;
    // An optional question answered with nothing is the same state as a skip:
    // the branch reads no answer, because there is none.
    if (validated.value !== undefined) probe.answers[block.ref] = validated.value;
  }
  const next = resolveNext(doc, block.ref, probe);
  return next.kind === "block" ? { kind: "block", ref: next.block.ref, title: next.block.title } : { kind: "ending" };
}

export interface ToolContext {
  doc: FormDoc;
  currentBlock: Block;
  /**
   * Where the flow will go once `value` is recorded for the current question —
   * or once it is skipped, when called with no value. See `nextStepAfter`.
   *
   * A callback into the FSM rather than a list computed when the turn started,
   * because the branch reads the answer, and when the turn started that answer
   * had not been given.
   */
  nextAfter: (value?: unknown) => NextStep | null;
  /**
   * True when the form asks its questions word for word.
   *
   * The agent then never asks anything itself — the FSM emits the question
   * verbatim right after its turn — so naming the routed question would put it
   * on screen twice, in two different sets of words.
   */
  verbatimQuestions?: boolean;
  /** Clarifications already spent on the current block. */
  clarifications: number;
  /**
   * Retrieval over the form's knowledge base.
   *
   * Injected rather than imported so this file stays a pure description of the
   * agent's verbs — the DO owns the bindings, and a test can hand in a stub
   * without standing up Vectorize.
   *
   * Absent means this deployment has no knowledge base wired (Miniflare
   * implements neither Vectorize nor Workers AI), and the tool degrades to
   * saying so rather than throwing at a respondent.
   */
  searchKnowledge?: (query: string) => Promise<KnowledgeHit[]>;
  /** Whether the form has any indexed knowledge at all. */
  hasKnowledge?: boolean;
  /**
   * Required questions that still have no answer, in the order they are asked.
   *
   * Passed in rather than derived from `doc` here: whether a question is
   * reachable depends on the answers already given, and the FSM is the only
   * thing that holds them.
   */
  unansweredRequired?: { ref: string; title: string }[];
}

export interface ToolOutcome {
  name: string;
  ok: boolean;
  /** Set when the handler wants the DO to act after the turn completes. */
  effect?:
    | { kind: "record"; ref: string; value: unknown }
    | { kind: "ask"; ref: string }
    | { kind: "clarify"; reason: string }
    | { kind: "skip" }
    | { kind: "upload"; ref: string }
    | { kind: "end"; endingRef?: string };
  message: string;
}

/**
 * Builds the toolset. `collect` receives every outcome so the DO can apply
 * effects in order after the model's turn finishes — tools never mutate state
 * directly, which keeps the FSM the single writer.
 */
export function buildAgentTools(ctx: ToolContext, collect: (outcome: ToolOutcome) => void): ToolSet {
  const record = (outcome: ToolOutcome) => {
    collect(outcome);
    return outcome.message;
  };

  /**
   * Name the question the flow actually goes to, in the tool result.
   *
   * Said here rather than in the system prompt because it is the one thing
   * about this form that is not knowable until the answer is: the branch reads
   * the value that was just given. The model is mid-turn when it reads this,
   * with the message still to write, so this is also the last moment at which
   * telling it changes what the respondent sees.
   */
  const route = (settled: string, next: NextStep | null): string => {
    if (ctx.verbatimQuestions) return `${settled} Do NOT ask the next question — it follows immediately, word for word.`;
    if (!next) return `${settled} Move on to the next question.`;
    if (next.kind === "ending") {
      return `${settled} That was the last question for them — do NOT ask another. Close in one short line; the form takes it from here.`;
    }
    return (
      `${settled} The flow goes to ref=${next.ref} — "${next.title}". Ask THAT question next, in this same ` +
      `message, and no other. It is not always the one that follows in the list: this form branches on the answers.`
    );
  };

  /**
   * Offered only when there is something to look up.
   *
   * It used to be registered unconditionally, and its description tells the
   * model to call it "before answering any question about pricing, policy, the
   * product, or the form itself". On a form with no knowledge base that
   * instruction can only ever be answered with "no knowledge base is
   * configured" — so an off-topic question spent a whole extra model round
   * trip, at the full prompt, to learn nothing. It also put ~100 tokens of
   * schema in front of every turn of every form, most of which have no
   * knowledge base at all.
   */
  const knowledgeTools: ToolSet = ctx.hasKnowledge
    ? {
        answer_from_knowledge: tool({
          description:
            "Look up something the respondent asked about, from the form's knowledge base. Use this before answering any question about pricing, policy, the product, or the form itself.",
          inputSchema: z.object({ query: z.string().describe("What they want to know.") }),
          execute: async ({ query }) => {
            const guards = ctx.doc.settings.agent.guardrails;
            const nothingFound = () =>
              record({
                name: "answer_from_knowledge",
                ok: true,
                message: guards.answerOffTopic
                  ? "Nothing in the knowledge base covers that. Answer briefly from general knowledge and say you are not certain."
                  : `Nothing in the knowledge base covers that. Say: "${guards.refusalMessage}"`,
              });

            /*
             * `hasKnowledge` was true when the toolset was built, but the
             * searcher can still be missing — Miniflare implements neither
             * Vectorize nor Workers AI, so this is the shape of every local dev
             * run. Saying "nothing covers that" would be a lie about the
             * material; saying retrieval is unavailable is the truth, and it is
             * what stops the model inventing an answer it thinks it looked up.
             */
            if (!ctx.searchKnowledge) {
              return record({
                name: "answer_from_knowledge",
                ok: true,
                message:
                  "No knowledge base is configured for this form. Answer from the form's title and description only, and say if you are unsure.",
              });
            }

            let hits: KnowledgeHit[];
            try {
              hits = await ctx.searchKnowledge(query);
            } catch (err) {
              // A retrieval failure is not a reason to end the respondent's turn.
              // Treating it as a miss lets the guardrail decide what to say, which
              // is the same thing that happens when the answer genuinely is not
              // there.
              console.error("knowledge_search_failed", err);
              return nothingFound();
            }

            if (hits.length === 0) return nothingFound();

            return record({
              name: "answer_from_knowledge",
              ok: true,
              message: hits.map((hit) => `### ${hit.title}\n${hit.text}`).join("\n\n"),
            });
          },
        }),
      }
    : {};

  return {
    ...knowledgeTools,
    record_answer: tool({
      description:
        "Record the respondent's answer to the question you are currently asking. Only call this when they have actually answered it.",
      inputSchema: z.object({
        ref: z.string().describe("Must be the ref of the question you are currently asking."),
        value: z
          .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
          .describe("The answer, in the shape the question expects. Use option ids for choices."),
      }),
      execute: async ({ ref, value }) => {
        if (ref !== ctx.currentBlock.ref) {
          return record({
            name: "record_answer",
            ok: false,
            message: `Rejected: you may only record an answer for ref=${ctx.currentBlock.ref}, not ${ref}.`,
          });
        }
        return record({
          name: "record_answer",
          ok: true,
          effect: { kind: "record", ref, value },
          message: route("Answer accepted.", ctx.nextAfter(value)),
        });
      },
    }),

    clarify: tool({
      description:
        "Ask the respondent to rephrase or give more detail, when their reply does not answer the current question.",
      inputSchema: z.object({ reason: z.string().describe("What is unclear.") }),
      execute: async ({ reason }) => {
        const cap = ctx.doc.settings.agent.maxClarificationsPerBlock;
        if (ctx.clarifications >= cap) {
          return record({
            name: "clarify",
            ok: false,
            message: `Rejected: you have already asked for clarification ${ctx.clarifications} times on this question (limit ${cap}). Accept what they gave you or move on.`,
          });
        }
        return record({
          name: "clarify",
          ok: true,
          effect: { kind: "clarify", reason },
          message: "Ask again, differently and more concretely.",
        });
      },
    }),

    skip_current: tool({
      description: "Skip the current question when the respondent declines to answer it.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!ctx.doc.settings.navigation.allowSkip) {
          return record({
            name: "skip_current",
            ok: false,
            message: "Rejected: this form does not allow skipping. Ask again, more gently.",
          });
        }
        if (ctx.currentBlock.required) {
          return record({
            name: "skip_current",
            ok: false,
            message: "Rejected: this question is required. Explain why you need it and ask again.",
          });
        }
        return record({
          name: "skip_current",
          ok: true,
          effect: { kind: "skip" },
          message: route("Skipped. Acknowledge it warmly.", ctx.nextAfter()),
        });
      },
    }),

    request_upload: tool({
      description: "Show the respondent a file picker for the current question.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => {
        if (ref !== ctx.currentBlock.ref || ctx.currentBlock.type !== "file_upload") {
          return record({
            name: "request_upload",
            ok: false,
            message: "Rejected: the current question does not take a file.",
          });
        }
        return record({
          name: "request_upload",
          ok: true,
          effect: { kind: "upload", ref },
          message: "Upload control shown. Tell them what you need.",
        });
      },
    }),

    /**
     * The verb that ends the conversation, and the one guard on it that was
     * written but never used.
     *
     * `unanswered` was computed from `doc.blocks` alone — every required
     * question, whether or not it had been answered — so the list was never
     * empty, the tool always reported "wrapping up early", and it accepted the
     * call either way. A model that decided it had heard enough could close a
     * form with required questions still blank, and the only trace was an
     * adverb in a message nobody reads.
     */
    end_interview: tool({
      description: "Finish the conversation. Only when every required question is answered, or they ask to stop.",
      inputSchema: z.object({ endingRef: z.string().optional() }),
      execute: async ({ endingRef }) => {
        const ending = endingRef ? ctx.doc.endings.find((e) => e.ref === endingRef) : undefined;
        if (endingRef && !ending) {
          return record({
            name: "end_interview",
            ok: false,
            message: `Rejected: there is no ending with ref=${endingRef}.`,
          });
        }
        const unanswered = ctx.unansweredRequired ?? [];
        /*
         * A screen-out is exempt. Turning somebody away is a decision about the
         * answers already given, and holding it back until they have filled in
         * the rest of a form that has just refused them is the wrong way round.
         */
        if (unanswered.length > 0 && ending?.kind !== "screen_out") {
          const next = unanswered[0]!;
          return record({
            name: "end_interview",
            ok: false,
            message:
              `Rejected: ${unanswered.length} required question${unanswered.length === 1 ? "" : "s"} still ` +
              `unanswered, starting with "${next.title}" (ref=${next.ref}). Ask that one instead.`,
          });
        }
        return record({
          name: "end_interview",
          ok: true,
          effect: { kind: "end", endingRef },
          message: "Wrapping up. Thank them warmly.",
        });
      },
    }),
  };
}
