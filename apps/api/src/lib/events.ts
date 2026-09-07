import type { PublicBlock, PublicEnding, RespondentAuthMethod } from "@repo/form-schema";

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
}

export interface EscalatePayload {
  ref: string;
  spec: PublicBlock;
  reason: string;
}

export type ServerEvent =
  | { type: "session_ready"; data: { sessionId: string; formTitle: string; agentMode: string; brandingHidden: boolean } }
  | { type: "user_message"; data: { messageId: string; text: string } }
  | { type: "message_start"; data: { messageId: string; role: "assistant" } }
  | { type: "message_end"; data: { messageId: string; interrupted?: boolean } }
  | { type: "token"; data: { messageId: string; delta: string } }
  | { type: "question"; data: QuestionPayload }
  | { type: "validation_error"; data: { ref: string; code: string; message: string } }
  | { type: "upload_request"; data: { ref: string; accept: string[]; maxFiles: number; maxSizeMB: number } }
  | { type: "upload_received"; data: { ref: string; fileId: string; filename: string } }
  | { type: "answer_recorded"; data: { ref: string; pct: number } }
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
      data: { methods: RespondentAuthMethod[]; message: string };
    }
  | {
      type: "auth_verified";
      data: { provider: RespondentAuthMethod; label: string; name: string | null; pictureUrl: string | null };
    }
  | { type: "ending"; data: { ending: PublicEnding } }
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
