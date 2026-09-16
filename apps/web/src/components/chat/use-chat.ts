"use client";

import { emitEmbedEvent } from "./embed-bridge";
import { stuckTurnStep } from "./stuck-turn";
import { rememberValue } from "./respondent-profile";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicBlock } from "@repo/form-schema";
import { getRespondentSignal } from "@/lib/respondent-signal";
import { isFramed, launchCheckout, preopenCheckoutTab } from "@/lib/payments/launch-checkout";
import type {
  CheckoutLaunch,
  PaymentFailedEvent,
  PaymentProvider,
  PaymentRequiredEvent,
  PaymentSettledEvent,
  StartPaymentError,
  StartPaymentErrorCode,
  StartPaymentResponse,
} from "@/lib/payments/types";
import {
  clearRespondentHint,
  loadRespondentHint,
  saveRespondentHint,
  type RespondentHint,
} from "./respondent-hint";
import { rememberEmbedQuery, storageKey, submittedKey } from "./session-store";

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
  /**
   * `contact_info` and `address` only: the fields a refused card already got
   * right, so the composer comes back holding them instead of empty. See
   * `QuestionPayload.prefill`.
   */
  prefill?: Record<string, string>;
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
  /**
   * On a screen-out, whether "I answered that by mistake" is still on offer.
   * Absent from servers that predate the undo allowance, which read as yes.
   */
  canUndo?: boolean;
}

export type ConnectionStatus = "connecting" | "ready" | "reconnecting" | "ended" | "error";

/** Everything answered, waiting on an explicit submit. */
export interface ReviewState {
  answers: { ref: string; title: string; display: string }[];
}

/** A response already sent for this form — by this device, or by this person. */
export interface SubmittedState {
  at: number;
  answers: { ref: string; title: string; display: string }[];
  /**
   * Whether the form accepted that response or refused it.
   *
   * Defaults to `completed`, which is what every path but the sign-in gate can
   * tell. A screen-out is a different screen and a different sentence: nothing
   * was submitted, so "you already answered this" is the wrong word for it,
   * and the reason they were turned away is the thing they came back to read.
   */
  outcome?: "completed" | "screened_out";
  /** On a screen-out, the ending that refused them — title, body, requirements. */
  ending?: EndingState | null;
  /**
   * Whether starting another response is on the table.
   *
   * Undefined means "ask the form's settings", which is the device-local case:
   * we found a completed response in `localStorage` and `allowResubmissions`
   * decides. False is the server having refused a specific person — either
   * `onePerIdentity` or resubmissions being off — and there is no point
   * offering a button that will be turned down at the next sign-in.
   */
  canRepeat?: boolean;
}

/** The sign-in gate, while it is blocking the conversation. */
export interface AuthState {
  method: "google" | "phone";
  message: string;
  pending: boolean;
  error: string | null;
}

/**
 * A code sent to the answer they just gave, while it is outstanding.
 *
 * Separate from `AuthState` on purpose: that gate is about who they are and
 * blocks the whole conversation; this is about one question, sits in the
 * thread under it, and leaves everything already answered on screen.
 */
export interface VerifyState {
  ref: string;
  channel: "sms" | "email";
  sentTo: string;
  /** Restarts the resend countdown on every send, including a resend. */
  sentAt: number;
  pending: boolean;
  /**
   * Dev convenience: an emailed code is returned by the API in development,
   * so the flow is testable without waiting on a mailbox. Never for a number —
   * that code is Firebase's and this app never sees it.
   */
  devCode?: string;
}

/** Who the respondent turned out to be, once the gate is cleared. */
export interface VerifiedIdentity {
  provider: "google" | "phone";
  label: string;
  name: string | null;
  pictureUrl: string | null;
}

/**
 * A verified gateway payment, while one is under way for the question on
 * screen.
 *
 * Shaped like `VerifyState`: the answer is waiting on something outside the
 * conversation, and the stream is what says it is over. No phase here means
 * "paid". Only `payment_settled` clears this for a success, and the answer
 * that follows it is built by the server from the gateway's own record, so
 * nothing this device holds could fake one.
 *
 *   - `starting`: the tap has gone to the server and checkout is being created.
 *   - `awaiting`: checkout exists (it may be open, closed, or in another tab),
 *     and we are waiting on the gateway's word.
 *   - `failed`: this attempt did not go through. The card stays up to try again.
 *   - `phone`: the gateway needs a number for the receipt that nothing so far
 *     has given (Cashfree, after a Google sign-in). The card asks for one, and
 *     Pay sends it with the next start.
 *
 * No phase means idle: the Pay button.
 */
export interface PaymentState {
  ref: string;
  phase: "starting" | "awaiting" | "failed" | "phone";
  recordId: string | null;
  provider: PaymentProvider | null;
  /** The server's formatted amount, e.g. "₹499". Wins over the block's, which is absent for a variable amount. */
  display: string | null;
  launch: CheckoutLaunch | null;
  expiresAt: number | null;
  /** A builder preview: nothing reaches a gateway, and the card offers a simulated payment. */
  preview: boolean;
  /** `failed` and `phone`: what to tell them. */
  message: string | null;
  /** The browser refused the checkout tab, so the card leads with opening it by hand. */
  blocked: boolean;
}

/**
 * How often a checkout in another tab is checked on, and for how long.
 *
 * Only for Stripe opened from a frame or the preview. A top-window redirect
 * comes back through the return page, and a modal reports back to this page
 * itself. A tab is the one place nothing tells us the respondent is done, so
 * we ask the server to look. The server looks at the gateway, which is why
 * this is every few seconds and not constantly, and only while the form is
 * visible: somebody still in the checkout tab is not going to be helped by it.
 */
const PAYMENT_POLL_MS = 3000;
const PAYMENT_POLL_MAX_MS = 10 * 60 * 1000;
/**
 * After a confirm that says "paid", how long the stream gets to say the same
 * before we ask it to.
 */
const PAYMENT_RESYNC_MS = 4000;

const blankPayment = (ref: string): PaymentState => ({
  ref,
  phase: "starting",
  recordId: null,
  provider: null,
  display: null,
  launch: null,
  expiresAt: null,
  preview: false,
  message: null,
  blocked: false,
});

/** Which gateway a launch belongs to. Stripe is the only one that redirects. */
function providerForLaunch(launch: CheckoutLaunch): PaymentProvider {
  switch (launch.kind) {
    case "cashfree_sdk":
      return "cashfree";
    case "razorpay_checkout":
      return "razorpay";
    case "redirect":
      return "stripe";
  }
}

