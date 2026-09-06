"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  Asterisk,
  Copy,
  Flag,
  GitBranch,
  Hash,
  LayoutGrid,
  Maximize2,
  Plus,
  SquarePen,
  Trash2,
} from "lucide-react";
import type { Block } from "@repo/form-schema";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { BLOCK_GROUPS, BLOCK_LIBRARY } from "./block-library";

/**
 * Right-click on the flow canvas.
 *
 * Everything here was already possible and each thing was somewhere else: to
 * duplicate a question you left the canvas for the Questions list, to add a
 * route you selected the node and found a button in the details panel, to make
 * one required you opened the inspector and scrolled. A canvas whose nodes are
 * the form's actual questions should answer the gesture people try first, and
 * the gesture people try first on a node in a flow editor is a right-click.
 *
 * The menu itself is `@/components/ui/context-menu`, which is the shadcn
 * component over Radix's — the same primitive the dropdowns in this app are
 * built on, so focus handling, typeahead, submenu timing and Escape all behave
 * the way they do everywhere else, and none of it is written here.
 *
 * Actions travel by context rather than through `data` on every node. React
 * Flow's node components receive only their own `data`, so the alternative is
 * threading six callbacks through the graph derivation and re-deriving the
 * whole thing whenever one of them changes identity — which would rebuild the
 * canvas on every render of its parent.
 */
export interface CanvasMenuActions {
  /** Select a node, which is what opens the details panel on it. */
  open: (id: string) => void;
  duplicate: (ref: string) => void;
  /** Add a question of this type directly below the named one. */
  addQuestionBelow: (ref: string, type: Block["type"]) => void;
  /** Another route out of a question that already decides something. */
  addRoute: (ref: string) => void;
  toggleRequired: (ref: string) => void;
  copyRef: (ref: string) => void;
  remove: (id: string) => void;
  /** Pane actions: the node library, without the drag. */
  addBlockHere: (type: Block["type"]) => void;
  addBranchHere: () => void;
  addEndingHere: () => void;
  autoArrange: () => void;
  fitToScreen: () => void;
}

const CanvasMenuContext = createContext<CanvasMenuActions | null>(null);

export function CanvasMenuProvider({
  actions,
  children,
}: {
  actions: CanvasMenuActions;
  children: ReactNode;
}) {
  return <CanvasMenuContext.Provider value={actions}>{children}</CanvasMenuContext.Provider>;
}

/**
 * The menu for one node.
 *
 * Returns the children untouched when there is no provider above it, so a node
 * rendered outside the canvas — in a test, or in the marketing preview — still
 * renders rather than throwing.
 */
export function NodeMenu({
  id,
  kind,
  /** The question this node is about; a branch node is about the one it hangs off. */
  sourceRef,
  required,
  deletable = true,
  children,
}: {
  id: string;
  kind: "start" | "question" | "branch" | "ending";
  sourceRef?: string;
  required?: boolean;
  deletable?: boolean;
  children: ReactNode;
}) {
  const actions = useContext(CanvasMenuContext);
  if (!actions) return <>{children}</>;
  const ref = sourceRef ?? id;

  return (
    <ContextMenu>
      {/*
        `stopPropagation` so a right-click on a node does not also open the
        canvas menu behind it. Radix composes its own handler onto the same
        element, so its menu still opens — only the bubble to the pane is cut.
      */}
      <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => actions.open(id)}>
          <SquarePen />
          {kind === "branch" ? "Edit this branch" : "Open in details"}
        </ContextMenuItem>

        {kind === "question" && (
          <>
            <ContextMenuItem onSelect={() => actions.duplicate(ref)}>
              <Copy />
              Duplicate
            </ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Plus />
                Add a question below
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-80 w-52 overflow-y-auto">
                <BlockTypeItems onPick={(type) => actions.addQuestionBelow(ref, type)} />
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => actions.addRoute(ref)}>
              <GitBranch />
              Send answers different ways
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => actions.toggleRequired(ref)}>
              <Asterisk />
              {required ? "Make optional" : "Make required"}
            </ContextMenuItem>
          </>
        )}

        {kind === "branch" && (
          <ContextMenuItem onSelect={() => actions.addRoute(ref)}>
            <Plus />
            Add another route
          </ContextMenuItem>
        )}

        {kind !== "branch" && (
          <ContextMenuItem onSelect={() => actions.copyRef(ref)}>
            <Hash />
            Copy reference
          </ContextMenuItem>
        )}

        {deletable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => actions.remove(id)}>
              <Trash2 />
              {kind === "branch" ? "Remove the branch" : "Delete"}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The menu for the empty canvas.
 *
 * The node library on the left is drag-only, which is a fine way to place
 * something precisely and a poor way to add one question — and impossible on a
 * touchpad for anyone who finds dragging awkward. The same list is here, at the
 * point that was right-clicked, and the two framing controls are here too
 * because they are what you reach for after adding anything.
 */
export function PaneMenu({ children }: { children: ReactNode }) {
  const actions = useContext(CanvasMenuContext);
  if (!actions) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel>Add here</ContextMenuLabel>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Plus />
            Question
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-80 w-52 overflow-y-auto">
            <BlockTypeItems onPick={actions.addBlockHere} />
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => actions.addBranchHere()}>
          <GitBranch />
          Branch
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.addEndingHere()}>
          <Flag />
          Ending
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => actions.autoArrange()}>
          <LayoutGrid />
          Auto arrange
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => actions.fitToScreen()}>
          <Maximize2 />
          Fit to screen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The block library as menu rows, grouped the way the sidebar groups it.
 *
 * Shared by the two places that offer "add a question": the pane menu, which
 * adds one where you clicked, and a node's menu, which adds one below it. One
 * copy, because a third list of block types is exactly how the first two came
 * to disagree — the workflow panel used to carry its own.
 */
function BlockTypeItems({ onPick }: { onPick: (type: Block["type"]) => void }) {
  return (
    <>
      {BLOCK_GROUPS.map((group) => {
        const items = BLOCK_LIBRARY.filter((b) => b.group === group);
        if (items.length === 0) return null;
        return (
          <ContextMenuGroup key={group}>
            <ContextMenuLabel>{group}</ContextMenuLabel>
            {items.map((item) => (
              <ContextMenuItem key={item.type} onSelect={() => onPick(item.type)}>
                <item.icon />
                {item.label}
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
        );
      })}
    </>
  );
}
