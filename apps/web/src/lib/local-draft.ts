"use client";

import type { FormDoc } from "@repo/form-schema";

/**
 * The working document, on disk, before the network has heard about it.
 *
 * This is what makes a lazier autosave safe rather than reckless. The editor
 * now waits three seconds after the last keystroke and at most ten under
 * continuous editing, and the only thing that made the old 800ms interval
 * defensible was that nothing else stood between a keystroke and a crash. A
 * local copy written on every committed edit costs nothing, needs no network,
 * and survives the cases `beforeunload` never covered — a backgrounded tab
 * killed on a phone, a browser crash, a lost battery.
 *
 * Deliberately not `zustand/middleware`'s `persist`: the builder store holds
 * fields that must not be restored (`shortcuts` carries bound handlers,
 * `pickerIndex` and `designOpen` are panel state), so it would need a
 * `partialize` anyway, and `persist` with an async store has a known race where
 * an empty initial state is written back over the saved one during hydration.
 * An explicit write from the one place that knows an edit was committed is both
 * smaller and easier to reason about.
 *
 * Modelled on `components/builder/ai-bar-thread.ts`, which is the only other
 * place in the app that handles namespacing, corruption and quota together.
 */

const DB_NAME = "chatform";
const DB_VERSION = 1;
const STORE = "drafts";

export interface LocalDraft {
  doc: FormDoc;
  /** The server revision this draft was based on. */
  revision: number | null;
  savedAt: number;
}

/**
 * A handle to the database, or null where there is no usable one.
 *
 * IndexedDB is absent during SSR and can throw rather than return empty in a
 * private window or with site data blocked, so every entry point below fails
 * soft. A draft cache that cannot be read is a missing convenience; a draft
 * cache that throws is a builder that will not open.
 */
let handle: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (handle) return handle;
  handle = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return handle;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return open().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const req = work(tx.objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/** Keep the draft for one form. Overwrites; there is only ever one per form. */
export function writeLocalDraft(formId: string, draft: LocalDraft): void {
  // Fire and forget. A save that has to wait for a disk write before it can
  // start is a slower save, and the network copy is the one that matters.
  void run("readwrite", (store) => store.put(draft, formId));
}

export function readLocalDraft(formId: string): Promise<LocalDraft | null> {
  return run<LocalDraft>("readonly", (store) => store.get(formId) as IDBRequest<LocalDraft>);
}

/** Called once the server has the work; the local copy has done its job. */
export function clearLocalDraft(formId: string): void {
  void run("readwrite", (store) => store.delete(formId));
}
