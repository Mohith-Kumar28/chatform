import type { Edge, MarkerType, Node } from "@xyflow/react";
import type { Block, FormDoc, LogicRule } from "@repo/form-schema";
import { conditionIsAlwaysTrue, rulesAreExhaustive } from "@repo/form-schema";
import { placeNodes, type Rankdir } from "./flow-layout";
import { caseLabel } from "./branch-layout";

/**
 * The graph a form's flow makes, derived once and drawn twice.
 *
 * This used to live inside the canvas component, which was fine while the
 * canvas was the only thing that drew a flow. It is not any more: the template
 * detail page shows the same graph read-only, and a second hand-written
 * derivation there would be a second answer to "where does this answer go" —
 * the exact drift the block and answer catalogs exist to prevent. A picture of
 * the flow that disagrees with the editor is worse than no picture.
 *
 * So the derivation is here, in the shape React Flow wants, and the two
 * renderings differ only in how they paint it. Nothing in this file imports a
 * React Flow *value*, so the read-only view pays for dagre and nothing else.
 */

export interface GotoRule extends Extract<LogicRule, { action_kind: "goto" }> {
  pair?: string;
  branch?: "true" | "false";
}

export const isGoto = (r: LogicRule): r is GotoRule => r.action_kind === "goto";
export const condOf = (r: GotoRule) => r.when?.conditions[0];

/**
 * `MarkerType.ArrowClosed` by value, without importing the enum.
 *
 * Importing `MarkerType` as a value pulls the whole 200 KB React Flow runtime
 * into anything that derives a graph — including the template page, which
 * draws its diagram in plain HTML precisely so it does not have to.
 */
const ARROW_CLOSED = "arrowclosed" as MarkerType;

/** A node the flow cannot serve: unreachable, or with no way to finish. */
export type NodeProblem = { level: "error" | "warning"; messages: string[] };

/**
 * Every wire on the canvas, drawn the same way.
 *
 * There used to be four styles — grey for block order, orange for a rule,
 * dashed into a branch, and labels reading "default", "always" and
 * "otherwise" — which invented a taxonomy the flow does not have. There are
 * nodes and there are connections between them.
 */
function wire(id: string, source: string, target: string, label?: string, sourceHandle?: string): Edge {
  return {
    id,
    source,
    target,
    sourceHandle,
    label,
    deletable: true,
    style: { stroke: "var(--border)", strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: "var(--muted-foreground)" },
    labelBgStyle: { fill: "var(--card)" },
    labelBgPadding: [4, 2],
    markerEnd: { type: ARROW_CLOSED },
  };
}

/** A single case on a branch: one condition, one destination. */
export interface BranchCase {
  ruleId: string;
  label: string;
  target: string;
  targetKind: "block" | "ending";
  /**
   * Nothing by this ref exists any more, so this answer has nowhere to go.
   *
   * The genuine "no connection" case, and the only one worth drawing in red.
   * An answer whose destination was deleted is a route that ends nowhere, which
   * is what n8n draws as an unconnected output — but unlike n8n, a form cannot
   * simply drop the respondent, so it is an error rather than a shrug.
   */
  missing?: boolean;
}

/** Where an unmatched answer goes, named rather than left as "anything else". */
export interface BranchFallback {
  ref: string;
  title: string;
  /** Aimed by hand, so it is a decision rather than a consequence. */
  explicit: boolean;
}

/** What a `branch` node carries. Read by both the canvas and the read-only view. */
export interface BranchData {
  sourceRef: string;
  sourceTitle: string;
  index: number;
  cases: BranchCase[];
  exhaustive: boolean;
  fallback: BranchFallback | null;
}

export const OTHERWISE = "__otherwise";

/**
 * A branch node's payload, typed.
 *
 * React Flow types `node.data` as `Record<string, unknown>`, so every reader
 * has to assert. `deriveGraph` is the only thing that ever writes it — and
 * writes it `satisfies BranchData` — so the assertion is sound exactly once,
 * here, rather than at each of the four places that draw a branch.
 */
