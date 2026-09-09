/**
 * A fragment of the flow canvas, drawn rather than screenshotted.
 *
 * The real editor is `@xyflow/react` with a dagre layout and a 200 KB chunk —
 * far too much to load on a marketing page, and a PNG would go stale. This is
 * the same shape: a question, two conditional arms, and the endings they lead
 * to, using the block-family colours the canvas itself uses.
 *
 * The nodes were redrawn because the old ones were a coloured bar down the
 * left edge of a rounded rectangle, which is the house style of every
 * generated dashboard mock on the internet — and, worse, it was not what this
 * product draws. `QuestionNode` in `workflow-client.tsx` puts the family
 * colour in a rounded icon chip and reserves a left spine for the *selected*
 * state, as an inset shadow. So the drawing was advertising a UI we do not
 * ship, in the visual cliché that makes a reader assume nobody looked.
 *
 * What it draws now, matching that component field for field: the chip with
 * the block type's own lucide glyph, the question index, the title, and the
 * type label underneath. The glyph paths are copied from lucide rather than
 * approximated, so the icon on this page is the icon in the builder. The
 * handles are the small dots the canvas puts where wires meet a node, and the
 * branch labels sit in pills ON their wire instead of floating beside it —
 * a label with a line running under it reads as a caption for the whole
 * picture, not for one edge.
 *
 * The edges draw themselves in, and the reason they were once removed is worth
 * keeping written down: the old version used motion's `whileInView` with a
 * `pathLength: 0` initial, which put `stroke-dashoffset: 1` into the server
 * HTML and made the diagram's only connective tissue conditional on an
 * IntersectionObserver delivering. When it did not — a backgrounded tab is
 * enough — the nodes rendered and the arrows between them did not: a flow
 * diagram showing no flow.
 *
 * `InView` inverts that. Nothing here is hidden until the browser has proved
 * it can animate, so the failure mode is a finished diagram rather than a
 * broken one, and this file stays a server component with no library in it.
 * The order is the order the linter walks: the question, then the branch it
 * splits on, then each arm, then the ending they both reach.
 */

/** Milliseconds, keyed to where each element sits in the walk. */
const BEAT = {
  question: 60,
  branch: 320,
  arms: 760,
  join: 1020,
  ending: 1400,
} as const;

const NODE_W = 176;
const NODE_H = 54;

/**
 * Glyphs lifted from lucide, at their own 24-unit scale.
 *
 * Each is rendered into a nested `<svg viewBox="0 0 24 24">`, which is what
 * lets the real path data drop in untouched — no re-plotting to this drawing's
 * coordinate space, and no chance of a hand-traced approximation drifting from
 * the icon the builder actually renders. `blockMeta(type).icon` names these:
 * Hash for Number, AtSign for Email, CircleDot for Single select.
 */
const GLYPHS = {
  hash: (
    <>
      <path d="M4 9h16" />
      <path d="M4 15h16" />
      <path d="M10 3 8 21" />
      <path d="M16 3l-2 18" />
    </>
  ),
  atSign: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
    </>
  ),
  circleDot: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
} as const;

interface FlowNode {
  x: number;
  y: number;
  index: string;
  title: string;
  type: string;
  tone: "number" | "contact" | "choice";
  glyph: keyof typeof GLYPHS;
  delay: number;
}

const NODES: readonly FlowNode[] = [
  {
    x: 132,
    y: 16,
    index: "3",
    title: "How big is your team?",
    type: "Number",
    tone: "number",
    glyph: "hash",
    delay: BEAT.question,
  },
  {
    x: 16,
    y: 148,
    index: "4",
    title: "Ask for a work email",
    type: "Email",
    tone: "contact",
    glyph: "atSign",
    delay: BEAT.arms,
  },
  {
    x: 248,
    y: 148,
    index: "5",
    title: "Which plan fits?",
    type: "Single select",
    tone: "choice",
    glyph: "circleDot",
    delay: BEAT.arms + 140,
  },
];

/**
 * The wires, and the two that carry a condition.
 *
 * Every path is `pathLength={1}` so one keyframe draws all four regardless of
 * their real lengths — the branch arms are nearly twice the join edges.
 */
interface FlowEdge {
  d: string;
  delay: number;
  /** Set on the two branch arms only; the join edges carry no condition. */
  label?: string;
  /** Pill centre and width, in viewBox units. */
  lx?: number;
  lw?: number;
}

const EDGES: readonly FlowEdge[] = [
  {
    d: "M220 70 L220 88 Q220 100 208 100 L116 100 Q104 100 104 112 L104 142",
    label: "≥ 50",
    lx: 160,
    lw: 36,
    delay: BEAT.branch,
  },
  {
    d: "M220 70 L220 88 Q220 100 232 100 L324 100 Q336 100 336 112 L336 142",
    label: "otherwise",
    lx: 280,
    lw: 58,
    delay: BEAT.branch,
  },
  { d: "M104 202 L104 255 Q104 267 116 267 L162 267", delay: BEAT.join },
  { d: "M336 202 L336 255 Q336 267 324 267 L278 267", delay: BEAT.join },
];

