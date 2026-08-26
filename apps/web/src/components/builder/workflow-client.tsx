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
import { layoutGraph, branchNodeHeight } from "./flow-layout";
import { toast } from "sonner";
import { useBuilderStore } from "@/stores/builder-store";
import type { Block, FormDoc, LogicRule } from "@repo/form-schema";
import { Block as BlockSchema, conditionIsAlwaysTrue, rulesAreExhaustive } from "@repo/form-schema";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  LayoutGrid,
  Plus,
  AlignLeft, Calendar, ChevronLeft, ChevronRight, CircleHelp, CreditCard, Flag,
  GitBranch, GripVertical, Hash, Heading, ListChecks, Mail, Phone, Play, Scale,
  Sigma, Sparkles, SquareCheck, Star, Trash2, Type, Upload, UserRound, Globe, X,
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

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(focusRef ?? null);
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
  const updateLayout = useCallback(
    (id: string, pos: { x: number; y: number }) => onChange({ ...doc, layout: { ...doc.layout, [id]: pos } }),
    [doc, onChange],
  );

  // ── derive graph from doc ──────────────────────────────────────────────
  const derived = useMemo(() => deriveGraph(doc, gotoRules), [doc, gotoRules]);

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

  // Clicking a wire already selected it and opened its editor, but the wire
  // itself looked exactly as it had a moment before — so there was no way to
  // tell which one the panel was talking about.
  const shownEdges = useMemo(
    () =>
      edges.map((e) =>
        e.id === selectedEdgeId
          ? {
              ...e,
              style: { ...e.style, stroke: "var(--destructive)", strokeWidth: 3 },
              labelStyle: { ...e.labelStyle, fill: "var(--destructive)" },
              markerEnd: { type: MarkerType.ArrowClosed, color: "var(--destructive)" },
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
    [doc, onChange],
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
    [doc, onChange, answerableBlocks],
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
    [doc, onChange],
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      if (!conn.source || !conn.target || conn.source === conn.target) return;
      const targetKind = doc.endings.some((e) => e.ref === conn.target) ? "ending" : "block";

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
    [doc, onChange],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      let logic = [...doc.logic];
      for (const e of deleted) {
        if (e.id.startsWith("case_")) {
          logic = logic.filter((r) => r.id !== e.id.slice("case_".length));
        } else if (e.id.startsWith("else_")) {
          // The fall-through wire only exists as a rule when it was aimed
          // somewhere; cutting it returns the question to plain fall-through.
          const from = e.id.slice("else_".length);
          logic = logic.filter((r) => !(isGoto(r) && r.from === from && !condOf(r)));
        } else {
          logic = logic.filter((r) => r.id !== e.id);
        }
      }
      setRules(logic);
      setSelectedEdgeId(null);
    },
    [doc, setRules],
  );

  // ── inspector targets ──────────────────────────────────────────────────
  const selBlock = selectedNodeId && !selectedNodeId.startsWith("branch_") ? doc.blocks.find((b) => b.ref === selectedNodeId) : undefined;

  // The shared inspector reads the selected block from the builder store, so
  // canvas selection has to land there too. This is also what makes selection
  // survive switching between the Questions and Flow views.
  const selectInStore = useBuilderStore((st) => st.select);
  useEffect(() => {
    if (selBlock) selectInStore(selBlock.ref);
  }, [selBlock, selectInStore]);
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
  }, []);

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
                <div className="px-4 py-4"><SequenceEdgeInfo edgeId={selEdge.id} doc={doc} /></div>
              ) : selEdgeRule ? (
                <div className="px-4 py-4"><EdgeRuleEditor
                  rule={selEdgeRule}
                  doc={doc}
                  isTrueBranch={false}
                  isFalseBranch={false}
                  elseTarget={null}
                  onPatch={patchRule}
                  onDelete={() => onEdgesDelete([{ id: selEdge!.id } as Edge])}
                /></div>
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

/** A single case on a branch: one condition, one destination. */
export interface BranchCase {
  ruleId: string;
  label: string;
  target: string;
  targetKind: "block" | "ending";
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
function deriveGraph(doc: FormDoc, gotoRules: GotoRule[]): { nodes: Node[]; edges: Edge[] } {
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
    list.push({
      ruleId: rule.id,
      label: edgeLabel(fromBlock, cond),
      target: rule.target,
      targetKind: endingRefs.has(rule.target) ? "ending" : "block",
    });
    casesBySource.set(from, list);
  }

  doc.blocks.forEach((b, i) => {
    const isFirst = i === 0;
    nodes.push({
      id: b.ref,
      type: isFirst ? "start" : "question",
      position: doc.layout[b.ref] ?? { x: 0, y: 0 },
      data: { block: b },
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
      nodes.push({
        id: branchId,
        type: "branch",
        position: doc.layout[branchId] ?? { x: 0, y: 0 },
        data: { sourceRef: b.ref, sourceTitle: b.title, cases, exhaustive },
        deletable: true,
      });
      edges.push({
        id: `into_${b.ref}`,
        source: b.ref,
        target: branchId,
        deletable: false,
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
      for (const c of cases) {
        edges.push(caseEdge(c, branchId));
      }
      // Whatever no case matched still has to go somewhere, and that
      // somewhere is the next question — or, past the last one, the ending.
      // It is worth drawing because it is the half of the decision the rules
      // never mention.
      const fallback = exhaustive ? undefined : (always?.target ?? next?.ref ?? doc.endings[0]?.ref);
      if (fallback) {
        edges.push({
          id: `else_${b.ref}`,
          source: branchId,
          sourceHandle: OTHERWISE,
          target: fallback,
          label: "anything else",
          deletable: false,
          style: { stroke: "var(--border)", strokeWidth: 1.5 },
          labelStyle: { fontSize: 9, fill: "var(--muted-foreground)" },
          labelBgStyle: { fill: "var(--card)" },
          labelBgPadding: [4, 2],
          markerEnd: { type: MarkerType.ArrowClosed },
        });
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
      edges.push({
        id: always.id,
        source: b.ref,
        target: always.target,
        deletable: true,
        label: "always",
        style: { stroke: "var(--primary)", strokeWidth: 2 },
        labelStyle: { fontSize: 10, fontWeight: 600, fill: "var(--primary)" },
        labelBgStyle: { fill: "var(--card)" },
        labelBgPadding: [4, 2],
        markerEnd: { type: MarkerType.ArrowClosed },
      });
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
      edges.push({
        id: `seq-${b.ref}`,
        source: b.ref,
        target: onward,
        deletable: false,
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  });

  doc.endings.forEach((e) => {
    nodes.push({
      id: e.ref,
      type: "ending",
      position: doc.layout[e.ref] ?? { x: 0, y: 0 },
      data: { title: e.title },
      deletable: doc.endings.length > 1,
    });
  });

  // Anything nobody has dragged gets placed by dagre. A saved position wins,
  // so hand-arranged canvases stay where they were put.
  const auto = layoutGraph(nodes, edges);
  for (const node of nodes) {
    if (doc.layout[node.id]) continue;
    const at = auto.get(node.id);
    if (at) node.position = at;
  }

  return { nodes, edges };
}

function caseEdge(c: BranchCase, branchId: string): Edge {
  return {
    id: `case_${c.ruleId}`,
    source: branchId,
    sourceHandle: c.ruleId,
    target: c.target,
    label: c.label,
    deletable: true,
    style: { stroke: "var(--primary)", strokeWidth: 2 },
    labelStyle: { fontSize: 10, fontWeight: 600, fill: "var(--primary)" },
    labelBgStyle: { fill: "var(--card)" },
    labelBgPadding: [4, 2],
    markerEnd: { type: MarkerType.ArrowClosed },
  };
}

// ────────────────────────── node components ──────────────────────────

const nodeTypes: NodeTypes = {
  start: StartNode,
  question: QuestionNode,
  ending: EndingNode,
  branch: BranchNode,
};

function StartNode({ data, selected }: NodeProps) {
  const { block } = data as { block: Block };
  return (
    <div
      className={`rounded-full border-2 px-4 py-2 shadow-sm ${selected ? "border-primary ring-2 ring-primary/30" : "border-green-600/50"}`}
      style={{ background: "var(--card)" }}
    >
      <div className="flex items-center gap-2">
        <Play className="size-3 fill-green-600 text-green-600" />
        <span className="max-w-44 truncate text-xs font-semibold">{block.title}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-green-600" />
    </div>
  );
}

function QuestionNode({ data, selected }: NodeProps) {
  const { block } = data as { block: Block };
  const meta = blockMeta(block.type);
  const accent = TONE_ACCENT[meta.tone];
  return (
    // Selection is a spine in the block's family colour, matching the Questions
    // list, rather than a generic orange ring.
    <div
      className={cn(
        "w-56 rounded-xl bg-[var(--card)] px-3 py-2.5 transition-shadow",
        selected ? "shadow-md" : "shadow-xs",
      )}
      style={{ boxShadow: selected ? `inset 3px 0 0 0 ${accent}, var(--shadow-md)` : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", TONE_CLASSES[meta.tone])}>
          <meta.icon className="size-3.5" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{block.title}</span>
        {block.required && <span className="text-destructive text-xs">*</span>}
      </div>
      <p className="text-muted-foreground mt-1 text-[10px] tracking-wide uppercase">{meta.label}</p>
      <Handle type="source" position={Position.Right} style={{ background: accent }} />
    </div>
  );
}

function EndingNode({ data, selected }: NodeProps) {
  const { title } = data as { title: string };
  return (
    <div
      className={`w-44 rounded-xl border-2 border-dashed px-3 py-2.5 shadow-sm ${selected ? "border-primary ring-2 ring-primary/30" : "border-primary/60"}`}
      style={{ background: "var(--accent)" }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />
      <div className="flex items-center gap-2">
        <Flag className="text-primary size-3.5 shrink-0" />
        <span className="truncate text-xs font-semibold">{title}</span>
      </div>
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
  const { sourceTitle, cases, exhaustive } = data as {
    sourceTitle: string;
    cases: BranchCase[];
    exhaustive: boolean;
  };

  return (
    <div
      className={`w-56 rounded-xl border-2 bg-[var(--card)] pb-1 shadow-sm ${
        selected ? "border-primary ring-primary/30 shadow-md ring-2" : "border-amber-500/60"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />

      <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
          <GitBranch className="size-3 text-amber-600" />
        </span>
        <span className="truncate text-[11px] font-semibold">{sourceTitle || "Branch"}</span>
      </div>

      <div className="border-t border-dashed pt-0.5">
        {cases.map((c) => (
          <BranchRow key={c.ruleId} label={c.label} handleId={c.ruleId} />
        ))}
        {/* When every answer is already spoken for there is no path left for
            "otherwise" to take, so offering one is a wire to nowhere. */}
        {/* Not a case you have to fill in: it is where an answer goes when
            none of the cases match, which happens whether or not it is drawn.
            It is shown so you can see it — and drag it somewhere else. */}
        {!exhaustive && (
          <BranchRow
            label="anything else"
            handleId={OTHERWISE}
            muted
            title="Where an answer goes when none of the cases above match. This happens automatically — drag from the dot to send it somewhere else."
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
  muted,
  title,
}: {
  label: string;
  handleId: string;
  muted?: boolean;
  title?: string;
}) {
  return (
    <div className="relative flex h-[22px] items-center px-3" title={title}>
      <span className={`truncate text-[10px] ${muted ? "text-muted-foreground italic" : "font-medium"}`}>{label}</span>
      <Handle
        type="source"
        id={handleId}
        position={Position.Right}
        style={{ background: muted ? "var(--muted-foreground)" : "var(--primary)" }}
      />
    </div>
  );
}

// ────────────────────────── inspectors ──────────────────────────

function BlockInspector({
  block,
  doc,
  onPatchBlock,
  onDelete,
}: {
  block: Block;
  doc: FormDoc;
  onChange: (d: FormDoc) => void;
  onPatchBlock: (ref: string, patch: Partial<Block>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-xs font-medium uppercase">{block.type}</p>
        {block.type !== "welcome" && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <Label>Question</Label>
        <Textarea rows={2} value={block.title} onChange={(e) => onPatchBlock(block.ref, { title: e.target.value })} />
      </div>
      <div className="flex items-center justify-between">
        <Label>Required</Label>
        <Switch checked={block.required} onCheckedChange={(v) => onPatchBlock(block.ref, { required: v })} />
      </div>
      {"options" in block && block.options && (
        <div className="space-y-1.5">
          <Label>Options</Label>
          {block.options.map((o, i) => (
            <div key={o.id} className="flex items-center gap-1.5">
              <Input
                value={o.label}
                onChange={(e) => {
                  const opts = [...block.options];
                  opts[i] = { ...o, label: e.target.value };
                  onPatchBlock(block.ref, { options: opts } as Partial<Block>);
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0"
                onClick={() => onPatchBlock(block.ref, { options: block.options!.filter((x) => x.id !== o.id) } as Partial<Block>)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              onPatchBlock(block.ref, {
                options: [...block.options!, { id: uid("opt"), label: `Option ${block.options!.length + 1}` }],
              } as Partial<Block>)
            }
          >
            Add option
          </Button>
        </div>
      )}
      {block.type === "rating" && (
        <div className="flex items-center justify-between">
          <Label>Scale</Label>
          <Picker
            className="w-24"
            value={String(block.scale ?? 5)}
            onValueChange={(v) => onPatchBlock(block.ref, { scale: Number(v) } as Partial<Block>)}
          >
            {[3, 4, 5, 7, 10].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </Picker>
        </div>
      )}
      {doc.endings.length > 1 && <p className="text-muted-foreground text-[10px]">{doc.blocks.length} blocks in this form.</p>}
    </div>
  );
}

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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <GitBranch className="text-primary size-4 shrink-0" />
            Branch
          </p>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">{sourceBlock?.title ?? sourceRef}</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" onClick={onDelete} aria-label="Delete branch">
          <Trash2 className="size-3.5" />
        </Button>
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

function EdgeRuleEditor({
  rule,
  doc,
  isTrueBranch,
  isFalseBranch,
  elseTarget,
  onPatch,
  onDelete,
}: {
  rule: GotoRule;
  doc: FormDoc;
  isTrueBranch: boolean;
  isFalseBranch: boolean;
  elseTarget: string | null;
  onPatch: (ruleId: string, patch: RulePatch) => void;
  onDelete: () => void;
}) {
  const cond = condOf(rule);
  const sourceBlock = doc.blocks.find((b) => b.ref === rule.from) ?? null;
  const isYesNo = sourceBlock?.type === "yes_no";
  const accent = isTrueBranch ? "text-green-600" : isFalseBranch ? "text-red-600" : "text-primary";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className={`text-sm font-semibold ${accent}`}>
          {isTrueBranch ? "YES branch" : isFalseBranch ? "NO branch" : "Custom flow"}
        </p>
        <Button variant="ghost" size="icon" className="size-7" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {!isTrueBranch && !isFalseBranch && (
        <div className="space-y-1.5">
          <Label>Source question</Label>
          <Picker value={rule.from ?? ""} onValueChange={(v) => onPatch(rule.id, { from: v })}>
            {doc.blocks.filter((b) => b.type !== "welcome").map((b) => (
              <SelectItem key={b.ref} value={b.ref}>{b.title.slice(0, 40)}</SelectItem>
            ))}
          </Picker>
        </div>
      )}
      {isYesNo && !isFalseBranch ? (
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
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
      {isFalseBranch && elseTarget === null && (
        <p className="text-muted-foreground text-xs">This branch falls through when unwired.</p>
      )}
      {!cond && !isTrueBranch && !isFalseBranch && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => onPatch(rule.id, { makeConditional: true })}>
          Add a condition to this wire
        </Button>
      )}
    </div>
  );
}

function SequenceEdgeInfo({ edgeId, doc }: { edgeId: string; doc: FormDoc }) {
  const fromRef = edgeId.slice(4);
  const from = doc.blocks.find((b) => b.ref === fromRef);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">Default flow</p>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Runs after <span className="font-medium text-foreground">{from?.title ?? "this block"}</span> when no matching rule
        redirects the flow. This wire follows the block order and can&apos;t be deleted — add a Branch or a custom
        wire to override it.
      </p>
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

// Node icons come from the shared library, so a block wears the same mark on
// the canvas, in the palette and in the Questions list.
const BLOCK_ICONS: Partial<Record<BlockType, typeof Mail>> = Object.fromEntries(
  BLOCK_LIBRARY.map((b) => [b.type, b.icon]),
);

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
      return BlockSchema.parse({ ...base, type, title: "Complete payment", amountMode: "fixed", amount: 10, currency: "USD" });
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
