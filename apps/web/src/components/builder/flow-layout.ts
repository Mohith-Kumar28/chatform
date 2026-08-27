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
  return out;
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
