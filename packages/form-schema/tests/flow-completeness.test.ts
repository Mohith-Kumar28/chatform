import { describe, expect, it } from "vitest";
import { FormDoc, lintFormDoc } from "../src/index";

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

const shell = (blocks: unknown[], logic: unknown[], endings = [{ id: uid("end", 1), ref: "end_thanks", title: "Thanks" }]) =>
  FormDoc.parse({
    schemaVersion: 1, title: "T", blocks, endings, logic,
    endingRules: [], variables: [], hiddenFields: [], settings: {}, theme: {},
  });

const rule = (n: number, from: string, target: string, when: { ref: string; op: string; value?: unknown } | null, targetKind: "block" | "ending" = "block") => ({
  id: uid("rl", n), action_kind: "goto" as const, from,
  when: { op: "and", conditions: when ? [{ left: { kind: "ref", ref: when.ref }, op: when.op, ...("value" in when ? { value: when.value } : {}) }] : [], groups: [] },
  target, targetKind,
});

const q = (n: number, ref: string, type = "short_text") => ({ id: uid("blk", n), ref, type, title: `Q ${ref}` });

describe("flow completeness", () => {
  it("names the refs of unreachable questions, not just a sentence", () => {
    // Nothing routes to q_orphan and the question above it jumps past it.
    const doc = shell(
      [q(1, "q_a"), q(2, "q_orphan"), q(3, "q_end_q")],
      [rule(1, "q_a", "q_end_q", null)],
    );
    const issue = lintFormDoc(doc).find((i) => i.code === "unreachable_blocks");
    expect(issue?.refs).toEqual(["q_orphan"]);
  });

  it("catches a question with no route to any ending", () => {
    // q_b's only rule sends everyone back into q_b's own pocket: the last
    // question routes away unconditionally, so falling off the end never
    // happens and no rule reaches an ending.
    const doc = shell(
      [q(1, "q_a"), q(2, "q_b"), q(3, "q_c")],
      [rule(1, "q_c", "q_b", null)],
    );
    const issue = lintFormDoc(doc).find((i) => i.code === "no_route_to_ending");
    expect(issue?.level).toBe("error");
    expect(issue?.refs).toContain("q_c");
  });

  it("is quiet about a form that simply runs to the end", () => {
    const doc = shell([q(1, "q_a"), q(2, "q_b")], []);
    expect(lintFormDoc(doc).find((i) => i.code === "no_route_to_ending")).toBeUndefined();
    expect(lintFormDoc(doc).find((i) => i.code === "unreachable_blocks")).toBeUndefined();
  });

  it("is quiet when a branch ends the form and the rest falls through", () => {
    const doc = shell(
      [q(1, "q_go", "yes_no"), q(2, "q_more")],
      [rule(1, "q_go", "end_thanks", { ref: "q_go", op: "eq", value: false }, "ending")],
    );
    const codes = lintFormDoc(doc).map((i) => i.code);
    expect(codes).not.toContain("no_route_to_ending");
    expect(codes).not.toContain("unreachable_blocks");
  });
});
