import { describe, expect, it } from "vitest";
import { buildFlowRules, FormDoc, type DraftBranch } from "@repo/form-schema";
import { cutConnections, deriveGraph, isGoto } from "@/components/builder/flow-graph";
import { nodeSize } from "@/components/builder/flow-layout";
import { routeWire } from "@/components/builder/flow-route";

/**
 * The flow canvas: what cutting a wire does to the rules, and how the auto
 * layout draws the shapes real forms take (a hackathon sign-up that splits
 * three ways into arms of different lengths, a VC intake whose arms end at
 * their own endings).
 */

const q = (ref: string, title: string, extra: Record<string, unknown> = {}) => ({
  id: `blk_${ref}`,
  ref,
  type: "short_text",
  title,
  required: true,
  ...extra,
});
const optId = (label: string) => `opt_${label.toLowerCase().replace(/\W+/g, "_")}`;
const choice = (ref: string, title: string, options: string[]) =>
  q(ref, title, { type: "single_select", options: options.map((o) => ({ id: optId(o), label: o })) });
const ending = (ref: string, kind: "success" | "screen_out" = "success") => ({ id: ref, ref, title: ref, bodyMd: "", kind });
const pick = (ref: string, option: string, then: string): DraftBranch => ({
  when: { ref, op: "eq", value: optId(option) },
  then,
});
const always = (ref: string, then: string): DraftBranch => ({ when: { ref, op: "is_not_empty", value: null }, then });

function form(blocks: ReturnType<typeof q>[], endings: ReturnType<typeof ending>[], branches: DraftBranch[]) {
  const logic = buildFlowRules(branches, blocks as never, endings.map((e) => e.ref));
  return FormDoc.parse({ title: "T", blocks, endings, logic });
}

const hackathon = () =>
  form(
    [
      q("welcome", "Welcome", { type: "welcome" }),
      q("q_age", "Age", { type: "number" }),
      choice("q_role", "Role", ["Participant", "Mentor", "Visitor"]),
      q("q_team", "Team"),
      q("q_size", "Size", { type: "number" }),
      q("q_problem", "Problem"),
      q("q_expertise", "Expertise"),
      q("q_org", "Organisation"),
      q("q_days", "Days"),
      q("q_tshirt", "T-shirt"),
    ],
    [ending("end_thanks"), ending("end_young", "screen_out")],
    [
      { when: { ref: "q_age", op: "lt", value: 18 }, then: "end_young" },
      pick("q_role", "Participant", "q_team"),
      pick("q_role", "Mentor", "q_expertise"),
      pick("q_role", "Visitor", "q_org"),
    ],
  );

const intake = () =>
  form(
    [
      q("welcome", "Pitch", { type: "welcome" }),
      choice("q_stage", "Stage", ["Pre-seed", "Seed", "Series A"]),
      q("q_idea", "Idea"),
      q("q_traction", "Traction"),
      q("q_deck", "Deck"),
      q("q_revenue", "Revenue"),
    ],
    [ending("end_early"), ending("end_apply"), ending("end_partner")],
    [
      pick("q_stage", "Pre-seed", "q_idea"),
      pick("q_stage", "Seed", "q_traction"),
      pick("q_stage", "Series A", "q_revenue"),
      always("q_idea", "end_early"),
      always("q_deck", "end_apply"),
      always("q_revenue", "end_partner"),
    ],
  );

function draw(doc: FormDoc) {
  const graph = deriveGraph(doc, doc.logic.filter(isGoto));
  const at = new Map(graph.nodes.map((n) => [n.id, { ...n.position, ...nodeSize(n) }]));
  return { graph, at };
}

function expectNoOverlaps(at: Map<string, { x: number; y: number; width: number; height: number }>) {
  const boxes = [...at.entries()];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, p] = boxes[i]!;
      const [b, r] = boxes[j]!;
      const overlap = p.x < r.x + r.width && r.x < p.x + p.width && p.y < r.y + r.height && r.y < p.y + p.height;
      expect(overlap, `${a} overlaps ${b}`).toBe(false);
    }
  }
}

