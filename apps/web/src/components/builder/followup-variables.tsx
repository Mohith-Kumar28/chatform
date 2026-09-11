"use client";

import { cn } from "@/lib/utils";

/**
 * The things an author can drop into a reminder, offered as words rather than
 * as syntax.
 *
 * `{{form.title}}` is a perfectly good thing to write and a terrible thing to
 * have to guess. Nothing in the product ever listed what was available, so the
 * only way to learn the vocabulary was to be told it — and the only way to
 * learn the *spelling* was to get it wrong, because an unknown placeholder is
 * blanked at send time rather than left visible. A respondent should never read
 * `{{q_name}}`, which is right, but it means a typo is invisible until the mail
 * has gone.
 *
 * So the author picks from a list and we write the syntax.
 */
export interface VariableOption {
  /** What goes into the field. */
  token: string;
  /** What the author reads. */
  label: string;
}

/**
 * Put text where the cursor is, in a field React controls.
 *
 * Writing to `el.value` directly would be reverted on the next render, and the
 * component's `onChange` is closed over inside `BufferedInput` where a caller
 * cannot reach it. So the value goes in through the prototype's own setter —
 * which is what React's synthetic `input` event reads — and a bubbling `input`
 * event is dispatched, so the field updates exactly as it would have if the
 * author had typed the token themselves. Buffering, autosave and the preview
 * all follow from that one event, with nothing else to keep in step.
 *
 * The caret is put back after the token rather than at the end of the field: an
 * author inserting into the middle of a sentence is mid-sentence, and sending
 * them to the end would make the second insertion land somewhere they did not
 * ask for.
 */
export function insertAtCaret(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  /*
   * A field nobody has typed in yet reports a caret at position zero, which is
   * a true reading and a useless one: an author who opened a step and pressed a
   * value without clicking into the message meant "add this", not "put it in
   * front of everything I have written". With no focus there is no caret to
   * respect, so the value goes at the end.
   */
  const live = document.activeElement === el;
  const start = live ? (el.selectionStart ?? el.value.length) : el.value.length;
  const end = live ? (el.selectionEnd ?? start) : start;
  const next = `${el.value.slice(0, start)}${text}${el.value.slice(end)}`;

  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));

  const caret = start + text.length;
  el.focus();
  el.setSelectionRange(caret, caret);
}

/**
 * The list itself: one tap each, styled as a value rather than as code.
 *
 * `onMouseDown` is swallowed because the press would otherwise blur the field
 * first — which commits the buffered value and, more to the point, throws away
 * the selection this is about to insert into. The same trick the rich text
 * toolbar uses for the same reason.
 */
export function VariablePalette({
  options,
  onInsert,
  className,
}: {
  options: VariableOption[];
  onInsert: (token: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map((o) => (
        <button
          key={o.token}
          type="button"
          title={`Inserts ${o.token}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onInsert(o.token)}
          className="bg-primary/10 text-primary hover:bg-primary/20 max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
