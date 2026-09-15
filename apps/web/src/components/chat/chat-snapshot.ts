import type { PublicFormConfig } from "@repo/form-schema";
import type {
  ChatMessage,
  ConnectionStatus,
  EndingState,
  QuestionState,
  ReviewState,
  SubmittedState,
} from "./use-chat";

/**
 * What a respondent was looking at when they pressed "Report a bug".
 *
 * Not a screenshot and not a DOM dump. This screen is a pure function of a small
 * amount of state the browser already holds — the form's public config, the
 * messages, and whichever card is up — so that state *is* the snapshot. It is a
 * few kilobytes, it needs no library in the respondent's bundle, and the console
 * replays it through the same components the respondent saw.
 *
 * It is taken here rather than reconstructed on the server for three reasons,
 * each of which was checked: `chat_sessions.state_snapshot_json` is a dead
 * column; `chat_messages` is not written until a response finalises, which never
 * happens for somebody who stopped at question three to tell us it broke; and
 * re-reading the published form later re-applies *today's* plan clamps, so it
 * would not show what was actually on screen if the account's plan had changed.
 *
 * `v` is the shape's version. The replay reads it; a future change to this type
 * bumps it rather than quietly reinterpreting old reports.
 */
export interface ChatSnapshot {
  v: 1;
  capturedAt: number;
  /** Already plan-clamped by the server — the exact config the page rendered. */
  config: PublicFormConfig;
  messages: Pick<ChatMessage, "id" | "role" | "text" | "answeredRef">[];
  question: QuestionState | null;
  review: ReviewState | null;
  ending: EndingState | null;
  submitted: Pick<SubmittedState, "at" | "outcome"> | null;
  /** Which gate was up, if any — never the code or the token behind it. */
  auth: { method: string; message: string; error: string | null } | null;
  verify: { channel: string; sentTo: string | null } | null;
  status: ConnectionStatus;
  error: string | null;
  thinking: boolean;
  validationHint: string | null;
  viewport: { width: number; height: number; dpr: number };
  timezone: string | null;
  path: string | null;
}

/** Everything `captureSnapshot` reads, named so a caller cannot pass the wrong half. */
export interface SnapshotSource {
  config: PublicFormConfig;
  messages: ChatMessage[];
  question: QuestionState | null;
  review: ReviewState | null;
  ending: EndingState | null;
  submitted: SubmittedState | null;
  auth: { method: string; message: string; error: string | null } | null;
  verify: { channel: string; sentTo: string } | null;
  status: ConnectionStatus;
  error: string | null;
  thinking: boolean;
  validationHint: string | null;
}

/**
 * Freeze the screen.
 *
 * Deliberately narrow about what it keeps. A verification code shown in dev, a
 * resume token in the URL's query, and streaming flags on half-written messages
 * all describe *this device's* session rather than what was on screen, and a
 * snapshot is evidence that gets read by other people — so only the path goes in,
 * never the query string, and messages keep their words and their role.
 */
export function captureSnapshot(src: SnapshotSource): ChatSnapshot {
  return {
    v: 1,
    capturedAt: Date.now(),
    config: src.config,
    messages: src.messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      ...(m.answeredRef ? { answeredRef: m.answeredRef } : {}),
    })),
    question: src.question,
    review: src.review,
    ending: src.ending,
    submitted: src.submitted ? { at: src.submitted.at, outcome: src.submitted.outcome } : null,
    auth: src.auth ? { method: src.auth.method, message: src.auth.message, error: src.auth.error } : null,
    verify: src.verify ? { channel: src.verify.channel, sentTo: src.verify.sentTo } : null,
    status: src.status,
    error: src.error,
    thinking: src.thinking,
    validationHint: src.validationHint,
    viewport:
      typeof window === "undefined"
        ? { width: 0, height: 0, dpr: 1 }
        : { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    timezone: safeTimezone(),
    path: typeof window === "undefined" ? null : window.location.pathname,
  };
}

function safeTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