describe("auto layout", () => {
  it("puts a three-way split's arms side by side under the branch, in option order", () => {
    const { at } = draw(hackathon());
    const heads = ["q_team", "q_expertise", "q_org"].map((ref) => at.get(ref)!);
    // All three start on the row below the branch, however long each arm is.
    expect(new Set(heads.map((h) => Math.round(h.y))).size).toBe(1);
    expect(heads[0]!.y).toBeGreaterThan(at.get("branch_q_role")!.y);
    // Participant, Mentor, Visitor, left to right.
    expect(heads[0]!.x).toBeLessThan(heads[1]!.x);
    expect(heads[1]!.x).toBeLessThan(heads[2]!.x);
    // The long arm keeps its own column.
    expect(Math.round(at.get("q_size")!.x)).toBe(Math.round(heads[0]!.x));
    expectNoOverlaps(at);
  });

  it("puts every ending on the bottom row, even one reached from the second question", () => {
    const { at } = draw(hackathon());
    const bottom = Math.max(...[...at.values()].map((b) => b.y));
    expect(at.get("end_young")!.y).toBe(bottom);
    expect(at.get("end_thanks")!.y).toBe(bottom);
    for (const [id, box] of at) if (!id.startsWith("end_")) expect(box.y).toBeLessThan(bottom);
  });

  it("puts an ending nothing leads to on the bottom row too, not beside the welcome", () => {
    const base = hackathon();
    const doc = FormDoc.parse({ ...base, endings: [...base.endings, ending("end_orphan")] });
    const { at } = draw(doc);
    const bottom = Math.max(...[...at.values()].map((b) => b.y));
    expect(at.get("end_orphan")!.y).toBe(bottom);
    expectNoOverlaps(at);
  });

  it("keeps arms in order and apart when each ends at its own ending", () => {
    const { at } = draw(intake());
    const heads = ["q_idea", "q_traction", "q_revenue"].map((ref) => at.get(ref)!.x);
    expect(heads).toEqual([...heads].sort((a, b) => a - b));
    // Each ending under its own arm, so no two wires cross on the way down.
    const endings = ["end_early", "end_apply", "end_partner"].map((ref) => at.get(ref)!.x);
    expect(endings).toEqual([...endings].sort((a, b) => a - b));
    expectNoOverlaps(at);
  });

  it("keeps the arm order when the longest arm ends the form instead of rejoining", () => {
    const doc = hackathon();
    const rejoin = doc.logic.find((r) => isGoto(r) && r.from === "q_problem")!;
    const { logic } = cutConnections(doc, [rejoin.id], () => "rl_cut00001");
    const { at } = draw({ ...doc, logic });
    const heads = ["q_team", "q_expertise", "q_org"].map((ref) => at.get(ref)!.x);
    expect(heads).toEqual([...heads].sort((a, b) => a - b));
    expectNoOverlaps(at);
  });
});

describe("cutting a wire", () => {
  const rules = (logic: FormDoc["logic"], from: string) =>
    logic.filter((r) => isGoto(r) && r.from === from).map((r) => (isGoto(r) ? r.target : ""));

  it("ends an arm's tail at the finish instead of re-aiming it at the next node", () => {
    const doc = hackathon();
    const rejoin = doc.logic.find((r) => isGoto(r) && r.from === "q_problem")!;
    const { logic, refused } = cutConnections(doc, [rejoin.id], () => "rl_cut00001");
    expect(refused).toBe(false);
    // The accepting ending, not the screen-out that happens to be listed too.
    expect(rules(logic, "q_problem")).toEqual(["end_thanks"]);
  });

  it("ends a question whose fall-through wire is cut", () => {
    const doc = hackathon();
    const { logic } = cutConnections(doc, ["seq-q_days"], () => "rl_cut00001");
    expect(rules(logic, "q_days")).toEqual(["end_thanks"]);
  });

  it("removes a conditional route, so its answers fall through", () => {
    const doc = hackathon();
    const mentor = doc.logic.find((r) => isGoto(r) && r.target === "q_expertise")!;
    const { logic } = cutConnections(doc, [`case_${mentor.id}`], () => "rl_cut00001");
    expect(logic.some((r) => r.id === mentor.id)).toBe(false);
    expect(logic).toHaveLength(doc.logic.length - 1);
  });

  it("refuses to cut a wire that already finishes the form, and changes nothing", () => {
    const doc = hackathon();
    const { logic, refused } = cutConnections(doc, ["seq-q_tshirt"], () => "rl_cut00001");
    expect(refused).toBe(true);
    expect(logic).toBe(doc.logic);
  });

  it("leaves the wire into a branch node alone", () => {
    const doc = hackathon();
    expect(cutConnections(doc, ["into_q_role"], () => "rl_cut00001").logic).toBe(doc.logic);
  });
});

describe("routeWire", () => {
  it("steps around a box sitting in the straight line down", () => {
    const blocker = { id: "mid", x: 80, y: 100, width: 100, height: 60 };
    const route = routeWire({ x: 130, y: 40 }, { x: 130, y: 260 }, [blocker]);
    const xs = [...route.path.matchAll(/[LM] ([\d.-]+) ([\d.-]+)/g)].map((m) => Number(m[1]));
    expect(xs.some((x) => x < blocker.x || x > blocker.x + blocker.width)).toBe(true);
  });

  it("draws a straight drop when nothing is in the way", () => {
    const route = routeWire({ x: 50, y: 0 }, { x: 50, y: 120 }, []);
    expect(route.path).toBe("M 50 0 L 50 120");
  });
});