/** What a refused start says, in the respondent's words rather than ours. */
function paymentRefusalMessage(
  code: StartPaymentErrorCode | string | null,
  status: number,
  serverMessage?: string,
): string {
  switch (code) {
    case "too_many_attempts":
      return "That's too many attempts to pay here. Please contact whoever sent you this form.";
    case "payment_unavailable":
      // The server's words when it has them: "unavailable" covers both a form that cannot take
      // payments and a total the respondent's own answers put outside the form's limits, and
      // only the second is theirs to fix.
      return serverMessage || "Payment isn't available on this form right now. Please try again later.";
    case "plan_required":
      // The server's sentence, for the same reason as `payment_unavailable`: it knows
      // whether this is the owner's plan or the author's own preview, and saying
      // something different here left two explanations for one refusal.
      return serverMessage || "Payment isn't available on this form right now. Please try again later.";
    case "preview_live_account":
      return "This form takes payments on a live account, which a preview never charges. Simulate the payment instead, or connect a test account to try real checkout.";
    case "live_account_in_test_mode":
      return "This is a test session, which never charges a live account.";
    default:
      return status === 429
        ? "You're going a bit fast. Give it a moment, then try again."
        : "Checkout couldn't start. Please try again.";
  }
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
  /**
   * The signed token out of a follow-up email's "pick up where you left off".
   *
   * This has existed on the API since follow-ups shipped and nothing ever sent
   * it: the mail minted a token, put it in the link, and the page it landed on
   * read the query string for hidden fields and nothing else. Every nudge we
   * have ever sent opened a brand new conversation at question one, in front of
   * somebody who had just been told their answers were saved.
   */
  resumeToken?: string;
  /** Which message in the sequence that link came from, for the recovery report. */
  followUpId?: string;
  /** Existing session (preview mode) — skips session creation. */
  existingSession?: { sessionId: string; token: string; eventsUrl: string } | null;
  /**
   * Mint a fresh preview session. Only meaningful alongside `existingSession`:
   * a preview cannot create its own session — the draft it runs against is not
   * published, so there is no public slug to post to — and without this
   * "Start over" reconnected to the session it was trying to leave.
   */
  onRestart?: () => void;
  /**
   * From `?cf_pay=`: the payment record a gateway redirect has just sent this
   * respondent back from.
   *
   * The conversation resumes from storage as on any reload. This only adds a
   * nudge, once the stream is up, asking the server to check that record now
   * rather than waiting for the webhook.
   */
  paymentReturn?: string;
  /**
   * From `?cf_pay_cancelled=`: the payment record whose redirect checkout the
   * respondent backed out of. The session still holds it as open — a gateway's
   * cancel link does not close the checkout — so once the stream has put its
   * card back, it is cancelled the way the card's own Cancel would.
   */
  paymentCancelled?: string;
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

/*
 * Where a respondent's place in a form is remembered: `storageKey` and
 * `submittedKey`, from `session-store`.
 *
 * Partial answers already persist server-side — every accepted answer is
 * written to D1 immediately — but the token that identifies the session lived
 * only in memory, so closing the tab orphaned it and reopening the link
 * started from scratch. Keeping it in storage is what makes the link
 * resumable. The keys moved out of this file so the gateway return page can
 * find the same conversation without importing this hook.
 */

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
/**
 * The respondent's IANA time zone, as a body fragment, or nothing.
 *
 * Spread into the session request rather than returned as a string so the
 * "could not tell" case adds no key at all — the server reads a missing zone
 * and an unreadable one the same way, and neither is an error.
 */
function respondentTimezone(): { timezone?: string } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz ? { timezone: tz } : {};
  } catch {
    return {};
  }
}

function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base * (0.7 + Math.random() * 0.6);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * How long one send may take before it is treated as lost.
 *
 * Generous, because the reply does not come back this way — the POST only has
 * to be accepted, and the interview arrives on the stream — so anything past
 * this is a request that is not going to be answered at all.
 */
const POST_TIMEOUT_MS = 20000;

/** Including the first. Two retries covers a hand-off; more is a real outage. */
const POST_MAX_ATTEMPTS = 3;

/**
 * The `error.code` a refusal carries, or null if it did not carry one.
 *
 * Failing soft on purpose: an error body that cannot be read is still a
 * refusal, and the caller has a sensible default for one it cannot name.
 */
async function refusalCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    return body?.error?.code ?? null;
  } catch {
    return null;
  }
}

