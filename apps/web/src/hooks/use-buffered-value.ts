"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long after the last keystroke an edit commits on its own.
 *
 * Blur is the real signal — it is unambiguous, and it is what a person does when
 * they have finished with a field. This is the backstop for the person who types
 * a sentence and then sits looking at it, and it is deliberately long enough to
 * survive thinking mid-word. The previous behaviour committed on every keystroke
 * and saved 800ms later, which is how typing `mu` into an email box produced
 * "Invalid email address" before the address had been finished.
 */
const IDLE_MS = 3000;

/**
 * Everything with an uncommitted keystroke in it, so one call can drain them.
 *
 * Blur, idle and unmount cover a person working normally, but ⌘S, Publish and
 * the leave-guard all reach for the document *now*, from outside whichever field
 * happens to be focused. Without this they would read a store that is one
 * half-typed word behind the screen — the save would look like it worked and
 * would be missing the last thing the author typed.
 */
const pending = new Set<() => void>();

/** Commit every buffered field immediately. Called before any deliberate save. */
export function flushBufferedValues(): void {
  // Copied first: committing mutates the set as each buffer deregisters itself.
  for (const flush of [...pending]) flush();
}

export interface BufferedValue<T> {
  value: T;
  onChange: (next: T) => void;
  onBlur: () => void;
}

/**
 * Hold a value locally while it is being typed, and commit it on blur or idle.
 *
 * The bug this exists to fix is that a keystroke and a committed edit were the
 * same event: every character typed anywhere in the builder produced a new
 * document, marked it dirty, and restarted the save timer. That made typing the
 * loudest thing in the application — one full-document upload per pause — and it
 * meant every intermediate state of a value was submitted for validation,
 * including the ones that could not possibly be valid yet.
 *
 * `commit` is called with the settled value only. Upstream changes that this
 * hook did not cause — undo, redo, an AI edit, adopting another tab's document —
 * take precedence over an unsent keystroke and replace what is on screen, which
 * is the behaviour someone pressing ⌘Z is asking for.
 */
export function useBufferedValue<T>(
  value: T,
  commit: (next: T) => void,
  { idleMs = IDLE_MS }: { idleMs?: number } = {},
): BufferedValue<T> {
  const [local, setLocal] = useState<T>(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false);
  /** The last value this hook put upstream, so it can recognise its own echo. */
  const mine = useRef<T>(value);
  /** Read from timers and unmount, where a stale closure would commit stale text. */
  const latest = useRef<T>(value);
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const flush = useCallback(() => {
    clear();
    if (!dirty.current) return;
    dirty.current = false;
    mine.current = latest.current;
    commitRef.current(latest.current);
  }, [clear]);

  /*
    Registered only while there is something to lose. A permanent membership
    would make `flushBufferedValues` walk every field in the builder to find the
    one or two that have been touched.
  */
  useEffect(() => {
    if (!dirty.current) return;
    pending.add(flush);
    return () => {
      pending.delete(flush);
    };
  });

  /*
    An unmount is not a cancellation. Switching to another question with a
    half-typed title, or closing the panel the field lives in, must keep what was
    typed — the old controlled inputs got that for free by committing every
    keystroke, and it would be a poor trade to lose it here.
  */
  useEffect(() => () => flush(), [flush]);

  useEffect(() => {
    latest.current = local;
  }, [local]);

  useEffect(() => {
    // Our own echo: the store telling us what we just told it. Ignored, because
    // adopting it would fight with anything typed in the meantime.
    if (Object.is(value, mine.current)) return;
    mine.current = value;
    dirty.current = false;
    clear();
    setLocal(value);
  }, [value, clear]);

  const onChange = useCallback(
    (next: T) => {
      dirty.current = true;
      latest.current = next;
      setLocal(next);
      clear();
      timer.current = setTimeout(flush, idleMs);
    },
    [clear, flush, idleMs],
  );

  return { value: local, onChange, onBlur: flush };
}
