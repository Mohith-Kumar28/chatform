import { describe, it, expect } from "vitest";
import { FormDoc, type AnswerMap } from "../src/index";
import { leadFormFixture } from "../src/fixtures";
import {
  replayState,
  unsatisfiedRequired,
  answerability,
  progressOf,
  resolveNext,
  type EvalState,
} from "../src/engine/index";

/**
 * Replay has to agree with the live conversation, or a programmatic response
 * resolves a different ending than the same answers would through the chat.
 *
 * So these tests do not assert replay against a hand-written expectation — they
 * assert it against the flow itself, stepped one answer at a time the way the
 * runtime steps it.
 */

const doc = FormDoc.parse(leadFormFixture);

/** The runtime's own loop: answer, resolve, repeat. */
function walkLive(answers: AnswerMap): { path: string[]; state: EvalState } {
  const state: EvalState = { answers: {}, variables: {}, hidden: {} };
  for (const v of doc.variables) state.variables[v.name] = v.initial;
  const path: string[] = [];
  let cursor = resolveNext(doc, null, state);
  while (cursor.kind === "block") {
    const block = cursor.block;
    path.push(block.ref);
    const passive = block.type === "welcome" || block.type === "statement";
    if (!passive) {
      if (answers[block.ref] === undefined) break;
      state.answers[block.ref] = answers[block.ref]!;
    }
    cursor = resolveNext(doc, block.ref, state);
  }
  return { path, state };
}

describe("replayState", () => {
  it("reproduces the path the live runtime walks", () => {
    const answers: AnswerMap = {
      q_email: "maya@northwind.co",
      q_name: "Maya",
      q_role: "opt_founder1",
      q_detail: "Building a thing",
      q_excitement: 5,
    };
    const live = walkLive(answers);
    const replayed = replayState(doc, answers);
    expect(replayed.path).toEqual(live.path);
    expect(replayed.state.answers).toEqual(live.state.answers);
    expect(replayed.state.variables).toEqual(live.state.variables);
  });

  it("follows a branch the same way, skipping the routed-around question", () => {
    // Answering "Designer" fires a goto that jumps past q_detail.
    const answers: AnswerMap = {
      q_email: "d@studio.co",
      q_name: "Dana",
      q_role: "opt_design01",
      q_excitement: 4,
    };
    const live = walkLive(answers);
    const replayed = replayState(doc, answers);
    expect(replayed.path).toEqual(live.path);
    expect(replayed.path).not.toContain("q_detail");
    expect(replayed.cursor.kind).toBe("block");
  });

  it("stops exactly where the flow is waiting", () => {
    const replayed = replayState(doc, { q_email: "a@b.co" });
    expect(replayed.cursor.kind).toBe("block");
    expect(replayed.cursor.kind === "block" && replayed.cursor.block.ref).toBe("q_name");
  });

  it("reaches the ending when everything on the path is answered", () => {
    const replayed = replayState(doc, {
      q_email: "a@b.co",
      q_name: "A",
      q_role: "opt_dev00001",
      q_detail: "x",
      q_excitement: 3,
      q_consent: { accepted: true, textSha256: "a".repeat(64), ts: Date.now() },
    });
    expect(replayed.cursor.kind).toBe("ending");
    expect(replayed.cursor.kind === "ending" && replayed.cursor.ending.ref).toBe("end_thanks");
  });

  it("reports an answer the flow routed around as off-path", () => {
    // q_detail was answered, then q_role changed to Designer, which routes past it.
    const replayed = replayState(doc, {
      q_email: "a@b.co",
      q_name: "A",
      q_role: "opt_design01",
      q_detail: "written before the branch changed",
      q_excitement: 3,
    });
    expect(replayed.offPath).toContain("q_detail");
    // And it must not influence logic or the ending.
    expect(replayed.state.answers.q_detail).toBeUndefined();
  });

  it("terminates even if a goto cycles", () => {
    const cyclic = FormDoc.parse({
      ...leadFormFixture,
      logic: [
        {
          id: "rl_loop0001",
          action_kind: "goto",
          from: "q_name",
          when: null,
          target: "q_email",
          targetKind: "block",
        },
      ],
    });
    // The guard is a ceiling on steps, not a cycle detector: what matters is
    // that a malformed document cannot hang a request.
    expect(() => replayState(cyclic, { q_email: "a@b.co", q_name: "A" })).not.toThrow();
  });
});

describe("unsatisfiedRequired", () => {
  it("names only what was actually asked and left empty", () => {
    const missing = unsatisfiedRequired(doc, { q_email: "a@b.co" });
    // q_name is where the flow is waiting; q_role and beyond were never asked,
    // so listing them would tell the caller to answer questions that do not
    // exist yet.
    expect(missing.map((m) => m.ref)).toEqual(["q_name"]);
  });

  it("does not demand a required question inside a branch nobody took", () => {
    const missing = unsatisfiedRequired(doc, {
      q_email: "a@b.co",
      q_name: "A",
      q_role: "opt_design01",
      q_excitement: 3,
      q_consent: { accepted: true, textSha256: "b".repeat(64), ts: Date.now() },
    });
    expect(missing).toEqual([]);
  });
});

describe("answerability", () => {
  const partial: AnswerMap = { q_email: "a@b.co" };

  it("accepts the question the flow is waiting on", () => {
    expect(answerability(doc, partial, "q_name").ok).toBe(true);
  });

  it("accepts re-answering something already on the path — that is an edit", () => {
    expect(answerability(doc, partial, "q_email").ok).toBe(true);
  });

  it("refuses a question the flow has not reached", () => {
    const res = answerability(doc, partial, "q_excitement");
    expect(res.ok).toBe(false);
    // Accepting this would report every skipped question as an abandonment.
    expect(res.ok === false && res.code).toBe("block_not_reachable");
  });

  it("refuses a question hidden by its own visibility rule", () => {
    const designer: AnswerMap = { q_email: "a@b.co", q_name: "A", q_role: "opt_design01" };
    const res = answerability(doc, designer, "q_detail");
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.code).toBe("block_not_visible");
  });

  it("refuses a ref that is not a question at all", () => {
    expect(answerability(doc, partial, "nope").ok).toBe(false);
    expect(answerability(doc, partial, "welcome").ok).toBe(false);
  });
});

describe("progressOf", () => {
  it("counts only questions that are actually visible", () => {
    const designer = progressOf(doc, { q_email: "a@b.co", q_name: "A", q_role: "opt_design01" });
    const founder = progressOf(doc, { q_email: "a@b.co", q_name: "A", q_role: "opt_founder1" });
    // The designer branch has one question fewer, so the same three answers are
    // further along.
    expect(designer.totalEstimate).toBeLessThan(founder.totalEstimate);
    expect(designer.pct).toBeGreaterThan(founder.pct);
  });
});
