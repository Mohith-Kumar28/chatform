"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  getNodesBounds,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./flow.css";
import { cn } from "@/lib/utils";
import { BlockInspector as SharedBlockInspector } from "./inspector/block-inspector";
import { BLOCK_GROUPS, BLOCK_LIBRARY, blockMeta, TONE_ACCENT, TONE_CLASSES } from "./block-library";
import { layoutGraph, placeNodes } from "./flow-layout";
import { toast } from "sonner";
import { useBuilderStore } from "@/stores/builder-store";
import type { Block, FormDoc, LogicRule } from "@repo/form-schema";
import { Block as BlockSchema, conditionIsAlwaysTrue, lintFormDoc, rulesAreExhaustive } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  LayoutGrid,
  Plus,
  ChevronLeft, ChevronRight, Flag,
  GitBranch, GripVertical, Play,
  Sparkles, Trash2, X,
} from "lucide-react";

const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

type BlockType = Block["type"];

const OPS = [
  { value: "eq", label: "equals", inv: "neq" },
  { value: "neq", label: "not equals", inv: "eq" },
  { value: "gt", label: "greater than", inv: "lte" },
  { value: "gte", label: "greater or equal", inv: "lt" },
  { value: "lt", label: "less than", inv: "gte" },
  { value: "lte", label: "less or equal", inv: "gt" },
  { value: "contains", label: "contains", inv: "not_contains" },
  { value: "not_contains", label: "doesn't contain", inv: "contains" },
  { value: "is_empty", label: "is empty", inv: "is_not_empty" },
  { value: "is_not_empty", label: "is not empty", inv: "is_empty" },
] as const;

type Op = (typeof OPS)[number]["value"];
const opInverse = (op: string): Op | null => OPS.find((o) => o.value === op)?.inv ?? null;
/** Shared by the initial fit and the Auto arrange button. */
const FIT_VIEW = { maxZoom: 0.85, minZoom: 0.65, padding: 0.12 } as const;

const opLabel = (op: string): string => OPS.find((o) => o.value === op)?.label ?? op;
const opsValueNeeded = (op: string): boolean => !["is_empty", "is_not_empty", "is_checked", "is_not_checked"].includes(op);

interface GotoRule extends Extract<LogicRule, { action_kind: "goto" }> {
  pair?: string;
  branch?: "true" | "false";
}

const isGoto = (r: LogicRule): r is GotoRule => r.action_kind === "goto";
const condOf = (r: GotoRule) => r.when?.conditions[0];

interface WorkflowClientProps {
  doc: FormDoc;
  onChange: (next: FormDoc) => void;
  /** Block ref to pre-select in the canvas (e.g. arriving from Build's Logic button). */
  focusRef?: string | null;
  /** Rendered above the canvas, between the two panels. */
  toolbar?: React.ReactNode;
}

export function WorkflowClient({ doc, onChange, focusRef, toolbar }: WorkflowClientProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditor doc={doc} onChange={onChange} focusRef={focusRef} toolbar={toolbar} />
    </ReactFlowProvider>
  );
}

