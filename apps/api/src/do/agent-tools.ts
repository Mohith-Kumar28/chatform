import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { Block, FormDoc } from "@repo/form-schema";

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

export interface ToolContext {
  doc: FormDoc;
  currentBlock: Block;
  /** Refs the FSM would accept as the next question right now. */
  allowedNext: string[];
  /** Clarifications already spent on the current block. */
  clarifications: number;
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

  return {
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
          message: "Answer accepted. Move on to the next question.",
        });
      },
    }),

    answer_from_knowledge: tool({
      description:
        "Look up something the respondent asked about, from the form's knowledge base. Use this before answering any question about pricing, policy, the product, or the form itself.",
      inputSchema: z.object({ query: z.string().describe("What they want to know.") }),
      execute: async ({ query }) => {
        const kb = ctx.doc.settings.agent.knowledge;
        if (kb.length === 0) {
          return record({
            name: "answer_from_knowledge",
            ok: true,
            message:
              "No knowledge base is configured for this form. Answer from the form's title and description only, and say if you are unsure.",
          });
        }
        // Deliberately simple lexical scoring: the whole KB is capped at ~20k
        // characters and already sits in the system prompt, so this is about
        // pointing the model at the right entry, not retrieval.
        const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
        const scored = kb
          .map((entry) => {
            const hay = `${entry.title} ${entry.body}`.toLowerCase();
            return { entry, score: terms.filter((t) => hay.includes(t)).length };
          })
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        if (scored.length === 0) {
          return record({
            name: "answer_from_knowledge",
            ok: true,
            message: ctx.doc.settings.agent.guardrails.answerOffTopic
              ? "Nothing in the knowledge base covers that. Answer briefly from general knowledge and say you are not certain."
              : `Nothing in the knowledge base covers that. Say: "${ctx.doc.settings.agent.guardrails.refusalMessage}"`,
          });
        }
        return record({
          name: "answer_from_knowledge",
          ok: true,
          message: scored.map((s) => `### ${s.entry.title}\n${s.entry.body}`).join("\n\n"),
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
          message: "Skipped. Acknowledge it warmly and move on.",
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

    end_interview: tool({
      description: "Finish the conversation. Only when every required question is answered, or they ask to stop.",
      inputSchema: z.object({ endingRef: z.string().optional() }),
      execute: async ({ endingRef }) => {
        const unanswered = ctx.doc.blocks.filter(
          (b) => b.required && !["welcome", "statement"].includes(b.type),
        );
        if (endingRef && !ctx.doc.endings.some((e) => e.ref === endingRef)) {
          return record({
            name: "end_interview",
            ok: false,
            message: `Rejected: there is no ending with ref=${endingRef}.`,
          });
        }
        return record({
          name: "end_interview",
          ok: true,
          effect: { kind: "end", endingRef },
          message: `Wrapping up${unanswered.length ? " early" : ""}. Thank them warmly.`,
        });
      },
    }),
  };
}
