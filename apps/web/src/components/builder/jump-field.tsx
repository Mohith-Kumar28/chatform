"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A number you can retype to go there.
 *
 * Both places that say where you are in the results table — the pager's
 * "51–72 of 72" and the detail panel's "51/72" — were labels. On a table of
 * seventy-two that is fine; on one of three thousand, reaching response 1,400
 * meant twenty-eight presses of an arrow, each one a page you did not want to
 * look at. The position is the natural place to type where you want to be, so
 * it is the control.
 *
 * Closed it is still a label, and reads as one: the affordance is a dashed
 * underline on hover, the same one `EditableTitle` uses in the builder header,
 * rather than a box sitting in a row of counts. Text that is quietly editable
 * costs a reader who is only reading nothing at all.
 */
export function JumpField({
  value,
  max,
  label,
  title,
  render,
  onJump,
  hint,
  disabled,
}: {
  /** What is showing now, and what the field opens on. One-based. */
  value: number;
  /** The largest accepted value. Typing past it is refused, not clamped. */
  max: number;
  /** Accessible name for the input — "Go to page", "Go to response". */
  label: string;
  /** Hover/title text on the closed control. */
  title: string;
  /** The closed label. Given the value so it can read "51–72 of 72" or "51/72". */
  render: (value: number) => React.ReactNode;
  /** Called with a valid, in-range number. Never with the one already showing. */
  onJump: (value: number) => void;
  /**
   * Rendered in a styled tooltip on hover instead of the native `title`.
   *
   * For the detail panel, where this sits between two chevrons that already
   * carry one — a browser tooltip beside a designed one reads as a bug. The
   * pager has no tooltips of its own, so it takes the native version.
   */
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  /*
    While closed, the field tracks the table. The position changes under it —
    an arrow press, a page turn, a filter that renumbers everything — and
    opening on a stale number would offer to "jump" to where the reader already is.
    Derived during the render that sees the new value rather than in an effect
    afterwards, so the field is never briefly holding the previous one.
  */
  if (!editing && draft !== String(value)) setDraft(String(value));

  function commit() {
    setEditing(false);
    const next = Number(draft.trim());
    /*
      Out of range puts the number back rather than clamping to the nearest
      end. Someone who types 400 into a table of 72 has the wrong table in
      mind, and landing them on 72 would answer a question they did not ask —
      quietly, with no way to tell it had happened.
    */
    if (!Number.isInteger(next) || next < 1 || next > max || next === value) {
      setDraft(String(value));
      return;
    }
    onJump(next);
  }

  if (disabled) return <span className="text-muted-foreground tabular px-1 text-xs">{render(value)}</span>;

  if (editing) {
    return (
      <input
        // `text`, not `number`: the spinner arrows land right beside the
        // Previous/Next chevrons, where a stray click steps the wrong control
        // entirely. `inputMode` still brings up the numeric keypad.
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          /*
            Stopped here rather than left to bubble. The panel binds ← and → on
            the window to step responses, so an arrow pressed while moving the
            cursor inside this field would also change what is behind it — and
            the field would be typing into a response that had been replaced.
          */
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(String(value));
            setEditing(false);
          }
        }}
        className="border-primary tabular w-10 border-0 border-b bg-transparent px-1 text-center text-xs outline-none"
      />
    );
  }

  const trigger = (
    <button
      type="button"
      onClick={() => setEditing(true)}
      // Dropped when a styled tooltip is carrying the same words, or the two
      // stack up on the same hover.
      title={hint ? undefined : title}
      aria-label={title}
      className="text-muted-foreground hover:text-foreground hover:decoration-border tabular rounded px-1 text-xs whitespace-nowrap underline-offset-4 transition-colors hover:underline hover:decoration-dashed"
    >
      {render(value)}
    </button>
  );

  if (!hint) return trigger;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="bottom">{hint}</TooltipContent>
    </Tooltip>
  );
}
