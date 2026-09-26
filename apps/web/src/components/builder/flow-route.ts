/**
 * The path a wire takes on the flow canvas: square turns, rounded corners.
 *
 * The canvas used to draw every connection as a bezier curve. Curves are what
 * free-form node editors use (n8n, Make), where nodes sit anywhere and a wire
 * is mostly a line between two points. This canvas is a column that splits and
 * rejoins, which is the shape of a tree, and tree-shaped builders (Zapier
 * paths, Salesforce Flow, HubSpot workflows) draw it with right angles: a
 * route drops out of its node, turns once toward the column it is going to,
 * and drops into it. Straight runs read as lanes, a turn says "this is where
 * it goes sideways", and a long curve no longer slices diagonally across the
 * questions between its two ends.
 *
 * Pure geometry, no React Flow, so the read-only diagram on the template page
 * can draw the same wires as the canvas.
 */

export interface Point {
  x: number;
  y: number;
}

/** A node on the canvas, as a box a wire should not run through. */
export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How far a wire runs straight out of a socket before it may turn. */
const STUB = 18;
/** Distance between two wires sharing a gap, so neither hides the other. */
const LANE_GAP = 8;
/** Clearance kept from a box a wire detours around. */
const CLEAR = 14;
const RADIUS = 10;

export interface Route {
  path: string;
  /** Where a label sits: the middle of the longest straight run. */
  labelX: number;
  labelY: number;
}

/**
 * Route one wire from a socket on the bottom of one node to the top of another.
 *
 * Tries the obvious shapes in order and keeps the first that crosses no other
 * node: turn just above the target (so a wire leaving an arm runs down the
 * arm's own column), then turn just below the source (so a route out of the
 * trunk steps aside before it runs down), then halfway. If all of them cross
 * something, it detours down a clear lane beside the boxes in the way.
 *
 * `lane` staggers wires that arrive at the same node from the same side, so two
 * of them never share a horizontal run: the one from further away turns lower.
 */
export function routeWire(
  from: Point,
  to: Point,
  obstacles: readonly Obstacle[],
  { exclude = [], lane = 0 }: { exclude?: readonly string[]; lane?: number } = {},
): Route {
  const others = obstacles.filter((o) => !exclude.includes(o.id));
  const offset = lane * LANE_GAP;

  if (to.y - from.y >= STUB * 2) {
    const nearTarget = to.y - STUB - offset;
    const nearSource = from.y + STUB + offset;
    const halfway = (from.y + to.y) / 2;
    const candidates: Point[][] = [nearTarget, nearSource, halfway]
      .filter((y) => y > from.y && y < to.y)
      .map((y) => [from, { x: from.x, y }, { x: to.x, y }, to]);

    let best: Point[] | null = null;
    let bestHits = Infinity;
    for (const points of candidates) {
      const hits = crossings(points, others);
      if (hits === 0) return finish(points);
      if (hits < bestHits) {
        best = points;
        bestHits = hits;
      }
    }

    // Down a lane beside whatever is in the way.
    const top = from.y + STUB + offset;
    const bottom = to.y - STUB - offset;
    const blocking = others.filter((o) => o.y < bottom && o.y + o.height > top);
    const lanes = [
      ...blocking.map((o) => o.x - CLEAR - offset),
      ...blocking.map((o) => o.x + o.width + CLEAR + offset),
    ].sort((a, b) => Math.abs(a - from.x) + Math.abs(a - to.x) - (Math.abs(b - from.x) + Math.abs(b - to.x)));
    for (const x of lanes) {
      const points = [from, { x: from.x, y: top }, { x, y: top }, { x, y: bottom }, { x: to.x, y: bottom }, to];
      const hits = crossings(points, others);
      if (hits === 0) return finish(points);
      if (hits < bestHits) {
        best = points;
        bestHits = hits;
      }
    }
    return finish(best ?? [from, { x: from.x, y: halfway }, { x: to.x, y: halfway }, to]);
  }

  // The target is level with or above the source: out, round the side, and in from above.
  const side = Math.max(from.x, to.x) + 60 + offset;
  return finish([
    from,
    { x: from.x, y: from.y + STUB },
    { x: side, y: from.y + STUB },
    { x: side, y: to.y - STUB },
    { x: to.x, y: to.y - STUB },
    to,
  ]);
}

