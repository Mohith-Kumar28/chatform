/**
 * The shapes the API returns.
 *
 * Written by hand rather than generated, and deliberately loose where the API is
 * open-ended: `AnswerValue` spans 26 block types and a union that tried to be
 * exact would be wrong the day a type was added. Where a field is a documented
 * enum it is typed as one, with an escape hatch, so an unfamiliar value is a
 * value rather than a compile error.
 */

export type ResponseStatus = "in_progress" | "completed" | "abandoned";
export type ResponseSource = "chat" | "embed" | "api";
export type Mode = "live" | "test";

/** Anything a block can hold. Per-type shapes are in the block reference. */
export type AnswerValue = unknown;

export interface PublicBlock {
  id: string;
  ref: string;
  type: string;
  title: string;
  description?: string;
  required: boolean;
  [key: string]: unknown;
}

export interface PublicEnding {
  ref: string;
  title: string;
  bodyMd?: string;
  redirectUrl?: string | null;
  [key: string]: unknown;
}

export interface Progress {
  answered: number;
  totalEstimate: number;
  pct: number;
}

export interface ChatformResponse {
  id: string;
  object: "response";
  form_id: string;
  status: ResponseStatus;
  source: ResponseSource;
  mode: Mode;
  started_at: number;
  updated_at: number | null;
  completed_at: number | null;
  expires_at: number | null;
  duration_ms: number | null;
  ending_ref: string | null;
  abandon_reason: string | null;
  progress: Progress;
  variables: Record<string, string | number>;
  hidden_fields: Record<string, string>;
  /** Where the flow is waiting. Null once the response is finished. */
  next: { kind: "block"; block: PublicBlock } | { kind: "ending"; ending: PublicEnding } | null;
  complete_ready: boolean;
  missing_required: { ref: string; title: string }[];
  off_path_answers: string[];
  answers?: { ref: string; type: string | null; value: AnswerValue }[];
}

export interface Page<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface FormSummary {
  id: string;
  title: string;
  slug: string;
  status: string;
  published: boolean;
  created_at: number;
  updated_at: number;
}

export interface SessionCreated {
  sessionId: string;
  /**
   * Scoped to this session and expiring. This — never the API key — is what a
   * browser should be given.
   */
  respondentToken: string;
  expiresAt: number;
  streamUrl: string;
  greeting: string | null;
  question: PublicBlock | null;
}

export interface SessionEvent {
  v: 1;
  seq: number;
  ts: number;
  type: string;
  data: unknown;
}

export interface TurnResult {
  accepted: boolean;
  complete: boolean;
  awaitingSubmit: boolean;
  assistantMessages: string[];
  question: PublicBlock | null;
  ending: PublicEnding | null;
  /** A rejected answer. Not an error — the same question comes back. */
  validation: { ref: string; code: string; message: string } | null;
  answers: Record<string, AnswerValue>;
  collected: number;
  events: SessionEvent[];
  sinceSeq: number;
  /** Present when the turn outran its deadline and is still running. */
  status?: "processing";
  pollUrl?: string;
}

export interface KeyIdentity {
  organization_id: string;
  key: { id: string | null; type: string | null; mode: Mode; scopes: Record<string, string[]> };
  plan: string;
  limits: Record<string, unknown>;
}

export interface BlockDefinition {
  type: string;
  summary: string;
  config_hint: string | null;
  needs_options: boolean;
  answered_by: string;
  config_schema: unknown;
  public_block: PublicBlock;
  answer: {
    shape: string;
    ts_type: string;
    examples: { value: unknown; canonical?: unknown; note?: string }[];
    error_codes: string[];
  };
}
