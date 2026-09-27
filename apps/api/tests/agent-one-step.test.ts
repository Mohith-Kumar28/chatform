import { describe, expect, it } from "vitest";
import { FormDoc, type EvalState } from "@repo/form-schema";
import {
  answerSteersFlow,
  buildAgentTools,
  nextStepAfter,
  settledInOneStep,
  type NextStep,
  type ToolOutcome,
} from "../src/do/agent-tools.js";

/**
 * One model round trip per typed answer, where the flow allows it.
 *
 * A typed answer used to cost two: the model recorded it, waited for the tool
 * result to learn the next question, then wrote it. About two seconds each. When
 * nothing reads the answer, the next question is known before the answer is, so
 * the model is told it up front and the turn stops after the first step. On the
 * last question the second step only ever wrote a closing line the ending says
 * anyway.
 */

const doc = FormDoc.parse({
  title: "Hackathon sign-up",
  blocks: [
    { id: "blk_bbbb01", ref: "q_name", type: "short_text", title: "What's your name?", required: true },
    { id: "blk_bbbb02", ref: "q_team", type: "short_text", title: "What's your team called?", required: true },
    { id: "blk_bbbb03", ref: "q_size", type: "number", title: "How many are on your team?", required: true, min: 1, max: 6 },
    { id: "blk_bbbb04", ref: "q_idea", type: "short_text", title: "Hi {{q_team}}, what are you building?", required: true },
  ],
  endings: [{ id: "end_bbbb01", ref: "end_thanks", title: "See you there" }],
  logic: [
    {
      id: "rl_bbbb01",
      action_kind: "goto",
      from: "q_size",
      target: "end_thanks",
      targetKind: "ending",
      when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_size" }, op: "gt", value: 4 }], groups: [] },
    },
  ],
});

const [name, team, size, idea] = doc.blocks as [
  (typeof doc.blocks)[number],
  (typeof doc.blocks)[number],
  (typeof doc.blocks)[number],
  (typeof doc.blocks)[number],
];
const empty = (): EvalState => ({ answers: {}, variables: {}, hidden: {} });

const recorded = (ref: string, value: unknown): ToolOutcome[] => [
  { name: "record_answer", ok: true, effect: { kind: "record", ref, value }, message: "Answer accepted." },
];
const step = (text: string, tools = ["record_answer"]) => [{ text, toolCalls: tools.map((toolName) => ({ toolName })) }];

describe("answerSteersFlow", () => {
  it("is false for an answer nothing reads", () => {
    expect(answerSteersFlow(doc, "q_name")).toBe(false);
  });

  it("is true for an answer a rule branches on", () => {
    expect(answerSteersFlow(doc, "q_size")).toBe(true);
  });

  it("is false for a question that is only a branch's destination", () => {
    const jumpedTo = FormDoc.parse({
      ...doc,
      logic: [
        ...doc.logic,
        {
          id: "rl_bbbb02",
          action_kind: "goto",
          from: "q_name",
          target: "q_idea",
          targetKind: "block",
          when: { op: "and", conditions: [{ left: { kind: "ref", ref: "q_name" }, op: "eq", value: "x" }], groups: [] },
        },
      ],
    });
    expect(answerSteersFlow(jumpedTo, "q_name")).toBe(true);
    expect(answerSteersFlow(jumpedTo, "q_idea")).toBe(false);
  });

  it("is true for an answer piped into a later question", () => {
    expect(answerSteersFlow(doc, "q_team")).toBe(true);
  });
});

