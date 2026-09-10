"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAsyncDebouncer } from "@tanstack/react-pacer";
import { FormDoc as FormDocSchema, type FormDoc } from "@repo/form-schema";
import { useBuilderStore, type DocIssue } from "@/stores/builder-store";
import {
  getApiFormsById,
  getGetApiFormsByIdQueryKey,
  usePutApiFormsByIdDoc,
} from "@/lib/api/dashboard/dashboard";
import { invalidateForms } from "@/lib/query-keys";
import { ApiError } from "@/lib/api/mutator";
import { flushBufferedValues } from "./use-buffered-value";
import { clearLocalDraft, writeLocalDraft } from "@/lib/local-draft";
import { saveDelay } from "@/lib/save-timing";

/** First backoff step after a failed save. Doubles, and is capped. */
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;

/** A schema failure the server reported, in the shape the panels read. */
function issuesFrom(err: ApiError): DocIssue[] {
  return err.issues.map((i) => ({ path: i.path, code: i.code, message: i.message }));
}

/**
 * Autosave for the working document.
 *
 * Three rules, and the bug each one is here to prevent:
 *
 * 1. **Nothing is sent that cannot be stored.** The document is parsed against
 *    the same schema the server parses it with, before the request. Around forty
 *    fields in `FormDoc` reject a partially-typed value — every URL, every email,
 *    an option's label, the form's own title — and because the server validates
 *    the document as a whole, one of them mid-edit used to reject the save of
 *    everything else in the form along with it.
 * 2. **A save states the revision it was made against.** The write used to be
 *    unconditional, so two open tabs overwrote each other in silence. A clash now
 *    comes back as a 409 and is put to the author instead of being lost.
 * 3. **The document is on disk before the network is involved.** That is what
 *    makes waiting three seconds — or ten — a reasonable thing to do at all.
 *
 * Returns `flush` so Publish, ⌘S and the leave-guard can force a pending save
 * rather than being disabled while dirty, and `retry` for the failure indicator.
 */
