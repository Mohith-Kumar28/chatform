"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Node } from "@xyflow/react";
import { Flag, Minus, Play, Plus, Scan, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Block, FormDoc } from "@repo/form-schema";
import { blockMeta, TONE_ACCENT, TONE_CLASSES } from "@/components/builder/block-library";
import { BRANCH_HEADER, BRANCH_ROW, nodeSize } from "@/components/builder/flow-layout";
import { branchData, deriveGraph, isGoto, OTHERWISE, routeColor } from "@/components/builder/flow-graph";
import { cn } from "@/lib/utils";

/**
 * The template's flow, drawn the way the builder draws it — and read-only.
 *
 * A list of questions tells you what a template asks. It cannot tell you that
 * the third question sends half the respondents to a different ending, and
 * that is exactly the thing somebody is deciding about when they choose
 * between two templates. So the gallery shows the graph.
 *
 * Not React Flow. The editor's canvas is a 200 KB chunk that exists to let you
 * drag nodes, connect handles and open inspectors — none of which this does.
 * The graph itself comes from `deriveGraph`, so the picture here and the
 * picture in the builder are the same picture; only the painting differs. What
 * is left is dagre for placement, absolutely-positioned nodes in the app's own
 * markup, and one SVG layer of wires.
 */

/** Where a wire leaves or arrives, in graph coordinates. */
interface Anchor {
  x: number;
  y: number;
}