describe("settledInOneStep", () => {
  const next: NextStep = { kind: "block", ref: "q_team", title: "What's your team called?" };

  it("stops when the model acknowledged and asked the announced question", () => {
    expect(
      settledInOneStep(doc, empty(), name, step("Nice to meet you, Asha! What's your team called?"), recorded("q_name", "Asha"), {
        announced: next,
        userText: "Asha",
      }),
    ).toBe(true);
  });

  it("carries on when the model only acknowledged", () => {
    expect(
      settledInOneStep(doc, empty(), name, step("Thanks, Asha."), recorded("q_name", "Asha"), { announced: next, userText: "Asha" }),
    ).toBe(false);
  });

  it("carries on when the respondent also asked something", () => {
    expect(
      settledInOneStep(
        doc,
        empty(),
        name,
        step("Hi Asha! What's your team called?"),
        recorded("q_name", "Asha"),
        { announced: next, userText: "Asha, do we get food?" },
      ),
    ).toBe(false);
  });

  it("carries on when nothing was announced", () => {
    expect(
      settledInOneStep(doc, empty(), name, step("Hi Asha! What's your team called?"), recorded("q_name", "Asha"), {
        userText: "Asha",
      }),
    ).toBe(false);
  });

  it("carries on after a rejected or missing record_answer", () => {
    const rejected: ToolOutcome[] = [{ name: "record_answer", ok: false, message: "Rejected" }];
    expect(settledInOneStep(doc, empty(), name, step("What's your team called?"), rejected, { announced: next })).toBe(false);
    expect(
      settledInOneStep(doc, empty(), name, step("Let me check.", ["answer_from_knowledge"]), [], { announced: next }),
    ).toBe(false);
  });

  it("carries on for a value the flow would refuse", () => {
    const told: NextStep = { kind: "block", ref: "q_idea", title: idea.title };
    expect(settledInOneStep(doc, empty(), size, step("Got it. What are you building?"), recorded("q_size", 40), { announced: told })).toBe(
      false,
    );
  });

  it("stops on the last question even with no text, since the ending speaks for itself", () => {
    const direct = FormDoc.parse({ ...doc, settings: { ...doc.settings, onComplete: { ...doc.settings.onComplete, requireSubmit: false } } });
    const answered: EvalState = { answers: { q_name: "Asha", q_team: "Nova", q_size: 3 }, variables: {}, hidden: {} };
    expect(
      settledInOneStep(direct, answered, idea, step(""), recorded("q_idea", "A bot"), { announced: { kind: "ending" }, userText: "A bot" }),
    ).toBe(true);
  });

  it("waits for the check-and-send line when the form has a review step (the default)", () => {
    const review = doc;
    const answered: EvalState = { answers: { q_name: "Asha", q_team: "Nova", q_size: 3 }, variables: {}, hidden: {} };
    const opts = { announced: { kind: "ending" } as NextStep, userText: "A bot" };
    expect(settledInOneStep(review, answered, idea, step(""), recorded("q_idea", "A bot"), opts)).toBe(false);
    expect(settledInOneStep(review, answered, idea, step("Have a look below and send it."), recorded("q_idea", "A bot"), opts)).toBe(true);
  });

  it("stops a verbatim form once the model has acknowledged", () => {
    const verbatim = FormDoc.parse({ ...doc, settings: { ...doc.settings, agent: { ...doc.settings.agent, rephraseQuestions: false } } });
    expect(settledInOneStep(verbatim, empty(), name, step("Thanks!"), recorded("q_name", "Asha"), {})).toBe(true);
    expect(settledInOneStep(verbatim, empty(), name, step(""), recorded("q_name", "Asha"), {})).toBe(false);
  });
});

describe("record_answer after an announced question", () => {
  it("tells the model not to ask it a second time", async () => {
    const tools = buildAgentTools(
      {
        doc,
        currentBlock: name,
        nextAfter: (value?: unknown) => nextStepAfter(doc, name, empty(), value),
        clarifications: 0,
        announced: { kind: "block", ref: "q_team", title: team.title },
      },
      () => {},
    );
    const out = (await (
      tools.record_answer as { execute: (a: { ref: string; value: unknown }) => Promise<string> }
    ).execute({ ref: "q_name", value: "Asha" })) as string;
    expect(out).toContain("already asks it");
    expect(out).toContain("write nothing more");
  });
});
