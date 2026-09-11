/**
 * The faint SVG tile behind a form's conversation.
 *
 * A flat fill is the one background that reads as "nobody chose this", and
 * every form had the same one. These are the geometric tiles that fix it —
 * written in the idiom Steve Schoger's Hero Patterns established
 * (https://heropatterns.com): one small `<svg>`, one colour, one alpha, tiled
 * by `background-repeat`. The path data here is our own rather than copied, so
 * every tile is sized and weighted for this use — a wash behind body copy, not
 * a hero panel.
 *
 * ## Why the default is derived rather than stored
 *
 * `theme.backgroundPattern` holds `auto` until somebody opens the picker, and
 * `auto` means "hash the slug". That is how every form that already existed
 * got a tile the moment this shipped — no migration, no reseeded templates,
 * and no grid of twenty forms all showing whichever tile happened to be the
 * schema default. Same slug, same tile, everywhere the form is drawn: the
 * hosted runtime, the builder's question preview, the embed preview and the
 * dashboard card all hash the same string and land on the same index.
 *
 * An author who wants a particular tile stores its id instead, and `none`
 * stores the decision to have no texture at all — which has to be a stored
 * value rather than the absence of one, or it would be indistinguishable from
 * a form that has not been through the picker yet.
 *
 * ## Why the ink is the accent
 *
 * The pattern has to belong to the form, so it is drawn in the colour the
 * author already chose — at 5–8% alpha, which is the band where a texture is
 * something you notice about a page rather than something you read. A green
 * form gets a green ghost of a pattern. Where the accent is too close to the
 * background to register at all (a white accent on a white page) it falls back
 * to the text colour, because an invisible pattern is just bytes.
 *
 * ## Why every tile is corner-continuous
 *
 * `background-repeat` does not know it is drawing a pattern — it draws the tile
 * again 20px to the right. So a stroke that leaves an edge has to arrive at the
 * opposite edge at the same offset, and a diagonal has to touch both corners it
 * points at. Anything that misses shows as a grid of seams, which is the one
 * failure mode that looks worse than no pattern at all.
 */

/** One tile: its intrinsic size, and its markup as a function of the ink. */
export interface PatternDef {
  id: string;
  /** What the picker calls it. Plain English, not the id. */
  label: string;
  w: number;
  h: number;
  /** Everything inside the `<svg>`. `c` is a complete CSS colour. */
  draw: (c: string) => string;
  /**
   * Alpha multiplier, for tiles whose ink covers more of the tile than a
   * 1px stroke does.
   *
   * Alpha is not perceived weight. A field of filled triangles at 5.5% and a
   * hairline grid at 5.5% are the same colour and nothing like the same
   * presence — the triangles cover perhaps a fifth of the tile and the grid
   * about a twelfth of it, so the solid one reads as a tint applied to the
   * page while the line one reads as texture on it. This is the correction, so
   * one alpha at the call site means one *apparent* strength across all 22.
   */
  weight?: number;
}

/**
 * A stroke group, since most of these are line work.
 *
 * `stroke-linecap="square"` on purpose: a round cap pulls a stroke back from
 * the tile edge by half its width, which is exactly the gap the corner rules
 * above exist to prevent.
 */
const lines = (c: string, d: string, width = 1) =>
  `<path d="${d}" fill="none" stroke="${c}" stroke-width="${width}" stroke-linecap="square"/>`;

