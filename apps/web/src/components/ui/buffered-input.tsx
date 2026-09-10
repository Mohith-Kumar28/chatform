"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useBufferedValue } from "@/hooks/use-buffered-value";

/**
 * An `Input` that reports a settled value rather than a keystroke.
 *
 * The builder's shared inspector fields buffer themselves, but a couple of dozen
 * boxes around the rest of the editor — Settings, the agent's prompts, the theme,
 * link previews, endings, conditions — are plain `Input`s wired straight to the
 * document. Each of those was one full-document change per character. This is
 * the same fix in a shape those call sites can adopt by renaming `onChange` to
 * `onCommit`.
 *
 * `onCommit` fires on blur, after a pause, and on unmount. It does not fire per
 * keystroke, which is the entire point: several of the values these boxes hold —
 * an email address, a URL, a two-letter language code — are invalid for as long
 * as they are half-typed, and the document they live in is validated whole.
 */
type BufferedProps<E> = Omit<React.ComponentProps<E extends "textarea" ? typeof Textarea : typeof Input>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (next: string) => void;
  /** Overrides the idle commit delay. Blur always commits immediately. */
  idleMs?: number;
};

export function BufferedInput({ value, onCommit, idleMs, ...rest }: BufferedProps<"input">) {
  const buffered = useBufferedValue(value, onCommit, idleMs === undefined ? undefined : { idleMs });
  return (
    <Input
      {...rest}
      value={buffered.value}
      onChange={(e) => buffered.onChange(e.target.value)}
      onBlur={buffered.onBlur}
    />
  );
}

export function BufferedTextarea({ value, onCommit, idleMs, ...rest }: BufferedProps<"textarea">) {
  const buffered = useBufferedValue(value, onCommit, idleMs === undefined ? undefined : { idleMs });
  return (
    <Textarea
      {...rest}
      value={buffered.value}
      onChange={(e) => buffered.onChange(e.target.value)}
      onBlur={buffered.onBlur}
    />
  );
}
