import type { PublicFormConfig } from "@repo/form-schema";
import type { ChatState } from "./chat-client";

/**
 * What a respondent was looking at when they pressed "Report a bug".
 *
 * Not a screenshot and not a DOM dump. The chat screen is `ChatSurface`, a pure
 * function of the form's public config and one `ChatState` object, so that
 * state *is* the snapshot: a few kilobytes, no library in the respondent's
 * bundle, and the console replays it through `ChatSurface` itself — the same
 * bubbles, cards, chips and composer the respondent saw, not a lookalike.
 *
 * It is taken in the browser rather than reconstructed on the server because
 * nothing on the server knows it while a conversation is still going:
 * `chat_sessions.state_snapshot_json` is a dead column, `chat_messages` is only
 * written when a response finalises, and re-reading the published form later
 * re-applies *today's* plan clamps rather than the ones that were on screen.
 *
 * `v` is the shape's version. Version 1 held a narrower slice; `toChatState`
 * still replays it, so reports filed before this changed keep their screen.
 */

/** The data half of `ChatState` — every field that is a value rather than a callback. */
export type ScreenState = Pick<
  ChatState,
  | "messages"
  | "pollResults"
  | "question"
  | "review"
  | "submitted"
  | "ending"
  | "status"
  | "error"
  | "thinking"
  | "answering"
  | "resolving"
  | "rateLimited"
  | "closed"
  | "resumed"
  | "auth"
  | "verify"
  | "identity"
  | "respondentHint"
  | "escalatedRef"
  | "validationHint"
  | "uploadSpec"
>;

export interface ChatSnapshotV2 {
  v: 2;
  capturedAt: number;
  /** Already plan-clamped by the server — the exact config the page rendered. */
  config: PublicFormConfig;
  state: ScreenState;
  viewport: { width: number; height: number; dpr: number };
  timezone: string | null;
  path: string | null;
}

/** The first shape, kept only so reports filed under it still replay. */
export interface ChatSnapshotV1 {
  v: 1;
  capturedAt: number;
  config: PublicFormConfig;
  messages: ScreenState["messages"];
  /** Optional: a report filed before polls existed, or a form with none, has no bars to replay. */
  pollResults?: ScreenState["pollResults"];
  question: ScreenState["question"];
  review: ScreenState["review"];
  ending: ScreenState["ending"];
  submitted: { at: number; outcome?: unknown } | null;
  auth: { method: string; message: string; error: string | null } | null;
  verify: { channel: string; sentTo: string | null } | null;
  status: ScreenState["status"];
  error: string | null;
  thinking: boolean;
  validationHint: string | null;
  viewport: { width: number; height: number; dpr: number };
  timezone: string | null;
  path: string | null;
}

export type ChatSnapshot = ChatSnapshotV1 | ChatSnapshotV2;

/**
 * Freeze the screen.
 *
 * Deliberately narrow about what it keeps beyond the screen itself: a
 * verification code shown in dev, a half-streamed message's flags and the
 * query string all describe *this device's* session rather than what was on
 * screen, and a snapshot is evidence other people read.
 */
export function captureSnapshot(config: PublicFormConfig, chat: ChatState): ChatSnapshotV2 {
  return {
    v: 2,
    capturedAt: Date.now(),
    config,
    state: {
      messages: chat.messages.map((m) => ({ ...m, streaming: false, optimistic: false })),
      pollResults: chat.pollResults,
      question: chat.question,
      review: chat.review,
      submitted: chat.submitted,
      ending: chat.ending,
      status: chat.status,
      error: chat.error,
      thinking: chat.thinking,
      answering: chat.answering,
      resolving: false,
      rateLimited: chat.rateLimited,
      /*
        Always null in practice: the closed screen has no "Report a bug" link,
        so there is no way to capture from it. Carried anyway so the replay is
        a complete `ScreenState` rather than one with a hole the console has to
        know about.
      */
      closed: chat.closed,
      resumed: chat.resumed,
      auth: chat.auth,
      verify: chat.verify ? { ...chat.verify, devCode: undefined } : null,
      identity: chat.identity,
      respondentHint: chat.respondentHint,
      escalatedRef: chat.escalatedRef,
      validationHint: chat.validationHint,
      uploadSpec: chat.uploadSpec,
    },
    viewport:
      typeof window === "undefined"
        ? { width: 0, height: 0, dpr: 1 }
        : { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    timezone: safeTimezone(),
    path: typeof window === "undefined" ? null : window.location.pathname,
  };
}

const noop = () => {};
const noopAsync = async () => {};

/**
 * A snapshot, turned back into something `ChatSurface` can draw.
 *
 * Every action is a no-op: the surface is `inert` in a replay anyway, and a
 * no-op is the belt to that brace — a replay must never be able to answer a
 * question, sign anybody in or send a report on a stranger's behalf.
 */
export function toChatState(snapshot: ChatSnapshot): ChatState {
  const state: ScreenState =
    snapshot.v === 2
      ? // `closed` was added after v2 shipped, so a report filed before it has
        // no such field — and `undefined` there would make `chat-client` draw
        // the closed screen over somebody's replayed conversation.
        { ...snapshot.state, closed: snapshot.state.closed ?? null }
      : {
          messages: snapshot.messages,
          pollResults: snapshot.pollResults ?? {},
          question: snapshot.question,
          review: snapshot.review,
          ending: snapshot.ending,
          // v1 kept only the timestamp; the thread still shows, the receipt does not.
          submitted: null,
          status: snapshot.status,
          error: snapshot.error,
          thinking: snapshot.thinking,
          answering: false,
          resolving: false,
          rateLimited: null,
          closed: null,
          resumed: false,
          auth: snapshot.auth
            ? {
                method: snapshot.auth.method === "phone" ? "phone" : "google",
                message: snapshot.auth.message,
                pending: false,
                error: snapshot.auth.error,
              }
            : null,
          verify: null,
          identity: null,
          respondentHint: null,
          escalatedRef: null,
          validationHint: snapshot.validationHint,
          uploadSpec: null,
        };

  const chat: ChatState = {
    ...state,
    forgetRespondentHint: noop,
    switchAccount: noopAsync,
    signInWithGoogle: noopAsync,
    signInWithPhoneToken: noopAsync,
    submitVerifyCode: noopAsync,
    submitVerifyPhoneToken: noopAsync,
    resendVerifyCode: noopAsync,
    changeVerifyAnswer: noopAsync,
    getUploadBase: () => null,
    getRespondentToken: () => null,
    sendFeedback: async () => ({ ok: false }),
    send: noopAsync,
    sendStructured: noopAsync,
    sendAction: noopAsync,
    undoScreenOut: noopAsync,
    editAnswer: noopAsync,
    startOver: noopAsync,
    retry: noop,
    dismissRateLimit: noop,
  };
  return chat;
}

function safeTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