/** How many boxes a polyline passes through. */
function crossings(points: Point[], boxes: readonly Obstacle[]): number {
  let hits = 0;
  for (const box of boxes) {
    for (let i = 1; i < points.length; i++) {
      if (segmentHitsBox(points[i - 1]!, points[i]!, box)) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

/** Axis-aligned segments only, which is all this file draws. */
function segmentHitsBox(a: Point, b: Point, box: Obstacle): boolean {
  const pad = 4;
  const left = box.x - pad;
  const right = box.x + box.width + pad;
  const top = box.y - pad;
  const bottom = box.y + box.height + pad;
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return minX < right && maxX > left && minY < bottom && maxY > top;
}

/** The polyline as an SVG path with rounded corners, and where its label goes. */
function finish(raw: Point[]): Route {
  // Drop zero-length runs, so a straight drop has no phantom corners.
  const distinct = raw.filter(
    (p, i) => i === 0 || Math.abs(p.x - raw[i - 1]!.x) > 0.5 || Math.abs(p.y - raw[i - 1]!.y) > 0.5,
  );
  // And points in the middle of a straight run, which are not corners at all.
  const points = distinct.filter((p, i) => {
    const prev = distinct[i - 1];
    const next = distinct[i + 1];
    if (!prev || !next) return true;
    const straight =
      (Math.abs(prev.x - p.x) < 0.5 && Math.abs(next.x - p.x) < 0.5) ||
      (Math.abs(prev.y - p.y) < 0.5 && Math.abs(next.y - p.y) < 0.5);
    return !straight;
  });
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!;
    const at = points[i]!;
    const next = points[i + 1]!;
    const r = Math.min(RADIUS, dist(prev, at) / 2, dist(at, next) / 2);
    const inX = at.x + Math.sign(prev.x - at.x) * r;
    const inY = at.y + Math.sign(prev.y - at.y) * r;
    const outX = at.x + Math.sign(next.x - at.x) * r;
    const outY = at.y + Math.sign(next.y - at.y) * r;
    path += ` L ${inX} ${inY} Q ${at.x} ${at.y} ${outX} ${outY}`;
  }
  const last = points[points.length - 1]!;
  path += ` L ${last.x} ${last.y}`;

  let labelX = (points[0]!.x + last.x) / 2;
  let labelY = (points[0]!.y + last.y) / 2;
  let longest = -1;
  for (let i = 1; i < points.length; i++) {
    const d = dist(points[i - 1]!, points[i]!);
    if (d > longest) {
      longest = d;
      labelX = (points[i - 1]!.x + points[i]!.x) / 2;
      labelY = (points[i - 1]!.y + points[i]!.y) / 2;
    }
  }
  return { path, labelX, labelY };
}

const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Stagger the wires that arrive at the same node from the same side.
 *
 * Returns a lane per edge id. Wires arriving from one side all turn in the gap
 * above their target; given the same height they would share one horizontal
 * run and the top colour would hide the others. The wire from furthest away
 * gets lane 0 and turns lowest, so the nearer wires turn above it and no two
 * runs cross.
 */
export function assignLanes(
  wires: readonly { id: string; target: string; fromX: number; toX: number }[],
): Map<string, number> {
  const lanes = new Map<string, number>();
  const groups = new Map<string, typeof wires[number][]>();
  for (const w of wires) {
    if (Math.abs(w.fromX - w.toX) < 1) continue;
    const key = `${w.target}\u0000${w.fromX < w.toX ? "l" : "r"}`;
    const list = groups.get(key);
    if (list) list.push(w);
    else groups.set(key, [w]);
  }
  for (const group of groups.values()) {
    group
      .sort((a, b) => Math.abs(b.fromX - b.toX) - Math.abs(a.fromX - a.toX))
      .forEach((w, i) => lanes.set(w.id, i));
  }
  return lanes;
}