export function useChat({
  slug,
  apiOrigin,
  hiddenFields,
  resumeToken,
  followUpId,
  existingSession,
  onRestart,
  paymentReturn,
  paymentCancelled,
}: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState<QuestionState | null>(null);
  /** The question on screen, for callbacks that must stay stable across renders. */
  const currentQuestionRef = useRef<string | null>(null);
  /** The same question's block, for the one handler that needs more than its ref. */
  const currentBlockRef = useRef<PublicBlock | null>(null);
  useEffect(() => {
    currentQuestionRef.current = question?.block?.ref ?? null;
    currentBlockRef.current = question?.block ?? null;
  }, [question]);
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
  /**
   * An edit, skip or submit is on its way to the server. A ref, not state: two
   * taps can land before a render. `settleTurn` releases it.
   */
  const actionInFlightRef = useRef(false);
  const [rateLimited, setRateLimited] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);
  /**
   * The next session was asked for explicitly, so it must not be resumed into
   * anything.
   *
   * The device key would otherwise match the very response they just walked
   * away from and hand it straight back — "Start over" would clear the screen
   * and then refill it. Cleared client-side signals cannot fix this and should
   * not try: the same key still has to work for the duplicate rule, so it is
   * this flag, and the server, that decide not to resume.
   */
  const freshRef = useRef(false);
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
  const [verify, setVerify] = useState<VerifyState | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PaymentState | null>(null);
  /** The same, for callbacks that must stay stable across renders. */
  const pendingPaymentRef = useRef<PaymentState | null>(null);
  useEffect(() => {
    pendingPaymentRef.current = pendingPayment;
  }, [pendingPayment]);
  /**
   * Records the stream has said are simulated.
   *
   * A ref beside the state because the start request and `payment_required`
   * race: the session emits the event while it is still answering the request,
   * so the event is usually applied first but not always rendered first. What
   * has to be right is that a preview checkout is never opened for real.
   */
  const previewRecordsRef = useRef(new Set<string>());
  /** One start at a time. A double tap must not create two orders. */
  const paymentStartingRef = useRef(false);
  /** A checkout is being put on screen, or is on screen as a modal. See `openCheckout`. */
  const checkoutOpeningRef = useRef(false);
  /**
   * Which attempt the checkout being opened belongs to.
   *
   * A gateway's script can take twenty seconds to load on mobile data, and Cancel is live that
   * whole time. Cancelling cleared the card and superseded the order, and then the SDK finished
   * loading and put the modal up anyway — for the order they had just cancelled, which the
   * gateway will still take money for. Bumped by everything that ends an attempt; `openCheckout`
   * checks it again after the load and walks away if it has moved.
   */
  const checkoutAttemptRef = useRef(0);
  const [identity, setIdentity] = useState<VerifiedIdentity | null>(null);
  /**
   * Who this device signed in as last time, if anyone.
   *
   * Read once, lazily, and guarded for the server render this component still
   * goes through — there is no `localStorage` there. Reading it during render
   * rather than from an effect is safe because it changes nothing the server
   * drew: the sign-in card it feeds only exists after the stream asks for one.
   */
  const [respondentHint, setRespondentHint] = useState<RespondentHint | null>(() =>
    typeof window === "undefined" ? null : loadRespondentHint(),
  );

  /** A preview runs against a draft and must leave no trace on the device. */
  const ephemeral = Boolean(existingSession);

  const sessionRef = useRef<{ sessionId: string; token: string } | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the current stream last said anything at all, pings included. */
  const lastEventAtRef = useRef(0);
  /**
   * This session cannot be revived, only replaced.
   *
   * Set when the server says the conversation is closed, gone, or no longer
   * ours. `retry` reads it so the button under that message opens a fresh
   * conversation instead of reconnecting to a dead one — which is what it did
   * before, forever, with no way for the respondent to tell.
   */
  const sessionDeadRef = useRef(false);
  /** Late-bound so `post` can ask for a resync that is declared below it. */
  const resyncRef = useRef<(() => Promise<void>) | null>(null);
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
    actionInFlightRef.current = false;
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

      es.addEventListener("session_ready", (raw) => {
        alive();
        setStatus("ready");
        setError(null);
        setResolving(false);
        /*
          Who this session already knows we are.

          `auth_verified` fires the once, at the moment somebody signs in, and
          a session that arrived already verified never fires it: a follow-up
          link carries the identity proved against that response forward, and
          the gate stays quiet. The respondent was then signed in with nothing
          on screen saying so and no way to be somebody else.

          Set rather than merged, and only when this device has nothing: an
          identity learned from a live sign-in in this tab is the fresher fact,
          and a reconnect mid-conversation must not walk it backwards.
        */
        try {
          const { identity: who } = JSON.parse((raw as MessageEvent).data ?? "{}") as {
            identity?: VerifiedIdentity | null;
          };
          if (who) {
            setIdentity((prev) => prev ?? who);
            /*
              The same note the gate writes, at the top of the thread.

              `auth_verified` appends it where it happened, which is right: it
              is a thing that occurred at that point in the conversation. This
              one did not occur here at all — it was proved on an earlier
              visit and carried in — so it belongs above everything, as the
              standing fact the transcript opens on rather than an event in
              the middle of it. Scrolling past it is fine; it is a note, not a
              status bar.
            */
            setMessages((prev) =>
              prev.some((m) => m.id === "sys_verified")
                ? prev
                : [
                    { id: "sys_verified", role: "system", text: `Verified as ${who.label}` },
                    ...prev,
                  ],
            );
          }
        } catch {
          // Older server, or a payload we cannot read — the connection is
          // ready either way, which is what this event is for.
        }
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
          messageId?: string | null;
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
        /*
         * An explicit `null` means there is no bubble: the answer came from
         * something outside the transcript, and a payment settled off-screen is
         * the one that does. Guessing here pinned "is this refundable?" — or any
         * message the server never read as an answer — with a pencil that opens
         * the payment question. Only an *absent* id is the old server's shape.
         */
        if (messageId === null) return;
        setMessages((prev) => {
          const idx = messageId
            ? prev.findIndex((m) => m.serverId === messageId || m.id === messageId)
            : (() => {
                const r = [...prev].reverse().findIndex((m) => m.role === "user" && !m.answeredRef);
                return r === -1 ? -1 : prev.length - 1 - r;
              })();
          if (idx === -1) return prev;
          /*
           * Remembered for next time only now that it counts as the answer.
           *
           * The composer used to store whatever was typed into a name or email
           * question the moment it was sent. But a message sent while a question
           * is on screen is not always an answer to it: "hmm I made a mistake
           * earlier, can I fix it?", typed while "Team Leader's Full Name" was
           * showing, was saved as a name and offered back as one. Only the
           * question on screen counts. An earlier answer changed from this
           * message is a different question, and the sentence was not that value.
           * Idempotent, so React calling this updater twice does no harm.
           */
          const block = currentBlockRef.current;
          const sent = prev[idx]!;
          if (block?.ref === ref && sent.role === "user") rememberValue(block.identityField, sent.text);
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
        const { messageId, text } = JSON.parse((e as MessageEvent).data) as { messageId: string; text?: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  streaming: false,
                  /**
                   * The finished message wins over whatever was accumulated.
                   *
                   * Identical to `m.text` on a live stream, and the repair on a
                   * reconnect: a device that dropped out mid-message holds a
                   * prefix, and replay cannot complete it — every frame with the
                   * rest of the text sits below the sequence number it has
                   * already passed, so the ratchet throws them away. This frame
                   * is the only one above that mark, so it is the only one that
                   * can put the sentence back together.
                   */
                  text: typeof text === "string" ? text : m.text,
                }
              : m,
          ),
        );
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
        /*
         * A question means the review step is over.
         *
         * The review card used to be cleared by exactly two things: an `ending`
         * event, and `editAnswer` clearing it locally on the way out. Nothing
         * cleared it when the *server* took the conversation off the review
         * step and back to a question — which is what a refused submit does.
         *
         * So a refused submit left the old card mounted underneath the new
         * question, still saying "Submit now", its countdown already spent. The
         * respondent pressed it, the server refused again, and the screen came
         * back looking identical: the one report we have of this described it
         * as the button doing nothing at all.
         */
        setReview(null);
        settleTurn();
        // A payment belongs to its question. Moving to another one (an edit, a
        // skip, a cancel that went on) leaves nothing of it on screen; the same
        // question re-stated keeps it, because a reload re-states the question
        // and then the checkout that is still open against it.
        setPendingPayment((p) => (p && p.ref !== data.block?.ref ? null : p));
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
        // A refused code leaves the card up; only its spinner has to stop.
        setVerify((v) => (v ? { ...v, pending: false } : v));
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
        setAuth((prev) => prev ?? { method: data.method, message: data.message, pending: false, error: null });
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

      on("verify_required", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as {
          ref: string;
          channel: "sms" | "email";
          sentTo: string;
          sentAt: number;
          devCode?: string;
        };
        // The server's `sentAt` rather than the clock here: a replay after a
        // reconnect must not restart a cooldown that has already run down.
        setVerify({ ...data, pending: false });
        setValidationHint(null);
        settleTurn();
        settleEcho();
      });

      on("verify_settled", () => {
        setVerify(null);
        setValidationHint(null);
      });

      /*
       * A checkout is waiting on the respondent.
       *
       * Sent when a start creates or reuses one, and again on resync, which is
       * how a reloaded tab gets the card back mid-payment. It never opens
       * checkout by itself. Opening happens in `startPayment`, on the tap,
       * because a tab opened without a tap behind it is refused, and because a
       * replay that re-opened a modal on every reconnect would be unbearable.
       */
      on("payment_required", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as PaymentRequiredEvent;
        if (data.preview) previewRecordsRef.current.add(data.recordId);
        // The latest one wins outright. The stream is ordered, so a later
        // `payment_required` is a newer attempt: a retry, or a checkout the
        // server re-created because the amount changed and it superseded the old.
        setPendingPayment((prev) => ({
          ref: data.ref,
          phase: "awaiting",
          recordId: data.recordId,
          provider: data.provider,
          display: data.display,
          launch: data.launch,
          expiresAt: data.expiresAt,
          preview: data.preview === true,
          message: null,
          blocked: prev?.recordId === data.recordId ? prev.blocked : false,
        }));
        setValidationHint(null);
        settleTurn();
      });

      /*
       * The gateway confirmed it. The card goes, and the answer and the next
       * question follow on the stream, written by the server from its own
       * record.
       *
       * `answering` as well as the dots: until the next question lands, the
       * question on screen is still this payment, and with the pending state
       * cleared its card would fall back to idle, putting "Pay ₹499" back up in
       * front of somebody who has just paid. This is an answer in flight in
       * every sense that matters, so it is treated as one, and the same events
       * (and the same watchdog) bring the controls back.
       */
      on("payment_settled", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as PaymentSettledEvent;
        setPendingPayment((prev) => (prev && (prev.recordId === data.recordId || prev.ref === data.ref) ? null : prev));
        /*
         * Only for the question on screen. A payment can settle for one the respondent has
         * moved past — they skipped an optional payment, or went back to edit something, and
         * paid in the other tab anyway — and the server then records it quietly, with no
         * question event to follow. Raising the flags for that hid the controls of the question
         * they are actually on behind typing dots until the watchdog gave up on it.
         */
        if (data.ref === currentQuestionRef.current) {
          setThinking(true);
          setAnswering(true);
        }
      });

      on("payment_failed", (e) => {
        const data = JSON.parse((e as MessageEvent).data) as PaymentFailedEvent;
        // The server has finished with this attempt, so a launch still loading for it must not
        // put a modal up. See `checkoutAttemptRef`.
        if (!pendingPaymentRef.current?.recordId || pendingPaymentRef.current.recordId === data.recordId) {
          checkoutAttemptRef.current += 1;
        }
        setPendingPayment((prev) => {
          // A failure for an attempt that has since been replaced says nothing
          // about the one on screen.
          if (prev && prev.recordId && prev.recordId !== data.recordId && prev.phase !== "failed") return prev;
          /*
           * Cancel is what the respondent asked for, not something that went wrong: the Pay
           * button comes back, not a red "Payment cancelled." with Try again. On the device
           * that pressed it this is already the state, and on another — or a replay after a
           * reload — it is the state it should land in.
           */
          if (data.code === "payment_cancelled") return prev && prev.ref !== data.ref ? prev : null;
          return {
            ...(prev && prev.ref === data.ref ? prev : blankPayment(data.ref)),
            phase: "failed",
            recordId: data.recordId,
            message: data.message,
            blocked: false,
          };
        });
        settleTurn();
      });

      on("review", (e) => {
        setReview(JSON.parse((e as MessageEvent).data) as ReviewState);
        setQuestion(null);
        setPendingPayment(null);
        settleTurn();
      });

      on("ending", (e) => {
        const { ending, canUndo } = JSON.parse((e as MessageEvent).data) as {
          ending: EndingState;
          canUndo?: boolean;
        };
        setEnding(canUndo === undefined ? ending : { ...ending, canUndo });
        setQuestion(null);
        setReview(null);
        setPendingPayment(null);
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
            ending?: EndingState | null;
            canRepeat?: boolean;
          };
          if (state.status === "completed") {
            setSubmitted({
              at: state.completedAt ?? done.at,
              answers: state.summary ?? [],
              // The screen they finished on, so a return visit shows the
              // thank-you and its link rather than one line of grey text.
              ending: state.ending ?? null,
              /*
                From the session, not from the published config. This is the
                document the response was actually written against, and it is
                the one the clamp has already been applied to — the config the
                page was rendered with knows neither.
              */
              canRepeat: state.canRepeat,
            });
            setStatus("ended");
            setResolving(false);
            return;
          }
          /*
           * A refusal is reconnected to, not summarised.
           *
           * `complete` fires on a screen-out too, so this session is recorded
           * here exactly as a finished one is — and because it is not
           * `completed`, the old code fell through, threw the session away and
           * started a blank one. On a form with `onePerIdentity` that blank
           * one signs in, is recognised, and is refused at the door: reloading
           * after being screened out wiped the entire conversation off the
           * screen and replaced it with "you already answered this", which is
           * both false and the exact opposite of reassuring.
           *
           * The session is still there and still reopenable, so we reattach to
           * it. The stream replays the whole transcript and the `ending` event
           * with it, which puts the respondent back on the card they were
           * looking at — including the way out of it.
           */
          if (state.status === "disqualified") {
            sessionRef.current = done;
            connectStream(done.sessionId, done.token, 0);
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
          const state = (await probe.json()) as {
            status?: string;
            summary?: SubmittedState["answers"];
            completedAt?: number | null;
            ending?: EndingState | null;
            canRepeat?: boolean;
          };
          if (state.status === "active") {
            sessionRef.current = saved;
            setResumed(true);
            connectStream(saved.sessionId, saved.token, 0);
            return;
          }
          /*
           * Finished while this tab was not watching.
           *
           * Only the stream's `complete` handler moves a session from the saved key to the
           * submitted one, and a tab that was somewhere else never runs it. The usual way is a
           * payment: Stripe took the whole window, or a phone discarded the tab while its owner
           * was in a UPI app, and the payment — the last question, on a form with no review step
           * — settled and completed the response meanwhile. Treated as gone, that threw the
           * finished response away and opened a blank one at question one, in front of somebody
           * who had just paid; walking it again charged them a second time. So it is recorded
           * as submitted here, and shown the way a submitted one is.
           */
          if (state.status === "completed" || state.status === "disqualified") {
            clearSaved(slug);
            markSubmitted(slug, saved);
            if (state.status === "disqualified") {
              sessionRef.current = saved;
              connectStream(saved.sessionId, saved.token, 0);
              return;
            }
            setSubmitted({
              at: state.completedAt ?? Date.now(),
              answers: state.summary ?? [],
              ending: state.ending ?? null,
              canRepeat: state.canRepeat,
            });
            setStatus("ended");
            setResolving(false);
            return;
          }
        }
        // Abandoned or gone — do not resurrect it.
        clearSaved(slug);
      } catch {
        clearSaved(slug);
      }
    }

    pendingRef.current = (async () => {
      try {
        /*
         * Computed here rather than at mount: it runs a canvas and an audio
         * probe, and nothing needs it until a session is actually being opened.
         * Failure is normal and returns null.
         */
        const deviceSignal = await getRespondentSignal();
        const res = await fetch(`${apiOrigin}/p/forms/${slug}/sessions`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hiddenFields,
            /**
             * Only when there is no live session to reconnect to — the branches
             * above already returned in that case. A refresh mid-conversation
             * must not mint a second session against the same response just
             * because the token is still sitting in the address bar.
             *
             * And not after "Start over", which is the one case where the token
             * is still in this component's props but the respondent has said
             * plainly that they do not want what it points at. It outranks
             * every other way of recognising them, so left in it would resume
             * the very response they asked to abandon.
             */
            ...(resumeToken && !freshRef.current ? { resumeToken } : {}),
            ...(followUpId ? { followUpId } : {}),
            /**
             * Which device this is, so an anonymous respondent who cleared
             * their storage or opened the form privately gets their own
             * half-finished response back instead of a blank one — and so the
             * duplicate rule stops treating a whole office as one person.
             *
             * Awaited rather than fired alongside: the server needs it in this
             * request to decide both. Null whenever the signal cannot be
             * computed, which the server handles by falling back to the IP.
             */
            ...(deviceSignal ? { deviceSignal } : {}),
            /**
             * Which clock this respondent is on, so a reminder that would fall
             * in the middle of their night waits for the morning instead.
             *
             * Read from the browser rather than guessed at the edge: geo-IP
             * gets a VPN user and a corporate egress wrong, and this is the one
             * source that knows where the person is actually sitting. Wrapped
             * because `resolvedOptions` is missing in a few hardened browsers,
             * and a form that would not open because it could not name a time
             * zone would be an absurd trade.
             */
            ...respondentTimezone(),
            ...(freshRef.current ? { fresh: true } : {}),
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { code?: string; message?: string };
          } | null;
          /*
           * "You have already answered this" is an outcome, not a breakdown.
           * The open-session gate returns it for a form with resubmissions off
           * when this address has finished one before — and it was surfacing as
           * the generic "something went wrong" screen, which tells a respondent
           * to retry the one thing that cannot work.
           */
          if (body?.error?.code === "already_responded") {
            setSubmitted({ at: 0, answers: [], canRepeat: false });
            setStatus("ended");
            setResolving(false);
            return;
          }
          /*
           * A limit is a wait, not a breakdown — and it is very often not this
           * person's fault. The window is keyed by address, so an office, a
           * campus or a phone network can spend it between them, and the
           * respondent who meets it has done nothing but open a link. "Too many
           * requests" over the generic failure screen reads as an accusation
           * and, worse, tells them to retry immediately, which is the one thing
           * that cannot help. Say roughly how long instead; `retry-after` is in
           * the CORS `exposeHeaders` list precisely so this can read it.
           */
          if (res.status === 429) {
            const secs = Number(res.headers.get("retry-after")) || 60;
            throw new Error(
              `This form is being opened a lot from your network right now. ` +
                `Try again in about ${secs < 90 ? "a minute" : `${Math.ceil(secs / 60)} minutes`}.`,
            );
          }
          throw new Error(body?.error?.message ?? "Could not start session");
        }
        // Spent. A later reload is an ordinary visit and should resume again.
        freshRef.current = false;
        const data = (await res.json()) as { sessionId: string; respondentToken: string };
        sessionRef.current = { sessionId: data.sessionId, token: data.respondentToken };
        saveSession(slug, sessionRef.current);
        /**
         * Take the resume token back out of the address bar once it has been
         * spent.
         *
         * It is a bearer credential for somebody's half-finished answers, and
         * it stays valid for thirty days. Leaving it on screen puts it in
         * screenshots, in "look at this form" links pasted into group chats,
         * and in the `Referer` of every outbound click from the page. The
         * session now lives in the ref and in storage, so nothing below needs
         * it. `replaceState` rather than a navigation: this must not add a
         * history entry or remount the conversation that just started.
         */
        if (resumeToken && typeof window !== "undefined") {
          try {
            const url = new URL(window.location.href);
            url.searchParams.delete("resume");
            url.searchParams.delete("fu");
            window.history.replaceState(null, "", url.toString());
          } catch {
            /* A URL we cannot parse is not worth failing a live session over. */
          }
        }
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
  }, [slug, apiOrigin, hiddenFields, resumeToken, followUpId, connectStream, existingSession]);

  /** Manual retry after a hard failure — replaces a full page reload. */
  const retry = useCallback(() => {
    setError(null);
    setStatus("connecting");
    const s = sessionRef.current;
    /**
     * A closed session is not a connection problem, and reconnecting to it
     * just draws the same dead conversation again. Drop it and start over —
     * the same thing the respondent would get by reloading, which is what they
     * would (rightly) try next.
     */
    if (sessionDeadRef.current) {
      sessionDeadRef.current = false;
      sessionRef.current = null;
      esRef.current?.close();
      esRef.current = null;
      lastSeqRef.current = 0;
      void start();
      return;
    }
    if (s) connectStream(s.sessionId, s.token, 0);
    else void start();
  }, [connectStream, start]);

  /**
   * Send something on this session, and do not quietly lose it.
   *
   * Three things this has to get right, each of which used to be wrong:
   *
   *  1. **A deadline.** There was none, on any request in this file, so a
   *     request that hung hung until the browser gave up on it — minutes, on
   *     some mobile stacks. `AbortSignal.timeout` turns that into a failure
   *     the ladder below can act on.
   *  2. **A retry.** A send that failed was simply gone: the typing dots came
   *     down, the bubble stayed on screen looking accepted, and the answer had
   *     never reached the server. The `turnId` is what makes retrying safe —
   *     the session recognises a second copy of a turn it already took and
   *     does nothing — so a dropped packet costs a round trip instead of an
   *     answer. Only answers are retried; an action is not idempotent, and
   *     skipping a question twice skips two questions.
   *  3. **Saying what happened.** Every refusal that was not a 429 used to be
   *     swallowed whole. An expired session, a closed gate, a rejected turn —
   *     all of them put the controls back with no explanation, so the form
   *     looked like it had accepted an answer it had thrown away.
   */
  const post = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const session = sessionRef.current;
      if (!session) return;
      // One id for every attempt at this one send, which is what lets the
      // server tell a retry apart from a second answer.
      const idempotent = path === "messages";
      const payload = idempotent ? { ...body, turnId: crypto.randomUUID() } : body;
      const attempts = idempotent ? POST_MAX_ATTEMPTS : 1;

      for (let attempt = 0; attempt < attempts; attempt++) {
        if (attempt > 0) await sleep(backoffMs(attempt - 1));
        let res: Response;
        try {
          res = await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-respondent-token": session.token },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(POST_TIMEOUT_MS),
          });
        } catch {
          // Network, DNS, timeout — we cannot know whether it landed, which is
          // exactly the case `turnId` exists to make safe to repeat.
          if (attempt < attempts - 1) continue;
          settleTurn();
          settleEcho();
          setError("That didn't send. Check your connection and try again.");
          return;
        }

        if (res.ok) return;

        if (res.status === 429) {
          setRateLimited("You're going a bit fast — give it a moment.");
          settleTurn();
          settleEcho();
          return;
        }

        // The server is having a bad moment rather than refusing us. Worth
        // another go; past the last one, say so rather than going quiet.
        if (res.status >= 500) {
          if (attempt < attempts - 1) continue;
          settleTurn();
          settleEcho();
          setError("We couldn't reach the form just now. Tap retry to send that again.");
          return;
        }

        // A considered refusal. Read it and act on what it says.
        const code = await refusalCode(res);
        settleTurn();
        settleEcho();
        if (code === "session_closed" || code === "session_not_found" || code === "unauthorized") {
          // Reconnecting cannot revive this one; the way back is a new session.
          sessionDeadRef.current = true;
          setError("This conversation has expired. Tap retry to start a fresh one.");
        } else if (
          code === "auth_required" ||
          code === "stale_ref" ||
          code === "no_question" ||
          // Cancel or retry on a checkout the server had already dropped — it settled, failed
          // or expired meanwhile. Nothing went wrong that the respondent could send again; the
          // server has put the current question back, and a resync makes sure this device has it.
          code === "no_pending_payment"
        ) {
          // The session knows something this device does not. Rather than
          // guessing at it, ask the conversation to say where it stands — the
          // sign-in card, or the question we are actually on, comes back.
          void resyncRef.current?.();
        } else if (code !== "turn_failed") {
          // `turn_failed` already announced itself on the stream as an
          // `error_event`; anything else has said nothing at all until now.
          setError("That answer didn't go through. Tap retry, or send it again.");
        }
        return;
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
      // Skip and submit move the flow, so a second tap before the first has
      // resolved acts on whatever comes next — a double-tapped Skip skipped
      // two questions. Stop and restart are the ways out and always go.
      const movesFlow = action === "skip" || action === "submit";
      if (movesFlow) {
        if (actionInFlightRef.current) return;
        actionInFlightRef.current = true;
      }
      setThinking(true);
      setAnswering(true);
      // The skip names its question, so one that arrives late is refused
      // rather than applied to the question after it.
      const ref = action === "skip" ? currentQuestionRef.current : null;
      await post("actions", ref ? { action, ref } : { action });
    },
    [post],
  );

  /**
   * The code for a `verify` answer.
   *
   * An ordinary message, not a route of its own: while a challenge is
   * outstanding the session reads what arrives as the code, which is what lets
   * a respondent type it into the box or a headless caller post it as text.
   * Nothing is echoed into the thread — a one-time code is not conversation.
   */
  const submitVerifyCode = useCallback(
    async (code: string) => {
      setVerify((v) => (v ? { ...v, pending: true } : v));
      setValidationHint(null);
      setThinking(true);
      await post("messages", { type: "text", text: code });
    },
    [post],
  );

  /** Another code to the same destination. */
  const resendVerifyCode = useCallback(async () => {
    setVerify((v) => (v ? { ...v, pending: true } : v));
    setValidationHint(null);
    await post("actions", { action: "resend_code" });
  }, [post]);

  /** Give up on the code and answer the question again. */
  const changeVerifyAnswer = useCallback(async () => {
    setVerify((v) => (v ? { ...v, pending: true } : v));
    setValidationHint(null);
    setThinking(true);
    await post("actions", { action: "change_answer" });
  }, [post]);

  /**
   * Ask the server to look at a payment now.
   *
   * Only a nudge, and never the verdict. The server asks the gateway and, if
   * the money is there, settles it, and the chat learns that from
   * `payment_settled` like everyone else. The status that comes back is for the
   * card's "Check payment" line and nothing more. The one thing done with it
   * here: if the server says paid but the stream stays quiet, ask the stream to
   * re-state itself, since that event may have gone to a socket that is no
   * longer there.
   */
  const confirmPayment = useCallback(
    async (recordId?: string): Promise<string | null> => {
      const session = sessionRef.current;
      const id = recordId ?? pendingPaymentRef.current?.recordId;
      if (!session || !id) return null;
      try {
        const res = await fetch(
          `${apiOrigin}/p/sessions/${session.sessionId}/payments/${encodeURIComponent(id)}/confirm`,
          {
            method: "POST",
            headers: { "x-respondent-token": session.token },
            signal: AbortSignal.timeout(POST_TIMEOUT_MS),
          },
        );
        if (!res.ok) return null;
        const body = (await res.json().catch(() => null)) as { status?: string } | null;
        const status = typeof body?.status === "string" ? body.status : null;
        if (status === "paid") {
          setTimeout(() => {
            if (pendingPaymentRef.current?.recordId === id) void resyncRef.current?.();
          }, PAYMENT_RESYNC_MS);
        }
        return status;
      } catch {
        return null;
      }
    },
    [apiOrigin],
  );

  /**
   * Put checkout on screen for a record the server has created.
   *
   * Whatever the gateway's own UI reports on the way out, finished or closed,
   * is worth one confirm nudge and nothing more. See `launchCheckout`.
   */
  const openCheckout = useCallback(
    async (recordId: string, launch: CheckoutLaunch, preopened: Window | null) => {
      /*
       * One launch at a time. The card reads "Waiting for payment confirmation" with an "Open
       * checkout again" chip from the moment the order exists, while the gateway's script can
       * still be loading for seconds on mobile data — and a respondent who saw nothing open
       * tapped the chip, putting two modals up on one order. A modal's launch lasts until it
       * closes, so this also covers a tap on the page underneath one.
       */
      if (checkoutOpeningRef.current) return;
      checkoutOpeningRef.current = true;
      const attempt = checkoutAttemptRef.current;
      let outcome: Awaited<ReturnType<typeof launchCheckout>>;
      try {
        outcome = await launchCheckout(launch, {
          newTab: ephemeral || isFramed(),
          preopened,
          // Cancel, or anything else that took the card down, while the script was loading.
          abandoned: () => checkoutAttemptRef.current !== attempt,
        });
      } finally {
        checkoutOpeningRef.current = false;
      }
      if (checkoutAttemptRef.current !== attempt) {
        preopened?.close();
        return;
      }
      switch (outcome.kind) {
        case "abandoned":
          preopened?.close();
          return;
        case "completed":
        case "dismissed":
          void confirmPayment(recordId);
          return;
        case "blocked":
          setPendingPayment((p) => (p?.recordId === recordId ? { ...p, blocked: true } : p));
          return;
        case "unavailable":
          setPendingPayment((p) =>
            p?.recordId === recordId ? { ...p, phase: "failed", message: outcome.message, blocked: false } : p,
          );
          return;
        case "navigating":
        case "tab_opened":
          setPendingPayment((p) => (p?.recordId === recordId && p.blocked ? { ...p, blocked: false } : p));
          return;
      }
    },
    [confirmPayment, ephemeral],
  );

  /**
   * The Pay button, and Try again.
   *
   * A request rather than a message or an action, because it needs its answer
   * inline: the checkout it creates has to be opened from this tap. A tab
   * opened from an event that arrives on the stream later has no tap behind it
   * and is refused. The same request serves a retry: the server hands back the
   * checkout that is still open, or makes a new one if the last attempt failed.
   *
   * Refusals that are not about payment go where they belong: a stale ref means
   * the conversation has moved on without us, and `already_paid` means the
   * server put the answer back rather than opening anything.
   */
  const startPayment = useCallback(
    async (ref: string, opts: { phone?: string } = {}) => {
      const session = sessionRef.current;
      if (!session || paymentStartingRef.current) return;
      paymentStartingRef.current = true;

      const current = pendingPaymentRef.current?.ref === ref ? pendingPaymentRef.current : null;
      const block = currentBlockRef.current?.ref === ref ? currentBlockRef.current : null;
      const newTab = ephemeral || isFramed();
      // Before any await, while the tap still counts. Only when the gateway is
      // known to redirect: a blank tab for a modal checkout would be litter.
      const provider = current?.provider ?? block?.paymentProvider ?? null;
      const preopened = newTab && provider === "stripe" && !current?.preview ? preopenCheckoutTab() : null;

      setPendingPayment((p) => ({
        ...(p?.ref === ref ? p : blankPayment(ref)),
        phase: "starting",
        message: null,
        blocked: false,
      }));
      setValidationHint(null);

      const fail = (message: string, extra: Partial<PaymentState> = {}) => {
        preopened?.close();
        setPendingPayment((p) => ({
          ...(p?.ref === ref ? p : blankPayment(ref)),
          phase: "failed",
          message,
          blocked: false,
          ...extra,
        }));
      };

      try {
        let res: Response;
        try {
          res = await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/payments`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-respondent-token": session.token },
            body: JSON.stringify(opts.phone ? { ref, phone: opts.phone } : { ref }),
            signal: AbortSignal.timeout(POST_TIMEOUT_MS),
          });
        } catch {
          fail("That didn't reach the form. Check your connection and try again.");
          return;
        }

        const body = (await res.json().catch(() => null)) as
          | (Partial<StartPaymentResponse> & { error?: StartPaymentError })
          | null;

        if (!res.ok || !body?.recordId || !body.launch) {
          const code = body?.error?.code ?? null;
          // `already_paid`: the server has re-recorded the payment this
          // question already holds and moved on, so what is missing here is
          // only the stream catching up.
          if (code === "stale_ref" || code === "already_paid") {
            preopened?.close();
            setPendingPayment(null);
            void resyncRef.current?.();
            return;
          }
          if (code === "session_closed" || code === "session_not_found" || code === "unauthorized") {
            preopened?.close();
            setPendingPayment(null);
            sessionDeadRef.current = true;
            setError("This conversation has expired. Tap retry to start a fresh one.");
            return;
          }
          // Asked for, not failed: the card turns into a phone field, and its
          // Pay sends the number with the next start. The server's message says
          // whether this is the first ask or a number it could not use.
          if (code === "phone_required") {
            preopened?.close();
            setPendingPayment((p) => ({
              ...(p?.ref === ref ? p : blankPayment(ref)),
              phase: "phone",
              message: opts.phone ? (body?.error?.message ?? null) : null,
              blocked: false,
              preview: body?.error?.preview === true || (p?.ref === ref && p.preview),
            }));
            return;
          }
          // A preview that cannot pay for real (no account yet, a live one, a
          // plan without payments) still gets to walk past the payment, just
          // not by paying. The server says which refusals those are.
          const previewRefusal = body?.error?.preview === true || code === "preview_live_account";
          fail(
            paymentRefusalMessage(code, res.status, body?.error?.message),
            previewRefusal ? { preview: true } : {},
          );
          return;
        }

        const recordId = body.recordId;
        const launch = body.launch;
        const preview = body.preview === true || previewRecordsRef.current.has(recordId);
        setPendingPayment((p) => ({
          ...(p?.ref === ref ? p : blankPayment(ref)),
          phase: "awaiting",
          recordId,
          // Until `payment_required` names it: the launch already says which
          // gateway this is, and the card's "Secure checkout by" line should
          // not wait on the stream to say so.
          provider: p?.ref === ref && p.provider ? p.provider : providerForLaunch(launch),
          launch,
          expiresAt: typeof body.expiresAt === "number" ? body.expiresAt : null,
          preview: preview || (p?.recordId === recordId && p.preview),
          message: null,
          blocked: false,
        }));
        if (preview) {
          preopened?.close();
          return;
        }
        await openCheckout(recordId, launch, preopened);
      } finally {
        paymentStartingRef.current = false;
      }
    },
    [apiOrigin, ephemeral, openCheckout],
  );

  /**
   * Open the same checkout again: after the modal was closed, after a reload,
   * or when the browser refused the tab. Called straight from a tap, and
   * `launchCheckout` reaches `window.open` before its first await, so the tab
   * is not refused a second time.
   */
  const reopenCheckout = useCallback(() => {
    const p = pendingPaymentRef.current;
    if (!p?.launch || !p.recordId || p.preview || p.phase !== "awaiting") return;
    // The Pay tap's own launch is still under way.
    if (paymentStartingRef.current) return;
    void openCheckout(p.recordId, p.launch, null);
  }, [openCheckout]);

  /** Walk away from this checkout and put the Pay button back. */
  const cancelPayment = useCallback(async () => {
    const p = pendingPaymentRef.current;
    if (!p) return;
    /*
     * The launch this cancels may still be loading its script. Retiring the attempt stops that
     * one opening a modal for an order nobody wants any more, and frees the Pay button, which
     * would otherwise ignore the next tap until the abandoned load finished.
     */
    checkoutAttemptRef.current += 1;
    paymentStartingRef.current = false;
    setPendingPayment(null);
    await post("actions", { action: "cancel_payment", ref: p.ref });
  }, [post]);

  /**
   * The builder preview's stand-in for paying. The server refuses it on a real
   * session, and records nothing in D1 for it on a preview.
   */
  const simulatePayment = useCallback(async () => {
    const p = pendingPaymentRef.current;
    if (!p) return;
    setThinking(true);
    await post("actions", { action: "simulate_payment", ref: p.ref });
  }, [post]);

  /** Go back and change a previous answer. */
  const editAnswer = useCallback(
    async (ref: string) => {
      // One at a time. The pencil stays tappable while an edit is resolving,
      // and a slow phone gets tapped again — each repeat used to be a whole
      // new "let's redo that one".
      if (actionInFlightRef.current) return;
      actionInFlightRef.current = true;
      setThinking(true);
      setAnswering(true);
      setEnding(null);
      setReview(null);
      await post("actions", { action: "edit", ref });
    },
    [post],
  );

  /**
   * "I answered that by mistake."
   *
   * The way out of a screen-out, and the reason a refusal is no longer a dead
   * end. It is emphatically not `startOver`: somebody turned away over one
   * answer wants that answer back, not a blank form and eleven questions to
   * retype.
   *
   * The stream is reopened before the action is posted, because `complete`
   * closed it. Reconnecting with the same session id replays what the client
   * has already applied — the seq ratchet makes that a no-op — so the thread
   * stays exactly where it is and only the new events, the re-asked question
   * among them, actually land. Posting first would race the reconnect and
   * lose them.
   */
  const undoScreenOut = useCallback(async () => {
    const session = sessionRef.current as { sessionId: string; token: string } | null;
    if (!session) return;
    // The conversation is live again, so it is resumable again — and it is no
    // longer a device that has answered.
    clearSubmitted(slug);
    saveSession(slug, session);
    setEnding(null);
    setSubmitted(null);
    setError(null);
    setThinking(true);
    setAnswering(true);
    setStatus("connecting");
    connectStream(session.sessionId, session.token, 0);
    await post("actions", { action: "undo_screen_out" });
  }, [connectStream, post, slug]);

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
      setVerify(null);
      setPendingPayment(null);
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
    freshRef.current = true;
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
    setVerify(null);
    setPendingPayment(null);
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
  /**
   * A POST on this session that expects its answer inline.
   *
   * The path is relative to the session — `auth/google`, `verify/phone-token`
   * — rather than assumed to be under `auth/`, because proving an *answer* is
   * not a sign-in and does not live there.
   */
  const sessionPost = useCallback(
    async (path: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
      const session = sessionRef.current;
      if (!session) return { ok: false, data: {} };
      try {
        const res = await fetch(`${apiOrigin}/p/sessions/${session.sessionId}/${path}`, {
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

  const authError = (data: Record<string, unknown>): string => {
    const err = data.error as { code?: string; message?: string } | undefined;
    /*
     * "Please try again" is the worst possible instruction to someone who has
     * been rate limited, and the sign-in window is the tightest one there is —
     * every attempt fetches a JWKS document before it can even be judged. The
     * generic fallback below would have them tapping the button in a loop,
     * spending the window they are waiting on.
     */
    if (err?.code === "rate_limited") {
      return "Too many sign-in attempts from your network. Wait about a minute and try again.";
    }
    return err?.message ?? "That didn't work. Please try again.";
  };

  /**
   * The one sign-in failure that is not a failure.
   *
   * Verifying can now come back with "you have already answered this", because
   * signing in is the moment the server can finally match a person to a
   * response they left on another device. Rendered as a red line under the
   * sign-in button it read as something to retry — so people pressed it again,
   * verified again, and got the same red line. It is an ending, so it gets the
   * ending screen.
   *
   * Returns true when it handled the response, so each caller can bail out
   * before setting an error state that would sit behind the card.
   */
  const settledAsAnswered = useCallback((data: Record<string, unknown>): boolean => {
    const err = data.error as
      | {
          code?: string;
          completedAt?: number | null;
          outcome?: "completed" | "screened_out";
          ending?: EndingState | null;
          answers?: SubmittedState["answers"];
          canRepeat?: boolean;
        }
      | undefined;
    if (err?.code !== "already_answered") return false;
    setThinking(false);
    setAuth(null);
    setSubmitted({
      at: err.completedAt ?? Date.now(),
      /*
       * The answers ride on the refusal itself.
       *
       * They used to be left empty on the reasoning that fetching a past
       * response over a session that had just been refused was a lookup we
       * should not do — but the lookup that found the response is the same one
       * that decides the block, so it costs nothing to bring the answers back
       * with it. What it bought instead was the worst screen in the product:
       * somebody who filled in eleven questions comes back, is told they have
       * "already answered", and is shown a blank page with no evidence that any
       * of it survived.
       */
      answers: err.answers ?? [],
      outcome: err.outcome ?? "completed",
      ending: err.ending ?? null,
      /*
       * The server decides, and it now says yes as often as no.
       *
       * This was hardcoded false on the reasoning that a 409 is always a
       * refusal. It is not any more: on a form that accepts more than one
       * response the same 409 is a *hold* — here is what you sent, would you
       * like to send another — and hardcoding false hid the only button that
       * answers the question. Defaulting to false keeps a server that says
       * nothing on the old, safe behaviour.
       */
      canRepeat: err.canRepeat === true,
    });
    setStatus("ended");
    setResolving(false);
    return true;
  }, []);

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
      const { ok, data } = await sessionPost("auth/google", { idToken });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        return;
      }
      setThinking(false);
      if (settledAsAnswered(data)) return;
      setAuth((a) => (a ? { ...a, pending: false, error: authError(data) } : a));
    },
    [sessionPost, settledAsAnswered],
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
      const { ok, data } = await sessionPost("auth/phone/token", { idToken });
      if (ok) {
        setIdentity(data.identity as VerifiedIdentity);
        setAuth(null);
        return;
      }
      setThinking(false);
      if (settledAsAnswered(data)) return;
      setAuth((a) => (a ? { ...a, pending: false, error: authError(data) } : a));
    },
    [sessionPost, settledAsAnswered],
  );

  /**
   * A number proved by Firebase, offered against the answer that is waiting.
   *
   * The token, not a code: Firebase sent the SMS and checked the code in this
   * browser, so what the server receives is the proof rather than the secret.
   * It refuses a token for any number other than the one they answered with,
   * which is what stops "verify some number you control" from passing.
   */
  const submitVerifyPhoneToken = useCallback(
    async (idToken: string) => {
      setVerify((v) => (v ? { ...v, pending: true } : v));
      setValidationHint(null);
      setThinking(true);
      const { ok, data } = await sessionPost("verify/phone-token", { idToken });
      if (ok) return;
      // The turn never ran, so nothing is coming to lower the dots or re-arm
      // the card; both are put back here.
      setThinking(false);
      setVerify((v) => (v ? { ...v, pending: false } : v));
      setValidationHint(authError(data));
    },
    [sessionPost],
  );

  /**
   * Remember the verified identity for the *next* form on this device.
   *
   * An effect on `identity` rather than a line in each of the four sign-in
   * paths, because the fifth way an identity arrives is the `auth_verified`
   * event on a resumed session, and a shortcut that worked everywhere except
   * after a reload would be the one people notice.
   *
   * A preview runs against a draft and must leave no trace on the device, so
   * it reads the hint — the author should see what a respondent sees — and
   * writes nothing.
   */
  useEffect(() => {
    if (!identity || ephemeral) return;
    saveRespondentHint({
      provider: identity.provider,
      label: identity.label,
      name: identity.name,
      pictureUrl: identity.pictureUrl,
    });
  }, [identity, ephemeral]);

  /** "Use a different account": forget the name on the card, for good. */
  const forgetRespondentHint = useCallback(() => {
    clearRespondentHint();
    setRespondentHint(null);
  }, []);

  /**
   * Answer as somebody else.
   *
   * The identity on a conversation cannot be swapped in place — `attachIdentity`
   * is write-once, deliberately, so that nothing can move a half-written
   * response from one verified person to another. Switching account is
   * therefore a *new* conversation: this one keeps the answers already recorded
   * against the person who gave them, and the gate asks again with whichever
   * methods the form allows.
   *
   * The remembered name goes too. Leaving it would put the account they just
   * left back on the card as the one-tap suggestion, which is the opposite of
   * what "switch account" means.
   */
  const switchAccount = useCallback(async () => {
    clearRespondentHint();
    setRespondentHint(null);
    await startOver();
  }, [startOver]);

  const getUploadBase = useCallback(() => {
    const s = sessionRef.current;
    return s ? `${apiOrigin}/p/sessions/${s.sessionId}/uploads` : null;
  }, [apiOrigin]);

  const getRespondentToken = useCallback(() => sessionRef.current?.token ?? null, []);

  /**
   * Tell us — not the customer whose form this is — that something is wrong.
   *
   * Posted on the session because the respondent has nothing else to identify
   * themselves with, and because that is what lets the server attribute the
   * report to the person rather than to a browser. The answer is wanted inline:
   * the dialog has to distinguish "sent" from "you have already sent three
   * today", and the second of those is a sentence, not a failure.
   */
  const sendFeedback = useCallback(
    async (rating: number, message: string, snapshot?: unknown): Promise<{ ok: boolean; error?: string }> => {
      const text = message.trim();
      const { ok, data } = await sessionPost("feedback", {
        rating,
        ...(text ? { message: text } : {}),
      });
      if (ok) {
        /*
          What was on screen follows the report, never ahead of it and never
          instead of it. Not awaited: the respondent has already been told it
          reached us, and a snapshot that is slow, blocked by an extension or
          refused for size must not hold that sentence hostage. A failure here is
          silence — the report is already written and the founders already mailed.
        */
        const session = sessionRef.current;
        const id = typeof data.id === "string" ? data.id : null;
        if (snapshot && session && id) {
          void fetch(`${apiOrigin}/p/sessions/${session.sessionId}/feedback/${id}/snapshot`, {
            method: "PUT",
            headers: { "content-type": "application/json", "x-respondent-token": session.token },
            body: JSON.stringify(snapshot),
          }).catch(() => {});
        }
        return { ok: true };
      }
      const err = data.error as { message?: string } | undefined;
      return { ok: false, error: err?.message ?? "That didn't send. Check your connection and try again." };
    },
    [sessionPost, apiOrigin],
  );

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

  useEffect(() => {
    resyncRef.current = resync;
  }, [resync]);

  /**
   * Throw this stream away and open a new one.
   *
   * The recovery a page reload performs, minus the reload — and unlike
   * `resync`, it does not depend on the existing connection being alive,
   * which is the whole point of having it. Replay from durable storage is
   * deduped by sequence number, so a reconnect that turns out not to have
   * been needed costs one round trip and changes nothing on screen.
   */
  const hardReconnect = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    if (stallTimer.current) clearInterval(stallTimer.current);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    esRef.current?.close();
    esRef.current = null;
    setStatus("reconnecting");
    // attempt 0: a fresh problem, not the continuation of a backoff.
    reconnectRef.current?.(s.sessionId, s.token, 0);
    // The reconnect replays what this device missed; this asks for anything it
    // saw once and lost, which replay's seq ratchet will not re-deliver.
    void resyncRef.current?.();
  }, []);

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
      const step = stuckTurnStep({
        now,
        armedAt,
        lastEventAt: lastEventAtRef.current,
        lastAttemptAt,
        attempts,
        answering: liveRef.current.answering,
        actionable: liveRef.current.actionable,
      });
      if (step === "wait") return;
      if (step === "settle") {
        settleTurn();
        return;
      }
      if (step === "giveUp") {
        settleTurn();
        setError("That took longer than it should have. Tap retry to pick up where you left off.");
        return;
      }
      lastAttemptAt = now;
      attempts += 1;
      if (step === "reconnect") hardReconnect();
      else void resync();
    }, 1000);
    return () => clearInterval(timer);
  }, [thinking, resync, hardReconnect, settleTurn]);

  /**
   * A checkout in another tab, checked on while the form is looked at.
   *
   * See `PAYMENT_POLL_MS`. Keyed on the record, so a retry that creates a new
   * one restarts the ten minutes rather than inheriting what is left of them.
   */
  const pollRecordId =
    pendingPayment?.phase === "awaiting" && pendingPayment.launch?.kind === "redirect" && !pendingPayment.preview
      ? pendingPayment.recordId
      : null;
  useEffect(() => {
    if (!pollRecordId || !(ephemeral || isFramed())) return;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > PAYMENT_POLL_MAX_MS) {
        clearInterval(timer);
        return;
      }
      if (document.visibilityState === "visible") void confirmPayment(pollRecordId);
    }, PAYMENT_POLL_MS);
    return () => clearInterval(timer);
  }, [pollRecordId, ephemeral, confirmPayment]);

  /**
   * Coming back to the form while a payment is out.
   *
   * The moment that matters most on a phone: the respondent left for their UPI
   * app, or for the checkout tab, paid, and switched back. Asking then, rather
   * than waiting for a webhook, is what makes the chat move on as they arrive.
   * For every kind of checkout, not only the polled one.
   */
  const awaitingRecordId =
    pendingPayment?.phase === "awaiting" && !pendingPayment.preview ? pendingPayment.recordId : null;
  useEffect(() => {
    if (!awaitingRecordId) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void confirmPayment(awaitingRecordId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [awaitingRecordId, confirmPayment]);

  /*
   * Remembered before any checkout can take this window away from the form: a gateway that
   * redirects (Cashfree, when the payment method needs a page of its own) comes back through
   * `/pay/return`, which rebuilds this address from the slug — and without these an embedded
   * form returns as a standalone one, inside the host page's frame. See `rememberEmbedQuery`.
   */
  useEffect(() => {
    rememberEmbedQuery(slug, window.location.search);
  }, [slug]);

  /**
   * Back from a gateway redirect (`?cf_pay=`).
   *
   * Once the stream is up, which is when the resumed session is known to be
   * this one. Then the parameter comes out of the address bar, so a reload
   * later is an ordinary visit and a shared link does not carry it.
   */
  const paymentReturnRef = useRef(paymentReturn ?? null);
  useEffect(() => {
    if (status !== "ready") return;
    const recordId = paymentReturnRef.current;
    if (!recordId) return;
    paymentReturnRef.current = null;
    void confirmPayment(recordId);
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("cf_pay")) {
        url.searchParams.delete("cf_pay");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      /* A URL we cannot parse is not worth failing a live session over. */
    }
  }, [status, confirmPayment]);

  /**
   * Back from a redirect checkout the respondent cancelled (`?cf_pay_cancelled=`).
   *
   * Without this the replayed `payment_required` put the card straight into "Waiting for
   * payment confirmation…", with a spinner and nothing polling, for a payment they had just told
   * the gateway they were not making. Only that record, and only while it is still the one
   * waiting: a checkout since replaced, or already settled by the webhook, is left alone.
   */
  const paymentCancelledRef = useRef(paymentCancelled ?? null);
  useEffect(() => {
    if (status !== "ready") return;
    const recordId = paymentCancelledRef.current;
    if (!recordId) return;
    paymentCancelledRef.current = null;
    if (pendingPayment?.recordId === recordId && pendingPayment.phase === "awaiting") void cancelPayment();
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("cf_pay_cancelled")) {
        url.searchParams.delete("cf_pay_cancelled");
        window.history.replaceState(null, "", url.toString());
      }
    } catch {
      /* As above. */
    }
  }, [status, pendingPayment, cancelPayment]);

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
    verify,
    identity,
    respondentHint,
    forgetRespondentHint,
    switchAccount,
    signInWithGoogle,
    signInWithPhoneToken,
    submitVerifyCode,
    submitVerifyPhoneToken,
    resendVerifyCode,
    changeVerifyAnswer,
    pendingPayment,
    startPayment,
    confirmPayment,
    reopenCheckout,
    cancelPayment,
    simulatePayment,
    escalatedRef,
    validationHint,
    uploadSpec,
    getUploadBase,
    getRespondentToken,
    sendFeedback,
    send,
    sendStructured,
    sendAction,
    undoScreenOut,
    editAnswer,
    startOver,
    retry,
    dismissRateLimit: () => setRateLimited(null),
  };
}
