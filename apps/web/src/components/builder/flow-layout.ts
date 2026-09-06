import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";

/**
 * Automatic placement for the flow canvas.
 *
 * The first version of this was a three-column grid over the blocks in
 * document order, which said nothing about the flow; the second walked the
 * branch structure by hand and still crossed wires as soon as arms rejoined.
 * Both were re-implementing, badly, a solved problem — so this hands the graph
 * to dagre, which is what the layered-DAG layout in every flow editor is.
 *
 * Left to right, so the form reads the way it is answered.
 */

/** Roughly the rendered size of each node type; dagre needs real boxes. */
const SIZES: Record<string, { width: number; height: number }> = {
  start: { width: 180, height: 44 },
  question: { width: 210, height: 56 },
  ending: { width: 190, height: 44 },
  branch: { width: 220, height: 64 },
};

const DEFAULT_SIZE = { width: 210, height: 56 };

/**
 * A branch node grows a row per case, so dagre has to be told how tall it is.
 *
 * This has to track the markup: 2px border top and bottom, a ~34px header, a
 * 22px row per case, one more for "otherwise", and 4px of bottom padding.
 * Under-counting it — the first version forgot the otherwise row — makes dagre
 * reserve less space than the node occupies, and the wires below it run
 * straight through the card.
 */
export function branchNodeHeight(cases: number, exhaustive = false): number {
  const rows = cases + (exhaustive ? 0 : 1);
  return 4 + 34 + rows * 22 + 4;
}

export function layoutGraph(nodes: Node[], edges: Edge[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    // Generous separation: the wires carry labels, and tight ranks put those
    // labels on top of each other.
    ranksep: 110,
    nodesep: 36,
    edgesep: 24,
    marginx: 40,
    marginy: 40,
  });

  for (const node of nodes) {
    const size = SIZES[node.type ?? ""] ?? DEFAULT_SIZE;
    const data = node.data as { cases?: unknown[]; exhaustive?: boolean };
    const height =
      node.type === "branch" ? branchNodeHeight((data.cases ?? []).length, data.exhaustive) : size.height;
    g.setNode(node.id, { width: size.width, height });
  }
  for (const edge of edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target)) g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const out = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const placed = g.node(node.id);
    if (!placed) continue;
    // dagre centres its boxes; React Flow positions by the top-left corner.
    out.set(node.id, { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2 });
  }
  alignArmsWithTheirRows(nodes, edges, out, g);
  return out;
}

/**
 * Put a branch's follow-ups in the order its rows are listed.
 *
 * dagre minimises edge crossings over the whole graph, which is the right
 * global objective and says nothing about the one thing an author reads a
 * branch node for: iPhone is the first row, so the iPhone question should be
 * the top box. When it is not, two wires cross between a node and its own
 * children — the graph is drawn correctly and looks like a mistake, and it is
 * the complaint the canvas gets most.
 *
 * dagre has no way to be told "this parent's children are ordered", so the
 * ordering is imposed afterwards, and imposed as narrowly as it can be: the
 * arm heads are permuted among the vertical slots they were ALREADY given.
 * Nothing else moves, no slot is invented, and every node keeps a position
 * dagre chose — so the spacing, the ranks and the rest of the layout are
 * exactly what they were. Only which box sits in which slot changes.
 *
 * Restricted to arms of equal height sharing a rank, which is the case that
 * matters (a run of question nodes) and the only one where swapping two boxes
 * cannot make them overlap.
 */
function alignArmsWithTheirRows(
  nodes: Node[],
  edges: Edge[],
  out: Map<string, { x: number; y: number }>,
  g: InstanceType<typeof dagre.graphlib.Graph>,
): void {
  /** How many wires arrive at each node — an arm two questions share is not this branch's to move. */
  const incoming = new Map<string, number>();
  for (const edge of edges) incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);

  for (const node of nodes) {
    if (node.type !== "branch") continue;
    const data = node.data as { cases?: { target: string }[] };
    const wanted = (data.cases ?? []).map((c) => c.target);
    if (wanted.length < 2) continue;

    /** The arms this branch alone owns, grouped by the rank and the size they landed at. */
    const slots = new Map<string, { ref: string; at: { x: number; y: number } }[]>();
    for (const ref of wanted) {
      const at = out.get(ref);
      const box = g.node(ref) as { height?: number } | undefined;
      if (!at || box?.height === undefined || (incoming.get(ref) ?? 0) !== 1) continue;
      const key = `${Math.round(at.x)} ${Math.round(box.height)}`;
      const group = slots.get(key);
      if (group) group.push({ ref, at });
      else slots.set(key, [{ ref, at }]);
    }

    for (const group of slots.values()) {
      if (group.length < 2) continue;
      // The slots, top to bottom, handed back out in row order — `group` is
      // already in row order, because `wanted` is.
      const ys = group.map((m) => m.at.y).sort((a, b) => a - b);
      group.forEach((member, i) => out.set(member.ref, { x: member.at.x, y: ys[i]! }));
    }
  }
}

/**
 * Where the nodes actually go: saved positions, or a fresh layout.
 *
 * A saved layout is a photograph of one particular graph. This used to be done
 * at the call site by taking a saved position wherever there was one and
 * filling the gaps from a fresh dagre run — which quietly mixes two coordinate
 * spaces the moment the flow gains a node the layout has never seen. Ask the
 * AI bar for a branch and its new questions are placed in the frame of the
 * graph they belong to while the old ones stay in the frame of the graph they
 * were photographed in, so the canvas draws question 3 to the left of the
 * welcome block with wires doubling back across it. Nothing was wrong with the
 * flow; the picture of it was two pictures.
 *
 * So a saved layout is trusted only while it accounts for every node. The
 * first node it does not know about makes it a picture of a different form,
 * and dagre lays the whole graph out again — which is also what you want when
 * the shape of the form changes under you.
 */
export function placeNodes(
  nodes: Node[],
  edges: Edge[],
  saved: Record<string, { x: number; y: number }>,
): Map<string, { x: number; y: number }> {
  if (nodes.every((node) => saved[node.id])) {
    const kept = new Map<string, { x: number; y: number }>();
    for (const node of nodes) kept.set(node.id, saved[node.id]!);
    return kept;
  }
  return layoutGraph(nodes, edges);
}