export const branchData = (node: Node): BranchData => node.data as unknown as BranchData;

/**
 * The graph the canvas draws.
 *
 * Every conditional rule used to become its own If/Else node with a Yes and a
 * No leg. A question with four options therefore produced four boxes, each
 * answering a yes/no question nobody asked, wired in a chain — and since only
 * one leg of each was ever taken, three of the eight legs were noise. One
 * question that splits the flow is one decision, so it is one node with a row
 * per case.
 */
export function deriveGraph(
  doc: FormDoc,
  gotoRules: GotoRule[],
  problems: Map<string, NodeProblem> = new Map(),
  /** The canvas runs left to right; the read-only diagram runs down a column. */
  rankdir: Rankdir = "LR",
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const endingRefs = new Set(doc.endings.map((e) => e.ref));

  const ruleById = new Map(gotoRules.map((r) => [r.id, r]));
  // Conditional rules, grouped by the question they hang off.
  const casesBySource = new Map<string, BranchCase[]>();
  /** Unconditional jumps: they replace fall-through, they do not branch. */
  const alwaysBySource = new Map<string, GotoRule>();

  for (const rule of gotoRules) {
    const cond = condOf(rule);
    const from = rule.from;
    if (!from) continue;
    const fromBlock = doc.blocks.find((b) => b.ref === from) ?? null;
    // A test that cannot fail is a jump, however it was written down. Drawing
    // it as a decision put a branch node on the canvas with one live arm and
    // one dead one, over a question the form never actually chooses about.
    // Only a lone condition can be read this way: one arm of a compound test
    // says nothing about whether the whole test can fail.
    if (!cond || (rule.when!.conditions.length === 1 && conditionIsAlwaysTrue(cond, fromBlock))) {
      alwaysBySource.set(from, rule);
      continue;
    }
    const list = casesBySource.get(from) ?? [];
    const exists = endingRefs.has(rule.target) || doc.blocks.some((b) => b.ref === rule.target);
    list.push({
      ruleId: rule.id,
      label: caseLabel(fromBlock, rule.when),
      target: rule.target,
      targetKind: endingRefs.has(rule.target) ? "ending" : "block",
      missing: !exists,
    });
    casesBySource.set(from, list);
  }

  doc.blocks.forEach((b, i) => {
    const isFirst = i === 0;
    nodes.push({
      id: b.ref,
      type: isFirst ? "start" : "question",
      position: doc.layout[b.ref] ?? { x: 0, y: 0 },
      // The same number the Questions list puts on the row, so the two views
      // name a question the same way and you can carry a position in the list
      // over to a box on the canvas without re-reading its title.
      data: { block: b, index: i + 1, problem: problems.get(b.ref) },
      deletable: !isFirst,
    });

    const cases = casesBySource.get(b.ref);
    const always = alwaysBySource.get(b.ref);
    const next = doc.blocks[i + 1];

    // The rows read in the same order as the question's own options.
    //
    // They used to read in whatever order the rules happened to sit in the
    // document, which is the order they were written or last edited. So a
    // question offering iPhone, Android and Chrome extension could list
    // Android above iPhone on its branch node while the canvas placed their
    // follow-ups the other way round, and the two wires crossed for no reason
    // an author could see. Option order is the order they chose; a route that
    // is not a choice — a number comparison, a text match — keeps its place
    // behind the ones that are.
    if (cases && cases.length > 1 && "options" in b && Array.isArray(b.options)) {
      const rank = new Map((b.options as { id: string }[]).map((o, at) => [o.id, at]));
      const place = (c: BranchCase) =>
        rank.get(String(condOf(ruleById.get(c.ruleId)!)?.value ?? "")) ?? Number.MAX_SAFE_INTEGER;
      cases.sort((x, y) => place(x) - place(y));
    }

    if (cases?.length) {
      const branchId = `branch_${b.ref}`;
      // Every option accounted for means no answer can fall past the cases.
      const exhaustive = rulesAreExhaustive(
        b as Block,
        gotoRules.filter((r) => r.from === b.ref && condOf(r)),
      );
      /**
       * Where an unmatched answer actually goes.
       *
       * Resolved to a real destination and named on the row, rather than drawn
       * as a bare "anything else" with nothing after it. n8n can leave a
       * fallback output unconnected because an unmatched item is simply
       * dropped; a respondent cannot be dropped, so this path always has a
       * destination — it is just one nobody typed. Naming it is the difference
       * between a branch that looks abandoned and one that reads as finished.
       */
      const fallbackRef = exhaustive ? undefined : (always?.target ?? next?.ref ?? doc.endings[0]?.ref);
      const fallback: BranchFallback | null = fallbackRef
        ? {
            ref: fallbackRef,
            title:
              doc.blocks.find((x) => x.ref === fallbackRef)?.title ??
              doc.endings.find((x) => x.ref === fallbackRef)?.title ??
              fallbackRef,
            explicit: Boolean(always?.target),
          }
        : null;

      nodes.push({
        id: branchId,
        type: "branch",
        position: doc.layout[branchId] ?? { x: 0, y: 0 },
        // A branch is drawn beside the question it hangs off, so it carries
        // that question's number rather than one of its own.
        data: {
          sourceRef: b.ref,
          sourceTitle: b.title,
          index: i + 1,
          cases,
          exhaustive,
          fallback,
        } satisfies BranchData,
        deletable: true,
      });
      edges.push(wire(`into_${b.ref}`, b.ref, branchId));
      for (const c of cases) {
        // A case whose destination is gone gets no wire, which is what makes
        // the unconnected handle on the node the honest picture.
        if (c.missing) continue;
        // Unlabelled: the row the wire leaves from already names the answer.
        // Repeating it on the wire put a second copy of every option's full
        // text in the gap between nodes, where the labels of neighbouring
        // wires ran over one another.
        edges.push(wire(`case_${c.ruleId}`, branchId, c.target, undefined, c.ruleId));
      }
      if (fallback) {
        edges.push(wire(`else_${b.ref}`, branchId, fallback.ref, undefined, OTHERWISE));
      }
      return;
    }

    // No branch here. An unconditional rule overrides fall-through entirely.
    if (always) {
      // Drawn by hand, by dragging one question onto another. It used to be
      // an unlabelled orange wire, identical in appearance to a conditional
      // route but with nothing on it to say what it did — so the only visible
      // difference between "always go here" and "go here if iPhone" was that
      // one of them had words.
      edges.push(wire(always.id, b.ref, always.target));
      return;
    }
    // Past the last question the flow reaches the ending, and that wire was
    // never drawn — so the ending had nothing pointing at it and the layout
    // stranded it back at the start, beside the welcome block.
    const onward = next?.ref ?? doc.endings[0]?.ref;
    if (onward) {
      // Unlabelled: "default" on every single wire in the form was a word
      // repeated until it stopped meaning anything. A plain line already says
      // "and then this".
      edges.push(wire(`seq-${b.ref}`, b.ref, onward));
    }
  });

  doc.endings.forEach((e) => {
    nodes.push({
      id: e.ref,
      type: "ending",
      position: doc.layout[e.ref] ?? { x: 0, y: 0 },
      data: { title: e.title, kind: e.kind, problem: problems.get(e.ref) },
      deletable: doc.endings.length > 1,
    });
  });

  // Saved positions while the layout still describes this graph, a fresh dagre
  // run the moment it does not — see `placeNodes`.
  const placed = placeNodes(nodes, edges, doc.layout, rankdir);
  for (const node of nodes) {
    const at = placed.get(node.id);
    if (at) node.position = at;
  }

  return { nodes, edges };
}
