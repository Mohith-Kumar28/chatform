"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
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
import { cn } from "@/lib/utils";
import { BlockInspector as SharedBlockInspector } from "./inspector/block-inspector";
import { BLOCK_GROUPS, BLOCK_LIBRARY, blockMeta, TONE_ACCENT, TONE_CLASSES } from "./block-library";
import { computeAutoLayout } from "./flow-layout";
import { useBuilderStore } from "@/stores/builder-store";
import type { Block, FormDoc, LogicRule } from "@repo/form-schema";
import { Block as BlockSchema } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
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
  const { screenToFlowPosition } = useReactFlow();

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
      onChange({ ...doc, logic: [...doc.logic, rule], layout: { ...doc.layout, [`cond_${rule.id}`]: position } });
      setSelectedNodeId(`cond_${rule.id}`);
      setSelectedEdgeId(null);
    },
    [doc, onChange, answerableBlocks],
  );

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
      const sourceIsCond = conn.source.startsWith("cond_");
      const ruleId = sourceIsCond ? conn.source.slice(5) : null;

      if (ruleId) {
        const rule = gotoRules.find((r) => r.id === ruleId);
        if (!rule) return;
        const targetKind = doc.endings.some((e) => e.ref === conn.target) ? "ending" : "block";

        if (conn.sourceHandle === "true") {
          setRules(doc.logic.map((r) => (isGoto(r) && r.id === ruleId ? { ...r, target: conn.target!, targetKind } : r)));
          return;
        }
        if (conn.sourceHandle === "false") {
          const cond = condOf(rule);
          const inv = opInverse(cond?.op ?? "eq");
          if (!inv) return;
          const existing = rule.pair ? gotoRules.find((r) => r.id === rule.pair) : undefined;
          const falseRule: GotoRule = {
            id: existing?.id ?? uid("rl"),
            action_kind: "goto",
            from: rule.from,
            when: {
              op: "and",
              conditions: [{ ...(cond as { left: { kind: "ref"; ref: string } }), op: inv, value: cond?.value }],
              groups: [],
            },
            target: conn.target,
            targetKind,
            branch: "false",
            pair: rule.id,
          };
          const kept = doc.logic.filter((r) => !(isGoto(r) && existing && r.id === existing.id));
          setRules([...kept.map((r) => (isGoto(r) && r.id === ruleId ? { ...r, pair: falseRule.id } : r)), falseRule]);
          return;
        }
        return;
      }

      if (conn.target?.startsWith("cond_")) {
        const rid = conn.target.slice(5);
        setRules(doc.logic.map((r) => (isGoto(r) && r.id === rid ? { ...r, from: conn.source } : r)));
        return;
      }

      if (!doc.blocks.some((b) => b.ref === conn.source)) return;
      const targetKind = doc.endings.some((e) => e.ref === conn.target) ? "ending" : "block";
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
        if (n.id.startsWith("cond_")) {
          const ruleId = n.id.slice(5);
          const rule = logic.find((r): r is GotoRule => isGoto(r) && r.id === ruleId);
          logic = logic.filter((r) => !(isGoto(r) && (r.id === ruleId || r.id === rule?.pair)));
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
    },
    [doc, onChange],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      let logic = [...doc.logic];
      for (const e of deleted) {
        if (e.id.startsWith("condtrue_")) {
          const ruleId = e.id.slice("condtrue_".length);
          const rule = logic.find((r): r is GotoRule => isGoto(r) && r.id === ruleId);
          logic = logic.filter((r) => !(isGoto(r) && (r.id === ruleId || r.id === rule?.pair)));
        } else if (e.id.startsWith("condfalse_")) {
          const ruleId = e.id.slice("condfalse_".length);
          const rule = logic.find((r): r is GotoRule => isGoto(r) && r.id === ruleId);
          logic = logic
            .filter((r) => !(isGoto(r) && rule?.pair != null && r.id === rule.pair))
            .map((r) => (isGoto(r) && rule != null && r.id === ruleId ? ({ ...r, pair: undefined } as LogicRule) : r));
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
  const selBlock = selectedNodeId && !selectedNodeId.startsWith("cond_") ? doc.blocks.find((b) => b.ref === selectedNodeId) : undefined;

  // The shared inspector reads the selected block from the builder store, so
  // canvas selection has to land there too. This is also what makes selection
  // survive switching between the Questions and Flow views.
  const selectInStore = useBuilderStore((st) => st.select);
  useEffect(() => {
    if (selBlock) selectInStore(selBlock.ref);
  }, [selBlock, selectInStore]);
  const selEnding = selectedNodeId && !selectedNodeId.startsWith("cond_") ? doc.endings.find((e) => e.ref === selectedNodeId) : undefined;
  const selCond = selectedNodeId?.startsWith("cond_") ? gotoRules.find((r) => r.id === selectedNodeId.slice(5)) : undefined;
  const selCondFalse = selCond?.pair ? gotoRules.find((r) => r.id === selCond.pair) : undefined;
  const selEdge = selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) : undefined;
  const selEdgeRule = selEdge && !selEdge.id.startsWith("seq-") ? gotoRules.find((r) => r.id === selEdge.id) : undefined;

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
                <span className="font-medium">If / Else</span>
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
          edges={edges}
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
          deleteKeyCode={["Backspace", "Delete"]}
          minZoom={0.25}
          fitView
          // A left-to-right flow is wide, and fitting the whole graph shrank
          // it until the node labels were unreadable. Fit to the start of the
          // flow at a legible size and let the canvas be panned.
          fitViewOptions={{ maxZoom: 0.9, minZoom: 0.45, padding: 0.15 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
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
                  isTrueBranch={selEdge!.id.startsWith("condtrue_")}
                  isFalseBranch={selEdge!.id.startsWith("condfalse_")}
                  elseTarget={selCondFalse?.target ?? null}
                  onPatch={patchRule}
                  onDelete={() => onEdgesDelete([{ id: selEdge!.id } as Edge])}
                /></div>
              ) : selBlock ? (
                // The shared inspector — same component, same fields, whether
                // you got here from Questions or from Flow.
                <SharedBlockInspector />
              ) : selCond ? (
                <div className="px-4 py-4"><ConditionInspector
                  rule={selCond}
                  elseRule={selCondFalse}
                  doc={doc}
                  answerableBlocks={answerableBlocks}
                  onPatch={patchRule}
                  onDelete={() => onNodesDelete([{ id: `cond_${selCond.id}` } as Node])}
                /></div>
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
                    <p>3. Drop an If / Else node for conditional branches.</p>
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

function deriveGraph(doc: FormDoc, gotoRules: GotoRule[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // Where a node starts when nobody has dragged it. A saved position wins.
  const auto = computeAutoLayout(doc).nodes;

  doc.blocks.forEach((b, i) => {
    const isFirst = i === 0;
    nodes.push({
      id: b.ref,
      type: isFirst ? "start" : "question",
      position: doc.layout[b.ref] ?? auto.get(b.ref) ?? { x: 80, y: 80 },
      data: { block: b },
      deletable: !isFirst,
    });
    const next = doc.blocks[i + 1];
    if (next) {
      edges.push({
        id: `seq-${b.ref}`,
        source: b.ref,
        target: next.ref,
        deletable: false,
        label: "default",
        style: { stroke: "var(--border)", strokeWidth: 1.5 },
        labelStyle: { fontSize: 9, fill: "var(--muted-foreground)" },
        labelBgStyle: { fill: "var(--card)" },
        labelBgPadding: [4, 2],
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  });

  doc.endings.forEach((e, i) => {
    nodes.push({
      id: e.ref,
      type: "ending",
      position: doc.layout[e.ref] ?? auto.get(e.ref) ?? { x: 80, y: 80 + i * 150 },
      data: { title: e.title },
      deletable: doc.endings.length > 1,
    });
  });

  const pairedFalse = new Set(gotoRules.map((r) => r.pair ?? "").filter(Boolean));
  gotoRules.forEach((r) => {
    const cond = condOf(r);
    if (cond && r.branch !== "false") {
      const falseRule = r.pair ? gotoRules.find((x) => x.id === r.pair) : undefined;
      nodes.push({
        id: `cond_${r.id}`,
        type: "condition",
        position:
          doc.layout[`cond_${r.id}`] ??
          auto.get(`cond_${r.id}`) ?? { x: 140, y: 170 },
        data: { rule: r },
      });
      if (r.from) {
        edges.push({
          id: `condin_${r.id}`,
          source: r.from,
          target: `cond_${r.id}`,
          deletable: false,
          style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5, strokeDasharray: "2 2" },
        });
      }
      edges.push(conditionEdge(`condtrue_${r.id}`, `cond_${r.id}`, "true", r.target, "YES", "#16a34a"));
      if (falseRule) {
        edges.push(conditionEdge(`condfalse_${r.id}`, `cond_${r.id}`, "false", falseRule.target, "NO", "#dc2626"));
      }
    } else if (!cond && !pairedFalse.has(r.id)) {
      const fromBlock = doc.blocks.find((b) => b.ref === r.from);
      edges.push({
        id: r.id,
        source: r.from ?? doc.blocks[0]?.ref ?? "",
        target: r.target,
        label: cond ? edgeLabel(fromBlock ?? null, cond) : "always",
        animated: !!cond,
        style: { stroke: "var(--primary)", strokeWidth: 2, strokeDasharray: cond ? "5 3" : undefined },
        labelStyle: { fontSize: 10 },
        labelBgStyle: { fill: "var(--card)" },
        labelBgPadding: [4, 2],
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  });

  return { nodes, edges };
}

function conditionEdge(id: string, source: string, handle: string, target: string, label: string, color: string): Edge {
  return {
    id,
    source,
    sourceHandle: handle,
    target,
    label,
    deletable: false,
    style: { stroke: color, strokeWidth: 2 },
    labelStyle: { fill: color, fontSize: 10, fontWeight: 700 },
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
  condition: ConditionNode,
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

function ConditionNode({ data, selected }: NodeProps) {
  const { rule } = data as { rule: GotoRule };
  const cond = condOf(rule);
  return (
    <div
      className={`w-52 rounded-xl border-2 bg-[var(--card)] px-3 py-2.5 shadow-sm ${selected ? "border-primary ring-2 ring-primary/30 shadow-md" : "border-amber-500/60"}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15">
          <GitBranch className="size-3.5 text-amber-600" />
        </span>
        <span className="text-xs font-semibold">If / Else</span>
      </div>
      <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[10px] leading-snug">
        {cond ? conditionText(cond) : "always"}
      </p>
      <Handle type="source" id="true" position={Position.Right} style={{ top: "38%" }} className="!bg-green-600" />
      <Handle type="source" id="false" position={Position.Right} style={{ top: "72%" }} className="!bg-red-600" />
      <span className="absolute right-6 top-[30%] text-[9px] font-bold text-green-600">Y</span>
      <span className="absolute right-6 top-[64%] text-[9px] font-bold text-red-600">N</span>
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
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={block.scale ?? 5}
            onChange={(e) => onPatchBlock(block.ref, { scale: Number(e.target.value) } as Partial<Block>)}
          >
            {[3, 4, 5, 7, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      )}
      {doc.endings.length > 1 && <p className="text-muted-foreground text-[10px]">{doc.blocks.length} blocks in this form.</p>}
    </div>
  );
}

function ConditionInspector({
  rule,
  elseRule,
  doc,
  answerableBlocks,
  onPatch,
  onDelete,
}: {
  rule: GotoRule;
  elseRule: GotoRule | undefined;
  doc: FormDoc;
  answerableBlocks: Block[];
  onPatch: (ruleId: string, patch: RulePatch) => void;
  onDelete: () => void;
}) {
  const cond = condOf(rule);
  const sourceBlock = doc.blocks.find((b) => b.ref === rule.from) ?? null;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GitBranch className="text-primary size-4" />
          <p className="text-sm font-semibold">If / Else</p>
        </div>
        <Button variant="ghost" size="icon" className="size-7" onClick={onDelete}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label>Question</Label>
        <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={rule.from ?? ""} onChange={(e) => onPatch(rule.id, { from: e.target.value })}>
          {answerableBlocks.map((b) => (
            <option key={b.ref} value={b.ref}>{b.title.slice(0, 40)}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Condition</Label>
        <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={cond?.op ?? "is_not_empty"} onChange={(e) => onPatch(rule.id, { op: e.target.value as Op })}>
          {OPS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {opsValueNeeded(cond?.op ?? "is_not_empty") && (
          <ConditionValueInput
            block={sourceBlock}
            value={cond?.value}
            onChange={(v) => onPatch(rule.id, { value: v })}
          />
        )}
      </div>
      <div className="space-y-1.5 rounded-lg border border-green-600/30 bg-green-500/5 p-2.5">
        <p className="text-xs font-semibold text-green-600">YES →</p>
        <TargetSelect doc={doc} value={rule.target} onChange={(t, kind) => onPatch(rule.id, { target: t, targetKind: kind })} />
      </div>
      <div className="space-y-1.5 rounded-lg border border-red-600/30 bg-red-500/5 p-2.5">
        <p className="text-xs font-semibold text-red-600">NO →</p>
        {elseRule ? (
          <TargetSelect doc={doc} value={elseRule.target} onChange={(t, kind) => onPatch(elseRule.id, { target: t, targetKind: kind })} />
        ) : (
          <p className="text-muted-foreground text-xs">Falls through to the next node — drag the red handle to route it.</p>
        )}
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
          <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={rule.from ?? ""} onChange={(e) => onPatch(rule.id, { from: e.target.value })}>
            {doc.blocks.filter((b) => b.type !== "welcome").map((b) => (
              <option key={b.ref} value={b.ref}>{b.title.slice(0, 40)}</option>
            ))}
          </select>
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
          <select className="w-full rounded-md border px-2 py-1.5 text-sm" value={cond?.op ?? "is_not_empty"} onChange={(e) => onPatch(rule.id, { op: e.target.value as Op })}>
            {OPS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
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
        redirects the flow. This wire follows the block order and can&apos;t be deleted — add an If / Else node or a custom
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
    <select
      className="w-full rounded-md border px-2 py-1.5 text-sm"
      value={value}
      onChange={(e) => {
        const t = e.target.value;
        onChange(t, doc.endings.some((x) => x.ref === t) ? "ending" : "block");
      }}
    >
      {doc.blocks.map((b) => (
        <option key={b.ref} value={b.ref}>{b.title.slice(0, 36)}</option>
      ))}
      {doc.endings.map((e) => (
        <option key={e.ref} value={e.ref}>🏁 {e.title.slice(0, 30)}</option>
      ))}
    </select>
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
      <select
        className="w-full rounded-md border px-2 py-1.5 text-sm"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value === "true")}
      >
        <option value="">pick…</option>
        <option value="true">{block.yesLabel ?? "Yes"}</option>
        <option value="false">{block.noLabel ?? "No"}</option>
      </select>
    );
  }
  if ("options" in block && block.options) {
    return (
      <select
        className="w-full rounded-md border px-2 py-1.5 text-sm"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">pick an option…</option>
        {block.options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
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
        const removedIds: string[] = (change as { ids?: string[] }).ids ?? [];
        next = next.filter((n) => !removedIds.includes(n.id));
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