function WorkflowEditor({ doc, onChange, focusRef, toolbar }: WorkflowClientProps) {
  const { screenToFlowPosition, setViewport } = useReactFlow();

  /**
   * The minimap earns its place while you are panning, zooming or dragging a
   * node, and is dead weight the rest of the time. Reveal it on interaction
   * and hide it again shortly after you stop.
   */
  const [navigating, setNavigating] = useState(false);
  const hideMapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showMap = useCallback(() => {
    setNavigating(true);
    if (hideMapTimer.current) clearTimeout(hideMapTimer.current);
    hideMapTimer.current = setTimeout(() => setNavigating(false), 1400);
  }, []);
  useEffect(() => () => {
    if (hideMapTimer.current) clearTimeout(hideMapTimer.current);
  }, []);
  const wrapper = useRef<HTMLDivElement>(null);
  const dragType = useRef<{ kind: "block" | "condition" | "ending"; blockType?: BlockType } | null>(null);

  /**
   * Canvas selection, owned by the builder store.
   *
   * This was local state, mirrored INTO the store by an effect so the shared
   * inspector could read it. That made the store a copy rather than the source:
   * selecting a question in the Questions list left the canvas pointing at
   * whatever it had been showing, and switching views lost your place. The two
   * views are one document and one inspector; the selection is one thing too.
   *
   * `branch_*` nodes are the exception — the store has no concept of them, since
   * they are a drawing of rules rather than a part of the document — so they are
   * the only selection still held here.
   */
  const storeSelectedRef = useBuilderStore((st) => st.selectedRef);
  const storeSelectedEnding = useBuilderStore((st) => st.selectedEndingRef);
  const selectInStore = useBuilderStore((st) => st.select);
  const selectEndingInStore = useBuilderStore((st) => st.selectEnding);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(
    focusRef?.startsWith("branch_") ? focusRef : null,
  );
  const selectedNodeId = selectedBranchId ?? storeSelectedRef ?? storeSelectedEnding;

  const setSelectedNodeId = useCallback(
    (id: string | null) => {
      if (id === null) {
        setSelectedBranchId(null);
        selectInStore(null);
        return;
      }
      if (id.startsWith("branch_")) {
        setSelectedBranchId(id);
        selectInStore(null);
        return;
      }
      setSelectedBranchId(null);
      if (doc.endings.some((e) => e.ref === id)) selectEndingInStore(id);
      else selectInStore(id);
    },
    [doc.endings, selectInStore, selectEndingInStore],
  );

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // apply focus requests (e.g. from Build's Logic button) during render
  const [appliedFocus, setAppliedFocus] = useState<string | null>(focusRef ?? null);
  if (focusRef && focusRef !== appliedFocus) {
    setAppliedFocus(focusRef);
    setSelectedNodeId(focusRef);
    setSelectedEdgeId(null);
  }

  const gotoRules = useMemo(() => doc.logic.filter(isGoto), [doc.logic]);
  const answerableBlocks = useMemo(() => doc.blocks.filter((b) => b.type !== "welcome"), [doc.blocks]);

  const setRules = useCallback((rules: LogicRule[]) => onChange({ ...doc, logic: rules }), [doc, onChange]);

  /**
   * Where the flow is broken, per node.
   *
   * From `lintFormDoc`, which is the same pass that decides whether the form
   * can be published — so the canvas cannot disagree with the publish button
   * about whether the flow works. Only issues that name refs land on a node;
   * the rest (a missing ending, a payment with no destination) are the kind of
   * thing the publish dialog already says.
   */
  const flowProblems = useMemo(() => {
    const out = new Map<string, { level: "error" | "warning"; messages: string[] }>();
    for (const issue of lintFormDoc(doc)) {
      if (!issue.refs?.length) continue;
      if (issue.code !== "unreachable_blocks" && issue.code !== "no_route_to_ending" && issue.code !== "dangling_target") {
        continue;
      }
      for (const ref of issue.refs) {
        const existing = out.get(ref);
        if (existing) {
          existing.messages.push(issue.message);
          if (issue.level === "error") existing.level = "error";
        } else {
          out.set(ref, { level: issue.level, messages: [issue.message] });
        }
      }
    }
    return out;
  }, [doc]);

  // ── derive graph from doc ──────────────────────────────────────────────
  const derived = useMemo(() => deriveGraph(doc, gotoRules, flowProblems), [doc, gotoRules, flowProblems]);

  // sync local RF state when the doc changes (drag edits flow through onNodesChange,
  // so live drags are never clobbered by this sync). Render-phase adjustment pattern —
  // an effect here would snap nodes back mid-drag and cascade renders.
  const [syncedGraph, setSyncedGraph] = useState(derived);
  const [nodes, setNodes] = useState<Node[]>(derived.nodes);
  const [edges, setEdges] = useState<Edge[]>(derived.edges);
  if (syncedGraph !== derived) {
    setSyncedGraph(derived);
    setNodes(derived.nodes);
    setEdges(derived.edges);
  }

  /**
   * Dragging one node records where all of them are.
   *
   * `deriveGraph` honours the saved layout only while it covers every node, so
   * writing a single dragged position into an otherwise-empty layout would
   * leave it incomplete and the drag would be thrown away on the next render.
   * Committing the whole canvas keeps that invariant — and drops positions for
   * nodes that no longer exist, which is the other half of keeping the layout
   * a description of this graph rather than of every graph it has ever been.
   */
  const updateLayout = useCallback(
    (id: string, pos: { x: number; y: number }) => {
      const layout: FormDoc["layout"] = {};
      for (const n of nodes) layout[n.id] = n.id === id ? pos : n.position;
      onChange({ ...doc, layout });
    },
    [doc, nodes, onChange],
  );

  // Clicking a wire already selected it and opened its editor, but the wire
  // itself looked exactly as it had a moment before — so there was no way to
  // tell which one the panel was talking about.
  const shownEdges = useMemo(
    () =>
      edges.map((e) =>
        e.id === selectedEdgeId
          ? {
              ...e,
              style: { ...e.style, stroke: "var(--primary)", strokeWidth: 2.5 },
              labelStyle: { ...e.labelStyle, fill: "var(--primary)" },
              markerEnd: { type: MarkerType.ArrowClosed, color: "var(--primary)" },
              zIndex: 10,
            }
          : e,
      ),
    [edges, selectedEdgeId],
  );

  // real-time drag/selection: apply RF changes to local state immediately
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((prev) => applyNodeChangesShallow(prev, changes));
  }, []);

  // ── mutations ──────────────────────────────────────────────────────────
  const addBlockAt = useCallback(
    (type: BlockType, position: { x: number; y: number }) => {
      const b = defaultBlock(type);
      onChange({ ...doc, blocks: [...doc.blocks, b], layout: { ...doc.layout, [b.ref]: position } });
      setSelectedNodeId(b.ref);
      setSelectedEdgeId(null);
    },
    [doc, onChange, setSelectedNodeId],
  );

  const addConditionAt = useCallback(
    (position: { x: number; y: number }) => {
      const firstQ = answerableBlocks[0];
      if (!firstQ) return;
      const rule: GotoRule = {
        id: uid("rl"),
        action_kind: "goto",
        from: firstQ.ref,
        when: { op: "and", conditions: [{ left: { kind: "ref", ref: firstQ.ref }, op: "is_not_empty" }], groups: [] },
        target: doc.endings[0]?.ref ?? doc.blocks[doc.blocks.length - 1]?.ref ?? firstQ.ref,
        targetKind: "ending",
        branch: "true",
      };
      // Cases live on the question they branch from, so the node id follows
      // the question rather than the rule — dropping a second case onto the
      // same question grows that node instead of adding another one.
      onChange({ ...doc, logic: [...doc.logic, rule], layout: { ...doc.layout, [`branch_${firstQ.ref}`]: position } });
      setSelectedNodeId(`branch_${firstQ.ref}`);
      setSelectedEdgeId(null);
    },
    [doc, onChange, answerableBlocks, setSelectedNodeId],
  );

  /** Add another route out of a question that already branches. */
  const addCase = useCallback(
    (fromRef: string) => {
      const block = doc.blocks.find((b) => b.ref === fromRef);
      if (!block) return;
      const options = "options" in block ? block.options : undefined;
      // Default to an option the question actually has, so a new case is
      // meaningful before it is touched.
      const taken = new Set(
        gotoRules.filter((r) => r.from === fromRef).map((r) => String(condOf(r)?.value ?? "")),
      );
      const free = options?.find((o) => !taken.has(o.id));
      const rule: GotoRule = {
        id: uid("rl"),
        action_kind: "goto",
        from: fromRef,
        when: {
          op: "and",
          conditions: [
            free
              ? { left: { kind: "ref", ref: fromRef }, op: "eq", value: free.id }
              : { left: { kind: "ref", ref: fromRef }, op: "is_not_empty" },
          ],
          groups: [],
        },
        target: doc.endings[0]?.ref ?? fromRef,
        targetKind: doc.endings[0] ? "ending" : "block",
        branch: "true",
      };
      setRules([...doc.logic, rule]);
    },
    [doc, gotoRules, setRules],
  );

  /**
   * Frame the flow: start at the start.
   *
   * `fitView` centres what it fits, which for a form longer than the viewport
   * puts the welcome block off the left edge — you arrive in the middle of a
   * conversation. This anchors the left edge instead and only centres
   * vertically, so opening the canvas shows the first question.
   */
  const frame = useCallback(
    (duration = 0) => {
      const box = wrapper.current?.getBoundingClientRect();
      if (!box || nodes.length === 0) return;
      const bounds = getNodesBounds(nodes);
      const fit = Math.min(box.width / (bounds.width + 80), box.height / (bounds.height + 80));
      const zoom = Math.min(FIT_VIEW.maxZoom, Math.max(FIT_VIEW.minZoom, fit));
      void setViewport(
        {
          x: 48 - bounds.x * zoom,
          y: Math.max(24, (box.height - bounds.height * zoom) / 2) - bounds.y * zoom,
          zoom,
        },
        { duration },
      );
    },
    [nodes, setViewport],
  );

  // Frame once, when the graph first has something in it.
  const framed = useRef(false);
  useEffect(() => {
    if (framed.current || nodes.length === 0) return;
    framed.current = true;
    frame();
  }, [nodes, frame]);

  /**
   * Re-run the layout over the current graph and keep the result.
   *
   * Dragged positions are what make the canvas drift out of shape — one moved
   * node and the wires no longer read. This throws every saved position away
   * and lets dagre place the whole graph again, which is the point: it is a
   * reset, not a nudge.
   */
  const autoArrange = useCallback(() => {
    const placed = layoutGraph(nodes, edges);
    const layout: FormDoc["layout"] = {};
    for (const [id, pos] of placed) layout[id] = pos;
    onChange({ ...doc, layout });
    // Let the new positions land before framing them.
    setTimeout(() => frame(300), 60);
  }, [nodes, edges, doc, onChange, frame]);

  const addEndingAt = useCallback(
    (position: { x: number; y: number }) => {
      const e: FormDoc["endings"][number] = {
        id: uid("end"),
        ref: uid("end"),
        title: "Thank you!",
        bodyMd: "",
        imageUrl: null,
        redirectDelaySec: 5,
        showSummary: false,
      };
      onChange({ ...doc, endings: [...doc.endings, e], layout: { ...doc.layout, [e.ref]: position } });
      setSelectedNodeId(e.ref);
      setSelectedEdgeId(null);
    },
    [doc, onChange, setSelectedNodeId],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const targetKind = doc.endings.some((e) => e.ref === conn.target) ? "ending" : "block";

      /**
       * A wire that runs back up the list is refused here, out loud.
       *
       * `buildFlowRules` drops backwards branches because they loop — a
       * respondent sent to an earlier question answers their way down to it
       * again, forever. That was the right call and completely silent: you
       * dragged a connection, it appeared to take, and then it was gone with
       * nothing said. Saying so at the moment of the drag is the whole
       * difference between a rule and a disappearance.
       */
      const sourceRef = conn.source.startsWith("branch_")
        ? conn.source.slice("branch_".length)
        : conn.source;
      if (targetKind === "block") {
        const from = doc.blocks.findIndex((b) => b.ref === sourceRef);
        const to = doc.blocks.findIndex((b) => b.ref === conn.target);
        if (from !== -1 && to !== -1 && to <= from) {
          toast.error("That would loop", {
            description:
              "A route can only go forward. Move the question below this one, or point this at an ending.",
          });
          return;
        }
      }

      // Dragging from a branch row re-points that case.
      if (conn.source.startsWith("branch_")) {
        const handle = conn.sourceHandle;
        if (!handle) return;
        if (handle === OTHERWISE) {
          // "Otherwise" is fall-through, which has no rule of its own until
          // you aim it somewhere; then it becomes an unconditional jump.
          const from = conn.source.slice("branch_".length);
          const existing = gotoRules.find((r) => !condOf(r) && r.from === from);
          const rule: GotoRule = {
            id: existing?.id ?? uid("rl"),
            action_kind: "goto",
            from,
            when: null,
            target: conn.target,
            targetKind,
          };
          setRules([...doc.logic.filter((r) => r.id !== rule.id), rule]);
          return;
        }
        setRules(doc.logic.map((r) => (isGoto(r) && r.id === handle ? { ...r, target: conn.target!, targetKind } : r)));
        return;
      }

      if (conn.target?.startsWith("branch_")) return; // a branch is fed by its own question

      if (!doc.blocks.some((b) => b.ref === conn.source)) return;
      const duplicate = gotoRules.some((r) => !condOf(r) && r.from === conn.source && r.target === conn.target);
      if (duplicate) return;
      const rule: GotoRule = { id: uid("rl"), action_kind: "goto", from: conn.source, when: null, target: conn.target!, targetKind };
      setRules([...doc.logic, rule]);
    },
    [doc, gotoRules, setRules],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      let logic = [...doc.logic];
      let blocks = [...doc.blocks];
      let endings = [...doc.endings];
      const layout = { ...doc.layout };

      for (const n of deleted) {
        if (n.id.startsWith("branch_")) {
          // Deleting the node deletes the decision — every case on it.
          const from = n.id.slice("branch_".length);
          logic = logic.filter((r) => !(isGoto(r) && r.from === from && condOf(r)));
          delete layout[n.id];
          continue;
        }
        if (doc.endings.some((e) => e.ref === n.id)) {
          endings = endings.filter((e) => e.ref !== n.id);
          logic = logic.filter((r) => !(isGoto(r) && r.target === n.id));
          delete layout[n.id];
          continue;
        }
        blocks = blocks.filter((b) => b.ref !== n.id);
        const removed = logic.filter((r) => isGoto(r) && (r.from === n.id || r.target === n.id));
        const removedIds = new Set(removed.flatMap((r) => [r.id, isGoto(r) ? (r.pair ?? "") : ""]).filter(Boolean));
        logic = logic.filter((r) => !removedIds.has(r.id));
        delete layout[n.id];
      }
      onChange({ ...doc, blocks, endings, logic, layout });
      setSelectedNodeId(null);

      // Deleting a question takes its wording, its options, and every rule
      // pointing at it. That should never happen without a word.
      const questions = deleted.filter((n) => doc.blocks.some((b) => b.ref === n.id));
      if (questions.length > 0) {
        toast(`Deleted ${questions.length} question${questions.length > 1 ? "s" : ""}`, {
          description: "⌘Z to undo.",
        });
      }
    },
    [doc, onChange, setSelectedNodeId],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      let logic = [...doc.logic];
      for (const e of deleted) {
        if (e.id.startsWith("case_")) {
          logic = logic.filter((r) => r.id !== e.id.slice("case_".length));
          continue;
        }
        if (e.id.startsWith("else_")) {
          const from = e.id.slice("else_".length);
          logic = logic.filter((r) => !(isGoto(r) && r.from === from && !condOf(r)));
          continue;
        }
        if (e.id.startsWith("seq-") || e.id.startsWith("into_")) {
          // A wire drawn from the block order had no rule behind it, so
          // deleting it did nothing and it came straight back — the canvas
          // said "you can't delete this" about a line that looked like every
          // other line. Cutting it means the question stops leading to the
          // one below it, which is a jump past it.
          const from = e.id.startsWith("seq-") ? e.id.slice(4) : e.id.slice("into_".length);
          const i = doc.blocks.findIndex((b) => b.ref === from);
          const skipped = doc.blocks[i + 1];
          const after = doc.blocks[i + 2]?.ref ?? doc.endings[0]?.ref;
          if (i < 0 || !skipped || !after) continue;
          logic = logic.filter((r) => !(isGoto(r) && r.from === from && !condOf(r)));
          logic.push({
            id: uid("rl"),
            action_kind: "goto",
            from,
            when: null,
            target: after,
            targetKind: doc.endings.some((x) => x.ref === after) ? "ending" : "block",
          } as LogicRule);
          continue;
        }
        logic = logic.filter((r) => r.id !== e.id);
      }
      setRules(logic);
      setSelectedEdgeId(null);
    },
    [doc, setRules],
  );

  // ── inspector targets ──────────────────────────────────────────────────
  const selBlock = selectedNodeId && !selectedNodeId.startsWith("branch_") ? doc.blocks.find((b) => b.ref === selectedNodeId) : undefined;


  const selEnding = selectedNodeId && !selectedNodeId.startsWith("branch_") ? doc.endings.find((e) => e.ref === selectedNodeId) : undefined;
  const selBranchRef = selectedNodeId?.startsWith("branch_") ? selectedNodeId.slice("branch_".length) : null;
  const selBranchRules = useMemo(
    () => (selBranchRef ? gotoRules.filter((r) => r.from === selBranchRef && condOf(r)) : []),
    [selBranchRef, gotoRules],
  );
  const selEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : undefined;
  const selEdgeRule = useMemo(() => {
    if (!selEdge) return undefined;
    const id = selEdge.id.startsWith("case_") ? selEdge.id.slice("case_".length) : selEdge.id;
    return gotoRules.find((r) => r.id === id);
  }, [selEdge, gotoRules]);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setSelectedNodeId]);

  // ── edge rule editing (click a wire to edit it) ───────────────────────
  const patchRule = useCallback(
    (ruleId: string, patch: RulePatch) => {
      let logic = [...doc.logic];
      const rule = logic.find((r): r is GotoRule => isGoto(r) && r.id === ruleId);
      if (!rule) return;

      const cond = condOf(rule);
      const op = (patch.op ?? cond?.op ?? "is_not_empty") as Op;
      const from = patch.from ?? rule.from ?? "";
      const left = { kind: "ref" as const, ref: from };
      const value = patch.value !== undefined ? patch.value : (cond?.value ?? "");
      const nextWhen =
        patch.makeConditional || cond
          ? ({ op: "and" as const, conditions: [{ left, op, ...(opsValueNeeded(op) ? { value } : {}) }], groups: [] } as GotoRule["when"])
          : null;

      logic = logic.map((r) => {
        if (!isGoto(r) || r.id !== ruleId) return r;
        return { ...r, from, ...(patch.target ? { target: patch.target, targetKind: patch.targetKind ?? r.targetKind } : {}), when: nextWhen } as LogicRule;
      });

      // keep the else sibling's condition inverted
      if (rule.pair) {
        const inv = opInverse(op);
        logic = logic.map((r) =>
          isGoto(r) && r.id === rule.pair && inv
            ? ({ ...r, from, when: { op: "and" as const, conditions: [{ left, op: inv, ...(opsValueNeeded(inv) ? { value } : {}) }], groups: [] } } as LogicRule)
            : r,
        );
      }
      setRules(logic);
    },
    [doc, setRules],
  );

  return (
    <div className="relative flex h-full min-h-0">
      {/* left: node library (collapsible) */}
      <aside
        data-tour="wf-palette"
        className={`bg-sidebar relative flex shrink-0 flex-col overflow-y-auto transition-all duration-200 ${leftOpen ? "w-60" : "w-12"}`}
      >
        {leftOpen ? (
          <>
            <div className="flex items-center justify-between px-3 py-3">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium uppercase">
                <Sparkles className="text-primary size-3.5" /> Node library
              </p>
              <button onClick={() => setLeftOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Collapse library">
                <ChevronLeft className="size-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 px-3 pb-4">
              <div
                draggable
                onDragStart={() => (dragType.current = { kind: "condition" })}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-2.5 py-2 text-sm active:cursor-grabbing"
              >
                <GitBranch className="text-primary size-4" />
                <span className="font-medium">Branch</span>
              </div>
              <div
                draggable
                onDragStart={() => (dragType.current = { kind: "ending" })}
                className="flex cursor-grab items-center gap-2 rounded-lg border border-dashed px-2.5 py-2 text-sm active:cursor-grabbing"
              >
                <Flag className="text-muted-foreground size-4" />
                <span className="font-medium">Ending</span>
              </div>
              {/* The shared BLOCK_LIBRARY, tinted by family — the same colours
                  the Questions list uses, so a block looks like itself wherever
                  you meet it. This panel used to carry its own third copy of
                  the block list, which had already drifted from the other two. */}
              {BLOCK_GROUPS.map((group) => {
                const items = BLOCK_LIBRARY.filter((b) => b.group === group);
                if (!items.length) return null;
                return (
                  <div key={group}>
                    <p className="text-muted-foreground mb-1.5 text-[10px] font-semibold tracking-wide uppercase">
                      {group}
                    </p>
                    <div className="space-y-1">
                      {items.map((item) => (
                        <div
                          key={item.type}
                          draggable
                          onDragStart={() => (dragType.current = { kind: "block", blockType: item.type })}
                          title={item.description}
                          className={cn(
                            "flex cursor-grab items-center gap-2 rounded-lg px-2.5 py-2 text-xs",
                            "transition-opacity duration-[var(--duration-micro)] active:cursor-grabbing",
                            "opacity-[0.82] hover:opacity-100",
                            TONE_CLASSES[item.tone],
                          )}
                        >
                          <item.icon className="size-3.5 shrink-0" strokeWidth={2} />
                          {item.label}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-muted-foreground px-3 py-2 text-[10px] leading-relaxed">
              Drag nodes onto the canvas. Drag from a node&apos;s edge dot to another node to control the flow.
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-3">
            <button onClick={() => setLeftOpen(true)} className="text-muted-foreground hover:text-foreground" aria-label="Expand library">
              <ChevronRight className="size-4" />
            </button>
            <div className="text-muted-foreground rotate-90 text-[10px] font-semibold uppercase tracking-widest">Library</div>
          </div>
        )}
      </aside>

      {/* center: toolbar + canvas.
          The toolbar sits inside this column, between the two panels, exactly
          as it does on the Questions view. Spanning it across the full width
          pushed both panels down and left dead space above them. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {toolbar}
        {/*
          A red node nobody scrolls to is a red node nobody sees. The canvas is
          bigger than the viewport as soon as a form has a branch or two, so the
          count lives here and clicking it moves the selection to the first
          broken node — which is also what pans the canvas to it.
        */}
        {flowProblems.size > 0 && (
          <div className="px-4 pt-2">
            <button
              type="button"
              onClick={() => {
                const first = [...flowProblems.keys()][0];
                if (first) setSelectedNodeId(first);
              }}
              className="text-destructive flex w-full items-center gap-2 rounded-lg bg-[color-mix(in_oklch,var(--destructive)_12%,transparent)] px-3 py-2 text-left text-xs"
            >
              <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2.5} />
              <span className="min-w-0 flex-1">
                {flowProblems.size === 1
                  ? "1 step in this flow cannot be completed"
                  : `${flowProblems.size} steps in this flow cannot be completed`}
                . Publishing is blocked until it is fixed.
              </span>
              <span className="shrink-0 underline">Show me</span>
            </button>
          </div>
        )}
        <div
          ref={wrapper}
          data-tour="wf-canvas"
          className="relative min-h-0 flex-1"
          onPointerDown={showMap}
          onWheel={showMap}
        >
        <ReactFlow
          nodes={nodes}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, n) => {
            setSelectedNodeId(n.id);
            setSelectedEdgeId(null);
          }}
          onPaneClick={clearSelection}
          onEdgeClick={(_, e) => {
            setSelectedEdgeId(e.id);
            setSelectedNodeId(null);
          }}
          onConnect={onConnect}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          onNodeDragStop={(_, node) => updateLayout(node.id, node.position)}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const kind = dragType.current;
            if (!kind || !wrapper.current) return;
            const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            if (kind.kind === "block" && kind.blockType) addBlockAt(kind.blockType, pos);
            else if (kind.kind === "condition") addConditionAt(pos);
            else if (kind.kind === "ending") addEndingAt(pos);
            dragType.current = null;
          }}
          // Delete only. Backspace over a canvas whose nodes are the form's
          // actual questions means one stray keystroke — after typing in a
          // field and clicking away, say — silently destroys a question and
          // everything wired to it.
          deleteKeyCode={["Delete"]}
          minZoom={0.25}
          // Framing is done by `frame()`, which anchors the left edge instead
          // of centring — see the comment there.
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
          <Panel position="top-right">
            <Button variant="outline" size="sm" shape="pill" onClick={autoArrange} className="shadow-sm">
              <LayoutGrid className="size-3.5" />
              Auto arrange
            </Button>
          </Panel>
          <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              className={cn(
                "hidden transition-opacity duration-[var(--duration-standard)] md:block",
                navigating ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
          </ReactFlow>
        </div>
      </div>

      {/* right: inspector (collapsible) */}
      <aside
        data-tour="wf-inspector"
        className={`bg-panel relative flex shrink-0 flex-col overflow-y-auto transition-all duration-200 ${rightOpen ? "w-80" : "w-12"}`}
      >
        {rightOpen ? (
          <>
            {/* The block inspector carries its own header (type, ref, delete),
                so a second "DETAILS" bar above it was duplicate chrome and a
                stack of dead space. Only the collapse control stays, floated. */}
            <button
              onClick={() => setRightOpen(false)}
              className="text-muted-foreground hover:text-foreground absolute top-3 right-3 z-10"
              aria-label="Collapse details"
            >
              <ChevronRight className="size-4" />
            </button>
            <div className="flex-1">
              {selEdge && !selEdgeRule ? (
                <div className="px-4 py-4">
                  <EdgeInfo edgeId={selEdge.id} doc={doc} onDelete={() => onEdgesDelete([selEdge])} />
                </div>
              ) : selEdgeRule ? (
                <div className="px-4 py-4">
                  <EdgeRuleEditor
                    rule={selEdgeRule}
                    doc={doc}
                    onPatch={patchRule}
                    onDelete={() => onEdgesDelete([{ id: selEdge!.id } as Edge])}
                  />
                </div>
              ) : selBlock ? (
                // The shared inspector — same component, same fields, whether
                // you got here from Questions or from Flow.
                <SharedBlockInspector />
              ) : selBranchRef ? (
                <div className="px-4 py-4">
                  <BranchInspector
                    sourceRef={selBranchRef}
                    rules={selBranchRules}
                    doc={doc}
                    answerableBlocks={answerableBlocks}
                    onPatch={patchRule}
                    onAddCase={() => addCase(selBranchRef)}
                    onDeleteCase={(id) => onEdgesDelete([{ id: `case_${id}` } as Edge])}
                    onDelete={() => onNodesDelete([{ id: `branch_${selBranchRef}` } as Node])}
                  />
                </div>
              ) : selEnding ? (
                <div className="px-4 py-4"><EndingInspector ending={selEnding} doc={doc} onChange={onChange} /></div>
              ) : (
                <div className="space-y-3 px-4 py-4">
                  <p className="text-muted-foreground text-sm">Select a node or a wire to edit it.</p>
                  <div className="text-muted-foreground space-y-2 rounded-xl border border-dashed p-3 text-xs leading-relaxed">
                    <p className="flex items-center gap-1.5 font-medium">
                      <GripVertical className="size-3" /> Quick start
                    </p>
                    <p>1. Drag questions from the library onto the canvas.</p>
                    <p>2. Drag from a node&apos;s edge dot to another node to wire the flow.</p>
                    <p>3. Drop a Branch onto a question to send answers different ways.</p>
                    <p>4. Click any wire to edit its condition.</p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 pt-3">
            <button onClick={() => setRightOpen(true)} className="text-muted-foreground hover:text-foreground" aria-label="Expand details">
              <ChevronLeft className="size-4" />
            </button>
            <div className="text-muted-foreground rotate-90 text-[10px] font-semibold uppercase tracking-widest">Details</div>
          </div>
        )}
      </aside>
    </div>
  );
}

// ────────────────────────── graph derivation ──────────────────────────

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
    markerEnd: { type: MarkerType.ArrowClosed },
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

export const OTHERWISE = "__otherwise";

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
function deriveGraph(
  doc: FormDoc,
  gotoRules: GotoRule[],
  problems: Map<string, { level: "error" | "warning"; messages: string[] }> = new Map(),
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const endingRefs = new Set(doc.endings.map((e) => e.ref));

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
    if (!cond || conditionIsAlwaysTrue(cond, fromBlock)) {
      alwaysBySource.set(from, rule);
      continue;
    }
    const list = casesBySource.get(from) ?? [];
    const exists = endingRefs.has(rule.target) || doc.blocks.some((b) => b.ref === rule.target);
    list.push({
      ruleId: rule.id,
      label: edgeLabel(fromBlock, cond),
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

    if (cases?.length) {
      const branchId = `branch_${b.ref}`;
      // Every option accounted for means no answer can fall past the cases.
      const exhaustive = rulesAreExhaustive(
        b,
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
      const fallback = fallbackRef
        ? {
            ref: fallbackRef,
            title:
              doc.blocks.find((x) => x.ref === fallbackRef)?.title ??
              doc.endings.find((x) => x.ref === fallbackRef)?.title ??
              fallbackRef,
            /** Aimed by hand, so it is a decision rather than a consequence. */
            explicit: Boolean(always?.target),
          }
        : null;

      nodes.push({
        id: branchId,
        type: "branch",
        position: doc.layout[branchId] ?? { x: 0, y: 0 },
        // A branch is drawn beside the question it hangs off, so it carries
        // that question's number rather than one of its own.
        data: { sourceRef: b.ref, sourceTitle: b.title, index: i + 1, cases, exhaustive, fallback },
        deletable: true,
      });
      edges.push(wire(`into_${b.ref}`, b.ref, branchId));
      for (const c of cases) {
        // A case whose destination is gone gets no wire, which is what makes
        // the unconnected handle on the node the honest picture.
        if (c.missing) continue;
        edges.push(wire(`case_${c.ruleId}`, branchId, c.target, c.label, c.ruleId));
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
      data: { title: e.title, problem: problems.get(e.ref) },
      deletable: doc.endings.length > 1,
    });
  });

  // Saved positions while the layout still describes this graph, a fresh dagre
  // run the moment it does not — see `placeNodes`.
  const placed = placeNodes(nodes, edges, doc.layout);
  for (const node of nodes) {
    const at = placed.get(node.id);
    if (at) node.position = at;
  }

  return { nodes, edges };
}


// ────────────────────────── node components ──────────────────────────

const nodeTypes: NodeTypes = {
  start: StartNode,
  question: QuestionNode,
  ending: EndingNode,
  branch: BranchNode,
};

function StartNode({ data, selected }: NodeProps) {
  const { block, index } = data as { block: Block; index: number };
  return (
    <div
      className={`rounded-full border-2 px-4 py-2 shadow-sm ${selected ? "border-primary ring-2 ring-primary/30" : "border-green-600/50"}`}
      style={{ background: "var(--card)" }}
    >
      <div className="flex items-center gap-2">
        <Play className="size-3 fill-green-600 text-green-600" />
        <span className="tabular text-[0.625rem] opacity-60">{index}</span>
        <span className="max-w-44 truncate text-xs font-semibold">{block.title}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-green-600" />
    </div>
  );
}

/** A node the flow cannot serve: unreachable, or with no way to finish. */
type NodeProblem = { level: "error" | "warning"; messages: string[] };

function QuestionNode({ data, selected }: NodeProps) {
  const { block, index, problem } = data as { block: Block; index: number; problem?: NodeProblem };
  const meta = blockMeta(block.type);
  const accent = TONE_ACCENT[meta.tone];
  return (
    // Selection is a spine in the block's family colour, matching the Questions
    // list, rather than a generic orange ring.
    <div
      className={cn(
        "w-56 rounded-xl bg-[var(--card)] px-3 py-2.5 transition-shadow",
        selected ? "shadow-md" : "shadow-xs",
        // A broken node is outlined, not tinted: the fill is the block's family
        // colour and carries meaning of its own.
        problem && "ring-2 ring-[var(--destructive)]",
      )}
      style={{ boxShadow: selected ? `inset 3px 0 0 0 ${accent}, var(--shadow-md)` : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", TONE_CLASSES[meta.tone])}>
          <meta.icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="tabular text-[0.625rem] opacity-60">{index}</span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{block.title}</span>
        {block.required && <span className="text-destructive text-xs">*</span>}
      </div>
      {problem ? (
        <ProblemNote problem={problem} />
      ) : (
        <p className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">{meta.label}</p>
      )}
      <Handle type="source" position={Position.Right} style={{ background: accent }} />
    </div>
  );
}

/**
 * What is wrong, on the node it is wrong about.
 *
 * Replaces the block-type caption rather than sitting beside it. The type is
 * legible from the icon and the colour, and a node this size cannot carry both
 * without the warning becoming the smaller of the two — which is the wrong way
 * round for the one thing that stops the form working.
 */
function ProblemNote({ problem }: { problem: NodeProblem }) {
  return (
    <p
      className="text-destructive mt-1 flex items-start gap-1 text-[10px] leading-tight"
      title={problem.messages.join("\n\n")}
    >
      <AlertTriangle className="mt-px size-3 shrink-0" strokeWidth={2.5} />
      <span className="min-w-0">
        {problem.messages.length > 1 ? `${problem.messages.length} flow problems` : shortProblem(problem.messages[0]!)}
      </span>
    </p>
  );
}

/** The headline of a lint message; the full text is in the tooltip. */
function shortProblem(message: string): string {
  if (message.startsWith("No path reaches")) return "Nothing reaches this";
  if (message.startsWith("From these questions")) return "No way to finish from here";
  return "Broken connection";
}

function EndingNode({ data, selected }: NodeProps) {
  const { title, problem } = data as { title: string; problem?: NodeProblem };
  return (
    <div
      className={cn(
        "w-44 rounded-xl border-2 border-dashed px-3 py-2.5 shadow-sm",
        selected ? "border-primary ring-2 ring-primary/30" : "border-primary/60",
        problem && "!border-[var(--destructive)] ring-2 ring-[var(--destructive)]",
      )}
      style={{ background: "var(--accent)" }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="flex items-center gap-2">
        <Flag className={cn("size-3.5 shrink-0", problem ? "text-destructive" : "text-primary")} />
        <span className="truncate text-xs font-semibold">{title}</span>
      </div>
      {problem && <ProblemNote problem={problem} />}
    </div>
  );
}

/**
 * One question, every route out of it.
 *
 * Each case gets its own row and its own handle on the right, so the wire
 * leaving the node starts level with the answer that takes it. The last row is
 * always "otherwise" — the path taken when no case matches, which is real and
 * used to be invisible.
 */
function BranchNode({ data, selected }: NodeProps) {
  const { sourceTitle, index, cases, fallback } = data as {
    sourceTitle: string;
    index: number;
    cases: BranchCase[];
    exhaustive: boolean;
    fallback: { ref: string; title: string; explicit: boolean } | null;
  };
  const broken = cases.some((c) => c.missing);

  return (
    <div
      className={cn(
        "w-56 rounded-xl border-2 bg-[var(--card)] pb-1 shadow-sm",
        selected ? "border-primary ring-primary/30 shadow-md ring-2" : "border-amber-500/60",
        broken && "!border-[var(--destructive)] ring-2 ring-[var(--destructive)]",
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />

      <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-md",
            broken ? "bg-[color-mix(in_oklch,var(--destructive)_18%,transparent)]" : "bg-amber-500/15",
          )}
        >
          {broken ? (
            <AlertTriangle className="text-destructive size-3" strokeWidth={2.5} />
          ) : (
            <GitBranch className="size-3 text-amber-600" />
          )}
        </span>
        <span className="tabular text-[0.625rem] opacity-60">{index}</span>
        <span className="truncate text-[11px] font-semibold">{sourceTitle || "Branch"}</span>
      </div>

      <div className="border-t border-dashed pt-0.5">
        {cases.map((c) => (
          <BranchRow
            key={c.ruleId}
            label={c.label}
            handleId={c.ruleId}
            missing={c.missing}
            title={
              c.missing
                ? `This answer points at "${c.target}", which no longer exists. Drag from the dot to give it a destination.`
                : undefined
            }
          />
        ))}
        {/*
          When every answer is already spoken for there is no path left for
          "otherwise" to take, so offering one is a wire to nowhere.

          Otherwise it is drawn, but never as a peer of the cases above it.
          Nobody authored this row — it is derived, and it read as a branch
          someone had written and then abandoned, which is why it kept getting
          reported as a mistake. So: its own rule above it, marked `auto`, and
          worded as a consequence rather than as an option label. It cannot be
          removed, because it is the half of a conditional question that does
          the skipping: delete it and every "only ask this sometimes" question
          is asked of everyone.
        */}
        {fallback && (
          <BranchRow
            label="otherwise"
            destination={fallback.title}
            handleId={OTHERWISE}
            derived={!fallback.explicit}
            title={
              fallback.explicit
                ? `Every other answer goes to "${fallback.title}", because you aimed it there.`
                : `Every other answer carries on to "${fallback.title}", which is simply what comes next. Drag from the dot to send it somewhere else instead.`
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * One route out, with its dot beside it.
 *
 * The dot used to be positioned with a `top` measured from the top of the
 * card, while sitting inside a row that is itself positioned — so the offset
 * was applied twice and the handles ended up bunched below the node, nowhere
 * near the answers they belong to. React Flow already centres a handle in its
 * positioned parent; the row is that parent, so the fix is to stop fighting it.
 */
function BranchRow({
  label,
  handleId,
  destination,
  derived,
  missing,
  title,
}: {
  label: string;
  handleId: string;
  /** Where this route lands, named on the row when it is worth naming. */
  destination?: string;
  /** Not authored — the fall-through this branch implies. Drawn as such. */
  derived?: boolean;
  /** Its destination is gone: this really is an unconnected output. */
  missing?: boolean;
  title?: string;
}) {
  return (
    <div
      className={cn("relative flex h-[22px] items-center gap-1.5 px-3", derived && "border-t border-dashed")}
      title={title}
    >
      <span
        className={cn(
          "shrink-0 truncate text-[10px]",
          missing && "text-destructive font-medium",
          derived && "text-muted-foreground italic",
          !missing && !derived && "font-medium",
        )}
      >
        {label}
      </span>
      {/* The destination, so a finished route reads as finished. */}
      {destination && !missing && (
        <span className="text-muted-foreground/80 min-w-0 flex-1 truncate text-[9px]">→ {destination}</span>
      )}
      {derived && !missing && (
        <span className="text-muted-foreground/70 shrink-0 rounded bg-[color-mix(in_oklch,currentColor_12%,transparent)] px-1 font-mono text-[8px] leading-[1.4] tracking-wide uppercase">
          auto
        </span>
      )}
      {/* The one state n8n would call an unconnected output — and here, unlike
          n8n, the respondent cannot just be dropped, so it is an error. */}
      {missing && (
        <span className="text-destructive ml-auto shrink-0 text-[9px] font-medium">no connection</span>
      )}
      <Handle
        type="source"
        id={handleId}
        position={Position.Right}
        className={cn(missing && "!border-2 !border-[var(--destructive)] !bg-[var(--card)]")}
        style={missing ? undefined : { background: derived ? "var(--muted-foreground)" : "var(--primary)" }}
      />
    </div>
  );
}

// ────────────────────────── inspectors ──────────────────────────


/**
 * Everything that leaves one question.
 *
 * There used to be one panel per If/Else node, each editing a single yes/no
 * test — so a four-option question meant four panels to keep consistent by
 * hand. A decision is one thing; this edits all of its cases together, and
 * says out loud where an unmatched answer goes.
 */
function BranchInspector({
  sourceRef,
  rules,
  doc,
  answerableBlocks,
  onPatch,
  onAddCase,
  onDeleteCase,
  onDelete,
}: {
  sourceRef: string;
  rules: GotoRule[];
  doc: FormDoc;
  answerableBlocks: Block[];
  onPatch: (ruleId: string, patch: RulePatch) => void;
  onAddCase: () => void;
  onDeleteCase: (ruleId: string) => void;
  onDelete: () => void;
}) {
  const sourceBlock = doc.blocks.find((b) => b.ref === sourceRef) ?? null;
  const sourceIndex = doc.blocks.findIndex((b) => b.ref === sourceRef);
  const fallthrough = doc.blocks[sourceIndex + 1];
  const explicitElse = doc.logic.find((r): r is GotoRule => isGoto(r) && r.from === sourceRef && !condOf(r));
  const elseTarget = explicitElse
    ? (doc.blocks.find((b) => b.ref === explicitElse.target)?.title ?? doc.endings.find((e) => e.ref === explicitElse.target)?.title ?? explicitElse.target)
    : (fallthrough?.title ?? "the ending");

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <GitBranch className="text-primary size-4 shrink-0" />
          Branch
        </p>
        <p className="text-muted-foreground mt-0.5 truncate text-xs">{sourceBlock?.title ?? sourceRef}</p>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <BranchCaseRow
            key={rule.id}
            rule={rule}
            sourceBlock={sourceBlock}
            doc={doc}
            onPatch={onPatch}
            onDelete={() => onDeleteCase(rule.id)}
          />
        ))}
      </div>

      <Button variant="outline" size="sm" shape="pill" className="w-full" onClick={onAddCase}>
        <Plus className="size-3.5" />
        Add a route
      </Button>

      <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed">
        {rulesAreExhaustive(sourceBlock as Block, rules) ? (
          <>Every answer is covered by a route above, so nothing falls through.</>
        ) : (
          <>
            Anything the routes above do not match goes to <span className="font-medium">{elseTarget}</span>. You do
            not have to set this up — it is what happens anyway.
          </>
        )}
      </p>

      {answerableBlocks.length === 0 && (
        <p className="text-muted-foreground text-xs">Add a question before wiring conditions.</p>
      )}

      {/* The same button, in the same place, as every other panel. This was a
          bare trash icon in the header while the panels beside it used a
          labelled button at the bottom. */}
      <Button variant="outline" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="size-3.5" />
        Delete branch
      </Button>
    </div>
  );
}

/** One case: a test on the branch's question, and where a match goes. */
function BranchCaseRow({
  rule,
  sourceBlock,
  doc,
  onPatch,
  onDelete,
}: {
  rule: GotoRule;
  sourceBlock: Block | null;
  doc: FormDoc;
  onPatch: (ruleId: string, patch: RulePatch) => void;
  onDelete: () => void;
}) {
  const cond = condOf(rule);
  const op = (cond?.op ?? "is_not_empty") as Op;
  const options = sourceBlock && "options" in sourceBlock ? sourceBlock.options : undefined;

  return (
    <div className="bg-muted/40 space-y-2 rounded-xl p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">If</span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Remove this route"
          className="text-muted-foreground hover:text-destructive shrink-0"
        >
          <X className="size-3" />
        </button>
      </div>

      <div className="flex gap-1.5">
        <Picker
          value={op}
          onValueChange={(v) => onPatch(rule.id, { op: v as Op, makeConditional: true })}
          className="min-w-0 flex-1"
        >
          {OPS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </Picker>
        {opsValueNeeded(op) &&
          (options?.length ? (
            <Picker
              value={String(cond?.value ?? "")}
              onValueChange={(v) => onPatch(rule.id, { value: v, makeConditional: true })}
              placeholder="Choose…"
              className="min-w-0 flex-1"
            >
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </Picker>
          ) : (
            <Input
              className="h-7 min-w-0 flex-1 text-xs"
              value={String(cond?.value ?? "")}
              onChange={(e) => onPatch(rule.id, { value: e.target.value, makeConditional: true })}
            />
          ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">Go to</span>
        <Picker
          value={rule.target}
          onValueChange={(v) =>
            onPatch(rule.id, {
              target: v,
              targetKind: doc.endings.some((x) => x.ref === v) ? "ending" : "block",
            })
          }
          className="min-w-0 flex-1"
        >
          <SelectGroup>
            <SelectLabel>Questions</SelectLabel>
            {doc.blocks.map((b) => (
              <SelectItem key={b.ref} value={b.ref}>
                {b.title.slice(0, 40)}
              </SelectItem>
            ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>Endings</SelectLabel>
            {doc.endings.map((e) => (
              <SelectItem key={e.ref} value={e.ref}>
                {e.title.slice(0, 40)}
              </SelectItem>
            ))}
          </SelectGroup>
        </Picker>
      </div>
    </div>
  );
}

/**
 * A connection that carries a condition.
 *
 * It used to call itself "YES branch", "NO branch" or "Custom flow" depending
 * on flags that no caller sets any more, tint its heading green or red to
 * match, and delete through a bare trash icon — while the plain-connection
 * panel beside it said "Connection" and deleted through a labelled button.
 * Same thing, same words, same button.
 */
function EdgeRuleEditor({
  rule,
  doc,
  onPatch,
  onDelete,
}: {
  rule: GotoRule;
  doc: FormDoc;
  onPatch: (ruleId: string, patch: RulePatch) => void;
  onDelete: () => void;
}) {
  const cond = condOf(rule);
  const sourceBlock = doc.blocks.find((b) => b.ref === rule.from) ?? null;
  const isYesNo = sourceBlock?.type === "yes_no";

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Connection</p>

      <div className="space-y-1.5">
        <Label>Source question</Label>
        <Picker value={rule.from ?? ""} onValueChange={(v) => onPatch(rule.id, { from: v })}>
          {doc.blocks
            .filter((b) => b.type !== "welcome")
            .map((b) => (
              <SelectItem key={b.ref} value={b.ref}>
                {b.title.slice(0, 40)}
              </SelectItem>
            ))}
        </Picker>
      </div>

      {isYesNo ? (
        <div className="space-y-1.5">
          <Label>Answer</Label>
          <div className="flex gap-2">
            <Button
              variant={cond?.value === true ? "default" : "outline"}
              size="sm"
              className="flex-1 rounded-full"
              onClick={() => onPatch(rule.id, { op: "eq", value: true })}
            >
              {sourceBlock?.yesLabel ?? "Yes"}
            </Button>
            <Button
              variant={cond?.value === false ? "default" : "outline"}
              size="sm"
              className="flex-1 rounded-full"
              onClick={() => onPatch(rule.id, { op: "eq", value: false })}
            >
              {sourceBlock?.noLabel ?? "No"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>Condition</Label>
          <Picker value={cond?.op ?? "is_not_empty"} onValueChange={(v) => onPatch(rule.id, { op: v as Op })}>
            {OPS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </Picker>
          {opsValueNeeded(cond?.op ?? "is_not_empty") && (
            <ConditionValueInput block={sourceBlock} value={cond?.value} onChange={(v) => onPatch(rule.id, { value: v })} />
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label>Jumps to</Label>
        <TargetSelect doc={doc} value={rule.target} onChange={(t, kind) => onPatch(rule.id, { target: t, targetKind: kind })} />
      </div>

      {!cond && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => onPatch(rule.id, { makeConditional: true })}>
          Add a condition
        </Button>
      )}

      <Button variant="outline" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="size-3.5" />
        Delete connection
      </Button>
    </div>
  );
}

/** A wire with no condition on it: what it connects, and a way to cut it. */
function EdgeInfo({ edgeId, doc, onDelete }: { edgeId: string; doc: FormDoc; onDelete: () => void }) {
  const fromRef = edgeId.startsWith("seq-")
    ? edgeId.slice(4)
    : edgeId.startsWith("into_")
      ? edgeId.slice("into_".length)
      : edgeId.startsWith("else_")
        ? edgeId.slice("else_".length)
        : "";
  const from = doc.blocks.find((b) => b.ref === fromRef);
  const i = doc.blocks.findIndex((b) => b.ref === fromRef);
  const to = doc.blocks[i + 1];

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold">Connection</p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {from ? <span className="text-foreground font-medium">{from.title}</span> : "This question"} leads to{" "}
        {to ? <span className="text-foreground font-medium">{to.title}</span> : "the ending"}.
      </p>
      <Button variant="outline" size="sm" className="w-full" onClick={onDelete}>
        <Trash2 className="size-3.5" />
        Delete connection
      </Button>
    </div>
  );
}

function EndingInspector({
  ending,
  doc,
  onChange,
}: {
  ending: FormDoc["endings"][number];
  doc: FormDoc;
  onChange: (d: FormDoc) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        <Flag className="text-primary size-4" />
        <p className="text-sm font-semibold">Ending</p>
      </div>
      <div className="space-y-1.5">
        <Label>Title</Label>
        <Input
          value={ending.title}
          onChange={(e) => onChange({ ...doc, endings: doc.endings.map((x) => (x.ref === ending.ref ? { ...x, title: e.target.value } : x)) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Message</Label>
        <Textarea
          rows={3}
          value={ending.bodyMd}
          onChange={(e) => onChange({ ...doc, endings: doc.endings.map((x) => (x.ref === ending.ref ? { ...x, bodyMd: e.target.value } : x)) })}
        />
      </div>
    </div>
  );
}

// ────────────────────────── shared bits ──────────────────────────

/**
 * The styled select, in the shape this file keeps needing.
 *
 * Native `<select>` elements were scattered through the flow inspectors while
 * the shadcn Select sat unused — so the panel rendered the operating system's
 * dropdown next to the app's own controls, in a different font at a different
 * height with a different focus ring.
 */
function Picker({
  value,
  onValueChange,
  placeholder,
  className,
  size = "sm",
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "default";
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger size={size} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

function TargetSelect({
  doc,
  value,
  onChange,
}: {
  doc: FormDoc;
  value: string;
  onChange: (ref: string, kind: "block" | "ending") => void;
}) {
  return (
    <Picker
      value={value}
      onValueChange={(t) => onChange(t, doc.endings.some((x) => x.ref === t) ? "ending" : "block")}
    >
      <SelectGroup>
        <SelectLabel>Questions</SelectLabel>
        {doc.blocks.map((b) => (
          <SelectItem key={b.ref} value={b.ref}>
            {b.title.slice(0, 36)}
          </SelectItem>
        ))}
      </SelectGroup>
      <SelectGroup>
        <SelectLabel>Endings</SelectLabel>
        {doc.endings.map((e) => (
          <SelectItem key={e.ref} value={e.ref}>
            {e.title.slice(0, 30)}
          </SelectItem>
        ))}
      </SelectGroup>
    </Picker>
  );
}

function ConditionValueInput({
  block,
  value,
  onChange,
}: {
  block: Block | null;
  value: unknown;
  onChange: (v: string | number | boolean) => void;
}) {
  if (!block) return null;
  if (block.type === "yes_no") {
    return (
      <Picker value={String(value ?? "")} onValueChange={(v) => onChange(v === "true")} placeholder="Pick…">
        <SelectItem value="true">{block.yesLabel ?? "Yes"}</SelectItem>
        <SelectItem value="false">{block.noLabel ?? "No"}</SelectItem>
      </Picker>
    );
  }
  if ("options" in block && block.options) {
    return (
      <Picker value={String(value ?? "")} onValueChange={onChange} placeholder="Pick an option…">
        {block.options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </Picker>
    );
  }
  if (["rating", "nps", "opinion_scale", "number"].includes(block.type)) {
    return <Input type="number" value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} placeholder="number" />;
  }
  return <Input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="value" />;
}

// ────────────────────────── helpers ──────────────────────────


function conditionText(cond: { op: string; value?: unknown }): string {
  return `${opLabel(cond.op)}${cond.value !== undefined && cond.value !== null ? ` ${String(cond.value).slice(0, 14)}` : ""}`;
}

function edgeLabel(block: Block | null, cond: { op: string; value?: unknown }): string {
  if (block?.type === "yes_no" && (cond.value === true || cond.value === false)) {
    return cond.value === true ? (block.yesLabel ?? "Yes") : (block.noLabel ?? "No");
  }
  if (block && "options" in block && block.options && typeof cond.value === "string") {
    const opt = block.options.find((o) => o.id === cond.value);
    if (opt) return opt.label;
  }
  return conditionText(cond);
}

function defaultBlock(type: BlockType): Block {
  const id = uid("blk");
  const ref = `q_${type.replace(/_/g, "")}${crypto.randomUUID().slice(0, 4)}`;
  const base = { id, ref, title: "New question", required: false };
  switch (type) {
    case "statement":
      return BlockSchema.parse({ ...base, type, title: "A quick note", buttonLabel: "Continue" });
    case "short_text":
      return BlockSchema.parse({ ...base, type, title: "Your answer?", minLength: 0, maxLength: 200 });
    case "long_text":
      return BlockSchema.parse({ ...base, type, title: "Tell us more", minLength: 0, maxLength: 1000 });
    case "email":
      return BlockSchema.parse({ ...base, type, title: "What's your email?" });
    case "phone":
      return BlockSchema.parse({ ...base, type, title: "Phone number" });
    case "url":
      return BlockSchema.parse({ ...base, type, title: "Your website" });
    case "number":
      return BlockSchema.parse({ ...base, type, title: "Pick a number" });
    case "date":
      return BlockSchema.parse({ ...base, type, title: "Pick a date" });
    case "yes_no":
      return BlockSchema.parse({ ...base, type, title: "Yes or no?" });
    case "single_select":
    case "multi_select":
      return BlockSchema.parse({
        ...base,
        type,
        title: type === "single_select" ? "Choose an option" : "Choose options",
        options: [
          { id: uid("opt"), label: "Option 1" },
          { id: uid("opt"), label: "Option 2" },
        ],
        ...(type === "single_select" ? { allowOther: false } : { minSelections: 1, maxSelections: 10, allowOther: false }),
      });
    case "rating":
      return BlockSchema.parse({ ...base, type, title: "How would you rate it?", scale: 5, shape: "star" });
    case "nps":
      return BlockSchema.parse({ ...base, type, title: "How likely are you to recommend us?" });
    case "opinion_scale":
      return BlockSchema.parse({ ...base, type, title: "Your opinion", steps: 10, startAt: 1 });
    case "file_upload":
      return BlockSchema.parse({ ...base, type, title: "Upload a file", accept: ["image/png", "image/jpeg", "application/pdf"], maxFiles: 1, maxSizeMB: 10 });
    case "payment":
      return BlockSchema.parse({ ...base, type, title: "Complete payment", method: "link", amountMode: "fixed", amount: 10, currency: "USD" });
    case "legal_consent":
      return BlockSchema.parse({ ...base, type, title: "One last thing", consentText: "I agree to the terms." });
    default:
      return BlockSchema.parse({ ...base, type: "short_text", title: "Your answer?" });
  }
}

/** Controlled nodes state: applies RF changes (drag/selection) locally in real time. */
function applyNodeChangesShallow(nodes: Node[], changes: NodeChange[]): Node[] {
  let next = nodes;
  for (const change of changes) {
    switch (change.type) {
      case "position": {
        next = next.map((n) =>
          n.id === change.id
            ? { ...n, position: change.position ?? n.position, dragging: change.dragging ?? n.dragging }
            : n,
        );
        break;
      }
      case "select": {
        next = next.map((n) => (change.id === n.id ? { ...n, selected: change.selected } : change.selected ? { ...n, selected: false } : n));
        break;
      }
      case "remove": {
        // React Flow sends `{ type: "remove", id }`, not a list of ids, so
        // this filtered against an always-empty array and removed nothing.
        next = next.filter((n) => n.id !== change.id);
        break;
      }
      case "dimensions": {
        next = next.map((n) => (n.id === change.id ? { ...n, measured: change.dimensions } : n));
        break;
      }
      default:
        break;
    }
  }
  return next;
}

interface RulePatch {
  from?: string;
  target?: string;
  targetKind?: "block" | "ending";
  op?: Op;
  value?: string | number | boolean | null;
  makeConditional?: boolean;
}
