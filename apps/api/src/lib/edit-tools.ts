import { z } from "zod";
import { tool, type ToolSet } from "ai";
import {
  ADDABLE_BLOCK_TYPES,
  BLOCK_CATALOG,
  DRAFT_BRANCH_OPS,
  describeBlockType,
  renderBlockCatalog,
  type BlockType,
  type FormDoc,
} from "@repo/form-schema";
import type { EditDraft } from "./ai.js";
import { validateBlockConfig } from "./draft-normalize.js";

/**
 * The edit bar's toolset.
 *
 * Same contract as `do/agent-tools.ts`, and for the same reason: the LLM is a
 * constrained actor, never the controller. Every verb it gets is here, every
 * one is checked before it counts, and a refused call comes back as a sentence
 * it can act on rather than a silent no-op.
 *
 * What this replaces is a single `generateObject` call that wrote an entire
 * document in one shot, with 27 block types and their settings recited as
 * ~5.7 KB of English in front of it, and `config` as an unchecked string. A
 * key the model misspelled was dropped by `parseBlockConfig` without a word,
 * and four whole types — scheduling, field_group, matrix, and any choice
 * question with one option — were silently DOWNGRADED to a text question by
 * `normalizeBlock` when their setup was incomplete. The author saw a question
 * that was not the one they asked for, and nothing anywhere said why.
 *
 * Two deliberate departures from the interview's toolset:
 *
 * 1. These tools mutate. `set_branch` has to be able to point at a question
 *    added earlier in the same turn, and a guard that cannot see
 *    `add_question`'s effect would refuse the commonest two-call edit there
 *    is ("add a question, route Android to it"). What they mutate is the
 *    DRAFT — never a `FormDoc`. `applyEditDraft` stays the single place a
 *    proposal becomes a document, so there is still one writer.
 * 2. The catalog is INLINE, not discovered — and that is a measured decision
 *    that went against the design it started from.
 *
 *    The plan was a names-only index in `add_question` plus a
 *    `get_question_type` lookup for the two or three types an edit touches,
 *    on the reasoning that the catalog is the part which grows without bound.
 *    Measured on `bench-edit`, it cost more than it saved: the model called
 *    the lookup defensively on almost every edit, and one extra step is
 *    ~5,000 tokens — the whole context is re-sent — where the entire 27-type
 *    catalog is ~1,400. Inlining it took the loop from 11,887ms/14,962 tokens
 *    to 8,485ms/10,468 with identical results.
 *
 *    The crossover is arithmetic, so it can be checked rather than guessed:
 *    discovery starts paying when the catalog costs more than a round trip,
 *    around 5,000 tokens of catalog — roughly 90-100 block types at today's
 *    per-type size. `renderBlockIndex` is kept for that day; until then the
 *    model sees everything, every turn, which is also the arrangement with no
 *    retrieval step to get wrong.
 */

/** One tool call's outcome, collected for the caller. */
export interface EditOutcome {
  name: string;
  ok: boolean;
  message: string;
}

/** What a guard needs to know about a question already in (or added to) the form. */
export interface EditBlockView {
  ref: string;
  type: BlockType;
  title: string;
  /** Choice labels as the respondent reads them, for matching a branch value. */
  optionLabels: string[];
  /** False for a question this edit added — `configure_question` refuses those. */
  existing: boolean;
}

export interface EditToolContext {
  /** Refs in document order, kept current as adds and removals land. */
  order: string[];
  blocks: Map<string, EditBlockView>;
  endings: Map<string, { kind: "success" | "screen_out"; title: string }>;
  /** The proposal being accumulated. Never a FormDoc. */
  draft: EditDraft;
  /**
   * Apply-and-check, injected by the caller — the same shape as the interview
   * toolset's `searchKnowledge` and `nextAfter`. Keeps this module free of
   * document surgery, and lets a test drive the loop without one.
   */
  review: (draft: EditDraft) => { introduced: { code: string; message: string }[] };
  /** How many times `finish_edit` has come back with problems. */
  reviewAttempts: number;
  /** The fewest-problems proposal seen so far, and its problems. */
  best: { draft: EditDraft; problems: { code: string; message: string }[] } | null;
  /** Set once the model has called `finish_edit` and the check passed. */
  finished: boolean;
}

