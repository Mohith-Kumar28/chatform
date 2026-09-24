/**
 * The shapes the API returns.
 *
 * Written by hand rather than generated, and deliberately loose where the API is
 * open-ended: `AnswerValue` spans 26 block types and a union that tried to be
 * exact would be wrong the day a type was added. Where a field is a documented
 * enum it is typed as one, with an escape hatch, so an unfamiliar value is a
 * value rather than a compile error.
 */

/**
 * `disqualified` is a response the form itself refused: it reached an ending
 * whose `kind` is `"screen_out"`. Terminal like `completed` — it has a
 * `completed_at` and no `next` — and never a completion: it does not fire
 * `response.completed`, and it is not in the completion rate. Handle it
 * wherever you handle `completed`, and count it separately.
 */
export type ResponseStatus = "in_progress" | "completed" | "disqualified" | "abandoned";
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
  /**
   * `"screen_out"` means the respondent was turned away rather than accepted.
   * Absent on an ending stored before endings had a kind, which is a success.
   */
  kind?: "success" | "screen_out";
  /** On a screen-out, the requirements this response did not meet. */
  requirements?: string[];
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
  /**
   * Set when the turn ended on a `verify` question waiting for its code.
   *
   * The next message you send is read as that code, not as an answer. Send it
   * with `send()`; `act(sessionId, "resend_code")` sends another, and
   * `act(sessionId, "change_answer")` drops it and asks the question again.
   */
  pendingVerification: {
    ref: string;
    channel: "sms" | "email";
    /** Normalized: the address or E.164 number the code actually went to. */
    sentTo: string;
    sentAt: number;
  } | null;
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

// ─────────────────────── 0.2.0: the rest of /v1 ───────────────────────

/**
 * A form document.
 *
 * `unknown` where the blocks are, and that is not laziness. The API publishes a
 * complete JSON Schema per block type at `GET /v1/blocks/{type}`, which is the
 * authority and which gains a type without this package being republished. What
 * the API does *not* publish is a schema for the document around them, so these
 * field names were read off `GET /v1/templates/{slug}`.
 *
 * Compose one and hand it to `forms.updateDocument()`. The linter it returns is
 * the only validator that counts.
 */
export interface FormDocument {
  schemaVersion: number;
  title: string;
  description?: string;
  blocks: unknown[];
  endings: unknown[];
  /** Checked once, after the last question. A rule pinned to one can never fire. */
  endingRules: unknown[];
  logic: unknown[];
  layout?: Record<string, unknown>;
  variables?: unknown[];
  hiddenFields?: unknown[];
  settings?: Record<string, unknown>;
  theme?: Record<string, unknown>;
}

export interface TemplateSummary {
  slug: string;
  title: string;
  category: string;
  description: string;
  blurb: string;
  tags: string[];
  icon: string;
  accent: string;
  blockCount: number;
  estMinutes: number;
  usageCount: number;
}

export interface TemplateDetail extends TemplateSummary {
  doc: FormDocument;
}

export interface FormVersionSummary {
  version: number;
  versionId: string;
  note: string | null;
  publishedAt: number;
  authorLabel: string;
  changeCount: number;
  isActive: boolean;
  /** Completed responses recorded against this version. */
  responses: number;
}

export interface FormVersion {
  version: number;
  versionId: string;
  note: string | null;
  publishedAt: number;
  doc: FormDocument;
  /** The version this one was diffed against, when `compare` was given. */
  comparedTo?: number;
  changes: unknown[];
  summary: string;
}

export interface RestoredVersion {
  ok: boolean;
  version: number;
  summary: string;
  changes: unknown[];
  doc: FormDocument;
}

export interface KnowledgeSource {
  id: string;
  kind?: string;
  title?: string;
  status?: string;
  [key: string]: unknown;
}

export interface KnowledgeIndex {
  sources: KnowledgeSource[];
  usage: { bytes: number; maxBytes: number; count: number; maxCount: number };
  /** False when the plan has no knowledge base, whatever is stored. */
  enabled: boolean;
}

export interface Integration {
  id: string;
  provider: string;
  status: string;
  createdAt: number;
  [key: string]: unknown;
}

export interface SpreadsheetIntegration extends Integration {
  /**
   * A live CSV. The URL is the credential, so treat it as a secret and rotate
   * it rather than deleting and recreating if it leaks.
   */
  feedUrl: string;
  includePartials: boolean;
}

export interface LintIssue {
  level: "error" | "warning" | string;
  code: string;
  message: string;
  path?: string;
  refs?: string[];
}

export interface AiGenerateResult {
  doc: FormDocument;
  issues?: LintIssue[];
  [key: string]: unknown;
}

export interface AiEditResult {
  doc: FormDocument;
  issues?: LintIssue[];
  summary?: string;
  [key: string]: unknown;
}

export interface ClarifyQuestion {
  question: string;
  why: string;
  kind: string;
  options: string[];
}

export interface RespondentAuthResult {
  ok?: boolean;
  [key: string]: unknown;
}

/**
 * How the follow-up emails for one form are doing.
 *
 * `holdout` and `liftPoints` are null until a holdout group has had time to not
 * come back, which is the only honest way to attribute a recovery.
 */
export interface FollowUpStats {
  everScheduled: boolean;
  sent: number;
  pending: number;
  clicked: number;
  recovered: number;
  clickRate: number;
  recoveryRate: number;
  byStep: unknown[];
  daily: { date: string; sent: number; recovered: number }[];
  holdout: number | null;
  liftPoints: number | null;
}
