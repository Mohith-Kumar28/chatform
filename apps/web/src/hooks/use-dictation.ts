"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Dictation, using the speech recogniser the browser already ships.
 *
 * No API key, no audio upload of our own, no second vendor on the bill: the
 * Web Speech API is built into the browser, and in Chrome it will run the model
 * on the device when the language pack is there (`processLocally`), which keeps
 * the audio off the network entirely. Where it is not, the browser falls back
 * to its own recognition service — still the browser's arrangement with its
 * user, not a service we introduced.
 *
 * Firefox has no implementation at all, so `supported` is false there and the
 * caller is expected to render nothing rather than a button that cannot work.
 */

/*
 * Minimal typings. `SpeechRecognition` is not in TypeScript's DOM library —
 * the spec has been a draft for a decade — so this declares exactly the surface
 * used below and nothing more. `processLocally` and `available()` are Chrome's
 * on-device additions and are optional everywhere.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlternative;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechResultList;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  processLocally?: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type SpeechRecognitionCtor = {
  new (): SpeechRecognitionLike;
  available?: (opts: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

function recogniser(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Whether the browser has a recogniser never changes, so there is nothing to
// subscribe to — the store exists only for its separate server snapshot.
const noSubscribe = () => () => {};
const hasRecogniser = () => recogniser() !== null;
const noRecogniser = () => false;

/** What went wrong, in words a person can act on. */
const MESSAGES: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it for this site and try again.",
  "service-not-allowed": "Microphone access is blocked. Allow it for this site and try again.",
  "audio-capture": "No microphone found.",
  network: "Speech recognition could not reach the browser's service.",
};

export interface Dictation {
  /** False where the browser has no recogniser — render no button at all. */
  supported: boolean;
  listening: boolean;
  toggle: () => void;
  stop: () => void;
}

export function useDictation({
  text,
  onChange,
  onError,
}: {
  /** What is already in the field. Speech is appended to it, never over it. */
  text: string;
  onChange: (next: string) => void;
  onError?: (message: string) => void;
}): Dictation {
  /*
   * False on the server and through hydration, the real answer after.
   *
   * A `useState` initialiser answered it on both sides: the server has no
   * `window` and drew no mic, the browser has a recogniser and drew one, and
   * any composer rendered on the first paint failed hydration over it. The
   * server snapshot is what hydration compares against; React switches to the
   * client one straight after.
   */
  const supported = useSyncExternalStore(noSubscribe, hasRecogniser, noRecogniser);
  const [listening, setListening] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  /** The field as it was when the mic was switched on. */
  const baseRef = useRef("");
  /** Everything the recogniser has committed this session. */
  const finalRef = useRef("");
  /** Whether the user still wants to be heard — see the restart in `onend`. */
  const wantRef = useRef(false);
  /** On-device availability, resolved once rather than inside the click. */
  const localRef = useRef(false);

  /*
   * The callbacks and the field, as of the last render.
   *
   * The recogniser's handlers outlive the render that installed them — a
   * session runs for as long as somebody is talking — so they read the current
   * value through here rather than closing over a stale one. Written in an
   * effect, not during render, which is the rule a ref has to follow to stay
   * safe under a concurrent re-render that never commits.
   */
  const latest = useRef({ text, onChange, onError });
  useEffect(() => {
    latest.current = { text, onChange, onError };
  });

  // Asked once, on mount, because `start()` has to stay synchronous with the
  // click: awaiting anything there is a gesture spent waiting on a promise.
  useEffect(() => {
    const Ctor = recogniser();
    if (!Ctor?.available) return;
    let live = true;
    void Ctor.available({ langs: [navigator.language || "en-US"], processLocally: true })
      .then((state) => {
        if (live) localRef.current = state === "available";
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recogniser();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    // Continuous, because dictating a change to a form is a sentence or three
    // and the one-shot mode hangs up after the first pause.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    if (localRef.current) rec.processLocally = true;

    baseRef.current = latest.current.text;
    finalRef.current = "";

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      const spoken = (finalRef.current + interim).trim();
      const base = baseRef.current.trim();
      // Interim results replace each other rather than accumulating, which is
      // what makes the field read like speech arriving rather than like text
      // being appended twice.
      latest.current.onChange(base && spoken ? `${base} ${spoken}` : base || spoken);
    };

    rec.onerror = (e) => {
      // Silence is not a failure — the recogniser reports `no-speech` after a
      // pause and `aborted` when we stop it ourselves. Both end the session,
      // and `onend` decides whether to pick it back up.
      if (e.error === "no-speech" || e.error === "aborted") return;
      wantRef.current = false;
      const message = MESSAGES[e.error];
      if (message) latest.current.onError?.(message);
    };

    rec.onend = () => {
      // Chrome ends a session on a long silence even in continuous mode. While
      // the user has not pressed stop, that is a pause in a sentence, not the
      // end of one — so the session restarts and `finalRef` carries the words
      // already said across the seam.
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          // Already starting, or the tab lost the microphone. Fall through.
        }
      }
      wantRef.current = false;
      setListening(false);
    };

    try {
      rec.start();
    } catch {
      latest.current.onError?.("Could not start the microphone.");
      return;
    }
    recRef.current = rec;
    wantRef.current = true;
    setListening(true);
  }, []);

  const toggle = useCallback(() => {
    if (wantRef.current) stop();
    else start();
  }, [start, stop]);

  // A recogniser left running after its component is gone holds the microphone
  // open, and the tab keeps showing the recording indicator.
  useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.abort();
    },
    [],
  );

  return { supported, listening, toggle, stop };
}