/** Caps, mirroring `DRAFT_LIMITS` so a loop cannot outgrow what `clampDraft` keeps. */
const LIMITS = { addBlocks: 12, updateBlocks: 12, removeRefs: 12, branches: 12, endings: 5 } as const;

/** How many times `finish_edit` may be told to try again before we take what we have. */
const MAX_REVIEWS = 2;

const emptyDraft = (): EditDraft => ({
  addBlocks: [],
  updateBlocks: [],
  endings: [],
  removeRefs: [],
  // Never written: replacement is decided per answer from `branches`. Kept so
  // the draft still satisfies `EditDraft` for `applyEditDraft`.
  rewireRefs: [],
  branches: [],
  summary: "",
});

/**
 * The form as the guards see it: refs in order, with the labels a branch value
 * has to match. Built once per edit, then kept current by the tools.
 */
export function buildEditContext(
  base: FormDoc,
  review: EditToolContext["review"],
): EditToolContext {
  const blocks = new Map<string, EditBlockView>();
  for (const b of base.blocks) {
    blocks.set(b.ref, {
      ref: b.ref,
      type: b.type,
      title: b.title,
      optionLabels:
        "options" in b && Array.isArray(b.options)
          ? (b.options as { label: string }[]).map((o) => o.label)
          : [],
      existing: true,
    });
  }
  return {
    order: base.blocks.map((b) => b.ref),
    blocks,
    endings: new Map(base.endings.map((e) => [e.ref, { kind: e.kind ?? "success", title: e.title }])),
    draft: emptyDraft(),
    review,
    reviewAttempts: 0,
    best: null,
    finished: false,
  };
}

/** The refs a guard can name back, so a rejection is actionable rather than a "no". */
const refList = (ctx: EditToolContext): string => ctx.order.join(", ");

