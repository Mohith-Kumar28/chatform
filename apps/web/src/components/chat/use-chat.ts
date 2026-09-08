"use client";

import { emitEmbedEvent } from "./embed-bridge";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBlock } from "@repo/form-schema";

export interface ChatMessage {
  /**
   * Stable for the life of the bubble, and therefore usable as a React key.
   *
   * For an answer this is the *local* echo's id, kept even after the server
   * confirms the message under an id of its own — see `serverId`.
   */
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
  /**
   * The id the server knows this message by, once it has confirmed one.
   *
   * Kept beside `id` rather than replacing it. Swapping the id on confirmation
   * changed the bubble's React key, so React unmounted the pale bubble and
   * mounted a fresh one in its place: `animate-message-in` replayed and every
   * accepted answer visibly flinched a moment after it was sent. Same key,
   * same element, one prop change — the only thing that moves now is opacity.
   */
  serverId?: string;
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
  /**
   * `screen_out` means the form refused this response.
   *
   * Optional because the event is also replayed from sessions that finished
   * before endings had a kind, and a stored ending read back without one is a
   * success — the only reading that was ever possible then.
   */
  kind?: "success" | "screen_out";
  /** On a screen-out, the requirements this response missed. Already narrowed server-side. */
  requirements?: string[];
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
  /**
   * When the most recent code went out. Drives the resend cooldown, and is a
   * timestamp rather than a boolean so that asking again for the *same* number
   * still restarts the countdown — `phoneSentTo` does not change on a resend.
   */
  phoneSentAt: number | null;
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
  /**
   * Mint a fresh preview session. Only meaningful alongside `existingSession`:
   * a preview cannot create its own session — the draft it runs against is not
   * published, so there is no public slug to post to — and without this
   * "Start over" reconnected to the session it was trying to leave.
   */
  onRestart?: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 8;

/**
 * How long the stream may say nothing before we assume it is dead.
 *
 * The server pings every 15s, so silence past three of them is not a quiet
 * conversation — it is a connection that went away without an error. That
 * happens routinely: a sleeping phone, a network hand-off, a proxy that drops
 * an idle stream. `EventSource` does not always fire `onerror` for it, so the
 * page sat on the typing dots with the answer already recorded server-side and
 * the reply already sent to a socket nobody was reading. Reconnecting replays
 * everything missed (the seq ratchet makes that free), which is exactly what a
 * manual page refresh used to do by hand.
 */
const STALL_MS = 45000;

/**
 * How long the typing indicator may run against a silent stream before we
 * treat it as a bug rather than a wait.
 *
 * Nothing above this line is supposed to be able to strand it — but "supposed
 * to" is not a good enough guarantee for the one thing standing between a
 * respondent and the controls they need. Whatever the cause (a flag armed
 * after its own turn had already landed, an event lost to a half-open socket,
 * a turn the server abandoned mid-flight), dots over a stream that has said
 * nothing while the screen already holds something to act on is a stuck form,
 * and a stuck form has to get itself unstuck.
 */
const THINKING_STALE_MS = 6000;

/**
 * ...and how long before we stop reasoning about it and ask the server.
 *
 * Longer, because this is the case where the screen holds nothing to fall back
 * on, so the only safe recovery is to have the conversation re-state itself —
 * the same thing a page reload does, minus the reload.
 */
const RESYNC_AFTER_MS = 12000;

/** Give up asking after this many; three failures is a real outage, not a blip. */
const MAX_RESYNC_ATTEMPTS = 3;

/**
 * The longest the boot screen may hold the frame.
 *
 * `resolving` exists to answer one question — fresh conversation, resumed one,
 * or "you have already answered this" — and it was lowered only by the
 * stream's readiness signal. A stream that connects but never says it is ready
 * therefore held a full-screen skeleton indefinitely, hiding the error banner
 * and the Retry button that were the way out of it. Past this, the chat is
 * shown regardless: a header that says "Reconnecting…" is a state a person can
 * understand and act on, and a spinner with no end is not.
 */
const BOOT_MAX_MS = 8000;

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

export function useChat({ slug, apiOrigin, hiddenFields, existingSession, onRestart }: UseChatOptions) {
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
  /**
   * True while the answer to the question on screen is in flight.
   *
   * Deliberately not `thinking`. `thinking` means "the agent is composing" and
   * is armed by things that have nothing to do with the current controls — a
   * branch jump, a sign-in round trip — so using it to gate the answer chips
   * meant any unrelated flag could take the only way to answer off the screen,
   * and one that got stuck took it away permanently. This one is armed by a
   * send and disarmed by the server's reply to that send, and nothing else
   * touches it.
   */
  const [answering, setAnswering] = useState(false);
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

  /** A preview runs against a draft and must leave no trace on the device. */
  const ephemeral = Boolean(existingSession);

  const sessionRef = useRef<{ sessionId: string; token: string } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the current stream last said anything at all, pings included. */
  const lastEventAtRef = useRef(0);
  const stallTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /**
   * The id of the echo this device is still waiting on a server twin for.
   *
   * It used to be enough to look for "any message still marked optimistic",
   * but an echo only settles when the server accepts the answer — and a
   * *rejected* answer never produces a `user_message`, so its echo stayed
   * optimistic forever and the next send inherited its text. That is how
   * picking "Email, Slack" after a refused "Email, Slack, SMS, WhatsApp"
   * printed the refused answer as the accepted one, and how a typed message
   * could vanish into an older bubble entirely. One id, cleared the moment it
   * is claimed or abandoned, cannot do that.
   */
  const pendingEchoRef = useRef<string | null>(null);

  const pushMessage = useCallback((msg: ChatMessage) => {
    // Claimed here, not inside the updater. React runs updaters twice in
    // development, and a ref cleared on the first run made the second run —
    // the one whose result is kept — append instead of replace, so every
    // answer showed up twice: once pale, once solid.
    // `!msg.optimistic`: the echo must not claim itself. Arming the ref before
    // pushing the local bubble meant `pushMessage` consumed it on the way in,
    // leaving nothing for the server's twin to replace — two bubbles per
    // answer, one pale and one solid.
    const echoId = msg.role === "user" && !msg.optimistic ? pendingEchoRef.current : null;
    if (echoId) pendingEchoRef.current = null;

    setMessages((prev) => {
      // Matched on both ids: a confirmed answer keeps its echo's `id`, so
      // without `serverId` a redelivery of the same server message would not
      // recognise itself and would append a duplicate.
      if (prev.some((m) => m.id === msg.id || m.serverId === msg.id)) return prev;
      // A server-confirmed user message replaces its own optimistic echo
      // rather than appearing twice.
      //
      // Matching on text equality was wrong for structured answers: tapping
      // the fourth star echoes "4/5" locally while the server confirms "4", so
      // nothing matched and both bubbles stayed on screen. The echo keeps its
      // own label, which says more than the raw value does.
      if (echoId) {
        const echoIndex = prev.findIndex((m) => m.id === echoId);
        if (echoIndex !== -1) {
          const next = [...prev];
          next[echoIndex] = {
            ...msg,
            id: prev[echoIndex]!.id,
            serverId: msg.id,
            text: prev[echoIndex]!.text || msg.text,
          };
          return next;
        }
      }
      return [...prev, msg];
    });
  }, []);

  /** Let go of an echo the server will never confirm, so nothing inherits it. */
  const settleEcho = useCallback(() => {
    const id = pendingEchoRef.current;
    if (!id) return;
    pendingEchoRef.current = null;
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, optimistic: false } : m)));
  }, []);

  /**
   * The server has spoken: nothing this device sent is still in flight.
   *
   * Every event that resolves a turn goes through here, so "the dots are down"
   * and "the controls are live again" can never disagree.
   */
  const settleTurn = useCallback(() => {
    setThinking(false);
    setAnswering(false);
  }, []);

  const appendToken = useCallback((messageId: string, delta: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, text: m.text + delta } : m)));
  }, []);

  const reconnectRef = useRef<((sessionId: string, token: string, attempt: number) => void) | null>(null);

  /**
   * The highest event sequence this device has already applied.
   *
   * Every SSE frame carries `id: <seq>`, which the browser hands back as
   * `lastEventId`. The server replays the whole transcript to any new
   * connection, so without this a reconnect re-ran every event: tokens
   * double-appended, which is why the thread used to be wiped (`setMessages([])`)
   * on connect — and wiping it meant the entire conversation blanked for the
   * length of a network round trip and then rebuilt itself in front of the
   * respondent. That blank-and-rebuild is the flicker. Ratcheting on seq makes
   * replay a no-op instead, so a reconnect is invisible.
   */
  const lastSeqRef = useRef(0);
  /** Which session the current thread was built from. */
  const streamSessionRef = useRef<string | null>(null);

  const connectStream = useCallback(
    (sessionId: string, token: string, attempt: number) => {
      esRef.current?.close();
      if (stallTimer.current) clearInterval(stallTimer.current);
      // Only a *different* conversation starts from an empty thread. Replay of
      // the same one is deduped by seq below.
      if (streamSessionRef.current !== sessionId) {
        streamSessionRef.current = sessionId;
        lastSeqRef.current = 0;
        pendingEchoRef.current = null;
        setMessages([]);
      }

      const es = new EventSource(`${apiOrigin}/p/sessions/${sessionId}/events?t=${token}`);
      esRef.current = es;
      lastEventAtRef.current = Date.now();

      const alive = () => {
        lastEventAtRef.current = Date.now();
      };
      // Not routed through `on`: a ping carries no seq and means only "still
      // here", which is precisely what the watchdog below needs to hear.
      es.addEventListener("ping", alive);

      stallTimer.current = setInterval(() => {
        if (Date.now() - lastEventAtRef.current < STALL_MS) return;
        if (stallTimer.current) clearInterval(stallTimer.current);
        es.close();
        setStatus("reconnecting");
        // attempt 0: this is a fresh problem, not a continuation of a backoff.
        reconnectRef.current?.(sessionId, token, 0);
      }, 10000);

      /**
       * Wrap a listener so an event that has already been applied is dropped.
       *
       * SSE is ordered, so a monotonic high-water mark is enough. `session_ready`
       * and `ping` are per-connection and carry seq 0 — they are never skipped.
       */
      const on = (type: string, handler: (e: MessageEvent) => void) => {
        es.addEventListener(type, (raw) => {
          const e = raw as MessageEvent;
          alive();
          const seq = Number(e.lastEventId);
          if (Number.isFinite(seq) && seq > 0) {
            if (seq <= lastSeqRef.current) return;
            lastSeqRef.current = seq;
          }
          handler(e);
        });
      };

      es.addEventListener("session_ready", () => {
        alive();
        setStatus("ready");
        setError(null);
        setResolving(false);
      });

      on("user_message", (e) => {
        const { messageId, text, blockRef } = JSON.parse((e as MessageEvent).data) as {
          messageId: string;
          text: string;
          blockRef?: string;
        };
        pushMessage({ id: messageId, role: "user", text, answeredRef: blockRef });
      });

      /**
       * The server confirms which question an answer landed against, so the
       * bubble can offer "change this answer".
       *
       * It names the message explicitly. Guessing — "the last user message
       * without a ref" — walked backwards past the answer it meant whenever an
       * earlier turn had failed validation, and pinned the pencil to the wrong
       * bubble.
       */
      on("answer_recorded", (e) => {
        const { ref, messageId } = JSON.parse((e as MessageEvent).data) as {
          ref: string;
          messageId?: string;
        };
        /**
         * The ref, never the value.
         *
         * A host page learns that a question was answered, not what was said —
         * putting respondent answers into someone else's JavaScript by default
         * is not a default anyone asked for. Webhooks and the responses API are
         * where the data lives.
         */
        emitEmbedEvent({ type: "answer", ref });
        setMessages((prev) => {
          const idx = messageId
            ? prev.findIndex((m) => m.serverId === messageId || m.id === messageId)
            : (() => {
                const r = [...prev].reverse().findIndex((m) => m.role === "user" && !m.answeredRef);
                return r === -1 ? -1 : prev.length - 1 - r;
              })();
          if (idx === -1) return prev;
          const next = [...prev];
          next[idx] = { ...next[idx]!, answeredRef: ref };
          return next;
        });
      });

      on("message_start", (e) => {
        const { messageId } = JSON.parse((e as MessageEvent).data) as { messageId: string };
        setThinking(false);
        pushMessage({ id: messageId, role: "assistant", text: "", streaming: true });
      });

      on("token", (e) => {
        const { messageId, delta } = JSON.parse((e as MessageEvent).data) as { messageId: string; delta: string };
        appendToken(messageId, delta);
      });

      on("message_end", (e) => {
        const { messageId } = JSON.parse((e as MessageEvent).data) as { messageId: string };
        setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, streaming: false } : m)));
      });

      on("question", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as QuestionState;
        // Tell the host page which question is on screen, if we are framed.
        emitEmbedEvent({
          type: "question",
          ref: data.block?.ref,
          blockType: data.block?.type,
          answered: data.progress?.answered,
          total: data.progress?.totalEstimate,
        });
        setQuestion(data);
        settleTurn();
        // Cleared when the conversation moves on, not when the *same* question
        // is re-stated. Escalation now re-emits its own question so the
        // controls come back with it, and clearing unconditionally threw the
        // escalation away in the same breath that raised it.
        setEscalatedRef((prev) => (prev && prev === data.block?.ref ? prev : null));
        setValidationHint(null);
        // A new question means the last one is behind us; a "slow down" notice
        // that outlived it is just noise.
        setRateLimited(null);
      });

      on("validation_error", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message: string };
        setValidationHint(message);
        settleTurn();
        // A refused answer never gets a server twin. Settle its echo here or it
        // stays pale forever and the next answer inherits its text.
        settleEcho();
      });

      on("upload_request", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as Partial<UploadSpec> & { ref: string };
        setUploadSpec({
          ref: data.ref,
          accept: data.accept ?? ["image/png", "image/jpeg", "application/pdf"],
          maxFiles: data.maxFiles ?? 1,
          maxSizeMB: data.maxSizeMB ?? 10,
        });
      });

      on("upload_received", () => setUploadSpec(null));

      on("escalate_ui", (e) => {
        const { ref } = JSON.parse((e as MessageEvent).data) as { ref: string };
        setEscalatedRef(ref);
        settleTurn();
      });

      on("branch_jump", () => setThinking(true));

      // Declared in lib/events.ts and previously never emitted by the server
      // and never listened for here.
      on("error_event", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message?: string };
        setError(message ?? "Something went wrong");
        settleTurn();
      });

      on("rate_limited", (e) => {
        const { message } = JSON.parse((e as MessageEvent).data) as { message?: string };
        setRateLimited(message ?? "You're going a bit fast — give it a moment.");
        settleTurn();
      });

      on("auth_required", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as AuthState;
        // Replay re-delivers this on every reconnect. Keep whatever step the
        // card had reached — re-mounting it at "enter your number" would throw
        // away a code the respondent is in the middle of typing.
        setAuth((prev) =>
          prev ?? {
            methods: data.methods,
            message: data.message,
            phoneSentTo: null,
            phoneSentAt: null,
            pending: false,
            error: null,
          },
        );
        settleTurn();
      });

      on("auth_verified", (e) => {
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

      on("review", (e) => {
        setReview(JSON.parse((e as MessageEvent).data) as ReviewState);
        setQuestion(null);
        settleTurn();
      });

      on("ending", (e) => {
        const { ending } = JSON.parse((e as MessageEvent).data) as { ending: EndingState };
        setEnding(ending);
        setQuestion(null);
        setReview(null);
        settleTurn();
      });

      on("complete", (e) => {
        const payload = (() => {
          try {
            return JSON.parse((e as MessageEvent).data) as { submissionId?: string; durationMs?: number };
          } catch {
            return {};
          }
        })();
        emitEmbedEvent({
          type: "complete",
          responseId: payload.submissionId,
          durationMs: payload.durationMs,
        });
        setStatus("ended");
        settleTurn();
        // The active session is done, but remember that this device answered —
        // a return visit should say so rather than silently starting over.
        //
        // Except in a preview, which is a rehearsal: its slug is derived from
        // the draft's title, so recording it here both collided with the real
        // published form on this device and made the builder's second preview
        // open on "You've already answered this".
        const finished = sessionRef.current;
        if (!ephemeral) {
          clearSaved(slug);
          if (finished) markSubmitted(slug, finished);
        }
        es.close();
      });

      es.onerror = () => {
        es.close();
        if (stallTimer.current) clearInterval(stallTimer.current);
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
    [apiOrigin, appendToken, ephemeral, pushMessage, settleEcho, settleTurn, slug],
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
          settleTurn();
          settleEcho();
        } else if (!res.ok) {
          // Any other refusal: nothing is coming back over the stream for this
          // turn, so the dots have to come down and the controls have to come
          // back here, or the refusal reads as a hang.
          settleTurn();
          settleEcho();
        }
      } catch {
        settleTurn();
        setError("That didn't send. Check your connection and try again.");
        settleEcho();
      }
    },
    [apiOrigin, settleEcho, settleTurn],
  );

  const send = useCallback(
    async (text: string) => {
      // Echo locally so the bubble appears the instant they hit send; the
      // server's `user_message` event replaces this exact id on arrival.
      const id = `local_${crypto.randomUUID()}`;
      pendingEchoRef.current = id;
      pushMessage({ id, role: "user", text, optimistic: true });
      setThinking(true);
      setAnswering(true);
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
        const id = `local_${crypto.randomUUID()}`;
        pendingEchoRef.current = id;
        pushMessage({ id, role: "user", text: display, optimistic: true });
      }
      setThinking(true);
      setAnswering(true);
      setValidationHint(null);
      await post("messages", { type: "structured", ref, value });
    },
    [post, pushMessage],
  );

  const sendAction = useCallback(
    async (action: "skip" | "restart" | "stop" | "submit") => {
      setThinking(true);
      setAnswering(true);
      await post("actions", { action });
    },
    [post],
  );

  /** Go back and change a previous answer. */
  const editAnswer = useCallback(
    async (ref: string) => {
      setThinking(true);
      setAnswering(true);
      setEnding(null);
      setReview(null);
      await post("actions", { action: "edit", ref });
    },
    [post],
  );

  /** Abandon this attempt and begin a fresh one. */
  const startOver = useCallback(async () => {
    if (ephemeral) {
      // A preview cannot create its own session; its owner does. Everything
      // local is cleared here and the new session arrives as a prop.
      esRef.current?.close();
      esRef.current = null;
      streamSessionRef.current = null;
      lastSeqRef.current = 0;
      pendingEchoRef.current = null;
      setMessages([]);
      setQuestion(null);
      setEnding(null);
      setReview(null);
      setAuth(null);
      setIdentity(null);
      setError(null);
      setRateLimited(null);
      setValidationHint(null);
      setUploadSpec(null);
      setEscalatedRef(null);
      setThinking(false);
      setResolving(true);
      setStatus("connecting");
      onRestart?.();
      return;
    }
    clearSaved(slug);
    clearSubmitted(slug);
    setResolving(true);
    setSubmitted(null);
    sessionRef.current = null;
    esRef.current?.close();
    esRef.current = null;
    streamSessionRef.current = null;
    lastSeqRef.current = 0;
    pendingEchoRef.current = null;
    setMessages([]);
    setRateLimited(null);
    setValidationHint(null);
    setUploadSpec(null);
    setEscalatedRef(null);
    setThinking(false);
    setAnswering(false);
    setQuestion(null);
    setEnding(null);
    setReview(null);
    setResumed(false);
    setAuth(null);
    setIdentity(null);
    setError(null);
    setStatus("connecting");
    await start();
  }, [ephemeral, onRestart, slug, start]);

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

  /**
   * Armed BEFORE the request, never after it.
   *
   * Verifying an identity is not a quick acknowledgement. The same call clears
   * the gate *and* runs the whole first turn inside the durable object, so the
   * greeting, the agent's first question and the `question` event that arms
   * the answer chips have all normally arrived over SSE before this `await`
   * resolves. Setting `thinking` afterwards therefore raised the typing dots
   * for a turn that was already over — and since every event that lowers them
   * had been and gone, nothing was left to come and turn them off. The form
   * sat on three bouncing dots, with the chips it had already been sent hidden
   * behind them, until the respondent thought to reload the page. Arming
   * first puts the flag ahead of the events that clear it, which is the only
   * ordering that cannot lose the race.
   */
  const signInWithGoogle = useCallback(
    async (idToken: string) => {
      setAuth((a) => (a ? { ...a, pending: true, error: null } : a));
      setThinking(true);
      const { ok, data } = await authPost("google", { idToken });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        return;
      }
      setThinking(false);
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
            ? {
                ...a,
                pending: false,
                error: null,
                phoneSentTo: String(data.destination ?? phone),
                phoneSentAt: Date.now(),
                devCode: data.devCode as string | undefined,
              }
            : { ...a, pending: false, error: authError(data) }
          : a,
      );
    },
    [authPost],
  );

  /** Same ordering as `signInWithGoogle`, for the same reason. */
  const verifyPhoneCode = useCallback(
    async (code: string) => {
      setAuth((a) => (a ? { ...a, pending: true, error: null } : a));
      setThinking(true);
      const { ok, data } = await authPost("phone/verify", { code });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        return;
      }
      setThinking(false);
      setAuth((a) => (a ? { ...a, pending: false, error: authError(data) } : a));
    },
    [authPost],
  );

  /**
   * The hosted form's phone path: Firebase already proved the number in the
   * browser, so this posts the resulting ID token and the gate clears in one
   * call. Same ordering as `signInWithGoogle`, for the same reason.
   */
  const signInWithPhoneToken = useCallback(
    async (idToken: string) => {
      setAuth((a) => (a ? { ...a, pending: true, error: null } : a));
      setThinking(true);
      const { ok, data } = await authPost("phone/token", { idToken });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        return;
      }
      setThinking(false);
      setAuth((a) => (a ? { ...a, pending: false, error: authError(data) } : a));
    },
    [authPost],
  );

  /** Back out of the code step to correct a mistyped number. */
  const changePhoneNumber = useCallback(() => {
    setAuth((a) => (a ? { ...a, phoneSentTo: null, phoneSentAt: null, error: null, devCode: undefined } : a));
  }, []);

  const getUploadBase = useCallback(() => {
    const s = sessionRef.current;
    return s ? `${apiOrigin}/p/sessions/${s.sessionId}/uploads` : null;
  }, [apiOrigin]);

  const getRespondentToken = useCallback(() => sessionRef.current?.token ?? null, []);

  /**
   * The boot screen is a decision, not a wait. See BOOT_MAX_MS.
   */
  useEffect(() => {
    if (!resolving) return;
    const t = setTimeout(() => setResolving(false), BOOT_MAX_MS);
    return () => clearTimeout(t);
  }, [resolving]);

  /**
   * Ask the conversation to say again where it stands.
   *
   * The stream dedupes replay by sequence number, which is what makes a
   * reconnect invisible — and also what makes a reconnect useless for
   * recovering a state this device saw once and then lost. The server re-emits
   * the current step under fresh sequence numbers, which the ratchet cannot
   * swallow. It advances nothing, so calling it when it turns out not to have
   * been needed costs one repeated event.
   */
  const resync = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    try {
      await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/resync`, {
        method: "POST",
        headers: { "x-respondent-token": session.token },
      });
    } catch {
      // The watchdog below decides whether to try again.
    }
  }, [apiOrigin]);

  /**
   * What the watchdog below needs to know, kept somewhere it can read without
   * being rebuilt — and therefore restarted — every time any of it changes.
   */
  const liveRef = useRef({ answering: false, actionable: false });
  const actionable = Boolean(question || review || ending || auth || submitted);
  useEffect(() => {
    liveRef.current = { answering, actionable };
  }, [answering, actionable]);

  /**
   * The typing indicator can never be the last thing that happens.
   *
   * Everything above tries to keep `thinking` honest; this exists because
   * "tries" is not a good enough guarantee for the only thing standing between
   * a respondent and the controls they need. It never second-guesses a live
   * turn — any event at all, a keep-alive ping included, counts as the agent
   * still working — and only acts on a stream that has gone quiet underneath
   * raised dots. Then, in order of how much it has to assume:
   *
   *  1. Nothing was sent from here and the screen already holds something to
   *     act on. Then no turn is outstanding and the dots are simply wrong.
   *  2. Otherwise the conversation itself may have been lost mid-turn, so ask
   *     the server to re-state it — the recovery a page reload performs, done
   *     without one.
   *  3. If even that goes unanswered, stop pretending and say so, with a
   *     Retry that reconnects.
   */
  useEffect(() => {
    if (!thinking) return;
    const armedAt = Date.now();
    let attempts = 0;
    let lastAttemptAt = 0;
    const timer = setInterval(() => {
      const now = Date.now();
      // Something is arriving: the agent really is mid-turn. A keep-alive ping
      // counts — it is the server saying the connection is real.
      if (now - lastEventAtRef.current < THINKING_STALE_MS) return;
      if (now - armedAt < THINKING_STALE_MS) return;

      if (!liveRef.current.answering && liveRef.current.actionable) {
        settleTurn();
        return;
      }
      if (now - armedAt < RESYNC_AFTER_MS) return;
      // Spaced out. Three requests in three seconds is not a retry, it is a
      // client hammering a server that is already having a bad time.
      if (now - lastAttemptAt < THINKING_STALE_MS) return;
      if (attempts >= MAX_RESYNC_ATTEMPTS) {
        settleTurn();
        setError("That took longer than it should have. Tap retry to pick up where you left off.");
        return;
      }
      attempts += 1;
      lastAttemptAt = now;
      void resync();
    }, 1000);
    return () => clearInterval(timer);
  }, [thinking, resync, settleTurn]);

  useEffect(() => {
    const t = setTimeout(() => void start(), 0);
    return () => {
      clearTimeout(t);
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (stallTimer.current) clearInterval(stallTimer.current);
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
    answering,
    resolving,
    rateLimited,
    resumed,
    auth,
    identity,
    signInWithGoogle,
    requestPhoneCode,
    verifyPhoneCode,
    signInWithPhoneToken,
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
