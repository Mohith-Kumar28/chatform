"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import type { FormDoc } from "@repo/form-schema";
import { useBuilderStore } from "@/stores/builder-store";
import { usePutApiFormsByIdDoc } from "@/lib/api/dashboard/dashboard";

const DEBOUNCE_MS = 800;

/**
 * Debounced autosave for the working document.
 *
 * Also installs a beforeunload guard: the previous builder could lose up to
 * 800ms of edits if you closed the tab mid-debounce, silently.
 *
 * Returns `flush` so Publish can force a pending save instead of being disabled
 * while dirty — the old header disabled Publish whenever the doc was dirty, so
 * a user who had just typed had to wait out the debounce before they could ship.
 */
export function useAutosave(formId: string) {
  const doc = useBuilderStore((s) => s.doc);
  const saveState = useBuilderStore((s) => s.saveState);
  const markSaving = useBuilderStore((s) => s.markSaving);
  const markSaved = useBuilderStore((s) => s.markSaved);
  const markError = useBuilderStore((s) => s.markError);

  const { mutateAsync } = usePutApiFormsByIdDoc();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<FormDoc | null>(null);

  /**
   * The save itself, rebuilt whenever anything it closes over changes.
   *
   * This used to be `useRef(async next => …)`, whose argument is evaluated once
   * and then never again — so the saved closure kept the `formId` and mutation
   * from the very first render for the lifetime of the hook. The line below it,
   * `save.current = save.current`, was commented "keep the closure fresh" and
   * did nothing whatsoever: assigning a value to itself cannot refresh what it
   * captured. A `useCallback` is what that comment was reaching for.
   */
  const save = useCallback(
    async function run(next: FormDoc): Promise<void> {
      if (inFlight.current) {
        pending.current = next;
        return;
      }
      inFlight.current = true;
      markSaving();
      try {
        await mutateAsync({ id: formId as never, data: { doc: next } as never });
        markSaved(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not save";
        markError(message);
        toast.error("Changes not saved", { description: message });
      } finally {
        inFlight.current = false;
        const queued = pending.current;
        pending.current = null;
        // Named so the retry reaches this same invocation rather than a ref.
        if (queued) void run(queued);
      }
    },
    [formId, mutateAsync, markSaving, markSaved, markError],
  );

  /**
   * The newest `save`, readable from a timeout without making the debounce
   * depend on it. Written in an effect, never during render — a debounce that
   * restarted every time the mutation object changed identity would push its
   * own deadline forward and, while you kept typing, never fire.
   */
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!doc || saveState !== "dirty") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveRef.current(doc), DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [doc, saveState]);

  useEffect(() => {
    const dirty = saveState === "dirty" || saveState === "saving";
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  return {
    /** Force any pending save to complete. Resolves once the doc is persisted. */
    flush: async () => {
      if (timer.current) clearTimeout(timer.current);
      const current = useBuilderStore.getState().doc;
      if (current && useBuilderStore.getState().saveState !== "saved") {
        await saveRef.current(current);
      }
    },
  };
}
