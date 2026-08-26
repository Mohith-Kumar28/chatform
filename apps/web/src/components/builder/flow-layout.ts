import type { FormDoc } from "@repo/form-schema";
import { computeBranchLayout } from "./branch-layout";

/**
 * Where the nodes go on the canvas, when nobody has dragged them yet.
 *
 * The fallback used to be `x: 80 + (i % 3) * 280, y: 60 + floor(i / 3) * 160`
 * — a three-column grid over the blocks in document order, which says nothing
 * about the flow. It looked tolerable while every form ran straight through
 * and became unreadable the moment branching was real: arms landed wherever
 * the modulo put them and the wires crossed the whole canvas.
 *
 * The flow runs left to right. Each question that everyone answers takes the
 * next column; the arms of a branch sit in the column beside the question that
 * decides them, stacked one per row. A saved position always wins — this only
 * decides where a node starts.
 */

const COL = 300;
const ROW = 150;
const X0 = 80;
const Y0 = 80;

export interface FlowPositions {
  nodes: Map<string, { x: number; y: number }>;
  /** One past the last column, for endings and anything appended. */
  columns: number;
}

export function computeAutoLayout(doc: FormDoc): FlowPositions {
  const branch = computeBranchLayout(doc);
  const nodes = new Map<string, { x: number; y: number }>();
  const colOf = new Map<string, number>();
  const nextRow = new Map<string, number>();
  let maxCol = -1;

  for (const block of doc.blocks) {
    const info = branch.get(block.ref);
    const source = info?.sourceRef;
    let col: number;
    let row: number;

    if (source && colOf.has(source)) {
      // An arm belongs beside the question it hangs off, not after everything
      // that happens to precede it in the list.
      col = colOf.get(source)! + 1;
      row = nextRow.get(source) ?? 0;
      nextRow.set(source, row + 1);
    } else {
      // Trunk: past every column used so far, so it never lands on an arm.
      col = maxCol + 1;
      row = 0;
    }

    colOf.set(block.ref, col);
    maxCol = Math.max(maxCol, col);
    nodes.set(block.ref, { x: X0 + col * COL, y: Y0 + row * ROW });
  }

  // Endings are where the flow stops, so they belong at the end of it.
  doc.endings.forEach((ending, i) => {
    nodes.set(ending.ref, { x: X0 + (maxCol + 1) * COL, y: Y0 + i * ROW });
  });

  // A condition node goes below every arm of the question it belongs to.
  // Half a row down from the source — the obvious place — is exactly where the
  // first arm already sits, so they landed on top of each other.
  const condRow = new Map<string, number>();
  for (const rule of doc.logic) {
    if (rule.action_kind !== "goto" || !rule.from) continue;
    const anchor = nodes.get(rule.from);
    if (!anchor) continue;
    const below = nextRow.get(rule.from) ?? 1;
    const stacked = condRow.get(rule.from) ?? 0;
    condRow.set(rule.from, stacked + 1);
    nodes.set(`cond_${rule.id}`, {
      x: anchor.x + COL / 2,
      y: anchor.y + (below + stacked) * ROW,
    });
  }

  return { nodes, columns: maxCol + 2 };
}
