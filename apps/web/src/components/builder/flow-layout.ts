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
 * Top to bottom, so the form reads as the list of questions it is.
 */

/**
 * Roughly the rendered size of each node type; dagre needs real boxes.
 *
 * A question is sized for a title on two lines, the most it wraps to before
 * the ellipsis, so a long title cannot push its card into the next rank.
 */
const SIZES: Record<string, { width: number; height: number }> = {
  start: { width: 240, height: 44 },
  question: { width: 288, height: 72 },
  ending: { width: 224, height: 44 },
  branch: { width: 288, height: 64 },
};

const DEFAULT_SIZE = { width: 288, height: 72 };

/**
 * A branch node's own geometry, as the markup lays it out.
 *
 * Named rather than inlined because two things depend on them agreeing: dagre
 * has to reserve the height the node actually occupies, and the read-only
 * diagram has to start each case's wire level with the row it leaves from.
 */
/** The title bar above the rows. */
export const BRANCH_HEADER = 34;
/** One case, or the "otherwise" line. */
export const BRANCH_ROW = 22;
/** 2px border plus 2px of padding, top and bottom alike. */
export const BRANCH_EDGE = 4;

/**
 * A branch node grows a row per case, so dagre has to be told how tall it is.
 *
 * Under-counting it — the first version forgot the otherwise row — makes dagre
 * reserve less space than the node occupies, and the wires below it run
 * straight through the card.
 */
export function branchNodeHeight(cases: number, exhaustive = false): number {
  const rows = cases + (exhaustive ? 0 : 1);
  return BRANCH_EDGE + BRANCH_HEADER + rows * BRANCH_ROW + BRANCH_EDGE;
}

/**
 * The box a node occupies — what dagre reserves, and what a wire has to aim at.
 *
 * The canvas gets its anchors from React Flow's own handles, so this used to be
 * needed only here. The read-only diagram on the template page has no React
 * Flow to ask, and a wire drawn to a box of the wrong size is a wire that
 * misses the node it points at.
 */
export function nodeSize(node: Pick<Node, "type" | "data" | "measured">): { width: number; height: number } {
  // On the canvas React Flow has measured the real box, which is what a
  // question with a problem note or a two-line title actually occupies.
  if (node.measured?.width && node.measured.height) {
    return { width: node.measured.width, height: node.measured.height };
  }
  const size = SIZES[node.type ?? ""] ?? DEFAULT_SIZE;
  const data = node.data as { cases?: unknown[]; exhaustive?: boolean };
  return {
    width: size.width,
    height:
      node.type === "branch"
        ? branchNodeHeight((data.cases ?? []).length, data.exhaustive)
        : size.height,
  };
}

/**
 * Which way the flow runs.
 *
 * Top to bottom, everywhere. The canvas used to read left to right, and a form
 * is a list: question one, then two, then three. A column reads that way at a
 * glance, costs only one node's width, and matches the template diagrams.
 * "LR" is kept for anything that still asks for it by name.
 */
export type Rankdir = "LR" | "TB";

/**
 * Marks a saved layout as drawn top to bottom.
 *
 * Every layout saved before the canvas turned vertical is a left-to-right
 * picture, and keeping it would draw old forms sideways forever. A layout
 * without this key is treated as one of those and laid out again; the canvas
 * writes the key whenever it saves positions. A key in the record rather than
 * a new schema field, so no stored document needs rewriting.
 */
export const LAYOUT_TB = "__tb";

/** A layout record the canvas can save, tagged as vertical. */
export function tagVertical(
  layout: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  return { ...layout, [LAYOUT_TB]: { x: 0, y: 0 } };
}

export function layoutGraph(
  nodes: Node[],
  edges: Edge[],
  rankdir: Rankdir = "TB",
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir,
    // Generous separation: the wires carry labels, and tight ranks put those
    // labels on top of each other. Vertically a rank is a node's height rather
    // than its width, so the same air needs a smaller number.
    ranksep: rankdir === "LR" ? 110 : 56,
    nodesep: 36,
    edgesep: 24,
    marginx: 40,
    marginy: 40,
  });

  const forward = forwardEdges(nodes, edges);
  const rank = rankNodes(nodes, forward);

  for (const node of nodes) g.setNode(node.id, nodeSize(node));
  for (const edge of forward) {
    // `minlen` pins every node to the rank `rankNodes` chose. Left to its own
    // ranker dagre shortens edges wherever it can, and a question that sits
    // between two long arms can be placed anywhere along them at the same
    // cost: it put the one-question arm of a three-way split level with the
    // LAST question of the longest arm, so the arms no longer started side by
    // side under the question that decides them, and an ending reached from
    // the middle of the form floated up into the middle of the picture.
    const minlen = Math.max(1, (rank.get(edge.target) ?? 1) - (rank.get(edge.source) ?? 0));
    g.setEdge(edge.source, edge.target, { minlen });
  }

  dagre.layout(g, { constraints: armOrderConstraints(nodes, forward, rank) });

  const out = new Map<string, { x: number; y: number }>();
  for (const node of nodes) {
    const placed = g.node(node.id);
    if (!placed) continue;
    // dagre centres its boxes; React Flow positions by the top-left corner.
    out.set(node.id, { x: placed.x - placed.width / 2, y: placed.y - placed.height / 2 });
  }
  orderArmsLikeTheirRows(nodes, forward, out, rankdir);
  return out;
}

