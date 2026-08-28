"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBlock } from "@repo/form-schema";

export interface ChatMessage {
  id: string;
  /**
   * `system` is a note about the conversation rather than a turn in it —
   * currently only "verified as …". It is a message so that it keeps its
   * place in the thread; rendering it outside the list pinned it to the
   * bottom, where it drifted further from the moment it described with every
   * subsequent answer.
   */
  role: "assistant" | "user" | "system";
  text: string;
  streaming?: boolean;
  /** Locally-rendered echo awaiting its server-confirmed twin. */
  optimistic?: boolean;
  /** The question this message answered, when it was an answer. */
  answeredRef?: string;
}

export interface QuestionState {
  block: PublicBlock;
  progress: { answered: number; totalEstimate: number; pct: number };
}

export interface EndingState {
  title: string;
  bodyMd: string;
  ctaLabel?: string;
  ctaUrl?: string;
  redirectUrl?: string;
  redirectDelaySec?: number;
}

export type ConnectionStatus = "connecting" | "ready" | "reconnecting" | "ended" | "error";

/** Everything answered, waiting on an explicit submit. */
export interface ReviewState {
  answers: { ref: string; title: string; display: string }[];
}

/** A response this device already sent for this form. */
export interface SubmittedState {
  at: number;
  answers: { ref: string; title: string; display: string }[];
}

/** The sign-in gate, while it is blocking the conversation. */
export interface AuthState {
  methods: ("google" | "phone")[];
  message: string;
  /** Set once a code has been sent; the card switches to the code step. */
  phoneSentTo: string | null;
  pending: boolean;
  error: string | null;
  /** Dev convenience: with no SMS provider the API returns the code. */
  devCode?: string;
}

/** Who the respondent turned out to be, once the gate is cleared. */
export interface VerifiedIdentity {
  provider: "google" | "phone";
  label: string;
  name: string | null;
  pictureUrl: string | null;
}

export interface UploadSpec {
  ref: string;
  accept: string[];
  maxFiles: number;
  maxSizeMB: number;
}

interface UseChatOptions {
  slug: string;
  apiOrigin: string;
  hiddenFields?: Record<string, string>;
  /** Existing session (preview mode) — skips session creation. */
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
}

const MAX_RECONNECT_ATTEMPTS = 8;

/**
 * Where a respondent's place in a form is remembered.
 *
 * Partial answers already persist server-side — every accepted answer is
 * written to D1 immediately — but the token that identifies the session lived
 * only in memory, so closing the tab orphaned it and reopening the link
 * started from scratch. Keeping it here is what makes the link resumable.
 *
 * Scoped per form, so two forms on one device do not collide.
 */
const storageKey = (slug: string) => `chatform:session:${slug}`;
/** Kept after completion so a return visit knows it has already been filled. */
const submittedKey = (slug: string) => `chatform:submitted:${slug}`;

function loadSaved(slug: string): { sessionId: string; token: string } | null {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { sessionId?: string; token?: string };
    return parsed.sessionId && parsed.token
      ? { sessionId: parsed.sessionId, token: parsed.token }
      : null;
  } catch {
    // Private mode, blocked storage, corrupt value — resume is a convenience,
    // never a requirement.
    return null;
  }
}

function saveSession(slug: string, session: { sessionId: string; token: string }): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(session));
  } catch {
    /* not fatal */
  }
}

function clearSaved(slug: string): void {
  try {
    localStorage.removeItem(storageKey(slug));
  } catch {
    /* not fatal */
  }
}

function loadSubmitted(slug: string): { sessionId: string; token: string; at: number } | null {
  try {
    const raw = localStorage.getItem(submittedKey(slug));
    if (!raw) return null;
    const p = JSON.parse(raw) as { sessionId?: string; token?: string; at?: number };
    return p.sessionId && p.token ? { sessionId: p.sessionId, token: p.token, at: p.at ?? 0 } : null;
  } catch {
    return null;
  }
}

function markSubmitted(slug: string, session: { sessionId: string; token: string }): void {
  try {
    localStorage.setItem(
      submittedKey(slug),
      JSON.stringify({ ...session, at: Date.now() }),
    );
  } catch {
    /* not fatal */
  }
}

