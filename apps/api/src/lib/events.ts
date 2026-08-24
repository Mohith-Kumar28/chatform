import type { PublicBlock, PublicEnding } from "@repo/form-schema";

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
  | { type: "ending"; data: { ending: PublicEnding } }
  | { type: "complete"; data: { submissionId: string; durationMs: number } }
  | { type: "error"; data: { code: string; message: string } }
  | { type: "rate_limited"; data: { retryAfter: number } }
  | { type: "ping"; data: Record<string, never> };