export function buildEditTools(
  ctx: EditToolContext,
  collect: (outcome: EditOutcome) => void,
): ToolSet {
  /**
   * Three refused calls in a row and the model stops being asked.
   *
   * Copied from the interview's reliability floor (`session-do.ts`), for the
   * same reason: a model that cannot satisfy a guard three times running is not
   * one sentence away from getting it right, and the alternative is spending
   * the step budget discovering that. What it degrades TO is different — there
   * is no template to fall back on here, so it is told to finish with whatever
   * it has, and the caller keeps `ctx.best`.
   */
  let rejectionStreak = 0;
  let degraded = false;

  const reject = (name: string, message: string): string => {
    rejectionStreak++;
    if (rejectionStreak >= 3) degraded = true;
    const out = `Rejected: ${message}`;
    collect({ name, ok: false, message: out });
    return out;
  };

  const accept = (name: string, message: string): string => {
    rejectionStreak = 0;
    collect({ name, ok: true, message });
    return message;
  };

  /** The one check every mutating tool runs first. */
  const blocked = (name: string): string | null => {
    if (degraded) {
      return reject(name, "too many invalid calls on this edit. Call finish_edit with what you have.");
    }
    if (ctx.finished) {
      return reject(name, "this edit is already finished. Do not call any more tools.");
    }
    return null;
  };

  return {
    /**
     * The per-type detail, on demand.
     *
     * Demoted from "call this first" to "call this if a key was refused", for
     * the cost reason in the header note — as the expected opening move it
     * added a round trip to almost every edit. It stays because a rejection
     * naming the keys a type accepts is more useful when the model can also
     * ask for the list directly, and because it is the half that survives when
     * the catalog outgrows the prompt.
     */
    get_question_type: tool({
      description:
        "The exact config keys for one question type, as a checked list rather than prose. " +
        "You should not normally need this — add_question already describes every type. Use it only when a config key has " +
        "been rejected and you need to see precisely what that type accepts.",
      inputSchema: z.object({
        type: z.enum(ADDABLE_BLOCK_TYPES).describe("The question type to describe."),
      }),
      execute: async ({ type }) => {
        const d = describeBlockType(type);
        const lines = [
          `${d.type} — ${d.summary}`,
          d.needsOptions ? "Needs at least two options." : "Takes no options.",
          d.configKeys.length > 0
            ? `config keys: ${d.configKeys.join(", ")}, required`
            : "config keys: required only",
        ];
        if (d.config) lines.push(`How to set it: ${d.config}`);
        for (const group of d.requires) {
          lines.push(`Cannot be built without ${group.map((k) => `${k}=`).join(" or ")}.`);
        }
        return accept("get_question_type", lines.join("\n"));
      },
    }),

    add_question: tool({
      description:
        "Add a new question to the form.\n\n" +
        "Most edits to a working form need NONE of these — a request about who gets asked what is a routing change, so use " +
        "set_branch. Never add a question to carry a setting an existing one could have had; use configure_question.\n\n" +
        "The types you may add, what each collects, and how each is configured:\n" +
        renderBlockCatalog(ADDABLE_BLOCK_TYPES),
      inputSchema: z.object({
        ref: z.string().describe("lowercase snake_case, unique, prefixed by topic: q_email, q_role, q_team_size."),
        type: z.enum(ADDABLE_BLOCK_TYPES),
        title: z.string().min(1).describe("The question as the respondent reads it."),
        description: z.string().describe('Reassurance, format, or a media URL on its own line. "" for none.'),
        required: z.boolean(),
        options: z
          .array(z.string())
          .describe('Choice labels as written for the respondent — ["Android", "iPhone"]. [] for types that take none.'),
        scale: z.number().int().min(0).max(20).describe("rating: how many stars. opinion_scale: how many steps. 0 otherwise."),
        config: z
          .string()
          .describe(
            'Per-type setup as "key=value; key=value", using exactly the keys that type documents. "" when it needs none. ' +
              "An amount, an id or a URL the author gave you goes here, never in the title.",
          ),
        insertAfter: z
          .string()
          .describe(
            'The ref this goes directly after — one already in the form, or one you added earlier this turn. "" for the end. ' +
              "A question only asked for SOME answers must sit immediately below the question that decides it.",
          ),
      }),
      execute: async (input) => {
        const stop = blocked("add_question");
        if (stop) return stop;
        const { ref, type, title, description, required, options, scale, config, insertAfter } = input;

        if (ctx.blocks.has(ref)) {
          return reject(
            "add_question",
            `ref "${ref}" is already in this form. Use configure_question to change it, or pick another ref.`,
          );
        }
        if (!/^[a-z][a-z0-9_]*$/.test(ref)) {
          return reject("add_question", `ref "${ref}" must be lowercase snake_case, e.g. q_email.`);
        }
        if (insertAfter && !ctx.blocks.has(insertAfter)) {
          return reject(
            "add_question",
            `there is no question with ref "${insertAfter}". This form has: ${refList(ctx)}. Use "" to put it at the end.`,
          );
        }
        if (ctx.draft.addBlocks.length >= LIMITS.addBlocks) {
          return reject("add_question", `an edit may add at most ${LIMITS.addBlocks} questions.`);
        }

        // The silent downgrades, said out loud. Each of these used to produce a
        // short_text question with no explanation.
        const labels = options.map((o) => o.trim()).filter(Boolean);
        if (BLOCK_CATALOG[type].needsOptions && labels.length < 2) {
          return reject(
            "add_question",
            `a ${type} question needs at least two options. You gave ${labels.length}. ` +
              `If there is genuinely only one choice, this is not a choice question.`,
          );
        }
        const configCheck = validateBlockConfig(type, config, "add");
        if (!configCheck.ok) return reject("add_question", configCheck.message);

        ctx.draft.addBlocks.push({ ref, type, title, description, required, options: labels, scale, config, insertAfter });
        // Visible to every later guard in this same turn, which is what lets
        // set_branch point at it.
        ctx.blocks.set(ref, { ref, type, title, optionLabels: labels, existing: false });
        const at = insertAfter ? ctx.order.indexOf(insertAfter) : -1;
        if (at >= 0) ctx.order.splice(at + 1, 0, ref);
        else ctx.order.push(ref);

        return accept("add_question", `Added "${title}" (${type}) as ${ref}${insertAfter ? `, after ${insertAfter}` : " at the end"}.`);
      },
    }),

    configure_question: tool({
      description:
        "Change the settings or the wording of a question that is ALREADY in the form. This is the answer to " +
        '"the team name has to be unique", "make the email required", "cap that at 50", "work emails only", ' +
        '"only accept college addresses". Only the keys you write are changed; every other setting is left alone.',
      inputSchema: z.object({
        ref: z.string().describe("A ref already in the form."),
        config: z
          .string()
          .describe('"key=value; key=value" using the keys this question\'s type documents. "" to change only the description.'),
        description: z
          .string()
          .describe(
            '"" leaves the description alone. Anything else REPLACES it whole — keep the text that is there and add to it. ' +
              "A video, image or link goes here as its URL alone on its own line.",
          ),
      }),
      execute: async ({ ref, config, description }) => {
        const stop = blocked("configure_question");
        if (stop) return stop;

        const block = ctx.blocks.get(ref);
        if (!block) {
          return reject("configure_question", `there is no question with ref "${ref}". This form has: ${refList(ctx)}.`);
        }
        if (!block.existing) {
          return reject(
            "configure_question",
            `"${ref}" was added by this edit — set it up with add_question's config instead of changing it afterwards.`,
          );
        }
        if (!config.trim() && !description.trim()) {
          return reject("configure_question", "give a config or a description; this call changes nothing.");
        }
        const configCheck = validateBlockConfig(block.type, config, "update");
        if (!configCheck.ok) return reject("configure_question", configCheck.message);
        if (ctx.draft.updateBlocks.length >= LIMITS.updateBlocks) {
          return reject("configure_question", `an edit may change at most ${LIMITS.updateBlocks} questions.`);
        }

        ctx.draft.updateBlocks.push({ ref, config, description });
        return accept("configure_question", `Updated ${ref}${config.trim() ? ` (${config.trim()})` : ""}.`);
      },
    }),

    remove_question: tool({
      description: "Take a question out of the form. Only when the request actually asks for it to go.",
      inputSchema: z.object({ ref: z.string().describe("A ref already in the form.") }),
      execute: async ({ ref }) => {
        const stop = blocked("remove_question");
        if (stop) return stop;

        const block = ctx.blocks.get(ref);
        if (!block) {
          return reject("remove_question", `there is no question with ref "${ref}". This form has: ${refList(ctx)}.`);
        }
        if (block.type === "welcome") {
          return reject("remove_question", "the welcome block is the form's opening and cannot be removed.");
        }
        if (ctx.draft.removeRefs.length >= LIMITS.removeRefs) {
          return reject("remove_question", `an edit may remove at most ${LIMITS.removeRefs} questions.`);
        }

        ctx.draft.removeRefs.push(ref);
        ctx.blocks.delete(ref);
        ctx.order = ctx.order.filter((r) => r !== ref);
        return accept("remove_question", `Removed ${ref} ("${block.title}").`);
      },
    }),

    set_branch: tool({
      description:
        "Route one answer to one destination.\n\n" +
        "This REPLACES the existing rule for the same question and the same answer, and leaves every other route alone. " +
        "So restate the routes you are changing, in full — including an answer whose destination stays the same but whose " +
        "neighbours are moving. A route you do not mention keeps working exactly as it does now.\n\n" +
        "Answers you do not branch fall through to the question directly below. There is no operator for \"and then\": if a " +
        "question should be SKIPPED by some answers, branch the answers that skip it past it, not the ones that reach it.",
      inputSchema: z.object({
        whenRef: z.string().describe("The ref of the question whose answer decides this."),
        op: z.enum(DRAFT_BRANCH_OPS),
        value: z
          .string()
          .describe("For a choice question, the option's LABEL exactly as it is listed. Otherwise the literal value."),
        then: z.string().describe("A question ref BELOW whenRef, or an ending ref."),
      }),
      execute: async ({ whenRef, op, value, then }) => {
        const stop = blocked("set_branch");
        if (stop) return stop;

        const from = ctx.blocks.get(whenRef);
        if (!from) {
          return reject("set_branch", `there is no question with ref "${whenRef}". This form has: ${refList(ctx)}.`);
        }
        const toEnding = ctx.endings.has(then);
        const toBlock = ctx.blocks.get(then);
        if (!toEnding && !toBlock) {
          return reject(
            "set_branch",
            `there is no question or ending with ref "${then}". Questions: ${refList(ctx)}. ` +
              `Endings: ${[...ctx.endings.keys()].join(", ")}. Create the ending with set_ending first if it should be a new one.`,
          );
        }
        // A backwards jump is how a form loops forever. `buildFlowRules` drops
        // these silently, which is how a rewire quietly lost an arm.
        if (!toEnding) {
          const fromAt = ctx.order.indexOf(whenRef);
          const toAt = ctx.order.indexOf(then);
          if (toAt <= fromAt) {
            return reject(
              "set_branch",
              `"${then}" is asked at or before "${whenRef}", so a branch from ${whenRef} to ${then} would loop and be discarded. ` +
                `Move it below with add_question insertAfter=${whenRef}, or point at something further down.`,
            );
          }
        }
        // A value the deciding question cannot produce routes nobody.
        if (from.optionLabels.length > 0 && value.trim()) {
          const known = from.optionLabels.some((l) => l.toLowerCase() === value.trim().toLowerCase());
          if (!known) {
            return reject(
              "set_branch",
              `"${whenRef}" has these options: ${from.optionLabels.map((l) => `"${l}"`).join(", ")}. ` +
                `"${value}" is not one of them — use a label exactly as it is written.`,
            );
          }
        }
        if (ctx.draft.branches.length >= LIMITS.branches) {
          return reject("set_branch", `an edit may set at most ${LIMITS.branches} routes.`);
        }

        ctx.draft.branches.push({ whenRef, op, value, then });
        return accept("set_branch", `Routed ${whenRef} ${op} "${value}" → ${then}.`);
      },
    }),

    set_ending: tool({
      description:
        "Add an outcome, or change one that already exists. A ref already in the form is changed in place; any other ref adds a new one.\n\n" +
        'A "screen_out" REFUSES the respondent — they have told you something that means they cannot submit. It is what a failing ' +
        "answer must point at. Never point a failing answer at a success ending: that is what makes a form say " +
        '"Submitted Successfully" to somebody it has just turned away. A form must keep at least one success ending.',
      inputSchema: z.object({
        ref: z.string().describe("An existing ending's ref to change, or a new one shaped end_<slug>."),
        title: z.string().min(1).describe("On a screen_out, say plainly that they cannot submit — not a thank-you."),
        body: z.string().describe("What they can do about it, if anything. \"\" when there is genuinely nothing."),
        kind: z.enum(["success", "screen_out"]),
        requirements: z
          .string()
          .describe(
            'screen_out only: what they had to meet, separated by " | ", stated as requirements and not as failures — ' +
              '"A team of 2-5 people | At least one member over 18". "" on a success ending.',
          ),
        redirectUrl: z
          .string()
          .describe('A full https:// address to send them to afterwards, ONLY when the author named one. "" otherwise.'),
      }),
      execute: async ({ ref, title, body, kind, requirements, redirectUrl }) => {
        const stop = blocked("set_ending");
        if (stop) return stop;

        const existing = ctx.endings.get(ref);
        if (!existing && ctx.endings.size >= LIMITS.endings) {
          return reject("set_ending", `this form already has ${LIMITS.endings} outcomes, which is the most it may have.`);
        }
        if (!existing && !/^[a-z][a-z0-9_]*$/.test(ref)) {
          return reject("set_ending", `ref "${ref}" must be lowercase snake_case, e.g. end_sorry.`);
        }
        // Turning the last success ending into a refusal leaves a form nobody
        // can finish.
        if (existing?.kind === "success" && kind === "screen_out") {
          const otherSuccess = [...ctx.endings.entries()].some(([r, e]) => r !== ref && e.kind === "success");
          if (!otherSuccess) {
            return reject(
              "set_ending",
              `"${ref}" is this form's only success ending. A form whose only outcome refuses is a form nobody can finish — ` +
                `add a screen_out under a new ref instead.`,
            );
          }
        }
        if (kind === "success" && requirements.trim()) {
          return reject("set_ending", "requirements belong on a screen_out, which refuses. A success ending accepts the response.");
        }
        if (redirectUrl.trim() && !/^https?:\/\//i.test(redirectUrl.trim())) {
          return reject("set_ending", `"${redirectUrl}" is not a full address. Give a complete https:// URL, or "" for none.`);
        }

        ctx.draft.endings.push({ ref, title, body, kind, requirements, redirectUrl });
        ctx.endings.set(ref, { kind, title });
        return accept("set_ending", `${existing ? "Changed" : "Added"} ${kind === "screen_out" ? "screen-out" : "success"} ending ${ref}.`);
      },
    }),

    /**
     * The verification half.
     *
     * The linter this calls already existed and already ran — on the OUTSIDE of
     * the model, once, after the whole document had been written, with a full
     * ~10 KB prompt spent on the retry. Here the model still has its tool
     * results in context, so the same feedback costs a few hundred tokens and
     * it can fix one branch instead of redrafting the form.
     *
     * `ctx.best` keeps the "only if strictly better" rule the route's retry had:
     * a second attempt that makes things worse is discarded, not applied.
     */
    finish_edit: tool({
      description:
        "Call this once, when the edit is complete. It checks the flow: if your changes leave a question unreachable, or an " +
        "answer with no route to an ending, it tells you what broke and you fix it and call again.",
      inputSchema: z.object({
        summary: z
          .string()
          .describe("One plain sentence for the builder, describing only what you actually changed."),
      }),
      execute: async ({ summary }) => {
        if (degraded) {
          ctx.draft.summary = summary;
          ctx.finished = true;
          return accept("finish_edit", "Finished with what was valid.");
        }
        if (ctx.finished) return reject("finish_edit", "this edit is already finished.");

        const touched =
          ctx.draft.addBlocks.length +
          ctx.draft.updateBlocks.length +
          ctx.draft.removeRefs.length +
          ctx.draft.branches.length +
          ctx.draft.endings.length;
        if (touched === 0) {
          return reject(
            "finish_edit",
            "you have not changed anything yet. Make the change the request asks for, or say why it needs none.",
          );
        }

        ctx.draft.summary = summary;
        const { introduced } = ctx.review(ctx.draft);

        // Strictly better, or keep what we had.
        if (!ctx.best || introduced.length < ctx.best.problems.length) {
          ctx.best = { draft: structuredClone(ctx.draft), problems: introduced };
        }

        if (introduced.length === 0) {
          ctx.finished = true;
          return accept("finish_edit", "The flow checks out. Edit complete.");
        }

        ctx.reviewAttempts++;
        if (ctx.reviewAttempts > MAX_REVIEWS) {
          // Out of repair attempts. The proposal is still a proposal — the
          // builder sees the warning on it before applying — so this ends the
          // loop rather than spending the remaining steps.
          ctx.finished = true;
          return accept("finish_edit", "Still has flow problems, but out of attempts. Returning the best version.");
        }

        // The linter's own sentences: they are already written as instructions
        // ("give route 2 a condition, or move route 3 above it"), so they go
        // back unedited.
        return reject(
          "finish_edit",
          `your changes broke the flow. The form checker reported:\n` +
            introduced.map((i) => `  - ${i.message}`).join("\n") +
            `\nFix it with set_branch and call finish_edit again. Remember that answers you do not branch fall through to the ` +
            `question directly below.`,
        );
      },
    }),
  };
}