export function FlowPreview() {
  return (
    <svg
      viewBox="0 0 440 300"
      className="w-full"
      role="img"
      aria-label="A flow fragment: one question branching on team size into two more questions, both ending at the same completion."
    >
      <defs>
        <marker
          id="cf-flow-arrow"
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L8 4 L0 8 z" fill="var(--border)" />
        </marker>
        {/* The lift the real canvas gives its nodes. A card that sits flat on
            the ground reads as a drawing of a card; a shadow this small is the
            difference between a diagram and a screenshot. */}
        <filter id="cf-flow-lift" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dy="1.5" stdDeviation="2" floodOpacity="0.13" />
        </filter>
      </defs>

      {EDGES.map((edge, i) => (
        <path
          key={`e${i}`}
          d={edge.d}
          pathLength={1}
          fill="none"
          stroke="var(--border)"
          strokeWidth="1.75"
          strokeLinecap="round"
          markerEnd="url(#cf-flow-arrow)"
          className="cf-a-draw"
          style={{ animationDelay: `${edge.delay}ms` }}
        />
      ))}

      {/* The conditions, in pills on the wire they belong to. Card-filled, so
          the wire stops at the label rather than striking through it. */}
      {EDGES.filter((e) => e.label).map((edge) => (
        <g
          key={edge.label}
          className="cf-a-rise"
          style={{ animationDelay: `${BEAT.branch + 520}ms` }}
        >
          <rect
            x={edge.lx! - edge.lw! / 2}
            y="91"
            width={edge.lw!}
            height="18"
            rx="9"
            fill="var(--card)"
            stroke="var(--border)"
            strokeWidth="1"
          />
          <text
            x={edge.lx!}
            y="103.5"
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: 9, fontWeight: 500 }}
          >
            {edge.label}
          </text>
        </g>
      ))}

      {NODES.map((node) => (
        <Node key={node.title} {...node} />
      ))}

      {/* The ending. Dashed, because `EndingNode` is dashed — the canvas draws
          a terminus differently from a question on purpose, and a solid pill
          with a tick in it would have been a third kind of node this form does
          not have. */}
      <g
        className="cf-a-pop"
        style={{ animationDelay: `${BEAT.ending}ms`, transformOrigin: "220px 267px" }}
      >
        <rect
          x="168"
          y="250"
          width="104"
          height="34"
          rx="11"
          fill="var(--primary-soft)"
          stroke="var(--primary)"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <svg
          x="181"
          y="259"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <text
          x="202"
          y="272"
          className="fill-primary-soft-foreground"
          style={{ fontSize: 10.5, fontWeight: 600 }}
        >
          Complete
        </text>
      </g>
    </svg>
  );
}

/**
 * One question node, laid out the way `QuestionNode` lays one out: chip, index,
 * title, and the block type in small caps underneath.
 */
function Node({ x, y, index, title, type, tone, glyph, delay }: FlowNode) {
  const soft = `var(--family-${tone}-soft)`;
  const ink = `var(--family-${tone}-ink)`;
  const accent = `var(--family-${tone})`;

  return (
    <g className="cf-a-rise" style={{ animationDelay: `${delay}ms` }}>
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={NODE_H}
        rx="12"
        fill="var(--card)"
        stroke="var(--border)"
        strokeWidth="1"
        filter="url(#cf-flow-lift)"
      />

      {/* The chip. This is where the family colour lives — the whole point of
          the redraw. */}
      <rect x={x + 11} y={y + 15} width="24" height="24" rx="7" fill={soft} />
      {/* `color` as well as `stroke`, because CircleDot's centre is a FILLED
          shape and fills it with `currentColor`. Without this the glyph
          inherits the page's text colour from outside the chip: a dark dot on
          a pale chip in the light theme, which looked right by accident, and
          nothing at all in the dark one. */}
      <svg
        x={x + 16.5}
        y={y + 20.5}
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        color={ink}
        stroke={ink}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[glyph]}
      </svg>

      <text
        x={x + 43}
        y={y + 25}
        className="fill-muted-foreground tabular"
        style={{ fontSize: 8.5 }}
      >
        {index}
      </text>
      <text x={x + 54} y={y + 25} className="fill-foreground" style={{ fontSize: 11, fontWeight: 600 }}>
        {title}
      </text>
      <text
        x={x + 43}
        y={y + 40}
        className="fill-muted-foreground"
        style={{ fontSize: 8, fontWeight: 500, letterSpacing: "0.07em", textTransform: "uppercase" }}
      >
        {type}
      </text>

      {/* The handles, where the wires meet the card. Target grey, source in the
          family's own accent — the same pairing the canvas uses. */}
      <circle cx={x + NODE_W / 2} cy={y} r="2.75" fill="var(--border)" />
      <circle cx={x + NODE_W / 2} cy={y + NODE_H} r="2.75" fill={accent} />
    </g>
  );
}