interface Placed {
  node: Node;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Wire {
  id: string;
  from: Anchor;
  to: Anchor;
  label?: string;
  /** Where the label sits — see `labelAt`. */
  at?: Anchor;
  /** A branch route's colour, shared with its row's dot. Plain wires have none. */
  color?: string;
}

/** Breathing room around the graph, so nothing touches the frame. */
const PAD = 16;

/** A route label's plate, and therefore the step between two of them. */
const LABEL_H = 15;

/**
 * A wire, leaving the bottom of one node and arriving at the top of the next.
 *
 * The control points are pulled straight down and straight up, by half the
 * vertical gap, so a route that steps sideways leaves and lands square instead
 * of slicing diagonally across whatever is between them.
 */
function path(from: Anchor, to: Anchor): string {
  const d = Math.max(16, Math.abs(to.y - from.y) / 2);
  return `M ${from.x} ${from.y} C ${from.x} ${from.y + d}, ${to.x} ${to.y - d}, ${to.x} ${to.y}`;
}

export function TemplateFlow({
  doc,
  className,
  /** The frame's height cap; taller flows scroll inside it. */
  height = 440,
}: {
  doc: FormDoc;
  className?: string;
  height?: number;
}) {
  // Down a column, not across one: see `Rankdir` in `flow-layout`.
  const graph = useMemo(() => deriveGraph(doc, doc.logic.filter(isGoto), undefined, "TB"), [doc]);

  const { placed, wires, width: graphWidth, height: graphHeight } = useMemo(
    () => measure(graph.nodes, graph.edges),
    [graph],
  );

  /**
   * Fit to the frame, never past 1.
   *
   * Blowing a small graph up to fill the space would make a three-question
   * template look like a different product from a twelve-question one. Small
   * flows are simply small.
   */
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameWidth(entry?.contentRect.width ?? 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /**
   * Narrow enough for the frame, and never smaller than that.
   *
   * Height is deliberately not part of the fit. A twelve-question flow is a
   * tall picture, and squeezing it into the frame's height is what turned this
   * into a 40px strip of unreadable boxes; a column that is too tall simply
   * scrolls, which is what a column does.
   */
  const scale = frameWidth ? Math.min(1, frameWidth / graphWidth) : 1;

  /**
   * There is more flow below the fold, and a hard edge does not say so.
   *
   * Faded with a mask rather than a gradient plate on top, because the plate
   * has to be painted in the ground's own colour and this component does not
   * know what it has been dropped onto. The mask lifts at the bottom, so the
   * last node is not left permanently half-faded.
   */
  const [more, setMore] = useState(false);
  const onScroll = () => {
    const el = frame.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };
  useEffect(onScroll, [graphHeight, scale]);

  return (
    <div
      ref={frame}
      onScroll={onScroll}
      className={cn("relative w-full overflow-auto", className)}
      style={{
        maxHeight: height,
        maskImage: more ? "linear-gradient(to bottom, #000 calc(100% - 2.5rem), transparent)" : undefined,
      }}
      role="img"
      aria-label={flowSummary(doc)}
    >
      <div
        className="relative"
        style={{ width: graphWidth * scale, height: graphHeight * scale }}
      >
      <div
        className="absolute top-0 left-0"
        style={{
          width: graphWidth,
          height: graphHeight,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <FlowDrawing placed={placed} wires={wires} width={graphWidth} height={graphHeight} />
        </div>
      </div>
    </div>
  );
}

/**
 * The same flow in a viewport you can move around: drag to pan, scroll to pan,
 * pinch or ⌘/Ctrl-scroll to zoom, and buttons for anyone without a trackpad.
 *
 * Used by the expanded dialog, where the point is to read a big flow up close.
 * The inline version stays a plain scrolling column, because a canvas that
 * captures the wheel inside a page that scrolls is a trap for the page.
 *
 * Wheel means pan and ⌘/Ctrl-wheel means zoom, the Figma convention. A trackpad
 * pinch arrives as a ctrl-wheel, so pinching zooms without a special case.
 */
export function PannableFlow({ doc, className }: { doc: FormDoc; className?: string }) {
  const graph = useMemo(() => deriveGraph(doc, doc.logic.filter(isGoto), undefined, "TB"), [doc]);
  const { placed, wires, width: graphWidth, height: graphHeight } = useMemo(
    () => measure(graph.nodes, graph.edges),
    [graph],
  );

  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ x: number; y: number; k: number } | null>(null);

  /** The whole flow in view. */
  const fit = useCallback(() => {
    const el = frame.current;
    if (!el) return;
    setView(fitted(el, graphWidth, graphHeight));
  }, [graphWidth, graphHeight]);

  // Open at reading size: fitted to the width, top first, like the inline
  // column. Squeezing a twenty-question flow into the frame's height opens it
  // at 40% and every label unreadable; Fit is one click away for the overview.
  // Waits for the frame to have a size, since the dialog animates in.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth > 0) setView((v) => v ?? fitted(el, graphWidth, graphHeight, false));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [graphWidth, graphHeight]);

  /** Zoom to `k`, keeping the graph point under (cx, cy) where it is. */
  const zoomAt = useCallback((next: number, cx: number, cy: number) => {
    setView((v) => {
      if (!v) return v;
      const k = clamp(next);
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
    });
  }, []);

  const zoomBy = (factor: number) => {
    const el = frame.current;
    if (el && view) zoomAt(view.k * factor, el.clientWidth / 2, el.clientHeight / 2);
  };

  // A non-passive listener: React's onWheel is passive, so it cannot stop the
  // dialog behind from scrolling or the browser from zooming the page.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        setView((v) => {
          if (!v) return v;
          const k = clamp(v.k * Math.exp(-e.deltaY * 0.004));
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;
          return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k };
        });
      } else {
        setView((v) => (v ? { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY } : v));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /**
   * Drag to pan with one pointer, pinch with two. Tracked by pointer id so a
   * finger lifting mid-pinch hands over to a pan instead of jumping.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const map = pointers.current;
    const prev = map.get(e.pointerId);
    if (!prev) return;
    const others = [...map.entries()].filter(([id]) => id !== e.pointerId);
    if (others.length === 0) {
      setView((v) => (v ? { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y } : v));
    } else {
      const other = others[0]![1];
      const before = Math.hypot(prev.x - other.x, prev.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      const rect = e.currentTarget.getBoundingClientRect();
      if (before > 0 && view) {
        zoomAt(view.k * (after / before), (e.clientX + other.x) / 2 - rect.left, (e.clientY + other.y) / 2 - rect.top);
      }
    }
    map.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  };

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (view) zoomAt(view.k * 1.6, e.clientX - rect.left, e.clientY - rect.top);
        }}
        className={cn(
          "absolute inset-0 touch-none select-none",
          dragging ? "cursor-grabbing" : "cursor-grab",
        )}
        role="img"
        aria-label={flowSummary(doc)}
      >
        {view && (
          <div
            className="absolute top-0 left-0"
            style={{
              width: graphWidth,
              height: graphHeight,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
              transformOrigin: "0 0",
            }}
          >
            <FlowDrawing placed={placed} wires={wires} width={graphWidth} height={graphHeight} />
          </div>
        )}
      </div>

      <div className="bg-card border-border absolute right-3 bottom-3 flex items-center gap-0.5 rounded-full border p-1 shadow-sm">
        <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
          <Minus className="size-3.5" />
        </Button>
        <span className="text-muted-foreground tabular w-11 text-center text-xs" aria-live="polite">
          {view ? `${Math.round(view.k * 100)}%` : ""}
        </span>
        <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
          <Plus className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" shape="pill" aria-label="Fit to screen" onClick={fit}>
          <Scan className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const clamp = (k: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));

/** Centred and never past 1:1; `whole` also fits the height, not just the width. */
function fitted(el: HTMLElement, gw: number, gh: number, whole = true) {
  const { clientWidth: w, clientHeight: h } = el;
  const k = clamp(Math.min(1, (w - 2 * PAD) / gw, whole ? (h - 2 * PAD) / gh : 1));
  return { x: (w - gw * k) / 2, y: Math.max(PAD, (h - gh * k) / 2), k };
}

/** The boxes and wires at 1:1, in graph coordinates. Both viewports scale this. */
function FlowDrawing({ placed, wires, width, height }: { placed: Placed[]; wires: Wire[]; width: number; height: number }) {
  // Unique per drawing: the inline flow and the expanded one are both on the
  // page at once, and a duplicate marker id resolves to whichever came first.
  const markerBase = `cf-arrow-${useId().replace(/:/g, "")}`;
  const colors = [...new Set(["var(--border)", ...wires.flatMap((w) => (w.color ? [w.color] : []))])];
  return (
    <>
      <svg
        className="pointer-events-none absolute top-0 left-0 overflow-visible"
        width={width}
        height={height}
        aria-hidden
      >
        {/* One arrowhead per wire colour: a marker cannot inherit its
            wire's stroke everywhere yet. */}
        <defs>
          {colors.map((color, i) => (
            <marker
              key={color}
              id={`${markerBase}-${i}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill={color} />
            </marker>
          ))}
        </defs>
        {wires.map((w) => (
          <g key={w.id}>
            <path
              d={path(w.from, w.to)}
              fill="none"
              stroke={w.color ?? "var(--border)"}
              strokeWidth={1.5}
              markerEnd={`url(#${markerBase}-${colors.indexOf(w.color ?? "var(--border)")})`}
            />
            {w.label && <WireLabel wire={w} />}
          </g>
        ))}
      </svg>

      {placed.map((p) => (
        <div
          key={p.node.id}
          className="absolute"
          style={{ left: p.x, top: p.y, width: p.width, height: p.height }}
        >
          <FlowNode node={p.node} />
        </div>
      ))}
    </>
  );
}

/**
 * A route's condition, sat on its wire.
 *
 * The background is drawn rather than relying on the wire passing behind it —
 * an SVG has no z-index beyond document order, and a label the line runs
 * through is a label nobody can read.
 */
function WireLabel({ wire }: { wire: Wire }) {
  /*
   * Clipped, because the branch node above already lists every case in full.
   * A route out of a four-way branch labelled "Not sure — help me choose" is
   * 130px of text on a wire 55px from its neighbour, and three of those
   * overlapped into one unreadable smear.
   */
  const text = wire.label!.length > 15 ? `${wire.label!.slice(0, 14)}…` : wire.label!;
  // Estimated: measuring text needs a layout pass, and the plate only has to
  // cover the glyphs it sits behind.
  const width = text.length * 5.2 + 10;
  const { x, y } = wire.at ?? { x: (wire.from.x + wire.to.x) / 2, y: (wire.from.y + wire.to.y) / 2 };
  return (
    <>
      <rect
        x={x - width / 2}
        y={y - LABEL_H / 2}
        width={width}
        height={LABEL_H}
        rx={4}
        fill="var(--card)"
        stroke="var(--border)"
        strokeOpacity={0.6}
      />
      <text
        x={x}
        y={y + 3.2}
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 9.5, fontWeight: 500 }}
      >
        {text}
      </text>
    </>
  );
}

function FlowNode({ node }: { node: Node }) {
  if (node.type === "start") {
    const { block } = node.data as { block: Block };
    return (
      <div className="bg-card flex h-full items-center gap-2 rounded-full border-2 border-green-600/50 px-4 shadow-sm">
        <Play className="size-3 shrink-0 fill-green-600 text-green-600" />
        <span className="truncate text-xs font-semibold">{block.title}</span>
      </div>
    );
  }

  if (node.type === "ending") {
    const { title, kind } = node.data as { title: string; kind?: FormDoc["endings"][number]["kind"] };
    // A refusal reads as an exit, not a goal — the same distinction the canvas
    // makes, and the reason a screening template is legible at a glance.
    const screenOut = kind === "screen_out";
    const Icon = screenOut ? ShieldAlert : Flag;
    return (
      <div
        className={cn(
          "flex h-full flex-col justify-center rounded-xl border-2 border-dashed px-3 shadow-sm",
          screenOut ? "border-muted-foreground/50 bg-muted" : "border-primary/60 bg-accent",
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn("size-3.5 shrink-0", screenOut ? "text-muted-foreground" : "text-primary")} />
          <span className="truncate text-xs font-semibold">{title}</span>
        </div>
        {screenOut && (
          <p className="text-muted-foreground mt-0.5 text-[10px] font-medium tracking-wide uppercase">
            Can&apos;t submit
          </p>
        )}
      </div>
    );
  }

  if (node.type === "branch") {
    const { sourceTitle, cases, exhaustive, fallback } = branchData(node);
    return (
      <div className="bg-card border-border h-full overflow-hidden rounded-xl border-2 shadow-xs">
        <div
          className="text-muted-foreground flex items-center px-2 text-[10px] font-semibold tracking-wide uppercase"
          style={{ height: BRANCH_HEADER }}
        >
          <span className="truncate">{sourceTitle}</span>
        </div>
        {cases.map((c, row) => (
          <div
            key={c.ruleId}
            className="flex items-center px-2 text-[10px]"
            style={{ height: BRANCH_ROW }}
          >
            <span className="mr-1.5 size-1.5 shrink-0 rounded-full" style={{ background: routeColor(row) }} />
            <span className="truncate font-medium">{c.label}</span>
          </div>
        ))}
        {!exhaustive && fallback && (
          <div
            className="text-muted-foreground flex items-center px-2 text-[10px]"
            style={{ height: BRANCH_ROW }}
          >
            <span className="bg-muted-foreground/50 mr-1.5 size-1 shrink-0 rounded-full" />
            <span className="truncate">otherwise</span>
          </div>
        )}
      </div>
    );
  }

  const { block, index } = node.data as { block: Block; index: number };
  const meta = blockMeta(block.type);
  return (
    <div
      className="bg-card flex h-full flex-col justify-center overflow-hidden rounded-xl px-3 py-2 shadow-xs"
      style={{ boxShadow: `inset 3px 0 0 0 ${TONE_ACCENT[meta.tone]}, var(--shadow-xs)` }}
    >
      <div className="flex items-center gap-2">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md", TONE_CLASSES[meta.tone])}>
          <meta.icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="tabular text-[0.625rem] opacity-60">{index}</span>
        <span className="line-clamp-2 min-w-0 flex-1 text-xs font-medium break-words" title={block.title}>
          {block.title}
        </span>
        {block.required && <span className="text-destructive text-xs">*</span>}
      </div>
      <p className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">{meta.label}</p>
    </div>
  );
}

/**
 * Boxes and wires in one coordinate space, normalised to start at the origin.
 *
 * dagre's own margins put the first node at (40, 40) and leave the graph's
 * extent implicit; a diagram that has to fit a frame needs both corners.
 */
function measure(
  nodes: Node[],
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    label?: unknown;
    style?: { stroke?: string };
  }[],
): { placed: Placed[]; wires: Wire[]; width: number; height: number } {
  const boxes = new Map<string, Placed>();
  for (const node of nodes) {
    const { width, height } = nodeSize(node);
    boxes.set(node.id, { node, x: node.position.x, y: node.position.y, width, height });
  }

  const all = [...boxes.values()];
  if (all.length === 0) return { placed: [], wires: [], width: 1, height: 1 };

  const minX = Math.min(...all.map((b) => b.x)) - PAD;
  const minY = Math.min(...all.map((b) => b.y)) - PAD;
  for (const box of all) {
    box.x -= minX;
    box.y -= minY;
  }
  const width = Math.max(...all.map((b) => b.x + b.width)) + PAD;
  const height = Math.max(...all.map((b) => b.y + b.height)) + PAD;

  const wires: Wire[] = [];
  for (const edge of edges) {
    const from = boxes.get(edge.source);
    const to = boxes.get(edge.target);
    if (!from || !to) continue;
    const label = typeof edge.label === "string" ? edge.label : undefined;
    const at = { x: exitX(from, edge.sourceHandle ?? undefined), y: from.y + from.height };
    wires.push({
      id: edge.id,
      from: at,
      to: { x: to.x + to.width / 2, y: to.y },
      label,
      at: label ? labelAt(from, at, edge.sourceHandle ?? undefined) : undefined,
      color: edge.style?.stroke === "var(--border)" ? undefined : edge.style?.stroke,
    });
  }

  return { placed: all, wires, width, height };
}

/**
 * A branch's routes leave in the order its rows are listed.
 *
 * The whole reason a branch is one node with a row per answer is that you can
 * see which answer goes where. Running vertically the rows cannot each have
 * their own exit — they are stacked down the card, and every wire leaves the
 * bottom — so the order is carried instead: the first row leaves furthest
 * left, and `alignArmsWithTheirRows` has already put the first arm there. Four
 * routes fanning out of one point would leave the rows above as decoration.
 */
function exitX(box: Placed, handle?: string): number {
  const middle = box.x + box.width / 2;
  if (box.node.type !== "branch" || !handle) return middle;
  const { cases, exhaustive } = branchData(box.node);
  const row = handle === OTHERWISE ? cases.length : cases.findIndex((c) => c.ruleId === handle);
  if (row < 0) return middle;
  const exits = cases.length + (exhaustive ? 0 : 1);
  // Spread across the card's width, inset from both corners.
  return box.x + (box.width * (row + 1)) / (exits + 1);
}

/**
 * A route's label, close to the answer it belongs to.
 *
 * At the midpoint of the wire — where a label naturally goes — every arm of one
 * branch converges on nearly the same spot, because they all start at one node
 * and their curves cross before spreading. Sitting them just below their own
 * exit keeps each label over the wire it names, and a small step per row means
 * neighbouring arms cannot land on the same line.
 */
function labelAt(box: Placed, exit: Anchor, handle?: string): Anchor {
  if (box.node.type !== "branch" || !handle) return { x: exit.x, y: exit.y + 13 };
  const { cases } = branchData(box.node);
  const row = handle === OTHERWISE ? cases.length : Math.max(0, cases.findIndex((c) => c.ruleId === handle));
  // A full plate height per step, so two labels cannot half-cover each other,
  // cycling every third arm to stay inside the gap below the node.
  return { x: exit.x, y: exit.y + 13 + (row % 3) * LABEL_H };
}

/**
 * The diagram, said out loud.
 *
 * A picture with no text alternative is a picture a screen reader announces as
 * nothing at all. The full detail is in the question list beside it, so this
 * is a summary rather than a transcript.
 */
function flowSummary(doc: FormDoc): string {
  const questions = doc.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement").length;
  const splits = new Set(
    doc.logic.filter(isGoto).filter((r) => (r.when?.conditions.length ?? 0) > 0).map((r) => r.from),
  ).size;
  const endings = doc.endings.length;
  return [
    `Flow diagram: ${questions} question${questions === 1 ? "" : "s"}`,
    splits > 0 ? `${splits} branching point${splits === 1 ? "" : "s"}` : "no branching",
    `${endings} ending${endings === 1 ? "" : "s"}`,
  ].join(", ");
}