function clearSubmitted(slug: string): void {
  try {
    localStorage.removeItem(submittedKey(slug));
  } catch {
    /* not fatal */
  }
}

/** Exponential backoff with jitter, capped — a fixed linear retry hammers a
 *  server that is already struggling. */
function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base * (0.7 + Math.random() * 0.6);
}

export function useChat({ slug, apiOrigin, hiddenFields, existingSession }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  const [ending, setEnding] = useState<EndingState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [escalatedRef, setEscalatedRef] = useState<string | null>(null);
  const [validationHint, setValidationHint] = useState<string | null>(null);
  const [uploadSpec, setUploadSpec] = useState<UploadSpec | null>(null);
  /** True between sending a turn and the agent's first token. */
  const [thinking, setThinking] = useState(false);
  const [rateLimited, setRateLimited] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);
  /**
   * True until we know which screen this visit belongs on.
   *
   * `start()` asks the server whether this device already completed the form,
   * and that is a network round trip. Without this flag the whole chat rendered
   * first and was then replaced by "You've already answered this" — a full
   * screen of layout thrown away in front of the respondent.
   */
  const [resolving, setResolving] = useState(true);
  /** True when a replay rebuilt a transcript we did not start in this tab. */
  const [resumed, setResumed] = useState(false);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [identity, setIdentity] = useState<VerifiedIdentity | null>(null);

  const sessionRef = useRef<{ sessionId: string; token: string } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      // A server-confirmed user message replaces its optimistic echo rather
      // than appearing twice.
      //
      // Matching on text equality was wrong for structured answers: tapping
      // the fourth star echoes "4/5" locally while the server confirms "4", so
      // nothing matched and both bubbles stayed on screen. There is only ever
      // one send in flight, so the pending echo is the one to replace — and it
      // keeps its own label, which says more than the raw value does.
      if (msg.role === "user") {
        const echoIndex = prev.findIndex((m) => m.optimistic);
        if (echoIndex !== -1) {
          const next = [...prev];
          next[echoIndex] = { ...msg, text: prev[echoIndex]!.text || msg.text };
          return next;
        }
      }
      return [...prev, msg];
    });
  }, []);

  const appendToken = useCallback((messageId: string, delta: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: m.text + delta } : m)));
  }, []);

  const reconnectRef = useRef<((sessionId: string, token: string, attempt: number) => void) | null>(null);

  const connectStream = useCallback(
    (sessionId: string, token: string, attempt: number) => {
      esRef.current?.close();
      // Replay rebuilds the full transcript from durable DO storage, so local
      // state is always cleared — otherwise re-streamed tokens double-append.
      setMessages([]);

      const es = new EventSource(`${apiOrigin}/p/sessions/${sessionId}/events?t=${token}`);
      esRef.current = es;

      es.addEventListener("session_ready", () => {
        setStatus("ready");
        setError(null);
        setResolving(false);
      });

      es.addEventListener("user_message", (e) => {
        const { messageId, text, blockRef } = JSON.parse((e as MessageEvent).data) as {
          messageId: string;
          text: string;
          blockRef?: string;
        };
        pushMessage({ id: messageId, role: "user", text, answeredRef: blockRef });
      });

      // The server confirms which question an answer landed against; attach it
      // to the most recent user message so it can be edited.
      es.addEventListener("answer_recorded", (e) => {
        const { ref } = JSON.parse((e as MessageEvent).data) as { ref: string };
        setMessages((prev) => {
          const idx = [...prev].reverse().findIndex((m) => m.role === "user" && !m.answeredRef);
          if (idx === -1) return prev;
          const realIdx = prev.length - 1 - idx;
          const next = [...prev];
          next[realIdx] = { ...next[realIdx]!, answeredRef: ref };
          return next;
        });
      });

      es.addEventListener("message_start", (e) => {
        const { messageId } = JSON.parse((e as MessageEvent).data) as { messageId: string };
        setThinking(false);
        pushMessage({ id: messageId, role: "assistant", text: "", streaming: true });
      });

      es.addEventListener("token", (e) => {
        const { messageId, delta } = JSON.parse((e as MessageEvent).data) as { messageId: string; delta: string };
        appendToken(messageId, delta);
      });

      es.addEventListener("message_end", (e) => {
        const { messageId } = JSON.parse((e as MessageEvent).data) as { messageId: string };
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)));
      });

      es.addEventListener("question", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as QuestionState;
        setQuestion(data);
        setThinking(false);
        setEscalatedRef(null);
        setValidationHint(null);
      });

      es.addEventListener("validation_error", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message: string };
        setValidationHint(message);
        setThinking(false);
      });

      es.addEventListener("upload_request", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as Partial<UploadSpec> & { ref: string };
        setUploadSpec({
          ref: data.ref,
          accept: data.accept ?? ["image/png", "image/jpeg", "application/pdf"],
          maxFiles: data.maxFiles ?? 1,
          maxSizeMB: data.maxSizeMB ?? 10,
        });
      });

      es.addEventListener("upload_received", () => setUploadSpec(null));

      es.addEventListener("escalate_ui", (e) => {
        const { ref } = JSON.parse((e as MessageEvent).data) as { ref: string };
        setEscalatedRef(ref);
        setThinking(false);
      });

      es.addEventListener("branch_jump", () => setThinking(true));

      // Declared in lib/events.ts and previously never emitted by the server
      // and never listened for here.
      es.addEventListener("error_event", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message?: string };
        setError(message ?? "Something went wrong");
        setThinking(false);
      });

      es.addEventListener("rate_limited", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message?: string };
        setRateLimited(message ?? "You're going a bit fast — give it a moment.");
        setThinking(false);
      });

      es.addEventListener("auth_required", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as AuthState;
        // Replay re-delivers this on every reconnect. Keep whatever step the
        // card had reached — re-mounting it at "enter your number" would throw
        // away a code the respondent is in the middle of typing.
        setAuth((prev) =>
          prev ?? { methods: data.methods, message: data.message, phoneSentTo: null, pending: false, error: null },
        );
        setThinking(false);
      });

      es.addEventListener("auth_verified", (e) => {
        const who = JSON.parse((e as MessageEvent).data) as VerifiedIdentity;
        setIdentity(who);
        setAuth(null);
        setMessages((prev) =>
          // Replay re-delivers this event, and it must not stack up.
          prev.some((m) => m.id === "sys_verified")
            ? prev
            : [...prev, { id: "sys_verified", role: "system", text: `Verified as ${who.label}` }],
        );
      });

      es.addEventListener("review", (e) => {
        setReview(JSON.parse((e as MessageEvent).data) as ReviewState);
        setQuestion(null);
        setThinking(false);
      });

      es.addEventListener("ending", (e) => {
        const { ending } = JSON.parse((e as MessageEvent).data) as { ending: EndingState };
        setEnding(ending);
        setQuestion(null);
        setReview(null);
        setThinking(false);
      });

      es.addEventListener("complete", () => {
        setStatus("ended");
        // The active session is done, but remember that this device answered —
        // a return visit should say so rather than silently starting over.
        const finished = sessionRef.current;
        clearSaved(slug);
        if (finished) markSubmitted(slug, finished);
        es.close();
      });

      es.onerror = () => {
        es.close();
        if (attempt < MAX_RECONNECT_ATTEMPTS) {
          // Say we are reconnecting rather than silently blanking the UI.
          setStatus("reconnecting");
          retryTimer.current = setTimeout(
            () => reconnectRef.current?.(sessionId, token, attempt + 1),
            backoffMs(attempt),
          );
        } else {
          setStatus("error");
          setError("We lost the connection and couldn't get it back.");
        }
      };
    },
    [apiOrigin, appendToken, pushMessage, slug],
  );

  useEffect(() => {
    reconnectRef.current = connectStream;
  }, [connectStream]);

  const start = useCallback(async () => {
    if (existingSession) {
      sessionRef.current = { sessionId: existingSession.sessionId, token: existingSession.token };
      connectStream(existingSession.sessionId, existingSession.token, 0);
      return;
    }
    if (sessionRef.current) {
      connectStream(sessionRef.current.sessionId, sessionRef.current.token, 0);
      return;
    }
    if (pendingRef.current) {
      await pendingRef.current;
      const existing = sessionRef.current as { sessionId: string; token: string } | null;
      if (existing) connectStream(existing.sessionId, existing.token, 0);
      return;
    }
    // Already answered on this device? Say so instead of starting over.
    const done = loadSubmitted(slug);
    if (done) {
      try {
        const probe = await fetch(`${apiOrigin}/p/sessions/${done.sessionId}?t=${done.token}`);
        if (probe.ok) {
          const state = (await probe.json()) as {
            status?: string;
            summary?: SubmittedState["answers"];
            completedAt?: number | null;
          };
          if (state.status === "completed") {
            setSubmitted({ at: state.completedAt ?? done.at, answers: state.summary ?? [] });
            setStatus("ended");
            setResolving(false);
            return;
          }
        }
        clearSubmitted(slug);
      } catch {
        clearSubmitted(slug);
      }
    }

    // Reuse the saved session when the form is being reopened, so the
    // respondent lands where they left off rather than at question one.
    const saved = loadSaved(slug);
    if (saved) {
      try {
        const probe = await fetch(
          `${apiOrigin}/p/sessions/${saved.sessionId}?t=${saved.token}`,
        );
        if (probe.ok) {
          const state = (await probe.json()) as { status?: string };
          if (state.status === "active") {
            sessionRef.current = saved;
            setResumed(true);
            connectStream(saved.sessionId, saved.token, 0);
            return;
          }
        }
        // Completed, abandoned or gone — do not resurrect it.
        clearSaved(slug);
      } catch {
        clearSaved(slug);
      }
    }

    pendingRef.current = (async () => {
      try {
        const res = await fetch(`${apiOrigin}/p/forms/${slug}/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hiddenFields }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(body?.error?.message ?? "Could not start session");
        }
        const data = (await res.json()) as { sessionId: string; respondentToken: string };
        sessionRef.current = { sessionId: data.sessionId, token: data.respondentToken };
        saveSession(slug, sessionRef.current);
        connectStream(data.sessionId, data.respondentToken, 0);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Connection failed");
        setResolving(false);
      } finally {
        pendingRef.current = null;
      }
    })();
    await pendingRef.current;
  }, [slug, apiOrigin, hiddenFields, connectStream, existingSession]);

  /** Manual retry after a hard failure — replaces a full page reload. */
  const retry = useCallback(() => {
    setError(null);
    setStatus("connecting");
    const s = sessionRef.current;
    if (s) connectStream(s.sessionId, s.token, 0);
    else void start();
  }, [connectStream, start]);

  const post = useCallback(
    async (path: string, body: unknown) => {
      const session = sessionRef.current;
      if (!session) return;
      try {
        const res = await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-respondent-token": session.token },
          body: JSON.stringify(body),
        });
        if (res.status === 429) {
          setRateLimited("You're going a bit fast — give it a moment.");
          setThinking(false);
        } else if (!res.ok) {
          // Any other refusal. `thinking` gates the question's controls now, so
          // leaving it true on a 4xx would hide the chips with nothing coming
          // back.
          setThinking(false);
        }
      } catch {
        setThinking(false);
        setError("That didn't send. Check your connection and try again.");
      }
    },
    [apiOrigin],
  );

  const send = useCallback(
    async (text: string) => {
      // Echo locally so the bubble appears the instant they hit send; the
      // server's `user_message` event replaces it on arrival.
      pushMessage({ id: `local_${crypto.randomUUID()}`, role: "user", text, optimistic: true });
      setThinking(true);
      setValidationHint(null);
      await post("messages", { type: "text", text });
    },
    [post, pushMessage],
  );

  const sendStructured = useCallback(
    async (ref: string, value: unknown, display?: string) => {
      // `display` used to be discarded (`void display`), so tapping a chip
      // showed nothing until the server echoed it back.
      if (display) {
        pushMessage({ id: `local_${crypto.randomUUID()}`, role: "user", text: display, optimistic: true });
      }
      setThinking(true);
      setValidationHint(null);
      await post("messages", { type: "structured", ref, value });
    },
    [post, pushMessage],
  );

  const sendAction = useCallback(
    async (action: "skip" | "restart" | "stop" | "submit") => {
      setThinking(true);
      await post("actions", { action });
    },
    [post],
  );

  /** Go back and change a previous answer. */
  const editAnswer = useCallback(
    async (ref: string) => {
      setThinking(true);
      setEnding(null);
      setReview(null);
      await post("actions", { action: "edit", ref });
    },
    [post],
  );

  /** Abandon this attempt and begin a fresh one. */
  const startOver = useCallback(async () => {
    clearSaved(slug);
    clearSubmitted(slug);
    setResolving(true);
    setSubmitted(null);
    sessionRef.current = null;
    esRef.current?.close();
    esRef.current = null;
    setMessages([]);
    setQuestion(null);
    setEnding(null);
    setReview(null);
    setResumed(false);
    setAuth(null);
    setIdentity(null);
    setError(null);
    setStatus("connecting");
    await start();
  }, [slug, start]);

  /**
   * Sign-in calls, which differ from every other client → server call here:
   * they need the response body, both to surface a precise failure ("that code
   * didn't match, 3 tries left") and because the code arrives in it in dev.
   */
  const authPost = useCallback(
    async (path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
      const session = sessionRef.current;
      if (!session) return { ok: false, data: {} };
      try {
        const res = await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/auth/${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-respondent-token": session.token },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        return { ok: res.ok, data };
      } catch {
        return { ok: false, data: { error: { message: "Check your connection and try again." } } };
      }
    },
    [apiOrigin],
  );

  const authError = (data: Record<string, unknown>): string =>
    ((data.error as { message?: string } | undefined)?.message) ?? "That didn't work. Please try again.";

  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      setAuth((a) => (a ? { ...a, pending: true, error: null } : a));
      const { ok, data } = await authPost("google", { idToken });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        setThinking(true);
        return;
      }
      setAuth((a) => (a ? { ...a, pending: false, error: authError(data) } : a));
    },
    [authPost],
  );

  const requestPhoneCode = useCallback(
    async (phone: string, dialHint?: string) => {
      setAuth((a) => (a ? { ...a, pending: true, error: null } : a));
      const { ok, data } = await authPost("phone/start", { phone, dialHint });
      setAuth((a) =>
        a
          ? ok
            ? { ...a, pending: false, error: null, phoneSentTo: String(data.destination ?? phone), devCode: data.devCode as string | undefined }
            : { ...a, pending: false, error: authError(data) }
          : a,
      );
    },
    [authPost],
  );

  const verifyPhoneCode = useCallback(
    async (code: string) => {
      setAuth((a) => (a ? { ...a, pending: true, error: null } : a));
      const { ok, data } = await authPost("phone/verify", { code });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        setThinking(true);
        return;
      }
      setAuth((a) => (a ? { ...a, pending: false, error: authError(data) } : a));
    },
    [authPost],
  );

  /** Back out of the code step to correct a mistyped number. */
  const changePhoneNumber = useCallback(() => {
    setAuth((a) => (a ? { ...a, phoneSentTo: null, error: null, devCode: undefined } : a));
  }, []);

  const getUploadBase = useCallback(() => {
    const s = sessionRef.current;
    return s ? `${apiOrigin}/p/sessions/${s.sessionId}/uploads` : null;
  }, [apiOrigin]);

  const getRespondentToken = useCallback(() => sessionRef.current?.token ?? null, []);

  useEffect(() => {
    const t = setTimeout(() => void start(), 0);
    return () => {
      clearTimeout(t);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [start]);

  return {
    messages,
    question,
    review,
    submitted,
    ending,
    status,
    error,
    thinking,
    resolving,
    rateLimited,
    resumed,
    auth,
    identity,
    signInWithGoogle,
    requestPhoneCode,
    verifyPhoneCode,
    changePhoneNumber,
    escalatedRef,
    validationHint,
    uploadSpec,
    getUploadBase,
    getRespondentToken,
    send,
    sendStructured,
    sendAction,
    editAnswer,
    startOver,
    retry,
    dismissRateLimit: () => setRateLimited(null),
  };
}