export const PATTERNS: PatternDef[] = [
  {
    id: "dots",
    label: "Dots",
    w: 20,
    h: 20,
    weight: 0.85,
    draw: (c) => `<circle cx="10" cy="10" r="2" fill="${c}"/>`,
  },
  {
    id: "dots-dense",
    label: "Fine dots",
    w: 12,
    h: 12,
    draw: (c) => `<circle cx="6" cy="6" r="1.25" fill="${c}"/>`,
  },
  {
    id: "dots-offset",
    label: "Scattered dots",
    w: 24,
    h: 24,
    // Two dots per tile on opposite diagonals, which halves the apparent
    // spacing without halving the tile — a straight grid of dots at this size
    // starts reading as a grid rather than as a texture.
    draw: (c) => `<circle cx="6" cy="6" r="1.75" fill="${c}"/><circle cx="18" cy="18" r="1.75" fill="${c}"/>`,
  },
  {
    id: "rings",
    label: "Rings",
    w: 28,
    h: 28,
    draw: (c) => `<circle cx="14" cy="14" r="5.5" fill="none" stroke="${c}" stroke-width="1.25"/>`,
  },
  {
    id: "overlapping-circles",
    label: "Interlocking circles",
    w: 40,
    h: 40,
    // Radius exactly half the tile, centred on all four corners and the middle:
    // the corner circles are the neighbours' middle circles, so the lattice is
    // continuous in both axes.
    draw: (c) =>
      `<g fill="none" stroke="${c}" stroke-width="1">` +
      `<circle cx="0" cy="0" r="20"/><circle cx="40" cy="0" r="20"/>` +
      `<circle cx="0" cy="40" r="20"/><circle cx="40" cy="40" r="20"/>` +
      `<circle cx="20" cy="20" r="20"/></g>`,
  },
  {
    id: "diagonal",
    label: "Diagonal lines",
    w: 14,
    h: 14,
    // The main stroke runs corner to corner; the two stubs are the same line
    // arriving in the neighbouring tiles, so the join across the corner is as
    // thick as the rest of it.
    draw: (c) => lines(c, "M-1,1 L1,-1 M0,14 L14,0 M13,15 L15,13", 1.25),
  },
  {
    id: "diagonal-reverse",
    label: "Reverse diagonal",
    w: 14,
    h: 14,
    draw: (c) => lines(c, "M-1,13 L1,15 M0,0 L14,14 M13,-1 L15,1", 1.25),
  },
  {
    id: "crosshatch",
    label: "Crosshatch",
    w: 18,
    h: 18,
    // Two families of lines crossing, so twice the ink of a single diagonal.
    weight: 0.75,
    draw: (c) =>
      lines(
        c,
        "M-1,1 L1,-1 M0,18 L18,0 M17,19 L19,17 M-1,17 L1,19 M0,0 L18,18 M17,-1 L19,1",
        1,
      ),
  },
  {
    id: "grid",
    label: "Grid",
    w: 24,
    h: 24,
    draw: (c) => lines(c, "M0,0 H24 M0,0 V24", 1),
  },
  {
    id: "grid-fine",
    label: "Fine grid",
    w: 10,
    h: 10,
    weight: 0.8,
    draw: (c) => lines(c, "M0,0 H10 M0,0 V10", 0.75),
  },
  {
    id: "pinstripe",
    label: "Pinstripe",
    w: 9,
    h: 9,
    draw: (c) => lines(c, "M0,0 V9", 1),
  },
  {
    id: "plus",
    label: "Plus signs",
    w: 24,
    h: 24,
    draw: (c) => lines(c, "M12,7 V17 M7,12 H17", 1.5),
  },
  {
    id: "crosses",
    label: "Crosses",
    w: 20,
    h: 20,
    draw: (c) => lines(c, "M6,6 L14,14 M14,6 L6,14", 1.25),
  },
  {
    id: "zigzag",
    label: "Zigzag",
    w: 24,
    h: 12,
    // Both ends sit at y = 10, so a row of tiles is one unbroken chevron line.
    draw: (c) => lines(c, "M0,10 L6,2 L12,10 L18,2 L24,10", 1.5),
  },
  {
    id: "wave",
    label: "Waves",
    w: 40,
    h: 20,
    // Mirrored cubics: the outgoing slope at x=40 is the incoming slope at x=0,
    // which is what keeps a repeated sine from kinking at every tile edge.
    draw: (c) => lines(c, "M0,10 C5,1 15,1 20,10 C25,19 35,19 40,10", 1.5),
  },
  {
    id: "scallops",
    label: "Scallops",
    w: 24,
    h: 12,
    draw: (c) => lines(c, "M0,12 A6,6 0 0,1 12,12 A6,6 0 0,1 24,12", 1.25),
  },
  {
    id: "triangles",
    label: "Triangles",
    w: 24,
    h: 22,
    weight: 0.6,
    draw: (c) => `<path d="M12,3 L21,19 L3,19 Z" fill="${c}"/>`,
  },
  {
    id: "diamonds",
    label: "Diamonds",
    w: 26,
    h: 26,
    draw: (c) => `<path d="M13,3 L23,13 L13,23 L3,13 Z" fill="none" stroke="${c}" stroke-width="1.25"/>`,
  },
  {
    id: "bricks",
    label: "Brickwork",
    w: 32,
    h: 16,
    // Courses every 8px, with the vertical joint alternating half a brick —
    // the x=0 joint serves the upper course, x=16 the lower.
    draw: (c) => lines(c, "M0,0 H32 M0,8 H32 M0,0 V8 M16,8 V16", 1),
  },
  {
    id: "rain",
    label: "Rain",
    w: 20,
    h: 20,
    // Dashes kept clear of every edge, so this one needs no wrap segments.
    draw: (c) => lines(c, "M3,3 L7,9 M13,11 L17,17", 1.25),
  },
  {
    id: "confetti",
    label: "Confetti",
    w: 32,
    h: 32,
    // Scattered rather than latticed: the only tile here whose repeat is meant
    // to be hard to see, which is why nothing in it sits on a shared axis.
    draw: (c) =>
      `<g fill="${c}">` +
      `<circle cx="5" cy="8" r="1.5"/><circle cx="24" cy="4" r="1.25"/>` +
      `<circle cx="17" cy="19" r="1.75"/><circle cx="29" cy="25" r="1.25"/>` +
      `<circle cx="9" cy="28" r="1.5"/></g>` +
      lines(c, "M20,10 L24,14 M2,18 L5,21", 1.1),
  },
  {
    id: "honeycomb",
    label: "Honeycomb",
    w: 24.25,
    h: 42,
    /*
      Pointy-top hexagons, circumradius 14. The lattice repeats every √3·R
      across (24.25) and every 3·R down (42), with alternate rows shifted half
      a tile — so the tile has to carry seven centres, five of them off-canvas,
      for the cells that straddle its edges to close.
    */
    draw: (c) => {
      const hex = (cx: number, cy: number) =>
        `M${cx},${cy - 14} L${cx + 12.12},${cy - 7} L${cx + 12.12},${cy + 7} ` +
        `L${cx},${cy + 14} L${cx - 12.12},${cy + 7} L${cx - 12.12},${cy - 7} Z`;
      const centres: [number, number][] = [
        [0, 0],
        [24.25, 0],
        [12.125, 21],
        [0, 42],
        [24.25, 42],
        [12.125, -21],
        [12.125, 63],
      ];
      return lines(c, centres.map(([x, y]) => hex(x, y)).join(" "), 1);
    },
  },
];

