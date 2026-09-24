import type { PublicBlock, PublicEnding, RespondentAuthMethod } from "@repo/form-schema";
import type { CheckoutLaunch, PaymentProvider } from "./payments/types.js";

export interface SSEEnvelope {
  v: 1;
  seq: number;
  ts: number;
  type: string;
  data: unknown;
}

export interface QuestionPayload {
  messageId: string;
  block: PublicBlock;
  progress: { answered: number; totalEstimate: number; pct: number };
  /**
   * What a refused record-shaped answer already got right.
   *
   * Only `contact_info` and `address` ever carry one. A card refused for one
   * bad field used to come back with all four boxes empty, so the agent asking
   * "could you share your phone number again?" sat above a form asking for the
   * name and the email again too. `validateAnswer` returns the fields that
   * passed as `partial`; the session keeps them against the block ref and
   * re-states the question holding them.
   */
  prefill?: Record<string, string>;
}

export interface EscalatePayload {
  ref: string;
  spec: PublicBlock;
  reason: string;
}

export type ServerEvent =
  | {
      type: "session_ready";
      data: {
        sessionId: string;
        formTitle: string;
        agentMode: string;
        brandingHidden: boolean;
        /**
         * Who the session already knows this respondent to be.
         *
         * `auth_verified` announces the *moment* somebody verifies, and is
         * therefore silent about every session that arrived already knowing —
         * a follow-up link carries the identity proved against that response
         * forward (`loadResumable`), and the gate then never fires at all. A
         * respondent coming back through an email had no way to tell whether
         * they were signed in, as whom, or how to be somebody else.
         *
         * Sent per connection rather than persisted, so a reload past the
         * replay window recovers it too.
         */
        identity: { provider: string; label: string; name: string | null; pictureUrl: string | null } | null;
      };
    }
  | { type: "user_message"; data: { messageId: string; text: string } }
  | { type: "message_start"; data: { messageId: string; role: "assistant" } }
  /**
   * `text` is the finished message, and is what a client resuming mid-stream
   * uses to complete a bubble it only has part of — every frame carrying the
   * rest sits below the sequence number it has already applied. Absent when
   * the message streamed no tokens.
   */
  | { type: "message_end"; data: { messageId: string; interrupted?: boolean; text?: string } }
  | { type: "token"; data: { messageId: string; delta: string } }
  | { type: "question"; data: QuestionPayload }
  | { type: "validation_error"; data: { ref: string; code: string; message: string } }
  | { type: "upload_request"; data: { ref: string; accept: string[]; maxFiles: number; maxSizeMB: number } }
  | { type: "upload_received"; data: { ref: string; fileId: string; filename: string } }
  | { type: "answer_recorded"; data: { ref: string; pct: number } }
  /**
   * The split on a poll, sent once, immediately after the vote that earned it.
   *
   * Pushed rather than fetched because the respondent is owed it the instant
   * they answer, and because the session already knows the numbers: a second
   * request would be a round trip to learn what the first one just wrote.
   *
   * `counts` is absent until `total` reaches the block's reveal floor. The
   * total is sent either way, so a form that cannot show the split yet can
   * still say how many people are ahead of them rather than going quiet.
   */
  | {
      type: "poll_result";
      data: {
        ref: string;
        total: number;
        /** This respondent's own option, so the card can mark it without keeping its own books. */
        picked?: string;
        /** Every option with its count, labels included, or absent below the reveal floor. */
        options?: { id: string; label: string; count: number }[];
      };
    }
  | { type: "branch_jump"; data: { from: string; to: string } }
  | { type: "escalate_ui"; data: EscalatePayload }
  | {
      /** Every question answered; waiting on an explicit submit. */
      type: "review";
      data: { answers: { ref: string; title: string; display: string }[] };
    }
  | {
      /** The form wants a verified respondent before the first question. */
      type: "auth_required";
      data: { method: RespondentAuthMethod; message: string };
    }
  | {
      type: "auth_verified";
      data: { provider: RespondentAuthMethod; label: string; name: string | null; pictureUrl: string | null };
    }
  | {
      /**
       * A code went to the answer just given, and the answer is not recorded
       * until it comes back.
       *
       * Deliberately not an `auth_required` of its own: this is one question
       * mid-conversation, not a gate on the session, and the client keeps
       * showing the transcript around it. `sentTo` is the normalized
       * destination — the E.164 or lower-cased address the code actually went
       * to, which is not always what they typed.
       */
      type: "verify_required";
      data: {
        ref: string;
        channel: "sms" | "email";
        sentTo: string;
        sentAt: number;
        /** Development only, with no SMS provider configured. */
        devCode?: string;
      };
    }
  | {
      /**
       * The pending code step is over — verified, or given up on so the
       * question can be answered again. `question` follows in the second case.
       */
      type: "verify_settled";
      data: { ref: string; verified: boolean };
    }
  | {
      /**
       * A verified payment is waiting on the respondent, and this is how to
       * open its checkout.
       *
       * Emitted when they press Pay, and again on `resync` while it is still
       * outstanding, so a reloaded tab gets the card back instead of a
       * question it cannot answer. Like `verify_required`, it sits in the
       * thread under one question rather than gating the session.
       *
       * `launch` never carries a secret — see `CheckoutLaunch`. `amount` is
       * major units and `display` is `formatAmount`'s rendering, so the card
       * and the answer summary show the same price. `preview` marks a builder
       * preview, whose checkout is simulated and never reaches a gateway.
       */
      type: "payment_required";
      data: {
        ref: string;
        provider: PaymentProvider;
        amountMinor: number;
        amount: number;
        currency: string;
        display: string;
        launch: CheckoutLaunch;
        recordId: string;
        /** Epoch ms after which this checkout can no longer be paid. */
        expiresAt: number;
        preview?: boolean;
      };
    }
  | {
      /**
       * The gateway confirmed it. The answer is recorded from the server's
       * record and `answer_recorded` and the next question follow — this event
       * only takes the card down. The SSE stream decides the outcome; a
       * client's own confirm call is a nudge, never the verdict.
       */
      type: "payment_settled";
      data: { ref: string; recordId: string; status: "paid" };
    }
  | {
      /**
       * This attempt did not go through — declined, expired, cancelled. The
       * card stays up so they can try again, and `code` says whether they can.
       */
      type: "payment_failed";
      data: { ref: string; recordId: string; code: string; message: string };
    }
  | {
      type: "ending";
      /** `canUndo`: on a screen-out, whether "I answered that by mistake" is still on offer. */
      data: { ending: PublicEnding; canUndo?: boolean };
    }
  | { type: "complete"; data: { submissionId: string; durationMs: number } }
  | {
      /**
       * A turn that failed in a way the respondent has to be told about.
       *
       * Named `error_event`, not `error`: SSE event names become
       * `EventSource` event names, and `error` is already the one the browser
       * fires for transport failures. A server event called `error` would have
       * been read as "the connection died" and triggered a reconnect instead
       * of being shown. It is also what unsticks the typing indicator when a
       * turn ends without a question — an HTTP status cannot do that, because
       * the turn may have been started by something other than this client.
       */
      type: "error_event";
      data: { code: string; message: string };
    }
  | { type: "rate_limited"; data: { retryAfter: number } }
  | { type: "ping"; data: Record<string, never> };