export function useAutosave(formId: string) {
  const doc = useBuilderStore((s) => s.doc);
  const saveState = useBuilderStore((s) => s.saveState);
  const markSaving = useBuilderStore((s) => s.markSaving);
  const markSaved = useBuilderStore((s) => s.markSaved);
  const markError = useBuilderStore((s) => s.markError);
  const markInvalid = useBuilderStore((s) => s.markInvalid);
  const setOffline = useBuilderStore((s) => s.setOffline);
  const setConflict = useBuilderStore((s) => s.setConflict);

  const { mutateAsync } = usePutApiFormsByIdDoc();
  const queryClient = useQueryClient();

  const inFlight = useRef(false);
  const pending = useRef<FormDoc | null>(null);
  /** When the oldest unsent edit was made, for the ceiling. Null when settled. */
  const dirtySince = useRef<number | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);
  /** The exact bytes last accepted, so a reverted edit costs no request. */
  const lastSentJson = useRef<string | null>(null);
  /** Set once the debouncer exists; breaks the cycle between it and `save`. */
  const schedule = useRef<(next: FormDoc) => void>(() => {});
  const saveRef = useRef<(next: FormDoc) => Promise<void>>(async () => {});

  /**
   * What to do about a save that did not land.
   *
   * The outcomes are genuinely different and used to share one toast: a clash
   * needs a decision, a schema refusal needs a field corrected, and a network
   * failure needs another attempt and nothing from the author at all.
   */
  const handleFailure = useCallback(
    async (err: unknown, attempted: FormDoc): Promise<void> => {
      const api = err instanceof ApiError ? err : null;

      if (api?.status === 409) {
        /*
          Somebody else has saved since this editor loaded. Their document is not
          in the 409 body — it can be eighty kilobytes on a large form — so it is
          fetched here, once, on a path that should be rare.
        */
        try {
          const theirs = (await getApiFormsById(formId)) as {
            workingSchema?: unknown;
            workingRevision?: number;
          };
          const parsed = FormDocSchema.safeParse(theirs.workingSchema);
          if (parsed.success) setConflict(parsed.data, theirs.workingRevision ?? null);
        } catch {
          // Fall through: we know there was a clash but cannot show what it was,
          // and saying nothing at all would be worse than saying that much.
        }
        markError("Someone else edited this form");
        return;
      }

      if (api?.status === 422) {
        // The client-side parse let this through, so the two schemas disagree —
        // most likely a migration this tab has not loaded. Still the author's
        // field to fix, and still not a toast.
        markInvalid(issuesFrom(api));
        return;
      }

      // A plan or role denial is answered by its own dialog; retrying would
      // reopen that dialog every few seconds.
      if (api?.status === 403 || api?.gate) {
        markError(api.message);
        return;
      }

      markError(err instanceof Error ? err.message : "Could not save");

      /*
        Retried, with the gap widening.

        A failed save used to set `error` and stop — and because the timer only
        ran while the state was `dirty`, nothing tried again until the author
        typed another character. A dropped connection therefore looked exactly
        like a permanent failure, with the work sitting in memory until it was
        typed at.
      */
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      const wait =
        api?.retryAfterSeconds != null
          ? api.retryAfterSeconds * 1_000
          : Math.min(RETRY_BASE_MS * 2 ** attempt.current, RETRY_MAX_MS);
      attempt.current += 1;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => void saveRef.current(attempted), wait);
    },
    [formId, markError, markInvalid, setConflict],
  );

  const save = useCallback(
    async function run(next: FormDoc): Promise<void> {
      if (inFlight.current) {
        pending.current = next;
        return;
      }

      /*
        Refused here rather than by the server.

        A 422 for a half-finished value is not an error the author needs shown as
        one — it is a field they have not finished with. Holding the document
        keeps every *other* edit in it safe, and the save goes out on its own as
        soon as the value parses.
      */
      const parsed = FormDocSchema.safeParse(next);
      if (!parsed.success) {
        markInvalid(
          parsed.error.issues.map((i) => ({
            path: i.path.map(String).join("."),
            code: i.code,
            message: i.message,
          })),
        );
        return;
      }

      const body = JSON.stringify(next);
      if (body === lastSentJson.current) {
        // Typed, and untyped again. What the server holds is already this.
        dirtySince.current = null;
        markSaved(Date.now(), useBuilderStore.getState().revision, next);
        return;
      }

      inFlight.current = true;
      markSaving();
      try {
        const revision = useBuilderStore.getState().revision;
        const result = (await mutateAsync({
          id: formId as never,
          data: { doc: next, ...(revision === null ? {} : { baseRevision: revision }) } as never,
        })) as { revision?: number } | undefined;

        lastSentJson.current = body;
        dirtySince.current = null;
        attempt.current = 0;
        markSaved(Date.now(), result?.revision ?? null, next);
        // The server has it; the local copy has done its job.
        clearLocalDraft(formId);

        /*
          The form's name lives in the document, so a rename lands here and
          nowhere else. The row carries a copy of it — the server writes both —
          and every list that names this form is reading that copy from a cache
          with a thirty-second life. Left alone, renaming a form and going back
          to the dashboard showed the old name for half a minute, which reads as
          a rename that did not save.
        */
        const key = getGetApiFormsByIdQueryKey(formId as never);
        const row = queryClient.getQueryData<{ title?: string }>(key);
        if (row && row.title !== next.title) {
          queryClient.setQueryData(key, { ...row, title: next.title });
          void invalidateForms(queryClient);
        }
      } catch (err) {
        await handleFailure(err, next);
      } finally {
        inFlight.current = false;
        const queued = pending.current;
        pending.current = null;
        // Back through the debouncer rather than straight into another request:
        // recursing here is what let a fast typist produce back-to-back
        // full-document uploads with no gap between them at all.
        if (queued) schedule.current(queued);
      }
    },
    [formId, mutateAsync, markSaving, markSaved, markInvalid, queryClient, handleFailure],
  );

  /**
   * The newest `save`, readable from a timer without making the debounce depend
   * on it. Written in an effect, never during render — a debounce that restarted
   * whenever the mutation object changed identity would push its own deadline
   * forward and, while the author kept working, never fire.
   */
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const debouncer = useAsyncDebouncer(
    useCallback((next: FormDoc) => saveRef.current(next), []),
    {
      /*
        Idle normally; the time remaining to the ceiling once an edit has been
        waiting. Supplied as a function rather than a number so one timer serves
        both, instead of the second one a `maxWait` would need.
      */
      wait: () => saveDelay(dirtySince.current, Date.now()),
      // Failures are handled inside `save`; this exists only so that nothing can
      // escape as an unhandled rejection.
      onError: () => {},
    },
  );

  useEffect(() => {
    schedule.current = (next: FormDoc) => void debouncer.maybeExecute(next);
  }, [debouncer]);

  useEffect(() => {
    if (!doc || saveState !== "dirty") return;
    if (dirtySince.current === null) dirtySince.current = Date.now();
    /*
      On disk first, and unconditionally.

      This is the write that makes the rest of the timing defensible: whatever
      the network does next, the edit is no longer only in memory.
    */
    writeLocalDraft(formId, { doc, revision: useBuilderStore.getState().revision, savedAt: Date.now() });
    void debouncer.maybeExecute(doc);
  }, [doc, saveState, formId, debouncer]);

  /**
   * Force any pending save to complete. Resolves once the document is persisted.
   *
   * Drains the buffered fields first: ⌘S, Publish and the leave-guard all reach
   * for the document from outside whichever input is focused, and without this
   * they would read a store one half-typed word behind the screen.
   */
  const flush = useCallback(async () => {
    flushBufferedValues();
    if (retryTimer.current) clearTimeout(retryTimer.current);
    debouncer.cancel();
    const state = useBuilderStore.getState();
    if (state.doc && state.saveState !== "saved") await saveRef.current(state.doc);
  }, [debouncer]);

  /*
    `visibilitychange` and `pagehide`, not `unload`.

    `beforeunload` is unreliable on exactly the devices that need this most —
    mobile browsers background a tab and may kill it without ever firing one, and
    registering a handler disqualifies the page from the back/forward cache.
    `hidden` is the last dependable moment to get the work down.
  */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      flushBufferedValues();
      const state = useBuilderStore.getState();
      if (state.doc && state.saveState !== "saved") {
        writeLocalDraft(formId, { doc: state.doc, revision: state.revision, savedAt: Date.now() });
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [formId, flush]);

  /*
    Kept only for the one thing it is still good for: asking a desktop user
    whether they meant to leave. A prompt, not a persistence mechanism.
  */
  useEffect(() => {
    const unsaved = saveState === "dirty" || saveState === "saving" || saveState === "invalid";
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [saveState]);

  /*
    Both save indicators have rendered an `offline` state since they were written
    and nothing has ever set it — there was no `navigator.onLine` listener
    anywhere in the app, so the branch was permanently dead.
  */
  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      attempt.current = 0;
      const state = useBuilderStore.getState();
      if (state.doc && state.saveState !== "saved") void saveRef.current(state.doc);
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    if (typeof navigator !== "undefined" && navigator.onLine === false) setOffline(true);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [setOffline]);

  useEffect(
    () => () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [],
  );

  return {
    flush,
    /** Try a failed save again now, for the indicator's Retry control. */
    retry: useCallback(() => {
      attempt.current = 0;
      const state = useBuilderStore.getState();
      if (state.doc) void saveRef.current(state.doc);
    }, []),
  };
}
