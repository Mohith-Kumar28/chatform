import { describe, expect, it } from "vitest";
import { funnelGeometry } from "@/components/charts/funnel-shape";

/**
 * The funnel is drawn as one smooth curve through the step counts, and a smooth
 * curve through descending points is exactly the thing that overshoots. When it
 * does, the drawing shows the funnel *widening* somewhere the numbers narrow —
 * which is not a rough edge, it is a chart that says the opposite of its data,
 * and it does it in the gap between two rows where nobody is looking.
 *
 * So these walk the path the component actually renders.
 */

interface Sample {
  y: number;
  half: number;
}

/**
 * The right-hand edge of the shape, sampled densely.
 *
 * Reads the path's own commands rather than a re-derivation of them: `V` holds
 * the width and moves down, `C` is a cubic evaluated at enough points to catch a
 * bulge. Stops at the `H` that crosses the base, because everything after it is
 * the mirrored left side and would read as the funnel widening again.
 */
function rightEdge(d: string): Sample[] {
  const tokens = d.match(/[MHVCZ][^MHVCZ]*/g) ?? [];
  const out: Sample[] = [];
  let x = 0;
  let y = 0;
  let started = false;

  for (const token of tokens) {
    const kind = token[0]!;
    const nums = (token.slice(1).match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

    if (kind === "M") {
      [x, y] = [nums[0]!, nums[1]!];
    } else if (kind === "H") {
      // The first H is the rim, which opens the right edge; the second is the
      // base, which closes it.
      if (started) break;
      started = true;
      x = nums[0]!;
      out.push({ y, half: x - 50 });
    } else if (kind === "V") {
      y = nums[0]!;
      out.push({ y, half: x - 50 });
    } else if (kind === "C") {
      const [x1, y1, x2, y2, x3, y3] = nums as [number, number, number, number, number, number];
      for (let i = 1; i <= 40; i++) {
        const t = i / 40;
        const u = 1 - t;
        const px = u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
        const py = u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
        out.push({ y: py, half: px - 50 });
      }
      [x, y] = [x3, y3];
    }
  }
  return out;
}

const CASES: Record<string, number[]> = {
  "a steep funnel": [9, 6, 5, 4, 3, 0, 0],
  "a healthy one": [420, 388, 371, 352, 318, 266, 210],
  "a cliff at the first step": [40, 3, 1, 1, 0, 0, 0],
  "no movement at all": [12, 12, 12, 12, 12, 12, 12],
  "one long plateau then a fall": [100, 100, 100, 100, 4, 4, 1],
  "alternating flats and drops": [200, 200, 90, 90, 40, 40, 2],
};

describe("the funnel silhouette", () => {
  for (const [name, counts] of Object.entries(CASES)) {
    it(`never widens as it descends — ${name}`, () => {
      const { d } = funnelGeometry(counts);
      const edge = rightEdge(d!);
      expect(edge.length).toBeGreaterThan(50);

      for (let i = 1; i < edge.length; i++) {
        expect(edge[i]!.y).toBeGreaterThanOrEqual(edge[i - 1]!.y - 1e-9);
        // Half a viewBox unit of slack: floating point, not a bulge.
        expect(edge[i]!.half).toBeLessThanOrEqual(edge[i - 1]!.half + 0.005);
      }
    });

    it(`is as wide as the count beside each label — ${name}`, () => {
      const { d, tops, totalH } = funnelGeometry(counts);
      const edge = rightEdge(d!);
      const top = counts[0]!;

      // Every row is the same height, and the last one has no gap under it.
      const rowHeight = totalH - tops[counts.length - 1]!;

      counts.forEach((count, i) => {
        if (count === 0) return;
        // The label sits at the middle of its row, which is where the curve is
        // sampled from; anywhere else the width is an interpolation.
        const mid = tops[i]! + rowHeight / 2;
        const at = edge.reduce((best, s) => (Math.abs(s.y - mid) < Math.abs(best.y - mid) ? s : best));
        expect(at.half).toBeCloseTo(Math.max(2.5, (count / top) * 50), 1);
      });
    });
  }

  it("gives an empty step a floor rather than a point", () => {
    const { d, ghostFrom, totalH } = funnelGeometry([50, 20, 8, 4, 0, 0, 0]);
    expect(ghostFrom).not.toBeNull();
    expect(ghostFrom!).toBeLessThan(totalH);

    // The shape stops at the ghost's width, so the two join without a step and
    // nothing anywhere closes to zero.
    const edge = rightEdge(d!);
    expect(edge.at(-1)!.half).toBeCloseTo(2.5, 5);
    expect(Math.min(...edge.map((s) => s.half))).toBeGreaterThan(0);
  });

  it("draws nothing at all when nobody signed up", () => {
    expect(funnelGeometry([0, 0, 0]).d).toBeNull();
  });
});