/**
 * The wires that run down the flow, without the ones that loop back up it.
 *
 * The canvas refuses a backwards route, but a form can still arrive with one
 * (an old document, an import). A cycle has no longest path, so the ranking
 * below would never settle; the edge is simply left out of the layout. It is
 * still drawn.
 */
function forwardEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, Edge[]>();
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    const list = out.get(e.source);
    if (list) list.push(e);
    else out.set(e.source, [e]);
  }
  const state = new Map<string, "open" | "done">();
  const keep: Edge[] = [];
  const visit = (id: string) => {
    state.set(id, "open");
    for (const e of out.get(id) ?? []) {
      const s = state.get(e.target);
      if (s === "open") continue; // back up the flow
      keep.push(e);
      if (!s) visit(e.target);
    }
    state.set(id, "done");
  };
  // Document order, so the start is visited first and "back" means back up the form.
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);
  return keep;
}

/**
 * Which row each node sits on.
 *
 * A node goes on the row below the lowest thing that leads to it, so the
 * first question of every arm sits directly under its branch, however long
 * its siblings are. Endings all go on one row at the bottom: they are where
 * the form stops, and a screen-out reached from question two drawn level with
 * question three read as a step in the middle of the form.
 *
 * Something nothing leads to (a question just dropped on the canvas, cut off
 * from the flow) sits just above whatever it leads to, rather than up beside
 * the start.
 */
function rankNodes(nodes: Node[], forward: Edge[]): Map<string, number> {
  const isEnding = new Set(nodes.filter((n) => n.type === "ending").map((n) => n.id));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of forward) {
    preds.set(e.target, [...(preds.get(e.target) ?? []), e.source]);
    succs.set(e.source, [...(succs.get(e.source) ?? []), e.target]);
  }

  // Topological order: `forward` has no cycles, so Kahn's algorithm drains it.
  const indegree = new Map(nodes.map((n) => [n.id, preds.get(n.id)?.length ?? 0]));
  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const t of succs.get(id) ?? []) {
      indegree.set(t, indegree.get(t)! - 1);
      if (indegree.get(t) === 0) queue.push(t);
    }
  }

  const rank = new Map<string, number>();
  for (const id of order) {
    if (isEnding.has(id)) continue;
    const from = (preds.get(id) ?? []).filter((p) => !isEnding.has(p));
    rank.set(id, from.length ? Math.max(...from.map((p) => rank.get(p)! + 1)) : 0);
  }
  const bottom = Math.max(0, ...[...rank.values()].map((r) => r + 1));
  for (const id of isEnding) rank.set(id, bottom);

  // Pull loose roots down to just above what they lead to.
  const start = nodes.find((n) => n.type === "start")?.id ?? nodes[0]?.id;
  for (const id of [...order].reverse()) {
    if (isEnding.has(id) || id === start || (preds.get(id)?.length ?? 0) > 0) continue;
    const next = succs.get(id) ?? [];
    if (next.length) rank.set(id, Math.min(...next.map((t) => rank.get(t)!)) - 1);
  }
  return rank;
}

/**
 * The first question of each arm, in the order the branch lists its rows.
 *
 * Only the destinations this branch alone leads to: one that something else
 * also reaches is where arms meet, not an arm.
 */
function armHeads(branch: Node, preds: Map<string, string[]>): string[] {
  const data = branch.data as { cases?: { target: string; missing?: boolean }[]; fallback?: { ref: string } | null };
  const heads: string[] = [];
  for (const c of data.cases ?? []) if (!c.missing && !heads.includes(c.target)) heads.push(c.target);
  if (data.fallback && !heads.includes(data.fallback.ref)) heads.push(data.fallback.ref);
  return heads.filter((h) => (preds.get(h) ?? []).every((p) => p === branch.id));
}

/**
 * Tell dagre which way round each branch's arms go.
 *
 * Its crossing reduction otherwise chooses, and it will happily put the first
 * row's arm on the right to save a crossing further down, which leaves the
 * wires out of the branch itself crossed: the one crossing an author reads a
 * branch for. A left-of constraint between neighbouring arm heads on the same
 * row keeps the order and lets dagre arrange everything else around it.
 */
function armOrderConstraints(
  nodes: Node[],
  forward: Edge[],
  rank: Map<string, number>,
): { left: string; right: string }[] {
  const preds = new Map<string, string[]>();
  for (const e of forward) preds.set(e.target, [...(preds.get(e.target) ?? []), e.source]);
  const out: { left: string; right: string }[] = [];
  for (const branch of nodes) {
    if (branch.type !== "branch") continue;
    const heads = armHeads(branch, preds);
    const row = rank.get(branch.id)! + 1;
    const level = heads.filter((h) => rank.get(h) === row);
    for (let i = 1; i < level.length; i++) out.push({ left: level[i - 1]!, right: level[i]! });
  }
  return out;
}

