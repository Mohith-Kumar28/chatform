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

/** A branch node grows a row per case, so its height is not fixed. */
export function branchNodeHeight(cases: number): number {
  return 44 + Math.max(1, cases) * 22;
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
    const height =
      node.type === "branch"
        ? branchNodeHeight(((node.data as { cases?: unknown[] }).cases ?? []).length)
        : size.height;
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