/**
 * FNV-1a, 32-bit.
 *
 * Any stable hash would do; this one is four lines and has no dependencies.
 * What matters is that it is *not* `Math.random` — the dashboard card, the
 * builder preview and the hosted page each compute the pattern independently
 * from the same slug, and they have to agree without talking to each other.
 */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The tile this seed always gets. */
export function patternFor(seed: string): PatternDef {
  return PATTERNS[hash(seed) % PATTERNS.length];
}

/** The stored choice: a tile id, or one of the two words that are not tiles. */
export const PATTERN_AUTO = "auto";
export const PATTERN_NONE = "none";

/**
 * The author's choice, resolved to a tile or to nothing.
 *
 * Three cases, and the fallback is the interesting one. `auto` hashes the slug
 * — the behaviour every form had before the picker existed, and still the
 * default, because it gives a new form a texture that belongs to it without
 * anybody deciding. `none` is flat paper. Anything else is looked up by id,
 * and an id we no longer ship falls back to `auto` rather than to nothing: a
 * renamed or retired tile should leave the form looking designed, not blank.
 *
 * A seedless caller — the marketing demo has no form — gets a tile only if it
 * named one, since there is nothing to hash.
 */
export function resolvePattern(
  choice: string | null | undefined,
  seed?: string | null,
): PatternDef | null {
  if (choice === PATTERN_NONE) return null;
  if (choice && choice !== PATTERN_AUTO) {
    const named = PATTERNS.find((p) => p.id === choice);
    if (named) return named;
  }
  return seed ? patternFor(seed) : null;
}

/**
 * Percent-encode an SVG for a CSS `url("data:…")`.
 *
 * Only the five characters that actually break out of the context are touched
 * — `%` first, or it would re-encode its own escapes — and runs of whitespace
 * collapse to one `%20`, which is both the encoding and the minifier.
 */
function dataUri(svg: string): string {
  const encoded = svg
    .replace(/%/g, "%25")
    .replace(/#/g, "%23")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/"/g, "%22")
    .replace(/\s+/g, "%20");
  return `url("data:image/svg+xml,${encoded}")`;
}

/** A `background-image` value: this tile, drawn in `ink`. */
export function patternImage(p: PatternDef, ink: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}" ` +
    `viewBox="0 0 ${p.w} ${p.h}">${p.draw(ink)}</svg>`;
  return dataUri(svg);
}

/** How hard to pull this tile's alpha back. 1 for a plain hairline tile. */
export function patternWeight(p: PatternDef): number {
  return p.weight ?? 1;
}

/** The matching `background-size`, so the tile draws at its intrinsic scale. */
export function patternSize(p: PatternDef): string {
  return `${p.w}px ${p.h}px`;
}

/**
 * `rgb(r,g,b,a)` from a hex, with no spaces.
 *
 * The colour is inlined into a data URI, so `#` would have to be escaped and a
 * space would have to become `%20` — functional, but it doubles the length of
 * the one attribute that appears in every tile. Commas avoid both.
 */
export function rgbaFromHex(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (full.length !== 6) return `rgba(0,0,0,${alpha})`;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}
