import { describe, expect, it } from "vitest";
import type { Edge, Node } from "@xyflow/react";
import { nodeSize, placeNodes } from "../src/components/builder/flow-layout";

/** A straight run of questions, plus one the saved layout has never seen. */
function graph(): { nodes: Node[]; edges: Edge[] } {
  const ids = ["welcome", "name", "platform", "device", "phone", "end"];
  return {
    nodes: ids.map((id) => ({
      id,
      type: id === "welcome" ? "start" : id === "end" ? "ending" : "question",
      position: { x: 0, y: 0 },
      data: {},
    })),
    edges: ids.slice(0, -1).map((id, i) => ({ id: `e${i}`, source: id, target: ids[i + 1]! })),
  };
}

describe("placeNodes", () => {
  it("keeps a layout that accounts for every node", () => {
    const { nodes, edges } = graph();
    const saved = Object.fromEntries(nodes.map((n, i) => [n.id, { x: i * 300, y: 7 }]));

    const placed = placeNodes(nodes, edges, saved);

    for (const node of nodes) expect(placed.get(node.id)).toEqual(saved[node.id]);
  });

  it("lays the whole graph out again once a node is missing from it", () => {
    const { nodes, edges } = graph();
    // The shape a form is in after the AI bar adds a question: most nodes have
    // a position from an older canvas, the new one has none.
    const saved = Object.fromEntries(
      nodes.filter((n) => n.id !== "platform").map((n) => [n.id, { x: 9000, y: 9000 }]),
    );

    const placed = placeNodes(nodes, edges, saved);

    // Nothing is left in the old frame — a single leftover coordinate is what
    // put question 3 to the left of the welcome block.
    for (const node of nodes) expect(placed.get(node.id)).not.toEqual({ x: 9000, y: 9000 });
    // And the run reads left to right, in document order.
    const xs = nodes.map((n) => placed.get(n.id)!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  });

  /**
   * The shape that went wrong on the Memorie waitlist: a platform question
   * that splits into an Android arm and an iOS/extension arm, rejoining at
   * the phone number. The canvas drew it with the platform question left of
   * the welcome block.
   */
  it("draws a branching form in reading order", () => {
    const nodes: Node[] = [
      "welcome",
      "name",
      "platform",
      "branch_platform",
      "device",
      "playEmail",
      "email",
      "phone",
      "end",
    ].map((id) => ({
      id,
      type: id.startsWith("branch_") ? "branch" : "question",
      position: { x: 0, y: 0 },
      data: id.startsWith("branch_") ? { cases: [{}, {}, {}], exhaustive: true } : {},
    }));
    const wires: [string, string][] = [
      ["welcome", "name"],
      ["name", "platform"],
      ["platform", "branch_platform"],
      ["branch_platform", "device"],
      ["branch_platform", "email"],
      ["device", "playEmail"],
      ["playEmail", "phone"],
      ["email", "phone"],
      ["phone", "end"],
    ];
    const edges: Edge[] = wires.map(([source, target], i) => ({ id: `e${i}`, source, target }));

    const placed = placeNodes(nodes, edges, {});

    // Every wire runs forwards. A backwards one is a wire doubling back
    // across the canvas, which is what the broken layout looked like.
    for (const [source, target] of wires) {
      expect(placed.get(target)!.x).toBeGreaterThan(placed.get(source)!.x);
    }
    // The two arms sit side by side rather than on top of each other.
    expect(placed.get("device")!.y).not.toBe(placed.get("email")!.y);
  });

  it("lays out a graph with no saved layout at all", () => {
    const { nodes, edges } = graph();
    const placed = placeNodes(nodes, edges, {});
    expect(placed.size).toBe(nodes.length);
  });
});

/**
 * The direction the template page's read-only diagram reads in.
 *
 * Everything the canvas relies on has to hold turned ninety degrees, and the
 * two claims that are easy to break are the ones asserted here: the flow still
 * runs forwards, and a branch's arms still come out in the order its rows are
 * listed — which is now a left-to-right order rather than a top-to-bottom one.
 */
describe("placeNodes, top to bottom", () => {
  /** A question that splits three ways, with each arm reached only from it. */
  function branching(): { nodes: Node[]; edges: Edge[]; arms: string[] } {
    const arms = ["foundations", "intermediate", "advanced"];
    const nodes: Node[] = [
      { id: "welcome", type: "start", position: { x: 0, y: 0 }, data: {} },
      { id: "course", type: "question", position: { x: 0, y: 0 }, data: {} },
      {
        id: "branch_course",
        type: "branch",
        position: { x: 0, y: 0 },
        data: { cases: arms.map((target) => ({ target })), exhaustive: true },
      },
      ...arms.map((id): Node => ({ id, type: "question", position: { x: 0, y: 0 }, data: {} })),
      { id: "end", type: "ending", position: { x: 0, y: 0 }, data: {} },
    ];
    const wires: [string, string][] = [
      ["welcome", "course"],
      ["course", "branch_course"],
      ...arms.map((a): [string, string] => ["branch_course", a]),
      ...arms.map((a): [string, string] => [a, "end"]),
    ];
    return { nodes, edges: wires.map(([source, target], i) => ({ id: `e${i}`, source, target })), arms };
  }

  it("runs down the page rather than across it", () => {
    const { nodes, edges } = graph();
    const placed = placeNodes(nodes, edges, {}, "TB");

    const ys = nodes.map((n) => placed.get(n.id)!.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    // And a straight run is one column: nothing wanders sideways. Compared on
    // centres, because a start pill and a question card are not the same width
    // and dagre aligns what it stacks by the middle.
    const centres = new Set(
      nodes.map((n) => Math.round(placed.get(n.id)!.x + nodeSize(n).width / 2)),
    );
    expect(centres.size).toBe(1);
  });

  it("ignores a layout saved from the canvas", () => {
    const { nodes, edges } = graph();
    // Complete, so the left-to-right path would keep every one of these.
    const saved = Object.fromEntries(nodes.map((n, i) => [n.id, { x: i * 300, y: 7 }]));

    const placed = placeNodes(nodes, edges, saved, "TB");

    // A photograph of the graph running the other way says nothing about where
    // these nodes go down a column.
    expect(nodes.every((n) => placed.get(n.id)!.y === 7)).toBe(false);
  });

  it("puts a branch's arms side by side, in the order its rows read", () => {
    const { nodes, edges, arms } = branching();

    const placed = placeNodes(nodes, edges, {}, "TB");

    // Side by side, on one rank.
    const ys = new Set(arms.map((a) => Math.round(placed.get(a)!.y)));
    expect(ys.size).toBe(1);
    // First row leftmost — the vertical twin of the alignment the canvas does.
    const xs = arms.map((a) => placed.get(a)!.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
  });
});