/**
 * Put each branch's arms in the order its rows are listed, left to right.
 *
 * dagre minimises edge crossings over the whole graph, which is the right
 * global objective and says nothing about the one thing an author reads a
 * branch node for: iPhone is the first row, so the iPhone arm should be the
 * leftmost. When it is not, the wires cross between a node and its own
 * children, and the graph is drawn correctly and looks like a mistake.
 *
 * dagre cannot be told "this parent's children are ordered", so the order is
 * imposed afterwards. An arm here is everything only that arm leads to: its
 * first question, the questions after it, and an ending only it reaches. Each
 * arm moves as one block, so a three-question arm keeps its column, and the
 * arms are laid back into the same span they already occupied, with the same
 * gaps, in row order. If the arms overlap one another, or the result would
 * put a box on top of anything else, the branch is left as dagre drew it.
 *
 * Branches are taken top to bottom, so a branch inside an arm is ordered
 * after the arm it sits in has moved.
 */
function orderArmsLikeTheirRows(
  nodes: Node[],
  forward: Edge[],
  out: Map<string, { x: number; y: number }>,
  rankdir: Rankdir,
): void {
  const along = rankdir === "LR" ? "y" : "x";
  const extent = rankdir === "LR" ? "height" : "width";
  const across = rankdir === "LR" ? "x" : "y";
  const depth = rankdir === "LR" ? "width" : "height";
  const size = new Map(nodes.map((n) => [n.id, nodeSize(n)]));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const e of forward) {
    preds.set(e.target, [...(preds.get(e.target) ?? []), e.source]);
    succs.set(e.source, [...(succs.get(e.source) ?? []), e.target]);
  }

  const branches = nodes
    .filter((n) => n.type === "branch" && out.has(n.id))
    .sort((a, b) => out.get(a.id)![across] - out.get(b.id)![across]);

  for (const branch of branches) {
    const own = armHeads(branch, preds).filter((h) => out.has(h));
    if (own.length < 2) continue;

    // Each arm: its head, then anything every one of whose arrivals is already in the arm.
    const headSet = new Set(own);
    const arms = own.map((head) => {
      const members = new Set([head]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const m of [...members]) {
          for (const t of succs.get(m) ?? []) {
            if (members.has(t) || headSet.has(t)) continue;
            if ((preds.get(t) ?? []).every((p) => members.has(p))) {
              members.add(t);
              grew = true;
            }
          }
        }
      }
      return members;
    });

    const span = (members: Set<string>) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const id of members) {
        const at = out.get(id)![along];
        lo = Math.min(lo, at);
        hi = Math.max(hi, at + size.get(id)![extent]);
      }
      return { lo, hi };
    };
    const spans = arms.map(span);
    const current = arms.map((_, i) => i).sort((a, b) => spans[a]!.lo - spans[b]!.lo);
    if (current.every((armIndex, slot) => armIndex === slot)) continue; // already in row order
    // Arms that overlap cannot be swapped without colliding.
    if (current.some((a, k) => k > 0 && spans[a]!.lo < spans[current[k - 1]!]!.hi)) continue;

    // Same span, same gaps, new order.
    const gaps = current.slice(1).map((a, k) => spans[a]!.lo - spans[current[k]!]!.hi);
    const moved = new Map<string, { x: number; y: number }>();
    let cursor = spans[current[0]!]!.lo;
    arms.forEach((members, i) => {
      const delta = cursor - spans[i]!.lo;
      for (const id of members) {
        const at = out.get(id)!;
        moved.set(id, { ...at, [along]: at[along] + delta });
      }
      cursor += spans[i]!.hi - spans[i]!.lo + (gaps[i] ?? 0);
    });

    // Anything else in the way means the swap would draw one box over another.
    const box = (id: string, at: { x: number; y: number }) => ({
      lo: at[along],
      hi: at[along] + size.get(id)![extent],
      top: at[across],
      bottom: at[across] + size.get(id)![depth],
    });
    const clash = [...moved].some(([id, at]) => {
      const a = box(id, at);
      return nodes.some((other) => {
        if (moved.has(other.id) || !out.has(other.id)) return false;
        const b = box(other.id, out.get(other.id)!);
        return a.lo < b.hi && b.lo < a.hi && a.top < b.bottom && b.top < a.bottom;
      });
    });
    if (clash) continue;
    for (const [id, at] of moved) out.set(id, at);
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
  rankdir: Rankdir = "TB",
): Map<string, { x: number; y: number }> {
  // A saved layout is kept only if it was drawn in this direction: untagged
  // means left to right, from before the canvas turned vertical.
  const drawnThisWay = rankdir === "TB" ? Boolean(saved[LAYOUT_TB]) : !saved[LAYOUT_TB];
  if (drawnThisWay && nodes.every((node) => saved[node.id])) {
    const kept = new Map<string, { x: number; y: number }>();
    for (const node of nodes) kept.set(node.id, saved[node.id]!);
    return kept;
  }
  return layoutGraph(nodes, edges, rankdir);
}
