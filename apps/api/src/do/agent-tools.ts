import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { Block, FormDoc } from "@repo/form-schema";
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

export interface ToolContext {
  doc: FormDoc;
  currentBlock: Block;
  /** Refs the FSM would accept as the next question right now. */
  allowedNext: string[];
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

    /**
     * The retrieval verb.
     *
     * This is the only way the knowledge base reaches the model, and that is
     * deliberate. The material used to be pasted whole into the system prompt
     * *and* re-scored here, which put a ceiling on it of whatever fits in a
     * prompt — about twenty thousand characters. Now the prompt says only that
     * a knowledge base exists, and the passages arrive as this tool's result,
     * on the turns where a respondent actually asked something.
     *
     * Two consequences worth keeping in mind when editing:
     *
     * - The stable prefix stays byte-identical across a session, so the
     *   provider's prompt cache keeps serving it. Splicing retrieved text back
     *   into the system prompt would lose that on every turn.
     * - The size of a form's knowledge no longer costs anything per turn. A
     *   500-page manual and a one-line FAQ are the same prompt.
     */
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

        if (!ctx.searchKnowledge || ctx.hasKnowledge === false) {
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
