import { DurableObject } from "cloudflare:workers";
import {
  FormDoc,
  resolveNext,
  validateAnswer,
  enforcesUnique,
  DUPLICATE_HINT,
  toPublicBlock,
  toPublicEnding,
  type AnswerMap,
  type Block,
  type Ending,
  type EvalState,
  migrateFormDoc,
  readFormDoc,
  replayState,
  unsatisfiedRequired,
  progressOf,
  needsExtraction,
  extractionSchema,
  extractionGuidance,
  resolveEnding,
  answerability,
  displayAnswer as summarizeAnswer,
  isRequirementUnmet,
  defaultEnding,
  normalizeE164,
  type ConditionGroup,
  type PublicBlock,
  type PublicEnding,
  interpolate,
  contactFieldPhrase,
  resolvePaymentAmount,
  formatAmount,
  toMinorUnits,
  fromMinorUnits,
  PAYMENT_PROVIDERS,
  PAYMENT_PROVIDER_LABELS,
  type SettledPayment,
  type ValidateOptions,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { gatewayEnabled, signInBypassed } from "../lib/payments/flag.js";
import { loadAccountForOrg } from "../lib/payments/accounts.js";
import {
  CheckoutUnavailableError,
  MAX_PAYMENT_ATTEMPTS,
  PAYMENT_GRACE_MS,
  claimSettlement,
  clearAmountChanged,
  confirmPaymentRecord,
  countPaymentAttempts,
  createCheckoutForSession,
  customerIdFor,
  findSettledPayment,
  flagStaleSiblings,
  loadRecord,
  markAmountChanged,
  markDuplicate,
  markSettled,
  providersForAccounts,
  releaseSettlementClaim,
  settledPaymentOf,
  supersedeRecord,
  type SettleResult,
  type StartPaymentErrorCode,
  type StartPaymentResult,
} from "../lib/payments/service.js";
import type { CheckoutLaunch, PaymentProvider, RespondentPaymentRow } from "../lib/payments/types.js";
import { webOrigins } from "../lib/origins.js";
import type { ServerEvent, SSEEnvelope } from "../lib/events.js";
import { asideText, clarifyText, closingText, codeExpectedText, codeSentText, codeVerifiedText, escalateText, greeting, looksLikeQuestion, questionText, transitionAck } from "../lib/phrasing.js";
import {
  chatModel,
  interviewModel,
  extractAnswer,
  MODELS,
  INTERVIEW_PROVIDER_OPTIONS,
  callTag,
  REASONING_HEADROOM_TOKENS,
  reportedUsage,
  NO_USAGE,
  type TokenUsage,
} from "../lib/ai.js";
import {
  affordanceNote,
  buildStablePrefix,
  buildTurnSuffix,
  buildRetryObjective,
  buildReviewSuffix,
} from "../lib/agent-prompts.js";
import { buildAgentTools, nextStepAfter, resumeAfterChange, revisionOf, type ToolOutcome } from "./agent-tools.js";
import { knowledgeStore, knowledgeAvailable } from "../lib/knowledge/index.js";
import { getEntitlements } from "../lib/entitlements.js";
import { clampForRuntime } from "../lib/doc-entitlements.js";
import { can } from "@repo/entitlements";
import { meter } from "../lib/entitlements.js";
import { logAiGeneration } from "../lib/ai-usage.js";
import {
  newResponseId,
  openResponse,
  attachRespondent,
  recordAnswerRow,
  deleteAnswerRow,
  finalizeResponse,
  reopenResponse,
  restartResponse,
  reopenAbandonedResponse,
  findDuplicateAnswer,
  type ResponseOwner,
} from "../lib/submissions.js";
import { startEmailChallenge, verifyEmailChallenge } from "../lib/respondent-auth.js";
import { findOpenResponseId } from "../lib/respondent-history.js";
import type { RespondentKeySource } from "../lib/respondent-key.js";
import type { RespondentIdentity, RespondentAuthMethod } from "@repo/form-schema";
import { streamText, stepCountIs } from "ai";

interface DoSessionMeta {
  sessionId: string;
  formId: string;
  formVersionId: string;
  organizationId: string;
  slug: string;
  brandingHidden: boolean;
  respondentToken: string;
  /**
   * `disqualified` is terminal like `completed` and is NOT a completion: the
   * conversation reached a `screen_out` ending, so the respondent was turned
   * away rather than having submitted. Everything that closes a session treats
   * the two the same; everything that counts submissions must not.
   */
  status: "active" | "completed" | "disqualified" | "abandoned" | "blocked";
  currentRef: string | null;
  startedAt: number;
  hiddenFields: Record<string, string>;
  ipHash: string | null;
  /** Salted device key, from `lib/respondent-key.ts`. Null when nothing identified the device. */
  fingerprint?: string | null;
  /**
   * What that key was computed from.
   *
   * Carried because "device" and "ip" are not interchangeable and the value
   * alone cannot tell them apart. A hashed IP is shared by everyone behind one
   * router, so anything that treats the key as *this person* — reusing their
   * open response, above all — must honour only a real device signal.
   */
  fingerprintSource?: RespondentKeySource | null;
  /**
   * Who this is, platform-wide, resolved when the session opened.
   *
   * Stamped onto the response so a person's history can be assembled across
   * forms. Null when the visit offered nothing to recognise anybody by — see
   * `lib/respondents.ts`.
   */
  respondentId?: string | null;
  /** The platform-wide device key, so a sign-in mid-form can link this browser. */
  respondentDeviceKey?: string | null;
  /** They pressed "Start over": never reuse an earlier open response. */
  startedOver?: boolean;
  country: string | null;
  userAgent: string | null;
  /** Set when the respondent submits, for the already-submitted screen. */
  completedAt?: number | null;
  /** Set once the sign-in gate is satisfied. Null while it still blocks. */
  identity?: RespondentIdentity | null;
  /**
   * A `verify` answer that has been given, had a code sent to it, and is
   * waiting for that code back.
   *
   * On the session rather than in memory because it decides how the *next*
   * turn is read: while it is set, what the respondent types is a code and not
   * an answer. An eviction between the two would otherwise hand their code to
   * the agent as a reply to the question.
   */
  pendingVerify?: {
    ref: string;
    channel: "sms" | "email";
    /** The validated answer, held here until the code proves it. */
    value: string;
    /** Normalized destination the code actually went to. */
    sentTo: string;
    sentAt: number;
    devCode?: string;
    /** The bubble the answer was echoed in, so recording it does not draw a second. */
    messageId: string | null;
  } | null;
  /**
   * Destinations this session has already proved.
   *
   * So correcting a later answer, or coming back to the same question with the
   * pencil, does not send a second code to a number they have already
   * confirmed — and so a form asking for the same address twice asks once.
   */
  verified?: string[];
  /**
   * A verified-payment checkout the respondent has opened and not finished.
   *
   * The payment-block sibling of `pendingVerify`, and on the session for the
   * same reason: it decides how the next turn is read, and what a reloaded tab
   * is shown. While it is set a typed message is a question about the
   * checkout, not an answer, and `resync` puts the Pay card back rather than a
   * question the respondent cannot answer by typing.
   *
   * Nothing here is proof of anything. The answer is only ever written from
   * the D1 record once the gateway confirms it — see `settlePayment`. `launch`
   * is what the browser needs to reopen checkout and carries no secret.
   */
  pendingPayment?: {
    ref: string;
    recordId: string;
    provider: PaymentProvider;
    amountMinor: number;
    amount: number;
    currency: string;
    display: string;
    launch: CheckoutLaunch;
    /** Epoch ms. The checkout cannot be paid after this; the session waits `PAYMENT_GRACE_MS` longer. */
    expiresAt: number;
    /** Checkouts opened for this ref so far, this one included. */
    attempts: number;
    preview?: boolean;
  } | null;
  /**
   * Checkouts opened per question, kept past the pending one being cleared.
   *
   * A retry clears `pendingPayment`, so the count cannot live only there — or
   * "retry" would be a way to open unlimited gateway orders on the admin's
   * account, each one a real API call against their rate limit.
   */
  paymentAttempts?: Record<string, number>;
  /**
   * A phone number the respondent typed into the Pay card, for a gateway that will not open a
   * checkout without one (Cashfree) on a session that had none — a Google sign-in, and no phone
   * question before the payment. Kept so a retry does not ask again. Never an answer.
   */
  paymentPhone?: string | null;
  /**
   * Which surface opened this session.
   *
   * Optional, and defaulted to `"chat"` when read: sessions persisted before
   * this field existed read back without it, and a DO storage migration for a
   * value that is `"chat"` in every historical case would be ceremony.
   */
  source?: "chat" | "embed" | "api";
  /** Opened with a `*_test_` API key: real rows, excluded from every count. */
  isTest?: boolean;
  /** Which ending the conversation reached, once it has. */
  endingRef?: string | null;
  /**
   * The question whose answer sent this response to a screen-out.
   *
   * Remembered so a refusal has a way back. A screen-out is almost always one
   * answer's doing — and often a mis-tap on a yes/no — so "I answered that by
   * mistake" needs to know which question to reopen, and the cursor has
   * already been cleared by the time the respondent reads the card.
   *
   * Null on a completion, and cleared the moment the undo is taken.
   */
  screenedOutFrom?: string | null;
  /**
   * How many screen-outs this session has taken back.
   *
   * Every undo re-finalizes the response when the refusal lands again, and each
   * finalize sends the owner another `response.disqualified`. Unbounded, one
   * respondent looping "No → undo → No" is a webhook firehose. See
   * `MAX_SCREEN_OUT_UNDOS`.
   */
  undoCount?: number;
}

/**
 * The result of a turn driven over HTTP rather than over the stream.
 *
 * Carries the events the turn produced, so a headless caller sees exactly what a
 * streaming client would have — one event contract, two transports.
 */
export interface SyncTurnResult {
  accepted: boolean;
  error?: string;
  /** The turn outran its deadline; it is still running, and `events` is partial. */
  timedOut: boolean;
  /** Resume point: poll `eventsSince(sinceSeq)` for anything that arrived later. */
  sinceSeq: number;
  events: SSEEnvelope[];
  assistantMessages: string[];
  question: PublicBlock | null;
  ending: PublicEnding | null;
  validation: { ref: string; code: string; message: string } | null;
  complete: boolean;
  awaitingSubmit: boolean;
  status: Awaited<ReturnType<SessionDO["getStatus"]>>;
}

/** The single `"session"` storage blob. Everything here survives eviction. */
/**
 * One respondent turn as it arrives. `turnId` is the client's own id for the
 * send, carried so a retry of a request whose response was never seen can be
 * recognised rather than replayed. See `TurnInput` handling in `handleUserTurn`.
 */
type TurnInput =
  | { type: "text"; text: string; turnId?: string }
  | { type: "structured"; ref: string; value: unknown; turnId?: string };

/**
 * Everything a respondent can press that is not an answer.
 *
 * `retry_payment` and `cancel_payment` only mean anything while a checkout is
 * open. `simulate_payment` exists only in a builder preview, where it stands
 * in for a gateway that must never be charged — see `simulatePayment`.
 */
type SessionAction =
  | "skip"
  | "stop"
  | "restart"
  | "edit"
  | "submit"
  | "resend_code"
  | "change_answer"
  | "undo_screen_out"
  | "retry_payment"
  | "cancel_payment"
  | "simulate_payment";

interface StoredSession {
  meta: DoSessionMeta;
  docJson: unknown;
  answers: AnswerMap;
  variables: Record<string, string | number>;
  seq: number;
  turnCount: number;
  collectedCount: number;
  invalidCounts?: Record<string, number>;
  /** Per block ref: the sub-fields of a refused contact/address card that were good. */
  partials?: Record<string, Record<string, string>>;
  sessionTokensUsed?: number;
  /** How much of `sessionTokensUsed` has already been metered to the org. */
  meteredTokens?: number;
  /** Retired: merged into `sessionTokensUsed`. Still read when resuming an old session. */
  phrasingTokensUsed?: number;
  extractionCalls?: number;
  editingRef?: string | null;
  degraded?: boolean;
  pendingEndingRef?: string | null;
  gatedAtRef?: string | null;
  seenTurnIds?: string[];
}

/**
 * Block types whose validator accepts any non-empty string, so "is this an
 * answer or a question back?" cannot be decided by validation alone.
 */
function acceptsAnyString(block: Block): boolean {
  return block.type === "short_text" || block.type === "long_text";
}

/**
 * An Error, flattened into fields a log line will actually carry.
 *
 * `console.error("turn_failed", { err })` reads well in a terminal and is
 * nearly worthless in Workers Logs: an `Error` is not a plain object, so it
 * serialises to `{}` and the one thing worth knowing — what threw, and where —
 * is dropped on the way out. Every failure path that matters flattens through
 * here instead, so a turn that breaks in production can be read back rather
 * than reproduced.
 */
function errorInfo(err: unknown): { errName: string; errMessage: string; errStack?: string } {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message, errStack: err.stack?.slice(0, 2000) };
  }
  return { errName: typeof err, errMessage: String(err) };
}

const IDLE_ALARM_MS = 30 * 60 * 1000;
const MAX_REPLAY = 200;
/**
 * Screen-outs one session may take back.
 *
 * Enough for a genuine mis-tap or two. Past it the refusal stands: each undo
 * that lands on the screen-out again re-finalizes the response and re-sends the
 * owner's `response.disqualified` webhook.
 */
const MAX_SCREEN_OUT_UNDOS = 2;
/**
 * How long a single SSE frame may take to reach one connection before that
 * connection is treated as gone.
 *
 * A frame is a few hundred bytes; a live connection takes it immediately. A
 * connection that does not — a phone that slept, a laptop that closed, a
 * network that dropped without a FIN — leaves `write()` pending against a full
 * transform-stream queue forever, and `emit` used to await exactly that. One
 * abandoned tab could therefore stall the whole turn for everyone still
 * watching: the respondent had answered, the server had the answer, and the
 * typing dots stayed up until the page was reloaded. Nothing is lost by cutting
 * a slow reader loose — every event is durable, and the client reconnects and
 * replays from where it stopped.
 */
const WRITE_STALL_MS = 5000;

/**
 * How long one agentic turn may spend inside the model provider.
 *
 * `streamText` has no deadline of its own, so a provider that accepts the
 * request and then says nothing holds the turn open indefinitely — and the
 * turn is what emits the next `question` event, so the respondent sits on
 * typing dots with no way forward and no error to show them. Cutting it loose
 * is cheap: the catch below falls back to the deterministic phrasing, which is
 * the same path a missing API key or a spent token budget already takes. Set
 * well above a slow-but-real turn (a long reply with three tool calls lands
 * inside ten seconds) so this only ever fires on a turn that is not coming.
 */
const AI_TURN_TIMEOUT_MS = 45000;

/**
 * Used only if a document reaches the runtime without `clampForRuntime` having
 * written the plan's number onto it — which should not happen, and did once.
 * Generous on purpose: the failure mode of guessing low is a form that stops
 * talking mid-conversation, and the failure mode of guessing high is a slightly
 * larger bill on a path that is already a bug.
 */
const FALLBACK_TOKEN_BUDGET = 1_000_000;

/**
 * How many times one session may fall back to the extraction model.
 *
 * A ceiling, not a budget: extraction runs only after every deterministic
 * matcher has already failed, so in a healthy conversation it fires once or
 * twice. This exists so a pathological session cannot spend without bound, and
 * it is set far above any real interview rather than tuned as a cost lever —
 * the thing on the other side of it is a respondent who cannot answer the
 * question at all.
 */
const MAX_EXTRACTION_CALLS = 40;

/**
 * SessionDO — one instance per chat session. Owns the interview FSM,
 * the transcript (DO SQLite = source of truth during the session),
 * SSE fan-out, and finalization into D1.
 */
export class SessionDO extends DurableObject<Bindings> {
  private meta: DoSessionMeta | null = null;
  private doc: FormDoc | null = null;
  private state: EvalState = { answers: {}, variables: {}, hidden: {} };
  private invalidCounts = new Map<string, number>();
  /**
   * What a refused record-shaped answer kept, per block ref.
   *
   * A `contact_info` card refused for one bad field is not four bad fields, and
   * re-asking it as though it were is how a respondent ends up typing their
   * name and email a second time to fix a phone number. `validateAnswer` hands
   * back the fields that passed; they live here until the block is answered,
   * and `emitQuestion` sends them with the question as a prefill.
   */
  private partials = new Map<string, Record<string, string>>();
  /**
   * Whether this form has any indexed knowledge, resolved once per session.
   *
   * Cached because it decides one line of the stable prefix, and the prefix has
   * to be byte-identical across every turn for the provider's cache to serve
   * it. Re-reading it per turn would also mean a source finishing indexing
   * mid-conversation silently changed the prompt — the same bytes are worth
   * more than the freshness here.
   */
  private hasKnowledge: boolean | null = null;
  /** Human-readable summary of the most recent recorded answer (for AI acks). */
  private lastAnswerDisplay: string | null = null;
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private eventBuffer: SSEEnvelope[] = [];
  /**
   * Token frames written for a message that has not closed yet, so that
   * `coalesceTokenRun` can collapse them once it does. In-memory only: an
   * eviction mid-message simply leaves that one run uncollapsed.
   */
  private tokenRuns = new Map<string, { head: SSEEnvelope; keys: string[]; text: string }>();
  /**
   * Client turn ids already accepted, newest last.
   *
   * Bounded and persisted: an eviction between a turn and its retry is exactly
   * the window this exists to cover, so keeping it in memory alone would leave
   * the duplicate it is meant to catch. Twenty is far more than the handful of
   * sends a retry ladder can produce and costs nothing to carry.
   */
  private seenTurnIds: string[] = [];
  /** Non-null while a synchronous turn is collecting the events it produces. */
  private turnJournal: SSEEnvelope[] | null = null;
  /**
   * Did this turn hand control back to the respondent?
   *
   * A turn is only finished when something on screen is waiting for them: a
   * question, an ending, a sign-in card, a verification code, the review step.
   * Every path through the FSM is supposed to end in one of those, and one of
   * them did not — a respondent on the live SIH form answered, and the form
   * said nothing back, twice, on two different sessions. Reloading the page
   * fixed it, because `resync` re-states the step; nobody should have to
   * discover that.
   *
   * Rather than find and patch the one path that forgot, the guarantee is made
   * unconditional: `handleUserTurn` checks this flag and resyncs when it is
   * still false. Any future path that forgets is covered by the same net.
   */
  private turnHandedBack = false;
  private seq = 0;
  private turnCount = 0;
  private collectedCount = 0;
  private loaded = false;
  /** This conversation continues a response somebody abandoned. */
  private resumed = false;
  /**
   * Whether the carried-over questions and answers have been put on the stream.
   *
   * In memory only, and that is enough: the replay and the question that
   * follows it happen inside one request, so there is no eviction to survive.
   * It exists because two paths can reach it — a resume link, and a sign-in
   * that adopts the response at the door — and a respondent who came back must
   * not watch their own transcript print twice.
   */
  private historyReplayed = false;
  private encoder = new TextEncoder();
  /**
   * Every token this session has spent: the org meter, and the backstop.
   *
   * There were two counters here. The second, `phrasingTokensUsed`, held the
   * subset spent on the interviewer's own words, so that running out of
   * phrasing budget could not also cost the form its ability to *read* a
   * reply. That split is no longer carrying anything: comprehension is gated
   * by `MAX_EXTRACTION_CALLS`, not by tokens, so it was already independent —
   * and the budget is now the plan's, far past where any interview reaches.
   * One number, counted raw.
   */
  private sessionTokensUsed = 0;
  /**
   * The part of `sessionTokensUsed` already charged to the org.
   *
   * A session can finalize more than once — a screen-out that is undone and
   * then lands again — and metering the running total each time billed the
   * same tokens twice. Only the difference is metered.
   */
  private meteredTokens = 0;
  /** Extraction calls made, against MAX_EXTRACTION_CALLS. */
  private extractionCalls = 0;
  /** Consecutive guard rejections; 3 drops the session to template mode. */
  private toolErrorStreak = 0;
  /** Sticky: once true this session never calls the model again. */
  private degraded = false;
  /** Tool effects awaiting application after the model's turn completes. */
  private pendingEffects: NonNullable<ToolOutcome["effect"]>[] = [];
  /** True when the agent already asked the next question in this same turn. */
  private suppressNextAsk = false;
  /** Ending awaiting an explicit submit, when `requireSubmit` is on. */
  private pendingEndingRef: string | null = null;
  /**
   * The block a deferred sign-in gate stopped us just short of asking.
   *
   * Set only when `requireAuth.afterBlocks` is past and the respondent has not
   * verified yet. It is the resume point: `attachIdentity` reads it to carry on
   * with the question the gate interrupted, which is the whole difference
   * between a deferred gate and a lost conversation. Persisted for the same
   * reason `pendingEndingRef` is — the isolate can die while the respondent is
   * off in a Google popup, which is precisely when this is set.
   */
  private gatedAtRef: string | null = null;
  /**
   * The block a respondent went back to change, while they are changing it.
   *
   * Persisted, because it decides where the conversation resumes and a
   * respondent may well take a coffee break between reopening a question and
   * answering it — long enough for the durable object to be evicted.
   */
  private editingRef: string | null = null;
  private pendingUserTextPersisted = false;
  /** The transcript row an in-flight answer belongs to, so `answer_recorded` can name it. */
  private pendingUserMessageId: string | null = null;
  /** The respondent's typed message for the turn in flight, kept after `record` consumes the one above. */
  private turnUserMessageId: string | null = null;

  // ────────────────────────── lifecycle ──────────────────────────

  async init(params: {
    sessionId: string;
    formId: string;
    formVersionId: string;
    organizationId: string;
    slug: string;
    brandingHidden: boolean;
    /**
     * The organization has spent its monthly AI conversations. Start this session in
     * deterministic template mode rather than refusing it: the respondent gets scripted
     * questions instead of a conversation, and nothing about their experience fails.
     */
    aiDegraded?: boolean;
    docJson: unknown;
    respondentToken: string;
    hiddenFields: Record<string, string>;
    ipHash: string | null;
    fingerprint?: string | null;
    fingerprintSource?: RespondentKeySource | null;
    respondentId?: string | null;
    respondentDeviceKey?: string | null;
    /**
     * Opened by "Start over", which is a respondent saying they want nothing to
     * do with what they had. It already declines the device match in
     * `openSession`; it must decline the row-level reuse too, or the answers
     * they asked to be rid of come back as the row this session writes into.
     */
    startedOver?: boolean;
    country: string | null;
    userAgent: string | null;
    /** Which surface opened this. Defaults to a conversation. */
    source?: "chat" | "embed" | "api";
    /** Opened with a test-mode key: real rows, excluded from every count. */
    isTest?: boolean;
    /**
     * Continue a response that was abandoned, from a follow-up link.
     *
     * The answers come from `submission_answers`, which is the only place they
     * survive — the session that collected them is long gone and its state
     * snapshot was cleared when it was finalised. Seeding them here and letting
     * `replayState` work out where that leaves the conversation is what makes a
     * resume cross-device: nothing depends on the browser that started it.
     */
    resume?: {
      submissionId: string;
      answers: Record<string, unknown>;
      identity?: RespondentIdentity | null;
    };
  }): Promise<{ ok: true } | { ok: false; code: string }> {
    if (this.loaded) return { ok: true };

    const parsed = FormDoc.safeParse(params.docJson);
    if (!parsed.success) return { ok: false, code: "invalid_form" };
    this.doc = parsed.data;
    this.state.hidden = { ...params.hiddenFields };
    this.meta = {
      sessionId: params.sessionId,
      formId: params.formId,
      formVersionId: params.formVersionId,
      organizationId: params.organizationId,
      slug: params.slug,
      brandingHidden: params.brandingHidden,
      respondentToken: params.respondentToken,
      status: "active",
      currentRef: null,
      startedAt: Date.now(),
      hiddenFields: params.hiddenFields,
      ipHash: params.ipHash,
      fingerprint: params.fingerprint ?? null,
      fingerprintSource: params.fingerprintSource ?? null,
      respondentId: params.respondentId ?? null,
      respondentDeviceKey: params.respondentDeviceKey ?? null,
      startedOver: params.startedOver === true,
      country: params.country,
      userAgent: params.userAgent,
      source: params.source ?? "chat",
      isTest: params.isTest === true,
    };
    // Shares the `degraded` flag with the reliability floor (three guard rejections drop a
    // session to template mode permanently) — the two reasons to stop using the LLM want
    // exactly the same behaviour, and it is already persisted across eviction.
    if (params.aiDegraded) this.degraded = true;
    this.loaded = true;

    // initialize variables from doc defaults
    for (const v of this.doc.variables) {
      this.state.variables[v.name] = v.initial;
    }

    /**
     * A resumed session owns the response that already exists rather than
     * opening a new one.
     *
     * Writing `submission_id` into storage before anything else is what makes
     * that true: `ensureSubmissionRow` reads it first, so every answer recorded
     * from here lands on the original row. Without it the respondent would
     * finish a *second* response and the first would stay abandoned forever —
     * which is the whole thing this feature exists to prevent.
     */
    if (params.resume) {
      await this.ctx.storage.put("submission_id", params.resume.submissionId);
      this.state.answers = { ...(params.resume.answers as EvalState["answers"]) };
      this.collectedCount = this.liveAnswerCount(params.resume.answers);
      if (params.resume.identity) this.meta.identity = params.resume.identity;
      this.resumed = true;
    }

    await this.persistMeta();
    /*
     * The same opening line whether or not anything was carried over.
     *
     * A resumed conversation used to be met with "Welcome back — you'd already
     * answered 6 questions", which is a summary of a conversation standing in
     * for the conversation itself. What a respondent expects on coming back is
     * the thread they left: the questions, their answers, and the next question
     * under them — exactly what they see after a refresh. `replayAnswerHistory`
     * puts that thread back, so nothing here has to describe it.
     *
     * And only when the document does not open itself. A welcome block is the
     * greeting, and the flow says it: `beginInterview` walks to it and
     * `advanceTo` emits it, or on a resume `replayAnswerHistory` puts it back
     * at the top of the thread. Writing it here as well put the same paragraph
     * in the transcript twice — invisibly to the respondent, because this
     * stores without emitting, and then plainly in the response drawer, which
     * reads the stored record rather than the stream. Asked here with the same
     * `resolveNext` both of those paths start from, so the two cannot disagree.
     */
    const opening = resolveNext(this.doc, null, this.state);
    if (!(opening.kind === "block" && opening.block.type === "welcome")) {
      await this.appendMessage("assistant", greeting(this.doc));
    }
    await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);

    // Sign-in comes before the first question, not after it. Asking someone to
    // answer and then telling them it does not count without an account is the
    // worst possible order.
    if (this.authGateBlocks()) {
      await this.emitAuthRequired();
      return { ok: true };
    }

    // seed variables/score rules that apply pre-flow
    await this.beginInterview();
    return { ok: true };
  }

  /** Ask the first question. Split out so the auth gate can defer it. */
  private async beginInterview(): Promise<void> {
    if (!this.doc) return;
    if (this.resumed) {
      /**
       * Where a resumed conversation picks up.
       *
       * `replayState` walks the stored answers through the same `resolveNext`
       * the live conversation uses, applying every `set_variable` and
       * `add_score` on the way, and reports the block the flow is sitting on.
       * It exists for the stateless API path, which has no cursor to keep;
       * a resumed session has the same problem for the same reason — the cursor
       * it had died with the session that made it — so it gets the same answer.
       *
       * The alternative, replaying turns from the transcript, would re-run the
       * agent over questions already answered and cost a conversation's worth
       * of tokens to arrive at the same block.
       */
      /*
       * Before the replay, not after it: the replay walks past every answered question, so a
       * verified payment question carrying an answer nothing verified would be behind the cursor
       * by the time `advanceTo` (and `releaseStalePayments` with it) ran.
       */
      this.dropUnverifiedGatewayAnswers();
      const { state, cursor } = replayState(this.doc, this.state.answers, this.state.hidden);
      this.state.variables = state.variables;
      await this.replayAnswerHistory();
      await this.advanceTo(cursor);
      return;
    }
    const next = resolveNext(this.doc, null, this.state);
    await this.advanceTo(next);
  }

  // ────────────────────────── respondent auth ──────────────────────────

  /**
   * True while the form requires a verified respondent and has not got one.
   *
   * `afterBlocks` moves *when* that becomes true, not what it means. At the
   * default 0 this is the same predicate it has always been, so every existing
   * form gates before the first question exactly as before; above 0 the gate
   * stays open until that many answers are in.
   */
  /**
   * How many of a resumed response's answers this document still has a question
   * for.
   *
   * A response outlives the version it was given to. Republish the form with
   * different refs — a rewrite, a rebuilt demo, a question renamed — and the
   * answers come back keyed to blocks that no longer exist: `resolveNext` puts
   * the respondent on question one, the progress bar reads 0%, and every one of
   * those orphans was still counted.
   *
   * Which is how a public demo greeted returning visitors with a sign-in card
   * before its first question. `afterBlocks: 3` versus a raw count of four
   * answers from a version that had been replaced: the gate closed on somebody
   * who had, as far as this document is concerned, answered nothing.
   *
   * Counting only what the document can still show is the same rule
   * `collectedCount` follows everywhere else — it is the number of questions
   * this respondent has actually got through.
   */
  private liveAnswerCount(answers: Record<string, unknown>): number {
    if (!this.doc) return 0;
    const refs = new Set(this.doc.blocks.map((b) => b.ref));
    return Object.keys(answers).filter((ref) => refs.has(ref)).length;
  }

  private authGateBlocks(): boolean {
    if (!this.doc || !this.meta) return false;
    const gate = this.doc.settings.requireAuth;
    if (!gate.enabled || this.meta.identity) return false;
    return this.collectedCount >= gate.afterBlocks;
  }

  /**
   * Re-read the sign-in gate from the version the form publishes *now*.
   *
   * `this.doc` is a snapshot taken at `init` and stored with the session, so a
   * conversation already in progress never learns that anything changed. For
   * the questions that is the point — nobody should have the form rewritten
   * under them mid-answer — but the sign-in gate is not a question. It is the
   * author's rule about who may answer at all, and a rule that applies only to
   * people who had not already started is not the rule they switched on.
   *
   * That is the bug this exists for. A respondent who left a form half-finished
   * while it was open to anyone came back after sign-in was turned on, the
   * browser reconnected to the session it had saved rather than opening a new
   * one, and the only gate that session could see was the one that existed the
   * day it opened. They carried on answering, ungated, forever.
   *
   * So the gate alone is re-derived — in the same spirit as `clampForRuntime`,
   * which already re-reads the *plan* on every read so a downgrade takes effect
   * without anyone republishing. Everything else stays snapshotted.
   *
   * One small indexed read on the paths that decide the gate, and no cache in
   * front of it. A rate limit was the obvious thing to add and the wrong one:
   * anything that holds the previous answer for a few seconds is a window in
   * which the rule the author just switched on does not apply, which is the bug
   * this exists to close wearing a shorter hat. A turn that often makes a model
   * call can afford a `SELECT`.
   *
   * A failure leaves the snapshot alone: a form whose settings we cannot read
   * must not start refusing the person in front of it.
   */
  private async refreshAuthGate(): Promise<void> {
    if (!this.doc || !this.meta) return;
    // Somebody already verified has cleared whatever the gate now says, and a
    // finished conversation has nothing left to gate.
    if (this.meta.identity || this.meta.status !== "active") return;

    try {
      const row = await this.env.DB.prepare(
        `SELECT fv.schema_json AS schema_json
           FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
          WHERE f.id = ?1 AND f.deleted_at IS NULL LIMIT 1`,
      )
        .bind(this.meta.formId)
        .first<{ schema_json: string }>();
      if (!row?.schema_json) return;

      /*
       * Through the plan, exactly as this session's own document went. A gate
       * the subscription cannot complete has to stay off here too, or a lapsed
       * plan would put up a card with no door behind it.
       */
      const ent = await getEntitlements(this.env, this.meta.organizationId);
      const live = clampForRuntime(readFormDoc(JSON.parse(row.schema_json)), ent).settings.requireAuth;
      const held = this.doc.settings.requireAuth;
      if (
        live.enabled === held.enabled &&
        live.method === held.method &&
        live.afterBlocks === held.afterBlocks &&
        live.message === held.message
      ) {
        return;
      }
      this.doc.settings.requireAuth = live;
      await this.persistMeta();
    } catch (err) {
      console.error("auth_gate_refresh_failed", { sessionId: this.meta.sessionId, ...errorInfo(err) });
    }
  }

  /**
   * Remember the question a gate closed in front of, when nothing else has.
   *
   * `advanceTo` sets `gatedAtRef` on its way *to* a block, which is how signing
   * in knows where to carry on. A gate that closes because the author switched
   * it on has no such moment: the respondent is already sitting on a question
   * asked before the rule existed. Without the cursor written down here,
   * `attachIdentity` would find no bookmark and no reason to start the flow,
   * and would leave them verified in front of nothing.
   */
  private async rememberGatedCursor(): Promise<void> {
    if (!this.meta || this.gatedAtRef || !this.meta.currentRef) return;
    this.gatedAtRef = this.meta.currentRef;
    await this.persistMeta();
  }

  /**
   * Begin an interview that a gate never let start.
   *
   * The mirror of the case above, and just as real: `init` closes the gate
   * *before* `beginInterview`, so a session gated from the outset has no cursor
   * and has been asked nothing at all. If the author then switches sign-in back
   * off, clearing the gate is not enough on its own — the respondent reconnects
   * to a conversation that is no longer blocked and still has no question in
   * it, and the next thing they send is an answer to a question nobody asked.
   *
   * Deliberately narrow: only the exact state `init` leaves behind, and only
   * once the gate genuinely no longer blocks.
   */
  private async startIfGateCleared(): Promise<void> {
    if (!this.meta || this.meta.status !== "active") return;
    if (this.meta.currentRef || this.pendingEndingRef !== null) return;
    if (this.collectedCount > 0 && !this.resumed) return;
    if (this.authGateBlocks()) return;
    try {
      await this.beginInterview();
    } catch (err) {
      console.error("gate_cleared_start_failed", { sessionId: this.meta.sessionId, ...errorInfo(err) });
    }
  }

  private async emitAuthRequired(): Promise<void> {
    if (!this.doc || !this.meta) return;
    const gate = this.doc.settings.requireAuth;
    // The prompt is a real assistant message so it lands in the transcript and
    // survives replay; the card below it is the event.
    await this.emitMessage(gate.message);
    await this.emit("auth_required", { method: gate.method, message: gate.message });
  }

  /**
   * Record a verified identity and start (or resume) the interview.
   *
   * Verification itself happens in the route — the DO never sees an ID token or
   * an OTP, only the attested result — so this method must stay the single
   * place that clears the gate.
   */
  async attachIdentity(
    identity: RespondentIdentity,
    /**
     * A response this same person already has open on this form, found by the
     * route from their verified identity.
     *
     * The resume-link path hands the equivalent to `init`, before the greeting.
     * It cannot happen that early here: until somebody has signed in we do not
     * know who they are, which is the entire reason a gated form could not
     * recognise a returning respondent at all.
     */
    resume?: { submissionId: string; answers: Record<string, unknown> },
  ): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };
    if (this.meta.identity) return { accepted: true }; // idempotent: a double-submit is not an error

    this.meta.identity = identity;
    await this.persistMeta();

    /**
     * Write it down straight away, on both rows that carry it.
     *
     * `openResponse` covers the common order — gate, sign-in, first answer — but
     * a respondent can also verify *after* a row exists: a form that did not
     * require sign-in and asked anyway, or one where `requireAuth` was turned on
     * mid-conversation. Leaving those to `finalizeResponse` is what made every
     * partial response read as anonymous until it was abandoned.
     *
     * Failures are swallowed by the callees. The verification has already
     * succeeded and is already in durable storage; a denormalised copy that did
     * not land is a stale results table, not a failed sign-in.
     */
    const openRow = await this.ctx.storage.get<string>("submission_id").catch(() => null);
    /*
      The device key travels with the identity, because signing in is the moment
      the graph learns that this browser and this person are one.

      Called with or without a row. Without one is the *common* order on a gated
      form — the gate refuses every turn until somebody signs in, so the row is
      opened by the answer after this — and it used to mean the session carried
      whatever `respondentId` it had resolved from a browser fingerprint alone,
      or none at all. That id is what `ensureSubmissionRow` looks their existing
      draft up by and what the one-draft constraint is keyed on, so a stale one
      is how the same person came back as a second partial response. Taking the
      answer here keeps the session's idea of who it is talking to current from
      the moment they say so.
    */
    const resolved = await attachRespondent(
      this.env,
      openRow ?? null,
      identity,
      this.meta?.respondentDeviceKey ?? null,
    );
    if (resolved && this.meta && this.meta.respondentId !== resolved) {
      this.meta.respondentId = resolved;
      await this.persistMeta();
    }
    try {
      await this.env.DB.prepare(`UPDATE chat_sessions SET respondent_identity = ? WHERE id = ?`)
        .bind(JSON.stringify(identity), this.meta.sessionId)
        .run();
    } catch (err) {
      console.error("session_identity_write_failed", this.meta.sessionId, err);
    }

    await this.emit("auth_verified", {
      provider: identity.provider,
      label: identity.email ?? identity.phone ?? identity.name ?? "Verified",
      name: identity.name,
      pictureUrl: identity.pictureUrl,
    });
    await this.appendMessage(
      "system_event",
      `Respondent verified via ${identity.provider}: ${identity.email ?? identity.phone ?? identity.subject}`,
    );

    /**
     * Adopt the response they already had open, before the flow starts.
     *
     * `submission_id` goes into storage first, exactly as the resume-link path
     * does: `ensureSubmissionRow` reads that key before anything else, so every
     * answer from here lands on the original row. Without it they would fill in
     * a *second* response and the first would sit half-finished forever — which
     * is what was happening to every signed-in respondent who came back on a
     * different device, or whose embed had its storage partitioned away.
     *
     * Guarded on this session having no answers of its own: adopting one on top
     * of another would silently discard whichever lost.
     *
     * And reopened, which this path did not do and the resume-link route did.
     * `findIdentityHistory` hands back rows that are `in_progress` OR
     * `abandoned` — coming back after a sitting timed out is the ordinary way
     * to reach this — so without the reopen the respondent carried on
     * answering into a row `finalizeResponse` refuses to touch. Their
     * submission then went nowhere, and `undoScreenOut` had no `disqualified`
     * row to take back, which is what turned "I answered that by mistake" into
     * "this conversation has expired".
     */
    if (resume && this.collectedCount === 0 && !this.meta.currentRef) {
      await this.ctx.storage.put("submission_id", resume.submissionId);
      await this.reopenAdopted(resume.submissionId);
      this.state.answers = { ...(resume.answers as EvalState["answers"]) };
      this.collectedCount = this.liveAnswerCount(resume.answers);
      this.resumed = true;
      await this.persistMeta();
      // The thread they left, not a sentence about it. `beginInterview` below
      // would replay it anyway; doing it here as well costs nothing, because
      // the replay only ever runs once, and covers the branches that reach a
      // question without going through `beginInterview` at all.
      await this.replayAnswerHistory();
    }

    /**
     * A deferred gate stopped us one question short; ask that question now.
     *
     * Checked before the `beginInterview` case below, and separate from it,
     * because this session is mid-conversation: it has answers, it has a
     * cursor's worth of history, and replaying from the top would ask everything
     * again. `advanceTo` with no `fromRef` asks the stored block plainly — no
     * `branch_jump` for a jump that already happened, and no "you just answered
     * X" preamble, which would be a strange thing to say after a sign-in.
     */
    const gatedAt = this.gatedAtRef;
    if (gatedAt) {
      this.gatedAtRef = null;
      await this.persistMeta();
      const block = this.doc.blocks.find((b) => b.ref === gatedAt);
      if (block) {
        try {
          await this.advanceTo({ kind: "block", block });
        } catch (err) {
          // As below: the verification stands. Do not report this as a failed
          // sign-in, or they are sent back to a gate they have already cleared.
          console.error("gated_resume_failed", { sessionId: this.meta.sessionId, err });
          await this.failTurn("interview_resume_failed", "You're verified — give it another moment.");
        }
      }
      return { accepted: true };
    }

    // Only start the flow if the gate is what was holding it. A session that
    // verified mid-conversation (a settings change, a resumed session) must not
    // be rewound to question one. `resumed` is the exception: it has answers but
    // no cursor yet, and `beginInterview` is what replays it to the right block.
    if (!this.meta.currentRef && (this.collectedCount === 0 || this.resumed)) {
      try {
        await this.beginInterview();
      } catch (err) {
        // Verification itself succeeded and is already recorded, so this must
        // not be reported as a failed sign-in — the respondent would be sent
        // back to a gate they have already cleared. Say the turn failed and
        // leave the session in a state `resync` can rebuild.
        console.error("begin_interview_failed", { sessionId: this.meta.sessionId, err });
        await this.failTurn("interview_start_failed", "We couldn't get started. Give it another moment.");
      }
    }
    return { accepted: true };
  }

  /** The identity, for the route that needs to enforce `onePerIdentity`. */
  async getIdentity(): Promise<RespondentIdentity | null> {
    const ok = await this.ensureLoaded();
    return ok ? (this.meta?.identity ?? null) : null;
  }

  /**
   * Who this conversation belongs to, platform-wide.
   *
   * Resolved once when the session opened and carried on the meta, so the
   * feedback route can attribute a report without re-deriving a device key it
   * was never sent. Null is a normal answer — see `lib/respondents.ts` — and
   * the caller falls back to the session.
   */
  async getRespondentId(): Promise<string | null> {
    const ok = await this.ensureLoaded();
    return ok ? (this.meta?.respondentId ?? null) : null;
  }

  /**
   * What a bug report needs to know about the conversation it came out of.
   *
   * The counts are asked of this object because it is the only place they are
   * true while the conversation is still going: `chat_sessions` is written with
   * them when a response finalises, and reads zero until then.
   */
  async getReportContext(): Promise<{ respondentId: string | null; answered: number; turns: number } | null> {
    const ok = await this.ensureLoaded();
    if (!ok) return null;
    return {
      respondentId: this.meta?.respondentId ?? null,
      answered: this.collectedCount,
      turns: this.turnCount,
    };
  }

  // ─────────────────────── verifying one answer ───────────────────────

  /**
   * Whether this answer has to prove itself, and over which channel.
   *
   * Null means record it and move on, and there are three ways to get there:
   * the author never asked for verification, the plan does not include it (by
   * then `clampForRuntime` has already switched the flag off), or the value is
   * one this session has *already* proved.
   *
   * That last case is the interesting one, and it is why this looks at the
   * identity as well as the answer. Somebody who signed in with Google has
   * proved that address to Google's satisfaction; asking them to confirm it a
   * second time when they type it into an email question is ceremony, and the
   * kind that makes people abandon a form. Type a different address and it is a
   * different claim, so the code goes out as normal.
   */
  private verificationChannelFor(block: Block, value: unknown): "sms" | "email" | null {
    if (block.type !== "email" && block.type !== "phone") return null;
    if (!block.verify || typeof value !== "string" || !value) return null;
    if (this.meta?.verified?.includes(value)) return null;

    const identity = this.meta?.identity;
    if (block.type === "email") {
      if (identity?.provider === "google" && identity.email?.toLowerCase() === value.toLowerCase()) return null;
      return "email";
    }
    if (identity?.provider === "phone" && identity.phone === value) return null;
    return "sms";
  }

  /**
   * Send the code and park the answer.
   *
   * The answer is held on the session rather than written and un-written: an
   * unverified value must never reach the results table, not even for the
   * minute it takes somebody to read a text message, because a form owner
   * looking at their responses in that minute would see a number nobody has
   * confirmed with no way to tell.
   */
  private async beginVerification(
    block: Block,
    value: string,
    channel: "sms" | "email",
    answerMessageId: string | null,
  ): Promise<{ accepted: boolean; error?: string }> {
    /*
     * A number is never texted from here.
     *
     * Firebase sends and checks every SMS in this product — at the sign-in gate
     * and here alike — so for a phone answer there is nothing to send: the
     * session parks, the page runs the Firebase flow against the number that
     * was just answered, and the ID token comes back to `verifyPendingPhone`.
     * Only an emailed code is ours to send.
     */
    let sentTo = value;
    let devCode: string | undefined;

    if (channel === "email") {
      const started = await startEmailChallenge(this.env, {
        sessionId: this.meta!.sessionId,
        scope: `block:${block.ref}`,
        destination: value,
        formTitle: this.doc!.title,
      });
      if (!started.ok) {
        /*
         * Nothing was sent, so there is nothing to wait for. This is not a
         * wrong answer and must not be phrased as one — it is our side
         * failing, or a cooldown they have to sit out — so it goes out as the
         * refusal it is and the question is put back, without the agentic
         * retry `recordInvalid` would run.
         */
        await this.emit("validation_error", { ref: block.ref, code: "invalid_code", message: started.message });
        await this.emitMessage(started.message);
        await this.emitQuestion();
        return { accepted: true };
      }
      sentTo = started.destination;
      devCode = started.devCode;
    }

    this.meta!.pendingVerify = {
      ref: block.ref,
      channel,
      value,
      sentTo,
      sentAt: Date.now(),
      devCode,
      messageId: answerMessageId,
    };
    await this.persistMeta();
    await this.emitVerifyRequired();
    return { accepted: true };
  }

  /** Say a code went out, and arm the client's code step. Also used on replay. */
  private async emitVerifyRequired(announce = true): Promise<void> {
    const pending = this.meta?.pendingVerify;
    if (!pending) return;
    if (announce) {
      const said = codeSentText(pending.channel, pending.sentTo);
      await this.emitMessage(said);
    }
    await this.emit("verify_required", {
      ref: pending.ref,
      channel: pending.channel,
      sentTo: pending.sentTo,
      sentAt: pending.sentAt,
      devCode: pending.devCode,
    });
  }

  /**
   * A turn taken while a code is outstanding.
   *
   * Everything the respondent says here is read as a code and nothing else —
   * not passed to the agent, and not appended to the transcript. Both matter:
   * the agent would happily record `483920` as their phone number, and a
   * one-time code has no business being written into a conversation the form
   * owner can read back.
   */
  private async handlePendingVerify(
    input: TurnInput,
  ): Promise<{ accepted: boolean; error?: string }> {
    const pending = this.meta!.pendingVerify!;
    const block = this.doc!.blocks.find((b) => b.ref === pending.ref);
    if (!block) {
      // The question went away under them — an edited document, a resumed
      // session. Drop the challenge rather than trapping the conversation.
      this.meta!.pendingVerify = null;
      await this.persistMeta();
      await this.emit("verify_settled", { ref: pending.ref, verified: false });
      await this.emitQuestion();
      return { accepted: true };
    }

    /*
     * A phone number is proved by a Firebase token, not by a code typed in
     * here — Firebase checked the code itself, in the browser, and this session
     * never saw it. So anything said during a phone step is a message about the
     * step rather than the proof, and gets pointed back at the button.
     */
    if (pending.channel === "sms") {
      const nudge = codeExpectedText(pending.channel);
      await this.emitMessage(nudge);
      await this.emitVerifyRequired(false);
      return { accepted: true };
    }

    const said = input.type === "text" ? input.text : String(input.value ?? "");
    const code = said.replace(/\D/g, "");
    if (code.length < 4) {
      const nudge = codeExpectedText(pending.channel);
      await this.emitMessage(nudge);
      await this.emitVerifyRequired(false);
      return { accepted: true };
    }

    const result = await verifyEmailChallenge(this.env, this.meta!.sessionId, `block:${block.ref}`, code);
    if (!result.ok) {
      /*
       * Still pending. A wrong code is a wrong code — they can try again, ask
       * for another, or change the answer — so the card stays up and the
       * conversation does not move. `invalid_code` is the published code for
       * this; see `VALIDATION_CODES`.
       */
      await this.emit("validation_error", { ref: block.ref, code: "invalid_code", message: result.message });
      await this.emitVerifyRequired(false);
      return { accepted: true };
    }

    return this.settleVerification(block);
  }

  /**
   * The number in a Firebase token, offered against a phone answer.
   *
   * Called by the route that verified the token's signature, issuer, audience
   * and sign-in provider. What is left is the question that route cannot
   * answer: is this the number they actually typed? A token for some *other*
   * number is a perfectly valid token and proves nothing about this answer, so
   * it is refused here rather than quietly accepted.
   */
  async verifyPendingPhone(
    phone: string,
  ): Promise<{ accepted: boolean; error?: string; message?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };

    const pending = this.meta.pendingVerify;
    if (!pending || pending.channel !== "sms") {
      return { accepted: false, error: "no_pending_verification", message: "Nothing is waiting to be confirmed." };
    }
    const block = this.doc.blocks.find((b) => b.ref === pending.ref);
    if (!block) {
      await this.cancelVerification();
      await this.emitQuestion();
      return { accepted: false, error: "no_question", message: "That question is no longer being asked." };
    }

    const proved = normalizeE164(phone ?? "");
    if (!proved || proved !== pending.value) {
      const message = "That's a different number from the one you gave. Confirm the number you answered with, or change your answer.";
      await this.emit("validation_error", { ref: block.ref, code: "invalid_code", message });
      await this.emitVerifyRequired(false);
      return { accepted: false, error: "wrong_number", message };
    }

    await this.settleVerification(block);
    return { accepted: true };
  }

  /**
   * The proof landed, however it was obtained. Record the answer.
   *
   * The value is remembered as proved before `record` runs, which is what makes
   * that call fall straight through instead of starting a second challenge for
   * the number it just confirmed.
   */
  private async settleVerification(block: Block): Promise<{ accepted: boolean; error?: string }> {
    const pending = this.meta!.pendingVerify!;
    this.meta!.verified = [...(this.meta!.verified ?? []), pending.value];
    this.meta!.pendingVerify = null;
    await this.persistMeta();
    await this.emit("verify_settled", { ref: block.ref, verified: true });
    await this.appendMessage("system_event", `Verified ${pending.sentTo} by ${pending.channel === "sms" ? "SMS" : "email"}`);
    const done = codeVerifiedText(pending.channel);
    await this.emitMessage(done);

    /*
     * Now record it for real. The answer was echoed when they first gave it, so
     * `record` must not echo it again — these two flags are how it is told that
     * the bubble already exists, and which one it is.
     */
    this.pendingUserTextPersisted = true;
    this.pendingUserMessageId = pending.messageId;
    return this.record(block, pending.value);
  }

  /**
   * Another code to the same address. Subject to the same cooldown.
   *
   * Email only: a phone step has no code of ours to resend — the page asks
   * Firebase for another SMS itself, which is why `resend_code` is refused for
   * one rather than silently doing nothing.
   */
  private async resendVerifyCode(): Promise<{ accepted: boolean; error?: string }> {
    const pending = this.meta!.pendingVerify!;
    if (pending.channel !== "email") return { accepted: false, error: "not_our_code" };
    const started = await startEmailChallenge(this.env, {
      sessionId: this.meta!.sessionId,
      scope: `block:${pending.ref}`,
      destination: pending.sentTo,
      formTitle: this.doc!.title,
    });
    if (!started.ok) {
      await this.emit("validation_error", { ref: pending.ref, code: "invalid_code", message: started.message });
      await this.emitVerifyRequired(false);
      return { accepted: true };
    }
    this.meta!.pendingVerify = { ...pending, sentAt: Date.now(), devCode: started.devCode };
    await this.persistMeta();
    await this.emitVerifyRequired();
    return { accepted: true };
  }

  /**
   * Give up on the code and ask the question again.
   *
   * The way out of a mistyped number, and the reason the code step is never a
   * dead end. The challenge rows are left to expire on their own: they are
   * scoped to this block and capped, and consuming them here would let somebody
   * clear the send counter by pressing "change" five times.
   */
  private async cancelVerification(): Promise<void> {
    const pending = this.meta?.pendingVerify;
    if (!pending) return;
    this.meta!.pendingVerify = null;
    await this.persistMeta();
    await this.emit("verify_settled", { ref: pending.ref, verified: false });
  }

  // ─────────────────────── verified payments ───────────────────────

  /**
   * Open a checkout on the form admin's own gateway account for the payment
   * question in front of the respondent.
   *
   * Called by the route when they press Pay. The guards run in a fixed order,
   * cheapest and most fundamental first, and each refusal says which it was:
   *
   *   1. the session is live and this is the question it is on
   *   2. the question is a verified payment
   *   3. gateway payments are switched on for this organization
   *   4. the plan includes `collect_payments`
   *   5. somebody is signed in — mandatory, whatever the form's gate says
   *   6. the amount resolves, on the server, from this session's variables
   *   7. the account exists, is connected, and is not live money in a preview
   *   8. fewer than `MAX_PAYMENT_ATTEMPTS` checkouts for this question
   *
   * Sign-in is checked here even though lint refuses to publish a gateway
   * block without it: a form whose `afterBlocks` puts the gate *after* the
   * payment passes lint, and a gate the plan clamps off would pass nothing. A
   * payment with no verified person behind it is a payment the admin cannot
   * attribute or refund to anyone, so the card is replaced by the sign-in card
   * and the question comes back once they have.
   *
   * Pressing Pay twice returns the same checkout. A changed amount — a
   * variable recomputed from an edited answer — retires the old one.
   */
  async startPayment(ref: string, opts: { phone?: string } = {}): Promise<StartPaymentResult> {
    /*
     * One start at a time, per session.
     *
     * A Durable Object's input gate does not hold other requests while this one waits on the
     * outside world, and a start waits on plenty of it: the plan, the account row, the gateway.
     * Two presses — two tabs, or a double tap that slipped past the client — both saw no
     * pending checkout, both opened an order, and the later one overwrote the first in
     * `pendingPayment` without superseding it, leaving a payable checkout nothing would ever
     * settle. Chained, the second press starts after the first has finished, finds its
     * checkout pending, and hands the same one back.
     */
    return this.onPaymentChain(() => this.startPaymentOnce(ref, opts));
  }

  /**
   * Every payment entry point from outside — start, settle, fail, refund — one at a time.
   *
   * Settlement races as readily as a start does, and did more damage: a Razorpay modal's confirm
   * and the `payment.captured` webhook arrive together, both read no answer before their D1
   * awaits, and both recorded the payment — the rules applied twice, two concurrent AI turns
   * asking the next question, or two closings. Two different records paid close together both
   * passed `findSettledPayment`, since neither was settled yet, and nobody was told about the
   * double charge. On one chain, the second settle starts after the first has written its
   * answer and finds it there.
   *
   * Nothing on the chain calls back into it — none of these call one another, and the alarm's
   * last look (which does call `settlePayment`) is not itself on it — so it cannot deadlock.
   */
  private onPaymentChain<T>(task: () => Promise<T>): Promise<T> {
    const run = this.paymentChain.then(task);
    this.paymentChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private paymentChain: Promise<void> = Promise.resolve();

  private async startPaymentOnce(ref: string, opts: { phone?: string }): Promise<StartPaymentResult> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return refuse("session_not_found", "This conversation has ended.");
    if (this.meta.status !== "active") return refuse("session_closed", "This conversation has ended.");
    let result: StartPaymentResult;
    try {
      result = await this.runStartPayment(ref, opts);
    } catch (err) {
      console.error("payment_start_failed", {
        sessionId: this.meta.sessionId,
        formId: this.meta.formId,
        blockRef: ref,
        ...errorInfo(err),
      });
      result = refuse("payment_unavailable", "We couldn't open checkout. Please try again in a moment.");
    }
    /*
     * A preview that cannot take this payment for real — no account connected yet, a plan
     * without payments, a live account — still has to let its author see the rest of the form.
     * The server says so rather than leaving the browser to guess from the code, because the
     * browser cannot tell a preview's "unavailable" from a live form's.
     */
    if (!result.ok && this.meta.formVersionId === "preview" && SIMULATABLE_REFUSALS.has(result.code)) {
      result = { ...result, preview: true };
    }
    return result;
  }

  private async runStartPayment(ref: string, opts: { phone?: string }): Promise<StartPaymentResult> {
    const meta = this.meta!;
    const block = await this.currentBlock();
    if (!block || block.ref !== ref) return refuse("stale_ref", "That question is no longer being asked.");
    if (block.type !== "payment" || block.method !== "gateway") {
      return refuse("payment_unavailable", "This question doesn't take a payment.");
    }

    // On the server, from this session's answers, before anything else reads it. See `priceNow`.
    const amount = this.priceNow(block);

    /*
     * Already paid for this question — they went back with the pencil, started over, or a
     * second tab is still showing the card. A second checkout would take their money twice;
     * the payment they already made is put back as the answer instead, which moves the
     * conversation on exactly as the first settlement did.
     *
     * Only a payment of what the question charges *now*. One made before an answer that sets
     * the price was changed is not a payment for this question any more.
     */
    const held = amount.ok ? await this.heldPayment(block, amount) : null;
    if (held) {
      /*
       * A checkout still open for this question is surplus the moment the question is answered.
       * Left in `pendingPayment`, every later typed answer went to "your checkout is still open".
       */
      if (meta.pendingPayment?.ref === ref) await this.clearPendingPayment();
      const recorded = await this.record(block, null, { settledPayment: held });
      /*
       * Settled, if it never was: a payment refused at settlement because the price had moved
       * away from it is put back here when the price moves back, and nothing else will mark it.
       */
      if (recorded.accepted && !held.recordId.startsWith("rpay_preview_")) {
        await markSettled(this.env, held.recordId);
        /*
         * And every other payment this respondent made for the question is now one the question
         * does not ask for. Start over, pay ₹1,000, start over again and go back to ₹100: the
         * ₹100 comes back as the answer here, and without this the ₹1,000 was left `paid`,
         * settled and unflagged — invisible to the refund list, and counted as a valid payment
         * the next one could be called a duplicate of.
         */
        await flagStaleSiblings(this.env, {
          sessionId: meta.sessionId,
          blockRef: ref,
          keepId: held.recordId,
          amountMinor: held.amountMinor,
          currency: held.currency,
        });
        await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);
      }
      return refuse("already_paid", "You've already paid for this.");
    }

    if (!gatewayEnabled(this.env, meta.organizationId)) {
      // Same sentence as a missing account, and for the same reason: nothing the
      // respondent does reaches it, so don't invite them to wait and retry.
      return refuse("payment_unavailable", "This form can't take payments right now. Let its owner know.");
    }
    const ent = await getEntitlements(this.env, meta.organizationId);
    if (!can(ent, "collect_payments")) {
      return refuse("plan_required", "This form can't take payments right now. Let its owner know.");
    }
    if (!meta.identity && !signInBypassed(this.env)) {
      // `gatedAtRef` is what brings this question back after they sign in.
      await this.rememberGatedCursor();
      await this.emitAuthRequired();
      return refuse("sign_in_required", "Sign in to pay.");
    }
    if (!meta.identity) {
      console.warn("payment_signin_bypassed", { sessionId: meta.sessionId, blockRef: ref });
    }

    if (!amount.ok) {
      console.warn("payment_amount_unresolved", { sessionId: meta.sessionId, blockRef: ref, code: amount.code });
      /*
       * Outside the form's own limits is the respondent's to fix, not the owner's: the total
       * came from their answers — fifty tickets on a form that takes at most ten.
       */
      return refuse(
        "payment_unavailable",
        amount.code === "payment_amount_out_of_range"
          ? "That total is outside what this form can take. Change the answer it comes from to carry on."
          : "This payment isn't set up correctly. Let the form's owner know.",
      );
    }

    const account = block.paymentAccountId
      ? await loadAccountForOrg(this.env, meta.organizationId, block.paymentAccountId)
      : null;
    if (!account || account.status !== "active") {
      console.warn("payment_account_unavailable", {
        sessionId: meta.sessionId,
        blockRef: ref,
        accountStatus: account?.status ?? "missing",
      });
      /*
       * Said differently from the one a failed checkout call gets ("We couldn't
       * open checkout. Please try again in a moment."). Both used to open with
       * "Payments aren't available", which told a respondent to wait out
       * something only the form's owner can fix — this one is the account being
       * gone, and no amount of retrying reaches it.
       */
      return refuse("payment_unavailable", "This form can't take payments right now. Let its owner know.");
    }
    const preview = meta.formVersionId === "preview";
    if (preview && account.environment === "live") {
      return refuse(
        "preview_live_account",
        "Preview never charges a live account. Use Simulate payment, or connect a test account.",
      );
    }
    /*
     * Nor does a session opened with a `*_test_` key. Its response is a test response, hidden
     * from every count and pruned after thirty days; a real card charged against it would be
     * real money attached to a response built to be thrown away.
     */
    if (meta.isTest && account.environment === "live") {
      return refuse(
        "live_account_in_test_mode",
        "A test-mode session never charges a live account. Use a live API key, or connect a test account.",
      );
    }

    const now = Date.now();
    const pending = meta.pendingPayment;
    if (
      pending &&
      pending.ref === ref &&
      pending.amountMinor === amount.amountMinor &&
      pending.currency === amount.currency &&
      // A checkout about to expire is not worth handing back: it would close
      // under them mid-payment.
      pending.expiresAt - now > 60_000
    ) {
      /*
       * Only while the gateway would still take it. A record that came back `refunded` on its
       * first look, or was held for an amount mismatch, is an order nothing can be paid into
       * again — and this branch handed its launch back on every press, so the respondent tapped
       * Pay at a dead checkout until the thirty minutes ran out. A new one instead.
       */
      const row = await loadRecord(this.env, pending.recordId);
      if (row && (row.status === "created" || row.status === "superseded")) {
        await this.emitPaymentRequired();
        return { ok: true, recordId: pending.recordId, launch: pending.launch, expiresAt: pending.expiresAt, reused: true };
      }
      console.warn("payment_pending_not_payable", {
        sessionId: meta.sessionId,
        blockRef: ref,
        recordId: pending.recordId,
        recordStatus: row?.status ?? "missing",
      });
      await this.clearPendingPayment();
    }

    /*
     * Null only under the local sign-in bypass, which is the one path that
     * reaches here unidentified. The gateway still needs *something* to put on
     * the receipt, so the session id stands in for the person — see
     * `signInBypassed`.
     */
    const identity = meta.identity ?? null;
    /*
     * A number for the receipt, where the gateway insists on one.
     *
     * Cashfree will not open an order without `customer_phone`, and a Google sign-in on a form
     * with no phone question has none to give. Refused here, before an attempt is counted or a
     * record written, with a code the Pay card answers by asking for a number — never by
     * inventing one, which Cashfree would text.
     */
    let phone = identity?.phone ?? this.answeredPhone() ?? meta.paymentPhone ?? null;
    if (opts.phone !== undefined) {
      const given = normalizeE164(opts.phone);
      if (!given) return refuse("phone_required", "That number needs its country code — for example +91 98765 43210.");
      phone = given;
      meta.paymentPhone = given;
    }
    if (account.provider === "cashfree" && !phone) {
      return refuse("phone_required", "What number should the payment receipt go to?");
    }

    /*
     * The response row before the checkout, never after. A payment that lands
     * once this tab is closed and the session abandoned has to be written onto
     * *something*, and `settleLate` finds it through this row.
     */
    const submissionId = preview ? null : await this.ensureSubmissionRow();

    /*
     * The cap counts the orders on the *response*, not the ones this session remembers.
     *
     * A session is cheap to replace: a new tab under the same sign-in adopts the same response
     * and its counter starts at zero, so five orders per session was no cap at all on a script
     * opening sessions in a loop — every one of them a call on the admin's gateway account. The
     * rows outlive the session, so they are what it is really counted from; the session's own
     * counter still stands in for a preview, which writes no response.
     */
    const priorAttempts = Math.max(
      meta.paymentAttempts?.[ref] ?? 0,
      preview ? 0 : await countPaymentAttempts(this.env, { sessionId: meta.sessionId, submissionId, blockRef: ref }),
    );
    const attempts = priorAttempts + 1;
    if (attempts > MAX_PAYMENT_ATTEMPTS) {
      return refuse("too_many_attempts", "That's too many attempts for now. Please contact the form's owner.");
    }
    if (pending) await this.clearPendingPayment();
    meta.paymentAttempts = { ...meta.paymentAttempts, [ref]: attempts };
    await this.persistMeta();

    const origin = webOrigins(this.env)[0] ?? this.env.APP_ORIGIN;
    const answerBefore = this.state.answers[ref];

    let opened: Awaited<ReturnType<typeof createCheckoutForSession>>;
    try {
      opened = await createCheckoutForSession(this.env, {
        account,
        organizationId: meta.organizationId,
        formId: meta.formId,
        formVersionId: meta.formVersionId,
        sessionId: meta.sessionId,
        submissionId,
        blockRef: ref,
        amountMinor: amount.amountMinor,
        currency: amount.currency,
        title: block.title.slice(0, 120),
        description: this.doc!.title.slice(0, 200),
        customer: {
          id: customerIdFor(identity, meta.sessionId),
          name: identity?.name ?? null,
          email: identity?.email ?? null,
          phone,
        },
        urls: (recordId) => paymentReturnUrls(origin, { recordId, sessionId: meta.sessionId, slug: meta.slug }),
        preview,
        testSession: meta.isTest === true,
      });
    } catch (err) {
      /*
       * Not an attempt. The cap exists so "retry" cannot open unlimited orders on the admin's
       * account; a checkout the gateway refused to open is not one, and counting it let a
       * five-minute gateway outage use up a respondent's tries for good. Repeated presses are
       * still bounded by the route's rate limit.
       */
      meta.paymentAttempts = { ...meta.paymentAttempts, [ref]: attempts - 1 };
      await this.persistMeta();
      const recordId = err instanceof CheckoutUnavailableError ? (err.recordId ?? "") : "";
      const message = "We couldn't open checkout. Please try again in a moment.";
      await this.emit("payment_failed", { ref, recordId, code: "payment_unavailable", message });
      await this.emitQuestion();
      if (!(err instanceof CheckoutUnavailableError)) throw err;
      return refuse("payment_unavailable", message);
    }

    /*
     * The conversation may have moved while the gateway was answering — the old tab's payment
     * settled this question, or an action took the cursor elsewhere. A checkout for a question
     * that is no longer waiting on one is retired at once rather than put on screen.
     */
    if (meta.status !== "active" || meta.currentRef !== ref || this.state.answers[ref] !== answerBefore) {
      await supersedeRecord(this.env, opened.record.id);
      const answered = this.state.answers[ref] !== answerBefore;
      return answered
        ? refuse("already_paid", "You've already paid for this.")
        : refuse("stale_ref", "That question is no longer being asked.");
    }

    /*
     * And the price may have moved while the gateway was answering, without this question's own
     * answer changing: the amount was resolved before the plan, the account row and the gateway
     * were waited on — up to eighteen seconds with a token refresh — and the answer the price
     * comes *from* is another question, which another tab can edit in that window. Checkout would
     * have opened at the old total, been paid, and then been refused at settlement as stale.
     */
    const priceAfter = this.priceNow(block);
    if (!priceAfter.ok || priceAfter.amountMinor !== amount.amountMinor || priceAfter.currency !== amount.currency) {
      console.warn("payment_price_moved_while_opening", {
        sessionId: meta.sessionId,
        blockRef: ref,
        recordId: opened.record.id,
        openedMinor: amount.amountMinor,
        askedMinor: priceAfter.ok ? priceAfter.amountMinor : null,
      });
      await supersedeRecord(this.env, opened.record.id);
      return refuse("stale_ref", "The amount for this question just changed. Tap Pay again for the new total.");
    }

    const expiresAt = opened.record.expiresAt ?? now;
    meta.pendingPayment = {
      ref,
      recordId: opened.record.id,
      provider: account.provider,
      amountMinor: amount.amountMinor,
      amount: amount.amount,
      currency: amount.currency,
      display: formatAmount(amount.amount, amount.currency),
      launch: opened.launch,
      expiresAt,
      attempts,
      /*
       * No `preview` flag here, even in a builder preview. On the wire that
       * flag means "simulated: never open `launch`", and this is a real
       * test-mode checkout the author connected a test account to try. The
       * preview's simulated payment is the `simulate_payment` action, which
       * never comes through here.
       */
    };
    await this.persistMeta();
    await this.appendMessage(
      "system_event",
      `Checkout opened: ${meta.pendingPayment.display} via ${PAYMENT_PROVIDER_LABELS[account.provider]}`,
    );
    await this.emitPaymentRequired();
    await this.ctx.storage.setAlarm(Math.max(now + IDLE_ALARM_MS, expiresAt + PAYMENT_GRACE_MS));
    return { ok: true, recordId: opened.record.id, launch: opened.launch, expiresAt, reused: false };
  }

  /** Arm the client's Pay card. Also used on replay, and for a typed nudge. */
  private async emitPaymentRequired(): Promise<void> {
    const pending = this.meta?.pendingPayment;
    if (!pending) return;
    if (pending.expiresAt <= Date.now()) {
      await this.emitQuestion();
      return;
    }
    await this.emit("payment_required", {
      ref: pending.ref,
      provider: pending.provider,
      amountMinor: pending.amountMinor,
      amount: pending.amount,
      currency: pending.currency,
      display: pending.display,
      launch: pending.launch,
      recordId: pending.recordId,
      expiresAt: pending.expiresAt,
      ...(pending.preview ? { preview: true } : {}),
    });
  }

  /**
   * Something typed while checkout is open.
   *
   * It is kept — unlike a code, a message about a payment is ordinary
   * conversation the admin may want to read — but it is not an answer, and
   * the agent is not given it: "I paid" typed into the box is precisely the
   * claim this whole flow exists not to take on trust.
   */
  private async handlePendingPaymentText(text: string): Promise<{ accepted: boolean; error?: string }> {
    const msgId = await this.appendMessage("user", text);
    await this.emit("user_message", { messageId: msgId, text });
    this.pendingUserTextPersisted = false;
    this.pendingUserMessageId = null;
    await this.emitMessage(
      "Your checkout is still open — finish paying there, and I'll carry on as soon as it goes through. If the window closed, tap Pay again.",
    );
    await this.emitPaymentRequired();
    return { accepted: true };
  }

  /**
   * The payment the gateway confirmed, settled into the conversation.
   *
   * Called over RPC by `lib/payments/service.ts` — from the confirm route, a
   * webhook, or this object's own alarm — only after the D1 record is `paid`.
   * The record is re-read here rather than taken from the caller, so the one
   * thing that decides the answer is the row, not an argument.
   *
   * Idempotent: every path that notices a payment calls this, and they race.
   * The second caller finds the answer already holding this record's id.
   */
  async settlePayment(recordId: string): Promise<SettleResult> {
    return this.onPaymentChain(() => this.settlePaymentOnce(recordId));
  }

  private async settlePaymentOnce(recordId: string): Promise<SettleResult> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, reason: "session_not_found" };
    const record = await loadRecord(this.env, recordId);
    // `paid` only. A refund that beat settlement here is a payment the admin
    // has already given back, and writing "Paid" into the thread would be false.
    if (!record || record.status !== "paid") return { accepted: false, reason: "not_paid" };
    if (record.sessionId !== this.meta.sessionId) return { accepted: false, reason: "wrong_session" };
    const result = await this.settleFromRecord(settledPaymentOf(record), record.blockRef, false, record);
    /*
     * Flagged here rather than by the caller, because not every caller is `settleRecord`: the
     * alarm's last look comes straight to this method, and a payment it found that the question
     * could not take has to reach the admin's refund list all the same.
     */
    try {
      if (result.reason === "duplicate") await markDuplicate(this.env, record);
      if (result.reason === "amount_changed") await markAmountChanged(this.env, record.id);
    } catch (err) {
      console.error("payment_flag_failed", { sessionId: this.meta.sessionId, recordId, reason: result.reason, ...errorInfo(err) });
    }
    return result;
  }

  private async settleFromRecord(
    settled: SettledPayment,
    ref: string,
    simulated: boolean,
    record?: RespondentPaymentRow,
  ): Promise<SettleResult> {
    const meta = this.meta!;
    const existing = this.state.answers[ref] as
      | { method?: string; status?: string; paymentRecordId?: string }
      | undefined;
    if (existing?.paymentRecordId === settled.recordId) {
      if (!simulated) await markSettled(this.env, settled.recordId);
      return { accepted: true, reason: "already_settled" };
    }

    /** The settlement slot this call took in D1, to be given back if the answer never lands. */
    let claimed: string | null = null;

    const block = this.doc!.blocks.find((b) => b.ref === ref);
    const payable = block && block.type === "payment" && block.method === "gateway" ? block : null;

    /*
     * Paid, but not what the question charges now.
     *
     * The record's amount matched the gateway's, which proves the money; it does not prove the
     * price. A variable amount is worked out from answers, and the respondent can change an
     * answer after a checkout opened — one ticket at ₹100, then ten — and still pay the old
     * checkout, which stays live at the gateway until it expires. Settled, that wrote "Paid ₹100
     * · verified" against ten tickets. So the amount is resolved again from the variables this
     * session holds, which also stand for an abandoned one, and a payment that does not match
     * is refused and flagged for a refund rather than taken as the answer.
     */
    if (payable && !simulated) {
      const now = this.priceNow(payable);
      /*
       * A price that no longer resolves at all is the same verdict, not a pass. Fifty tickets on a
       * form that takes at most ten is a total the form refuses to charge — Pay says so — and the
       * old one-ticket checkout still open in another tab must not become the answer for it. Only
       * a doc with no variable named is let through: an author's error lint refuses to publish,
       * and the one case where "doesn't resolve" says nothing about what the respondent changed.
       */
      const stale = now.ok
        ? now.amountMinor !== settled.amountMinor || now.currency !== settled.currency.toUpperCase()
        : payable.amountMode === "variable" && Boolean(payable.amountVariable);
      if (stale) {
        console.warn("payment_settle_amount_changed", {
          sessionId: meta.sessionId,
          blockRef: ref,
          recordId: settled.recordId,
          paidMinor: settled.amountMinor,
          askedMinor: now.ok ? now.amountMinor : null,
          askedCode: now.ok ? null : now.code,
        });
        if (meta.status === "active") await this.refuseStalePayment(settled, ref, now);
        return { accepted: false, reason: "amount_changed" };
      }
    }

    if (!simulated && record) {
      /*
       * A second payment for a question that already holds one is the admin's to refund, not a
       * replacement for the first. See `markDuplicate`.
       *
       * Decided from what still pays for the question, not from what the answer happens to
       * say. The answer this session holds may be for a payment since refunded, and a
       * refunded payment is not one the next can duplicate; and the question may be paid for
       * on the response without this session's copy knowing — a Start over, or another
       * session of the same signed-in respondent. `findSettledPayment` reads both.
       */
      if (existing?.method === "gateway" && existing.status === "paid" && existing.paymentRecordId) {
        const prior = await loadRecord(this.env, existing.paymentRecordId);
        if (prior && prior.status === "paid" && !prior.failureReason) return this.refuseDuplicatePayment(ref);
      }
      const submissionId =
        meta.formVersionId === "preview"
          ? null
          : ((await this.ctx.storage.get<string>("submission_id")) ?? record.submissionId);
      const other = await findSettledPayment(this.env, {
        sessionId: meta.sessionId,
        submissionId,
        blockRef: ref,
        excludeId: settled.recordId,
      });
      if (other) {
        // Same price: a second payment for one question, whichever session made it.
        if (other.amountMinor === settled.amountMinor && other.currency === settled.currency.toUpperCase()) {
          return this.refuseDuplicatePayment(ref);
        }
        /*
         * Two prices, and only one of them can be the answer. Which is stale is a question about
         * the answers the *response* holds, and this session only knows its own copy of them.
         *
         * Its own payment it may judge: a different price from this session means this session's
         * answers moved (a Start over, an edit), and the earlier one is the stale one.
         *
         * Another session's it may not. The response is shared — the same signed-in respondent's
         * laptop adopts what their phone began — so a session left open on an old answer can
         * reach here holding an old price, and "the other one is stale" flagged the payment that
         * actually stands for refund while `settleLate` wrote the old price over the answer. A
         * payment the price moved away from is released by the session that moved it, so another
         * session's payment that is still settled and unflagged is one nothing has released: the
         * response is paid for at that price, and it is this one that goes on the refund list.
         */
        if (other.sessionId !== meta.sessionId) {
          console.warn("payment_settle_response_paid_elsewhere", {
            sessionId: meta.sessionId,
            blockRef: ref,
            recordId: settled.recordId,
            standingRecordId: other.id,
          });
          if (meta.status === "active") await this.refusePaidElsewhere(settled, ref);
          return { accepted: false, reason: "amount_changed" };
        }
        await markAmountChanged(this.env, other.id);
      }

      /*
       * The one settlement slot for this question, taken in D1 before the answer is written.
       * Two sessions of one response can settle at the same instant, and nothing inside this
       * object serialises them; see `claimSettlement`.
       */
      if (!(await claimSettlement(this.env, record, submissionId))) {
        return this.refuseDuplicatePayment(ref);
      }
      claimed = settled.recordId;
      // Everything else this respondent paid for the question, at a price it no longer asks.
      // The reuse path does the same; see `flagStaleSiblings`.
      await flagStaleSiblings(this.env, {
        sessionId: meta.sessionId,
        blockRef: ref,
        keepId: settled.recordId,
        amountMinor: settled.amountMinor,
        currency: settled.currency,
      });
    }

    if (meta.status !== "active") return { accepted: false, reason: "session_not_active" };
    if (!block || !payable) return { accepted: false, reason: "no_block" };

    this.turnHandedBack = false;
    try {
      const pending = meta.pendingPayment;
      if (pending && pending.ref === ref) {
        // A different attempt than the one on screen paid — an older tab. The
        // one on screen is now surplus.
        if (!simulated && pending.recordId !== settled.recordId) await supersedeRecord(this.env, pending.recordId);
        meta.pendingPayment = null;
        await this.persistMeta();
      }

      /*
       * Not the question on screen: they skipped past an optional payment, or
       * went back to edit something else, and paid anyway. The answer is kept
       * without dragging the conversation back to it.
       */
      if (meta.currentRef !== ref) {
        const value = validateAnswer(payable, null, { settledPayment: settled });
        if (!value.ok || value.value === undefined) {
          if (claimed) await releaseSettlementClaim(this.env, claimed);
          return { accepted: false, reason: "failed" };
        }
        if (this.state.answers[ref] === undefined) this.collectedCount += 1;
        this.state.answers[ref] = value.value;
        await this.persistMeta();
        this.ctx.waitUntil(this.projectAnswer(payable, value.value));
        await this.emit("payment_settled", { ref, recordId: settled.recordId, status: "paid" });
        /*
         * `null`, not a message id: nothing the respondent typed is this answer. The client
         * treats that as "no bubble to put a pencil on" rather than guessing at the last one.
         */
        await this.emit("answer_recorded", { ref, pct: this.progressPct(), messageId: null });
        if (!simulated) await markSettled(this.env, settled.recordId);
        // Paying is activity. Without this the alarm the checkout pushed out still fires at its
        // expiry and abandons a respondent who paid minutes ago.
        await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);
        return { accepted: true, reason: "recorded_off_cursor" };
      }

      await this.emit("payment_settled", { ref, recordId: settled.recordId, status: "paid" });
      await this.appendMessage(
        "system_event",
        `Payment ${simulated ? "simulated" : "verified"}: ${formatAmount(fromMinorUnits(settled.amountMinor, settled.currency), settled.currency)} via ${PAYMENT_PROVIDER_LABELS[settled.provider]}`,
      );
      this.pendingUserTextPersisted = false;
      this.pendingUserMessageId = null;
      const recorded = await this.record(payable, null, { settledPayment: settled });
      if (!recorded.accepted) {
        if (claimed) await releaseSettlementClaim(this.env, claimed);
        return { accepted: false, reason: "failed" };
      }
      if (!simulated) await markSettled(this.env, settled.recordId);
      if (!this.turnHandedBack) {
        console.error("payment_settle_without_handback", { sessionId: meta.sessionId, blockRef: ref });
        await this.resync();
      }
      // See the off-cursor path: the conversation has just moved, so the idle clock restarts.
      await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);
      return { accepted: true, reason: "settled" };
    } catch (err) {
      console.error("payment_settle_failed", {
        sessionId: meta.sessionId,
        formId: meta.formId,
        blockRef: ref,
        recordId: settled.recordId,
        ...errorInfo(err),
      });
      /*
       * The slot goes back, or the retry of this delivery reads a record already settled — with
       * no answer anywhere — and drops it. See `claimSettlement`.
       */
      if (claimed) await releaseSettlementClaim(this.env, claimed);
      await this.failTurn("payment_settle_failed", "Your payment went through — give us a moment to record it.");
      return { accepted: false, reason: "failed" };
    }
  }

  /**
   * Tell the respondent a payment that landed was not counted, because the question's price
   * moved after its checkout opened. Only when it is the checkout on screen, or when nothing
   * is — a failure for some older attempt would clobber the card for the one they are using.
   */
  private async refuseStalePayment(
    settled: SettledPayment,
    ref: string,
    now: ReturnType<typeof resolvePaymentAmount>,
  ): Promise<void> {
    const meta = this.meta!;
    const pending = meta.pendingPayment;
    const onScreen = pending?.recordId === settled.recordId || (!pending && meta.currentRef === ref);
    if (pending?.recordId === settled.recordId) {
      meta.pendingPayment = null;
      await this.persistMeta();
    }
    if (!onScreen || meta.currentRef !== ref) return;
    const paid = formatAmount(fromMinorUnits(settled.amountMinor, settled.currency), settled.currency);
    await this.emit("payment_failed", {
      ref,
      recordId: settled.recordId,
      code: "payment_amount_changed",
      message: now.ok
        ? `That payment of ${paid} was for an earlier total, so it wasn't counted — the form's owner can refund it. This now comes to ${formatAmount(now.amount, now.currency)}. Tap Pay to pay that.`
        : `That payment of ${paid} was for an earlier total, so it wasn't counted — the form's owner can refund it. The total your answers come to now isn't one this form can take; change the answer it comes from to carry on.`,
    });
    await this.emitQuestion();
  }

  /**
   * Tell the respondent a payment was not counted because the response is already paid for, at
   * another price, from somewhere this conversation cannot see — their other device, usually.
   *
   * Said rather than settled, and said plainly: this session's answers are the old ones, so it
   * cannot offer the new price either. The money is real, and the flag on the record is what
   * puts it in front of the admin.
   */
  private async refusePaidElsewhere(settled: SettledPayment, ref: string): Promise<void> {
    const meta = this.meta!;
    if (meta.pendingPayment?.recordId === settled.recordId) {
      meta.pendingPayment = null;
      await this.persistMeta();
    }
    if (meta.currentRef !== ref) return;
    const paid = formatAmount(fromMinorUnits(settled.amountMinor, settled.currency), settled.currency);
    await this.emit("payment_failed", {
      ref,
      recordId: settled.recordId,
      code: "payment_amount_changed",
      message: `That payment of ${paid} wasn't counted: this has already been paid for, for a different amount, somewhere else — on another device, or in another tab. The form's owner can refund it.`,
    });
    await this.emitQuestion();
  }

  /**
   * A payment refused as a second one for a question already paid for.
   *
   * It may be the very checkout this session has on screen — a respondent's phone holding one
   * open while their laptop paid for the same response — and a `pendingPayment` left pointing
   * at it swallowed every typed answer as "your checkout is still open" until the alarm gave up
   * on the conversation. Any checkout still open for the question is surplus now, so it goes,
   * and the card says why. Pay on it finds the payment that stands and moves on.
   */
  private async refuseDuplicatePayment(ref: string): Promise<SettleResult> {
    const meta = this.meta!;
    const pending = meta.pendingPayment;
    if (pending && pending.ref === ref) {
      // Superseding a record the gateway has already moved on is a no-op; see `supersedeRecord`.
      await this.clearPendingPayment();
      if (meta.status === "active" && meta.currentRef === ref) {
        await this.emit("payment_failed", {
          ref,
          recordId: pending.recordId,
          code: "payment_duplicate",
          message: paymentFailureMessage("payment_duplicate"),
        });
        await this.emitQuestion();
      }
    }
    return { accepted: false, reason: "duplicate" };
  }

  /**
   * The gateway reported a refund for this record. The session's own copy of the answer says
   * so too, so nothing that re-records from that copy writes "paid" back over it. See
   * `notifyRefunded` in `lib/payments/service.ts`.
   */
  async paymentRefunded(recordId: string): Promise<{ accepted: boolean }> {
    return this.onPaymentChain(() => this.paymentRefundedOnce(recordId));
  }

  private async paymentRefundedOnce(recordId: string): Promise<{ accepted: boolean }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false };

    /*
     * A refund on the checkout still on screen ends that checkout too.
     *
     * The gateway will not take a refunded order again — this happens to a late capture the
     * gateway auto-refunds — and a `pendingPayment` left pointing at it swallowed every typed
     * message as "your checkout is still open" and handed the same dead launch back to Pay.
     */
    const pending = this.meta.pendingPayment;
    if (pending?.recordId === recordId) {
      this.meta.pendingPayment = null;
      await this.persistMeta();
      if (this.meta.status === "active") {
        await this.emit("payment_failed", {
          ref: pending.ref,
          recordId,
          code: "payment_refunded",
          message: paymentFailureMessage("payment_refunded"),
        });
        await this.emitQuestion();
      }
    }

    for (const [ref, value] of Object.entries(this.state.answers)) {
      const v = value as { method?: string; paymentRecordId?: string; refunded?: boolean } | null;
      if (!v || typeof v !== "object" || v.method !== "gateway" || v.paymentRecordId !== recordId) continue;
      if (v.refunded) return { accepted: true };
      this.state.answers[ref] = { ...(v as object), refunded: true } as AnswerMap[string];
      await this.persistMeta();
      return { accepted: true };
    }
    return { accepted: Boolean(pending?.recordId === recordId) };
  }

  /**
   * The gateway said this attempt did not go through. The card offers a retry.
   *
   * Only for the attempt on screen: a failure report for an older, superseded
   * checkout says nothing about the one the respondent is looking at.
   */
  async paymentFailed(recordId: string, code: string): Promise<{ accepted: boolean }> {
    return this.onPaymentChain(() => this.paymentFailedOnce(recordId, code));
  }

  private async paymentFailedOnce(recordId: string, code: string): Promise<{ accepted: boolean }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || this.meta.status !== "active") return { accepted: false };
    const pending = this.meta.pendingPayment;
    if (!pending || pending.recordId !== recordId) return { accepted: false };
    try {
      this.meta.pendingPayment = null;
      await this.persistMeta();
      await this.emit("payment_failed", {
        ref: pending.ref,
        recordId,
        code,
        message: paymentFailureMessage(code),
      });
      await this.emitQuestion();
      return { accepted: true };
    } catch (err) {
      console.error("payment_failed_emit_failed", { sessionId: this.meta.sessionId, recordId, ...errorInfo(err) });
      return { accepted: false };
    }
  }

  /**
   * A payment, pretended — in a builder preview and nowhere else.
   *
   * A preview has to show an author the whole flow, including what happens
   * after Pay, and must never take money: not from a live account, and not
   * even a test-mode record in D1. So the settlement is synthesised in memory
   * and goes through the same `settleFromRecord` a real one does, which is
   * what keeps the preview from quietly drifting away from the live chat.
   */
  private async simulatePayment(ref: string | undefined): Promise<{ accepted: boolean; error?: string }> {
    const meta = this.meta!;
    if (meta.formVersionId !== "preview") return { accepted: false, error: "not_preview" };
    const block = await this.currentBlock();
    if (!block) return { accepted: false, error: "no_question" };
    if (ref !== undefined && ref !== block.ref) return { accepted: false, error: "stale_ref" };
    if (block.type !== "payment" || block.method !== "gateway") return { accepted: false, error: "not_payment" };

    const amount = this.priceNow(block);
    if (!amount.ok) {
      await this.emit("validation_error", {
        ref: block.ref,
        code: "payment_unverified",
        message: "This payment's amount doesn't resolve — check the amount or its variable.",
      });
      await this.emitQuestion();
      return { accepted: true };
    }
    let provider: PaymentProvider = meta.pendingPayment?.provider ?? "stripe";
    if (!meta.pendingPayment && block.paymentAccountId) {
      provider =
        (await providersForAccounts(this.env, meta.organizationId, [block.paymentAccountId])).get(block.paymentAccountId) ??
        provider;
    }
    if (meta.pendingPayment) await this.clearPendingPayment();

    const settled: SettledPayment = {
      recordId: `rpay_preview_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      provider: PAYMENT_PROVIDERS.includes(provider) ? provider : "stripe",
      providerPaymentId: null,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      paidAt: Date.now(),
    };
    const result = await this.settleFromRecord(settled, block.ref, true);
    return result.accepted ? { accepted: true } : { accepted: false, error: result.reason ?? "rejected" };
  }

  /** Retire the open checkout, if any. The record stays payable; see `supersedeRecord`. */
  private async clearPendingPayment(): Promise<void> {
    const pending = this.meta?.pendingPayment;
    if (!pending) return;
    this.meta!.pendingPayment = null;
    await this.persistMeta();
    await supersedeRecord(this.env, pending.recordId);
  }

  /**
   * The alarm's last question to the gateway before abandoning a conversation
   * with a checkout still open. True when it turned out to be paid.
   *
   * Once, and failure is not retried: the webhook and `settleLate` still cover
   * a payment this misses, and an alarm that retried a down gateway would hold
   * an abandoned conversation open indefinitely.
   */
  private async lastLookAtPayment(recordId: string): Promise<boolean> {
    try {
      const confirmed = await confirmPaymentRecord(this.env, recordId);
      if (confirmed?.record.status === "paid" && !confirmed.mismatch) {
        const settled = await this.settlePayment(recordId);
        if (settled.accepted) return true;
      }
    } catch (err) {
      console.error("payment_alarm_confirm_failed", { sessionId: this.meta?.sessionId, recordId, ...errorInfo(err) });
    }
    if (this.meta?.pendingPayment?.recordId === recordId) {
      this.meta.pendingPayment = null;
      await this.persistMeta();
    }
    return false;
  }

  /**
   * A payment that already pays for this question at the price it asks now, as proof for
   * `record`. Null for anything else — a manual payment, a refunded one, one for another price,
   * nothing.
   *
   * Read from D1, not from the answer this session holds. That copy was the whole check once,
   * and it is the wrong authority twice over: a refund reaches the D1 row, so the copy went on
   * saying "paid" and the next Pay re-recorded it over the refund; and Start over empties the
   * copy while the payment still stands, so the next Pay charged the respondent again. The
   * answer's record id is looked at first because it is the likeliest; the response's settled
   * payments are the fallback.
   */
  private async heldPayment(
    block: Block,
    amount: { amountMinor: number; currency: string },
  ): Promise<SettledPayment | null> {
    const meta = this.meta!;
    const v = this.state.answers[block.ref] as
      | {
          method?: string;
          status?: string;
          provider?: PaymentProvider;
          paymentRecordId?: string;
          amount?: number;
          currency?: string;
          paidAt?: number;
        }
      | undefined;

    // A simulated payment exists only in this preview's memory; there is no row to consult.
    if (v?.method === "gateway" && v.status === "paid" && v.paymentRecordId?.startsWith("rpay_preview_")) {
      if (v.amount === undefined || !v.currency || !v.provider) return null;
      const minor = toMinorUnits(v.amount, v.currency);
      if (minor !== amount.amountMinor || v.currency.toUpperCase() !== amount.currency) return null;
      return {
        recordId: v.paymentRecordId,
        provider: v.provider,
        providerPaymentId: null,
        amountMinor: minor,
        currency: v.currency,
        paidAt: v.paidAt ?? Date.now(),
      };
    }

    const submissionId =
      meta.formVersionId === "preview" ? null : ((await this.ctx.storage.get<string>("submission_id")) ?? null);
    const pays = (r: RespondentPaymentRow | null): r is RespondentPaymentRow =>
      r !== null &&
      r.status === "paid" &&
      r.blockRef === block.ref &&
      r.formId === meta.formId &&
      (r.sessionId === meta.sessionId || (submissionId !== null && r.submissionId === submissionId)) &&
      (r.failureReason === null || r.failureReason === "amount_changed") &&
      r.amountMinor === amount.amountMinor &&
      r.currency === amount.currency;

    let record = v?.method === "gateway" && v.paymentRecordId ? await loadRecord(this.env, v.paymentRecordId) : null;
    if (!pays(record)) {
      record = await findSettledPayment(this.env, {
        sessionId: meta.sessionId,
        submissionId,
        blockRef: block.ref,
        reusableFor: amount,
      });
    }
    if (!pays(record)) return null;

    /*
     * One question to the gateway before this counts as the answer again.
     *
     * The row says `paid` because that is what the gateway last said, and D1 only hears about a
     * refund when a refund webhook arrives — which for Cashfree means only a SUCCESS refund, and
     * a refund can sit PENDING there for days. So a respondent whose earlier payment the admin
     * has just refunded, coming back to the question, had that refunded payment written as
     * "Paid · verified" and the response completed on money that had gone back. Reuse is a tap on
     * Pay, so this costs one call at a moment the respondent is already waiting.
     */
    const fresh = await this.confirmedForReuse(record);
    if (!fresh) return null;

    // The price came back to what was paid: it pays for the question again.
    if (fresh.failureReason === "amount_changed") await clearAmountChanged(this.env, fresh.id);
    return settledPaymentOf(fresh);
  }

  /**
   * The record as the gateway has it right now, if it still pays for the question — null if the
   * gateway says it does not: refunded, being refunded, part-refunded, or an amount that no
   * longer matches. Refusing here only means the respondent is offered checkout again.
   */
  private async confirmedForReuse(record: RespondentPaymentRow): Promise<RespondentPaymentRow | null> {
    if (record.id.startsWith("rpay_preview_")) return record;
    try {
      const confirmed = await confirmPaymentRecord(this.env, record.id);
      if (!confirmed || confirmed.mismatch || confirmed.refundPending) return null;
      if (confirmed.unverifiable) {
        // Nobody can ask about it any more (the account is gone). The row is all there is, and
        // it says paid; charging the respondent a second time would be the worse of the two.
        return record;
      }
      const now = confirmed.record;
      if (now.status !== "paid" || now.amountMinor !== record.amountMinor || now.currency !== record.currency) {
        return null;
      }
      return now;
    } catch (err) {
      /*
       * The gateway could not be reached. The row is the best evidence left, and it says paid —
       * and the alternative here is opening a second checkout for a question this respondent has
       * already paid for, which is a double charge rather than a stale answer.
       */
      console.error("payment_reuse_confirm_failed", {
        sessionId: this.meta?.sessionId,
        recordId: record.id,
        ...errorInfo(err),
      });
      return record;
    }
  }

  /**
   * Answers that a changed price has left behind.
   *
   * A verified payment is an answer for one amount. When an answer that sets a variable amount
   * changes — the pencil on "how many tickets", or a typed correction — the payment answer that
   * was right for the old total is not an answer for the new one, and it cannot stay: the
   * resume after an edit walks past every answered question, so a ₹100 payment for one ticket
   * would have carried a response for ten straight to the end. So it is taken off the question
   * (the session, the tally, the results row), its record is flagged for the admin to refund,
   * and the respondent is told why they are about to be asked to pay again.
   *
   * Checked on every move forward, because that is the one moment an answer that sets the price
   * may have just changed. The price is replayed from the answers — see `priceNow` — never read
   * off the running variables, which move on every answer and would take a payment back off the
   * moment it settled.
   *
   * A price that no longer resolves releases the answer too. "Doesn't resolve" for a variable
   * amount means the answers now come to a total the form refuses to charge — above its
   * `maxAmount`, below its `minAmount` — which is exactly the case those limits exist for; kept,
   * the resume walked a response for fifty tickets past its one-ticket payment to the end. Only
   * a doc with no variable named is left alone: an author's error, and nothing the respondent
   * changed.
   */
  private async releaseStalePayments(): Promise<void> {
    if (!this.doc || !this.meta) return;
    this.dropUnverifiedGatewayAnswers();
    for (const block of this.doc.blocks) {
      if (block.type !== "payment" || block.method !== "gateway") continue;
      const held = this.state.answers[block.ref] as
        | { method?: string; status?: string; amount?: number; currency?: string; paymentRecordId?: string }
        | undefined;
      if (!held || held.method !== "gateway" || held.status !== "paid" || held.amount === undefined || !held.currency) {
        continue;
      }
      /*
       * A question the flow no longer reaches has no price to be stale against.
       *
       * `priceNow` falls back to the session's running variables when the replay never gets to
       * the block, and those keep growing: `applyLogicRules` re-applies every matching
       * `add_score` on each `resolveNext`. So a respondent who paid at a question and then took
       * a branch that skips it had the payment released against a total that block never asked
       * for, and was told to pay an amount nothing will ever charge them. Left alone: the answer
       * is not in their way (the flow does not go there), and if the branch comes back the
       * comparison below happens then.
       */
      if (
        block.amountMode === "variable" &&
        variablesReaching(this.doc, this.state.answers, this.state.hidden, block.ref) === null
      ) {
        continue;
      }
      const now = this.priceNow(block);
      if (!now.ok && (block.amountMode !== "variable" || !block.amountVariable)) continue;
      if (
        now.ok &&
        toMinorUnits(held.amount, held.currency) === now.amountMinor &&
        held.currency.toUpperCase() === now.currency
      ) {
        continue;
      }

      console.warn("payment_answer_released", {
        sessionId: this.meta.sessionId,
        blockRef: block.ref,
        recordId: held.paymentRecordId,
        paidMinor: toMinorUnits(held.amount, held.currency),
        askedMinor: now.ok ? now.amountMinor : null,
        askedCode: now.ok ? null : now.code,
      });
      delete this.state.answers[block.ref];
      this.collectedCount = Math.max(0, this.collectedCount - 1);
      await this.persistMeta();
      this.ctx.waitUntil(this.unprojectAnswer(block.ref));
      if (held.paymentRecordId && !held.paymentRecordId.startsWith("rpay_preview_")) {
        await markAmountChanged(this.env, held.paymentRecordId).catch((err: unknown) =>
          console.error("payment_release_flag_failed", { recordId: held.paymentRecordId, ...errorInfo(err) }),
        );
      }
      await this.emitMessage(
        now.ok
          ? `That changes "${block.title}" to ${formatAmount(now.amount, now.currency)}, so the ${formatAmount(held.amount, held.currency)} you paid earlier no longer covers it. You'll need to pay the new amount — the form's owner can refund the earlier payment.`
          : `That changes "${block.title}" to a total this form can't take, so the ${formatAmount(held.amount, held.currency)} you paid earlier no longer covers it. Change the answer the total comes from to carry on — the form's owner can refund the earlier payment.`,
      );
    }
  }

  /**
   * Answers on a verified payment question that no gateway ever confirmed.
   *
   * Answers arrive in a session without going through `validateAnswer` twice: a resume link and
   * an identity adoption both put a stored answer map straight into state. So a draft answered
   * while the block collected fees by UPI — `{status:"paid", method:"upi", verified:false}`, which
   * is nothing but the respondent's own word — outlived the author switching that block to
   * verified checkout, and `replayState` walked the resumed conversation straight past the Pay
   * card to the end. Dropped, the question is simply unanswered and gets asked properly.
   *
   * Not persisted here: every caller is about to persist, or to replay and then persist.
   */
  private dropUnverifiedGatewayAnswers(): void {
    if (!this.doc) return;
    for (const block of this.doc.blocks) {
      if (block.type !== "payment" || block.method !== "gateway") continue;
      const held = this.state.answers[block.ref] as { method?: string; verified?: boolean } | undefined;
      if (held === undefined || held === null) continue;
      if (typeof held === "object" && held.method === "gateway" && held.verified === true) continue;
      console.warn("payment_unverified_answer_dropped", {
        sessionId: this.meta?.sessionId,
        blockRef: block.ref,
        method: typeof held === "object" ? (held.method ?? null) : null,
      });
      delete this.state.answers[block.ref];
      this.collectedCount = Math.max(0, this.collectedCount - 1);
    }
  }

  /**
   * What a verified payment question charges, worked out from this session's answers.
   *
   * Every reading of the price goes through here — Pay, the re-check at settlement, the release
   * of a stale answer, the preview's simulation — so the four cannot disagree about it. The
   * variables are the ones the flow holds on reaching the question when the answers are
   * replayed; see `variablesReaching` for why the session's running copy is not used. The
   * running copy stands in only when the replay never reaches the question at all.
   */
  private priceNow(
    block: Parameters<typeof resolvePaymentAmount>[0] & { ref: string },
  ): ReturnType<typeof resolvePaymentAmount> {
    const variables =
      block.amountMode === "variable" && this.doc
        ? (variablesReaching(this.doc, this.state.answers, this.state.hidden, block.ref) ?? this.state.variables)
        : this.state.variables;
    return resolvePaymentAmount(block, variables);
  }

  /**
   * A phone number this respondent already gave, for gateways that insist on
   * one (Cashfree). A phone sign-in is preferred by the caller; this covers a
   * Google sign-in on a form that asked for a number anyway.
   */
  private answeredPhone(): string | null {
    for (const block of this.doc?.blocks ?? []) {
      const value = this.state.answers[block.ref];
      if (block.type === "phone" && typeof value === "string" && value) return value;
      if (block.type === "contact_info" && value && typeof value === "object") {
        const phone = (value as { phone?: unknown }).phone;
        if (typeof phone === "string" && phone) return phone;
      }
    }
    return null;
  }

  /** Which gateway a verified payment block's account is, resolved once per account per isolate. */
  private paymentProviders = new Map<string, PaymentProvider | null>();

  /**
   * `toPublicBlock`, plus the one fact only D1 knows: which gateway checkout
   * opens on, so the card can say "Pay with Razorpay" before anyone presses it.
   */
  private async publicBlockOf(block: Block): Promise<PublicBlock> {
    const pub = toPublicBlock(block);
    if (block.type !== "payment" || block.method !== "gateway" || !block.paymentAccountId || !this.meta) return pub;
    let provider = this.paymentProviders.get(block.paymentAccountId);
    if (provider === undefined) {
      provider =
        (await providersForAccounts(this.env, this.meta.organizationId, [block.paymentAccountId])).get(
          block.paymentAccountId,
        ) ?? null;
      this.paymentProviders.set(block.paymentAccountId, provider);
    }
    if (provider) pub.paymentProvider = provider;
    return pub;
  }

  /** Cold hydration after eviction. */
  private async ensureLoaded(): Promise<boolean> {
    if (this.loaded) return true;
    const stored = await this.ctx.storage.get<StoredSession>("session");
    if (!stored) return false;
    // A session started under an older schema version must keep running.
    const parsed = FormDoc.safeParse(migrateFormDoc(stored.docJson));
    if (!parsed.success) return false;
    this.meta = stored.meta;
    this.doc = parsed.data;
    this.state = { answers: stored.answers, variables: stored.variables, hidden: this.meta.hiddenFields };
    /**
     * The high-water mark of what was actually emitted, not of what was last
     * persisted alongside the rest of the session.
     *
     * `emit` bumps `seq` and writes `evt:<seq>`, but only `persistMeta` saves
     * the counter — so an eviction after an emit and before the next persist
     * rewound it. The next events then reused sequence numbers the client had
     * already seen, and the client's replay ratchet (which exists so a
     * reconnect is not applied twice) silently dropped every one of them: the
     * reply was sent, the browser threw it away, the typing dots never
     * stopped. Reading the last durable event back is the only number that
     * cannot go backwards.
     */
    const tail = await this.ctx.storage.list<SSEEnvelope>({ prefix: "evt:", reverse: true, limit: 1 });
    const lastEmitted = [...tail.values()][0]?.seq ?? 0;
    this.seq = Math.max(stored.seq, lastEmitted);
    this.turnCount = stored.turnCount;
    this.collectedCount = stored.collectedCount;
    // These two used to live only in memory. A DO eviction therefore reset the
    // escalation counter (so a respondent could loop on a bad answer forever)
    // and reset the token budget to zero (so `sessionTokenBudget` was not
    // actually a cap). They are part of session state and must survive.
    this.invalidCounts = new Map(Object.entries(stored.invalidCounts ?? {}));
    this.partials = new Map(Object.entries(stored.partials ?? {}));
    // `phrasingTokensUsed` was the larger of the two while both existed, so a
    // session written before they merged carries its spend across rather than
    // being handed a fresh allowance mid-conversation.
    this.sessionTokensUsed = Math.max(stored.sessionTokensUsed ?? 0, stored.phrasingTokensUsed ?? 0);
    this.meteredTokens = stored.meteredTokens ?? 0;
    this.extractionCalls = stored.extractionCalls ?? 0;
    this.editingRef = stored.editingRef ?? null;
    this.degraded = stored.degraded ?? false;
    this.pendingEndingRef = stored.pendingEndingRef ?? null;
    this.gatedAtRef = stored.gatedAtRef ?? null;
    this.seenTurnIds = stored.seenTurnIds ?? [];
    this.loaded = true;
    return true;
  }

  private async persistMeta(): Promise<void> {
    if (!this.meta || !this.doc) return;
    await this.ctx.storage.put("session", {
      meta: this.meta,
      docJson: this.doc,
      answers: this.state.answers,
      variables: this.state.variables,
      seq: this.seq,
      turnCount: this.turnCount,
      collectedCount: this.collectedCount,
      invalidCounts: Object.fromEntries(this.invalidCounts),
      partials: Object.fromEntries(this.partials),
      sessionTokensUsed: this.sessionTokensUsed,
      meteredTokens: this.meteredTokens,
      extractionCalls: this.extractionCalls,
      editingRef: this.editingRef,
      degraded: this.degraded,
      pendingEndingRef: this.pendingEndingRef,
      gatedAtRef: this.gatedAtRef,
      seenTurnIds: this.seenTurnIds,
    } satisfies StoredSession);
  }

  override async alarm(): Promise<void> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta) return;
    if (this.meta.status !== "active") return;

    /*
     * Idle is not the same as gone while a checkout is open.
     *
     * Somebody on a bank's 3-D Secure page, or waiting on a UPI approval on
     * their phone, sends this conversation nothing at all — and abandoning it
     * at the half-hour would finalise the response seconds before their money
     * lands, leaving the payment to the late path for no reason. So the alarm
     * keeps waking until the checkout's own expiry plus a grace period, and
     * then asks the gateway once before giving up.
     */
    const pending = this.meta.pendingPayment;
    if (pending) {
      const graceEnd = pending.expiresAt + PAYMENT_GRACE_MS;
      if (Date.now() < graceEnd) {
        await this.ctx.storage.setAlarm(graceEnd);
        return;
      }
      if (await this.lastLookAtPayment(pending.recordId)) {
        // Settled and moved on; they may yet come back to finish the rest.
        await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);
        return;
      }
      /*
       * That last look is a D1 read and a call to the gateway, and this object takes other
       * requests while it waits on them. The respondent coming back in that window — a typed
       * answer, or Pay opening a fresh checkout — is a conversation that is no longer idle, and
       * abandoning it anyway closed the form under somebody who had just paid into it. Whoever
       * moved also moved the alarm, so a later alarm is the signal that they did.
       */
      const alarmAt = await this.ctx.storage.getAlarm();
      if (
        this.meta?.status !== "active" ||
        (this.meta.pendingPayment && this.meta.pendingPayment.recordId !== pending.recordId) ||
        (alarmAt !== null && alarmAt > Date.now())
      ) {
        return;
      }
    }
    await this.abandon("idle_timeout");
  }

  // ────────────────────────── SSE ──────────────────────────

  async stream(): Promise<Response> {
    await this.ensureLoaded();
    // Reopening the form is the moment a respondent is most likely to meet a
    // rule that changed while they were away — the saved session reconnects
    // here rather than opening a new one, so this is the only place that can
    // notice.
    await this.refreshAuthGate();
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.writers.add(writer);

    /**
     * Replay from durable storage — the newest events, not the oldest.
     *
     * `list` is ascending, so a bare `limit` returns the *first* N keys. Past N
     * events that is precisely the wrong window: the client replayed the
     * opening of the conversation, its seq ratchet accepted those, and the
     * frames that say where the conversation actually stands — the last
     * `question`, an `auth_required`, an `ending` — were never in the response
     * at all. The form came back from a reload showing a stale transcript with
     * no controls under it and no way to get any, because the watchdog that
     * asks for a resync only arms under raised typing dots and a fresh load
     * has none.
     *
     * `reverse` takes the tail instead; the sort below puts it back in order.
     * A very long conversation now loses the *top* of its transcript on a
     * reconnect, which is cosmetic, rather than its current state, which is
     * the whole form.
     */
    const stored = await this.ctx.storage.list<SSEEnvelope>({
      prefix: "evt:",
      reverse: true,
      limit: MAX_REPLAY * 4,
    });
    const replay = [...stored.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v);
    const init = this.encoder.encode(`retry: 3000\n\n`);
    void writer.write(init);
    for (const evt of replay) {
      void writer.write(this.encoder.encode(this.serialize(evt)));
    }
    // per-connection readiness signal (not persisted, sent after replay)
    if (this.meta) {
      const ready: SSEEnvelope = {
        v: 1,
        seq: 0,
        ts: Date.now(),
        type: "session_ready",
        data: {
          sessionId: this.meta.sessionId,
          formTitle: this.doc?.title ?? "",
          agentMode: this.doc?.settings.agent.mode ?? "template",
          brandingHidden: this.meta.brandingHidden,
          // The same shape `auth_verified` carries, so the client has one way
          // of reading an identity whether it watched one arrive or was simply
          // handed one on connect.
          identity: this.meta.identity
            ? {
                provider: this.meta.identity.provider,
                label:
                  this.meta.identity.email ??
                  this.meta.identity.phone ??
                  this.meta.identity.name ??
                  "Verified",
                name: this.meta.identity.name ?? null,
                pictureUrl: this.meta.identity.pictureUrl ?? null,
              }
            : null,
        },
      };
      void writer.write(this.encoder.encode(this.serialize(ready)));
    }

    /**
     * A gate that closed while they were away, stated on the way back in.
     *
     * The replay above is the transcript as it stood, and a gate switched on
     * after the last turn is by definition not in it. Guarded on the tail so a
     * reconnect to a conversation already sitting at the card does not stack a
     * second one: the respondent reloading twice should see one card, not two.
     */
    /*
     * Raised once this method has handed the response back, never inside it.
     *
     * `emit` awaits a write to every attached writer, and this connection's
     * writer was added at the top — but its reader is the response that has not
     * been returned yet. Awaiting a write here is therefore waiting on a stream
     * nobody can drain until we stop waiting, which stalls the whole connect
     * path rather than the one frame it was trying to send.
     *
     * Queued instead: the reader attaches, and the card — or the first question
     * of an interview the gate never let start — arrives just behind the replay.
     */
    const onConnected = async (): Promise<void> => {
      if (this.authGateBlocks()) {
        if (replay.at(-1)?.type !== "auth_required") {
          await this.rememberGatedCursor();
          await this.emitAuthRequired();
        }
        return;
      }
      await this.startIfGateCleared();
    };
    void onConnected().catch((err: unknown) =>
      console.error("stream_gate_sync_failed", { sessionId: this.meta?.sessionId, ...errorInfo(err) }),
    );

    // periodic ping to keep connection alive
    const ping = setInterval(() => {
      void writer.write(this.encoder.encode(this.serialize({ v: 1, seq: 0, ts: Date.now(), type: "ping", data: {} })));
    }, 15000);
    void writer.closed
      .finally(() => {
        clearInterval(ping);
        this.writers.delete(writer);
      })
      .catch(() => {
        clearInterval(ping);
        this.writers.delete(writer);
      });

    return new Response(readable, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  }

  private serialize(evt: SSEEnvelope): string {
    return `id: ${evt.seq}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`;
  }

  private async emit(type: ServerEvent["type"], data: unknown): Promise<void> {
    /**
     * A closed bubble carries its own finished text.
     *
     * The seq ratchet on the client drops anything at or below what it has
     * already applied, so a correction can only ever be delivered *above* the
     * frames it corrects — and `message_end` is the only frame guaranteed to
     * sit above every token of its own message. That makes it the one place a
     * reconnecting client can be handed the whole message: one that dropped
     * out halfway through has a prefix, and replay alone cannot complete it,
     * because the frames holding the rest are all below its high-water mark.
     *
     * Live clients already have the identical text from the deltas, so this
     * changes nothing for them. Consumers that do not know the field ignore it.
     */
    if (type === "message_end") {
      const id = (data as { messageId?: string }).messageId;
      const run = id ? this.tokenRuns.get(id) : undefined;
      if (run) data = { ...(data as object), text: run.text };
    }
    const evt: SSEEnvelope = { v: 1, seq: ++this.seq, ts: Date.now(), type, data };
    // The events that put the respondent back in control. See `turnHandedBack`.
    // An open checkout card is one: the next move is theirs, in the gateway.
    if (
      type === "question" ||
      type === "ending" ||
      type === "auth_required" ||
      type === "verify_required" ||
      type === "review" ||
      type === "payment_required"
    ) {
      this.turnHandedBack = true;
    }
    // The one line that makes a turn returnable over HTTP as well as streamable:
    // when a *Sync RPC is collecting, every event it would have streamed is also
    // handed back to the caller. One event contract, two transports.
    if (this.turnJournal) this.turnJournal.push(evt);
    this.eventBuffer.push(evt);
    if (this.eventBuffer.length > MAX_REPLAY * 2) this.eventBuffer.splice(0, MAX_REPLAY);
    // persist for replay after eviction (key sorts by seq)
    const key = `evt:${String(evt.seq).padStart(8, "0")}`;
    await this.ctx.storage.put(key, evt);
    /**
     * A finished message is one stored frame, not one per token.
     *
     * Every delta the model streams is its own durable `put`, and a single
     * reply is fifty of them — so the replay window above was spent inside
     * about eight exchanges, and the storage bill was being paid to keep a
     * word-by-word recording of text nobody replays word by word. The tokens
     * still stream live at full granularity; what changes is that once the
     * bubble is closed, the run collapses into the first frame carrying the
     * whole message.
     *
     * The seq numbers the run consumed are deliberately not reused. They stay
     * below `message_end`'s, so the tail read in `ensureLoaded` still recovers
     * a high-water mark no live client can be ahead of.
     */
    if (evt.type === "token") {
      const { messageId, delta } = evt.data as { messageId: string; delta: string };
      const run = this.tokenRuns.get(messageId);
      if (run) {
        run.keys.push(key);
        run.text += delta;
      } else {
        this.tokenRuns.set(messageId, { head: evt, keys: [key], text: delta });
      }
    }
    if (evt.type === "message_end") {
      await this.coalesceTokenRun((evt.data as { messageId: string }).messageId);
    }
    const payload = this.encoder.encode(this.serialize(evt));
    // In parallel, and never unbounded: see WRITE_STALL_MS. A connection that
    // fails or stalls is dropped and aborted, which ends its response so the
    // browser reconnects and replays instead of watching a dead stream.
    const results = await Promise.all(
      [...this.writers].map(async (w) => ({ w, ok: await this.writeFrame(w, payload) })),
    );
    for (const { w, ok } of results) {
      if (ok) continue;
      this.writers.delete(w);
      void w.abort().catch(() => {});
    }
  }

  /** One frame to one connection, with a deadline. False means "this one is gone". */
  private async writeFrame(w: WritableStreamDefaultWriter<Uint8Array>, payload: Uint8Array): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        w.write(payload),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("sse_write_stalled")), WRITE_STALL_MS);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Replace a message's run of token frames with one frame holding the text.
   *
   * Best-effort on purpose: this is a storage tidy-up behind a bubble the
   * respondent has already read, and a failure here must not fail the turn
   * that produced it. The worst case of it not running is the old behaviour.
   */
  private async coalesceTokenRun(messageId: string): Promise<void> {
    const run = this.tokenRuns.get(messageId);
    this.tokenRuns.delete(messageId);
    if (!run || run.keys.length < 2) return;
    const [first, ...rest] = run.keys;
    try {
      await this.ctx.storage.put(first!, { ...run.head, data: { messageId, delta: run.text } });
      // The runtime caps one `delete` at 128 keys, and a long reply overruns that.
      for (let i = 0; i < rest.length; i += 128) {
        await this.ctx.storage.delete(rest.slice(i, i + 128));
      }
    } catch (err) {
      console.error("coalesce_tokens_failed", { sessionId: this.meta?.sessionId, messageId, ...errorInfo(err) });
    }
  }

  /** True when the LLM layer should phrase this turn. */
  private aiEnabled(): boolean {
    if (this.degraded) return false;
    const mode = this.doc?.settings.agent.mode ?? "template";
    return (
      this.env.OPENROUTER_API_KEY !== undefined &&
      mode !== "template" &&
      this.sessionTokensUsed < (this.doc?.settings.agent.sessionTokenBudget ?? FALLBACK_TOKEN_BUDGET)
    );
  }

  /**
   * Whether the session may still *understand* a reply, as opposed to phrase one.
   *
   * Deliberately not `aiEnabled()`. Running out of phrasing allowance is a
   * graceful downgrade — the interviewer stops rewording and the templates
   * take over — but it must never take comprehension with it, because
   * comprehension is the difference between a form that can be answered and
   * one that dead-ends. Nor is it gated on `degraded`: that flag means the
   * model mishandled its *tools*, and extraction has none — it is a single
   * constrained call whose output still goes through `validateAnswer`.
   *
   * It is reached only after the deterministic matchers have already failed,
   * so the alternative to allowing it is telling someone their answer is
   * invalid when it plainly was not.
   */
  private comprehensionEnabled(): boolean {
    const mode = this.doc?.settings.agent.mode ?? "template";
    return (
      this.env.OPENROUTER_API_KEY !== undefined &&
      mode !== "template" &&
      this.extractionCalls < MAX_EXTRACTION_CALLS
    );
  }

  /**
   * One agentic turn.
   *
   * Streams the model's words to SSE while collecting its tool calls. Tools
   * never mutate state: each is guarded against the FSM and its outcome is
   * returned to the model in the same turn, so a rejected call is corrected
   * rather than silently producing a wrong answer.
   *
   * Returns false when AI is unavailable or fails, and the caller falls back
   * to deterministic template phrasing.
   */
  private async aiStreamMessage(objective: string, opts: { review?: boolean } = {}): Promise<boolean> {
    if (!this.aiEnabled() || !this.doc || !this.meta) return false;
    /*
     * The review step has no question on screen. It gets a turn anyway — the
     * respondent can still type there, to change an answer or to ask something
     * — with only the tools that need no current question. See `handleReviewText`.
     */
    const block = opts.review ? null : this.doc.blocks.find((b) => b.ref === this.meta!.currentRef);
    if (!opts.review && !block) return false;

    const started = Date.now();
    const { model, id: modelId } = interviewModel(this.env, this.doc.settings.agent.model);

    /**
     * Declared out here so the catch can close a bubble the try opened.
     *
     * A `message_start` with no matching `message_end` leaves the client
     * rendering a streaming bubble — blinking caret, markdown deliberately not
     * parsed — forever, because "still streaming" is a state only the end
     * event clears. Any throw past the first token used to do exactly that:
     * the deterministic fallback then printed the question underneath, so the
     * respondent was left looking at a half-finished sentence that would never
     * finish above the question they were meant to answer.
     */
    const messageId = crypto.randomUUID();
    let opened = false;
    // Declared out here so the catch below can still write a usage row for a
    // turn that failed halfway. Starts unpriced, not free.
    let turnUsage: TokenUsage = NO_USAGE;

    try {
      const answered = Object.keys(this.state.answers).length;
      const context = await this.conversationContext();
      const outcomes: ToolOutcome[] = [];
      const formId = this.meta?.formId ?? "";
      const hasKnowledge = await this.resolveHasKnowledge(formId);
      const tools = buildAgentTools(
        {
          doc: this.doc,
          currentBlock: block ?? null,
          nextAfter: (value?: unknown) =>
            block
              ? nextStepAfter(this.doc!, block, this.state, value, { resume: this.editingRef === block.ref })
              : null,
          revise: (ref: string, value?: unknown) => revisionOf(this.doc!, this.state, block?.ref ?? null, ref, value),
          verbatimQuestions: this.doc.settings.agent.rephraseQuestions === false,
          clarifications: block ? (this.invalidCounts.get(block.ref) ?? 0) : 0,
          unansweredRequired: this.unansweredRequired().map((b) => ({ ref: b.ref, title: b.title })),
          hasKnowledge,
          searchKnowledge: hasKnowledge
            ? (query: string) => knowledgeStore(this.env).search(formId, query)
            : undefined,
        },
        (o: ToolOutcome) => outcomes.push(o),
      );

      const result = streamText({
        model,
        /**
         * `system` is the stable prefix and nothing else. The turn's own
         * context goes in the user message, below.
         *
         * This used to be `prefix + "\n\n" + suffix`, with a comment saying the
         * prefix came first so the provider's cache could serve it. The intent
         * was right and the arrangement defeated it: the suffix carries the
         * running transcript, so the system message changed on every turn and
         * the identical leading run was only the prefix itself — about 750
         * tokens, under Gemini's 1,024-token minimum for implicit caching. So
         * nothing was ever cached. `cacheReadTokens` came back 0 on every one
         * of the 5,700 turns this form has taken, which is why a 12,000-token
         * budget bought five answers.
         *
         * Split this way the system message is byte-identical for a whole
         * session, and together with the tool declarations the stable head
         * clears the threshold. `buildStablePrefix` must stay a pure function
         * of the document for this to hold — see its own note.
         */
        system: buildStablePrefix(this.doc, { hasKnowledge }),
        prompt: `${
          block
            ? buildTurnSuffix(this.doc, block, answered, { ...context, turnCount: this.turnCount })
            : buildReviewSuffix(context)
        }\n\n${objective}`,
        tools,
        // A tool call ends a step. Without this the model looks something up
        // (or records an answer) and the turn ends having said nothing, so the
        // respondent sees the deterministic fallback instead of a reply.
        //
        // Four covered look-up → answer → record → ask, which was enough while
        // the whole knowledge base also sat in the prompt and the look-up was
        // really a pointer. Retrieval can miss and be worth rephrasing once, and
        // a turn that spends its last step searching says nothing at all — so
        // six, which buys exactly one retry without letting a turn wander.
        stopWhen: stepCountIs(6),
        // The author's setting governs the visible reply; reasoning gets its
        // own headroom on top so it can never starve the answer.
        maxOutputTokens: this.doc.settings.agent.responseMaxTokens + REASONING_HEADROOM_TOKENS,
        providerOptions: {
          openrouter: {
            ...INTERVIEW_PROVIDER_OPTIONS.openrouter,
            // Which feature, whose org, which conversation — see `callTag`.
            user: callTag("interview_turn", this.meta.organizationId, this.meta.sessionId),
          },
        },
        // A turn that never returns is worse than a turn phrased by template.
        // See AI_TURN_TIMEOUT_MS.
        abortSignal: AbortSignal.timeout(AI_TURN_TIMEOUT_MS),
      });

      // Open the bubble lazily, on the first token. A turn that spends itself
      // on tool calls and says nothing used to leave an empty bubble in the
      // transcript, immediately followed by the deterministic fallback.
      let text = "";
      for await (const delta of result.textStream) {
        if (!delta) continue;
        if (!opened) {
          opened = true;
          await this.emit("message_start", { messageId, role: "assistant" });
        }
        text += delta;
        await this.emit("token", { messageId, delta });
      }
      if (opened) await this.emit("message_end", { messageId });

      const usage = await result.usage;
      // Tokens from the SDK, cost from OpenRouter. This turn runs up to six
      // steps and `result.providerMetadata` would carry only the last one, so
      // `reportedUsage` is given the whole step list to add up — reading the
      // top-level value instead under-reports a two-step call by more than half.
      turnUsage = reportedUsage({ usage, steps: await result.steps, response: await result.response });
      const inTok = usage?.inputTokens ?? 0;
      const outTok = usage?.outputTokens ?? 0;
      // The stable-prefix restructure above was measured once, by hand, against
      // 5,700 turns that all showed 0. Nothing since has logged it on an
      // ongoing basis, so there was no way to tell whether the fix held, or
      // whether Google's own implicit-caching threshold (or its interaction
      // with the tool declarations also in this prefix) moved out from under
      // it. One number, every turn, so a regression shows up in Workers Logs
      // instead of on the bill. Turn 0 is excluded — there is nothing to hit
      // yet on the first turn of a session.
      if (this.turnCount > 0) {
        console.log("interview_turn_cache", {
          sessionId: this.meta.sessionId,
          turn: this.turnCount,
          cacheReadTokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
          inputTokens: inTok,
        });
      }
      /**
       * Raw tokens, counted once, against a ceiling nobody reaches.
       *
       * This used to subtract cached input and reasoning output, so that a
       * budget "expressed in what the respondent sees" was not spent on what
       * they don't. The arithmetic was right and the whole idea was wrong: it
       * only matters within sight of the limit, and the limit is now the
       * plan's — a million on Business, against roughly forty thousand for a
       * full thirteen-question interview.
       *
       * So this is a backstop, not an allowance: one comparison, no accounting.
       * It is the only ceiling expressed in money — `agent_max_turns` is a
       * pacing hint to the model and stops nothing, and the hard `turnCount`
       * cap below is deliberately far out — so it stays, but it should never
       * be the thing a real conversation meets. The cost of caching lands where
       * it belongs, on the OpenRouter bill, without us modelling it.
       */
      const budget = this.doc.settings.agent.sessionTokenBudget ?? FALLBACK_TOKEN_BUDGET;
      const wasWithinBudget = this.sessionTokensUsed < budget;
      this.sessionTokensUsed += inTok + outTok;
      // Reaching it changes the product mid-conversation — the interviewer
      // becomes a form — so it must not be invisible.
      if (wasWithinBudget && this.sessionTokensUsed >= budget) {
        console.warn("agent_budget_spent", {
          sessionId: this.meta.sessionId,
          budget,
          used: this.sessionTokensUsed,
          turns: this.turnCount,
        });
      }
      await this.logAiUsage("interview_turn", turnUsage, modelId, Date.now() - started);
      if (text.trim()) await this.appendMessage("assistant", text);

      // Reliability floor (PLAN.md 4.3): three consecutive tool errors and the
      // session drops to deterministic template mode for good. The product
      // degrades; it never hangs on a model that cannot follow its own tools.
      const rejected = outcomes.filter((o) => !o.ok).length;
      this.toolErrorStreak = rejected > 0 ? this.toolErrorStreak + rejected : 0;
      if (this.toolErrorStreak >= 3) {
        console.warn("agent_degraded_to_template", { sessionId: this.meta.sessionId });
        this.degraded = true;
        await this.persistMeta();
      }

      this.pendingEffects = outcomes.flatMap((o) => (o.ok && o.effect ? [o.effect] : []));
      return text.trim().length > 0 || this.pendingEffects.length > 0;
    } catch (err) {
      console.error("ai_stream_failed", { sessionId: this.meta?.sessionId, ...errorInfo(err) });
      /**
       * A turn that threw still ran, and OpenRouter still charged for whatever
       * it generated before it did. This used to write nothing at all, which is
       * why the admin page could claim a 0% error rate over thousands of calls:
       * failures were not counted as failures, they were not counted at all.
       *
       * `turnUsage` holds whatever was known when it broke — usually nothing,
       * because the throw normally beats the final usage chunk, in which case
       * the row is unpriced rather than free.
       */
      await this.logAiUsage("interview_turn", turnUsage, modelId, Date.now() - started, "error");
      // Close whatever was opened before returning to the template path, so
      // the caller's fallback question lands under a finished bubble.
      if (opened) {
        try {
          await this.emit("message_end", { messageId, interrupted: true });
        } catch {
          /* the stream is already gone; the client will replay */
        }
      }
      return false;
    }
  }

  /**
   * Free text → a typed value, for the block types the deterministic NLU
   * cannot handle. Choice and scale types never reach this — they are matched
   * exactly, for free, with no chance of a hallucinated option.
   *
   * The extractor only narrows: whatever it returns still goes through
   * `validateAnswer`. Low confidence returns null so the caller clarifies
   * instead of recording a guess.
   */
  private async extractTypedAnswer(block: Block, text: string): Promise<unknown | null> {
    if (!this.comprehensionEnabled() || !needsExtraction(block)) return null;
    const schema = extractionSchema(block);
    if (!schema) return null;
    this.extractionCalls += 1;

    const started = Date.now();
    try {
      const { transcript } = await this.conversationContext();
      const out = await extractAnswer({
        env: this.env,
        organizationId: this.meta?.organizationId,
        sessionId: this.meta?.sessionId,
        schema: schema as never,
        question: block.title,
        guidance: extractionGuidance(block, new Date().toISOString().slice(0, 10)),
        answer: text,
        transcript,
      });
      if (!out) return null;
      // Metered like everything else, but never charged to the phrasing
      // allowance — see `comprehensionEnabled`.
      this.sessionTokensUsed += out.tokens;
      await this.logAiUsage("extraction", out.usage, MODELS.extraction, Date.now() - started);
      if (!out.confident || out.value === null || out.value === undefined) return null;
      return out.value;
    } catch (err) {
      console.error("extract_failed", { sessionId: this.meta?.sessionId, blockRef: block.ref, ...errorInfo(err) });
      return null;
    }
  }

  /**
   * Apply the effects the model asked for, after its turn has finished
   * streaming. Effects are applied here rather than inside the tool handlers
   * so the FSM stays the single writer of session state and the ordering is
   * deterministic.
   */
  private async applyPendingEffects(): Promise<void> {
    /*
     * A change to an earlier answer goes last. It moves the cursor back and
     * leaves an edit bookmark; anything applied after it that answers or skips
     * the question the turn started on would walk the cursor off the reopened
     * one and drop the bookmark with it.
     */
    const effects = [
      ...this.pendingEffects.filter((e) => e.kind !== "revise"),
      ...this.pendingEffects.filter((e) => e.kind === "revise"),
    ];
    this.pendingEffects = [];
    if (!this.doc || !this.meta) return;

    for (const effect of effects) {
      switch (effect.kind) {
        case "record": {
          const block = this.doc.blocks.find((b) => b.ref === effect.ref);
          // Guarded again here: the tool checked the ref, this checks the value.
          if (block) await this.record(block, effect.value);
          break;
        }
        /*
         * The respondent asked, in words, to change an earlier answer — the
         * pencil's edit, reached through the agent. Re-checked against the
         * state as it is now: an effect applied before this one may have moved
         * it since the tool said yes.
         */
        case "revise": {
          if (this.meta.status !== "active") break;
          const check = revisionOf(this.doc, this.state, this.meta.currentRef, effect.ref, effect.value);
          if (!check.ok) break;
          this.reopenQuestion(check.block);
          await this.persistMeta();
          if (effect.value === undefined) {
            // The agent has already asked for the new answer — unless the form
            // asks word for word, in which case the FSM does. Then arm its controls.
            if (this.doc.settings.agent.rephraseQuestions === false) {
              await this.emitMessage(questionText(check.block));
            }
            await this.emitQuestion();
          } else {
            /*
             * Their message already says it. Without this `record` echoes the
             * value as a bubble of its own whenever an earlier effect in the same
             * turn has used up the message — "Byte Force" appearing under the
             * agent's next question, as though they had sent it again.
             */
            if (this.turnUserMessageId) {
              this.pendingUserTextPersisted = true;
              this.pendingUserMessageId = this.turnUserMessageId;
            }
            await this.record(check.block, effect.value);
          }
          break;
        }
        case "skip": {
          const block = await this.currentBlock();
          if (block) {
            const next = resolveNext(this.doc, block.ref, this.state);
            await this.advanceTo(next, block.ref);
          }
          break;
        }
        case "upload": {
          const block = this.doc.blocks.find((b) => b.ref === effect.ref);
          if (block && block.type === "file_upload") {
            await this.emit("upload_request", {
              ref: block.ref,
              accept: block.accept,
              maxFiles: block.maxFiles,
              maxSizeMB: block.maxSizeMB,
            });
          }
          break;
        }
        case "end": {
          const ending =
            (effect.endingRef && this.doc.endings.find((e) => e.ref === effect.endingRef)) ||
            // Not `endings[0]`: an agent that finished the conversation without
            // naming an outcome has not refused anybody.
            defaultEnding(this.doc);
          if (ending) await this.advanceTo({ kind: "ending", ending }, this.meta.currentRef ?? "");
          break;
        }
        // `clarify` and `ask` need no state change — the model already said
        // the words, and the FSM is still on the same block.
        default:
          break;
      }
    }
  }

  /** Recent conversation + collected answers, for the agent's system prompt. */
  /**
   * Does this form have anything indexed to retrieve?
   *
   * One query per session. `ready` specifically: a source still extracting has
   * no vectors behind it, and telling the agent a knowledge base exists when
   * every search will come back empty is how it ends up insisting it should
   * know something it does not.
   */
  private async resolveHasKnowledge(formId: string): Promise<boolean> {
    if (this.hasKnowledge !== null) return this.hasKnowledge;
    if (!formId || !knowledgeAvailable(this.env)) {
      this.hasKnowledge = false;
      return false;
    }
    /*
     * The plan is re-checked here, not only at upload.
     *
     * Uploading is gated in `routes/knowledge.ts`, but rows outlive the
     * subscription that was allowed to create them: an org that indexes a
     * knowledge base on Pro and then downgrades would otherwise keep a paid
     * feature running on Free forever. This is the same re-derivation
     * `clampForRuntime` does for the sign-in gate and verified answers, and for
     * the same reason — what a form may do is decided by the plan it is being
     * answered on, not the plan it was published on.
     */
    const orgId = this.meta?.organizationId;
    if (orgId) {
      try {
        const ent = await getEntitlements(this.env, orgId);
        if (!can(ent, "agent_knowledge")) {
          this.hasKnowledge = false;
          return false;
        }
      } catch (err) {
        // Failing open would hand the feature to everyone on an outage;
        // failing closed only costs an entitled form one conversation's
        // retrieval, and the guardrail already says something sensible.
        console.error("knowledge_entitlement_check_failed", orgId, err);
        this.hasKnowledge = false;
        return false;
      }
    }
    try {
      const row = await this.env.DB.prepare(
        `SELECT 1 AS ok FROM knowledge_sources WHERE form_id = ? AND status = 'ready' LIMIT 1`,
      )
        .bind(formId)
        .first<{ ok: number }>();
      this.hasKnowledge = Boolean(row);
    } catch (err) {
      console.error("knowledge_presence_check_failed", formId, err);
      this.hasKnowledge = false;
    }
    return this.hasKnowledge;
  }

  private async conversationContext(): Promise<{ transcript: string; answers: string }> {
    const entries = await this.ctx.storage.list<{ id: string; role: string; content: string; createdAt: number }>({ prefix: "msg:" });
    const msgs = [...entries.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-16);
    const transcript = msgs.map((m) => `${m.role === "user" ? "Respondent" : "You"}: ${m.content}`).join("\n");
    const answers = Object.entries(this.state.answers)
      .map(([ref, v]) => {
        const block = this.doc?.blocks.find((b) => b.ref === ref);
        // The ref goes with the title: it is what `change_earlier_answer` takes.
        return `- ref=${ref} "${block?.title ?? ref}": ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`;
      })
      .join("\n");
    return { transcript, answers };
  }

  /**
   * Record one model call from the conversation path.
   *
   * A thin wrapper over the shared writer, which is now the only thing that
   * inserts into `ai_generations`. This used to be a second INSERT with its own
   * column list, and the two drifted: this one never wrote `user_id` or
   * `status`, so every conversation row claimed to have succeeded and none
   * could be attributed to a person.
   *
   * `usage.costUsd` is OpenRouter's own figure, passed through untouched.
   */
  private async logAiUsage(
    kind: string,
    usage: TokenUsage,
    model: string,
    latencyMs: number,
    status: "ok" | "error" = "ok",
  ): Promise<void> {
    if (!this.meta) return;
    await logAiGeneration(this.env, {
      organizationId: this.meta.organizationId,
      sessionId: this.meta.sessionId,
      formId: this.meta.formId,
      kind,
      model,
      usage,
      latencyMs,
      status,
    });
  }

  /**
   * Stream text as token events (template mode: chunked; AI mode: real tokens),
   * and write it down.
   *
   * The transcript append lives here rather than at the call sites, and that is
   * the whole point. It used to be a second line every caller had to remember —
   * `emitMessage(x)` then `appendMessage("assistant", x)` — and seven of the
   * fourteen callers did not, every one of them on the deterministic path. So a
   * conversation that spent its phrasing budget mid-way (see `aiEnabled`) went
   * on asking questions the respondent could read and the transcript never
   * recorded: the results dashboard showed a wall of answers with no questions
   * above them, and an author reading it back could not tell what had been
   * asked. Streaming a sentence to a respondent and storing it are the same
   * act, so they are one call.
   */
  private async emitMessage(text: string): Promise<string> {
    const messageId = crypto.randomUUID();
    // Ahead of the stream so the storage key, which is derived from `seq`,
    // sorts with the `message_start` this text belongs to.
    await this.appendMessage("assistant", text);
    await this.emit("message_start", { messageId, role: "assistant" });
    // chunk into word-ish tokens for streaming feel
    const chunks = text.match(/\S+\s*/g) ?? [text];
    let buf = "";
    for (const c of chunks) {
      buf += c;
      if (buf.length >= 12) {
        await this.emit("token", { messageId, delta: buf });
        buf = "";
      }
    }
    if (buf) await this.emit("token", { messageId, delta: buf });
    await this.emit("message_end", { messageId });
    return messageId;
  }

  /**
   * Put a message on the stream whole, without the token-by-token reveal.
   *
   * `emitMessage` streams because the respondent is watching a sentence being
   * written. History is not being written now — it was written on a previous
   * visit — so it arrives complete, the way the rest of the thread does after
   * a reload. One `token` frame collapses into the closing frame the same way
   * fifty do, so replay after a reconnect is unaffected.
   */
  private async emitHistoryMessage(text: string): Promise<void> {
    const messageId = crypto.randomUUID();
    await this.emit("message_start", { messageId, role: "assistant" });
    await this.emit("token", { messageId, delta: text });
    await this.emit("message_end", { messageId });
  }

  /**
   * Print the conversation they already had, as the conversation they had.
   *
   * A returning respondent gets the thread back — each question, their answer
   * under it, the next question at the bottom — because that is what coming
   * back to a chat means, and it is exactly what a refresh mid-form already
   * shows. The alternative this replaces, a line counting the questions they
   * had answered, asked them to take the form's word for what they had said
   * and gave them nothing to check it against or to edit.
   *
   * Walks `replayState`'s path rather than the answer map, so the questions
   * appear in the order they were asked, branches nobody took stay unasked,
   * and answers left off-path by a later edit stay off the screen.
   *
   * Streamed, never appended to the transcript. These messages are already
   * recorded against the response by the session that first asked them, and
   * `results` stitches every session of a response together in time order — so
   * writing them again would show the author each early question twice.
   */
  private async replayAnswerHistory(): Promise<void> {
    if (!this.doc || this.historyReplayed) return;
    this.historyReplayed = true;
    const { path } = replayState(this.doc, this.state.answers, this.state.hidden);
    for (const ref of path) {
      const block = this.doc.blocks.find((b) => b.ref === ref);
      if (!block) continue;
      // Collects nothing, so it was read and walked past. It belongs in the
      // thread — it is what the flow said between two questions — but it has
      // no answer to put under it.
      if (block.type === "welcome" || block.type === "statement") {
        await this.emitHistoryMessage(questionText(block));
        continue;
      }
      const value = this.state.answers[ref];
      // The block the flow is waiting on. `advanceTo` asks it next, with its
      // controls; printing it here would ask it twice.
      if (value === undefined) break;
      await this.emitHistoryMessage(questionText(block));
      /*
       * `blockRef` is what puts "change this answer" on the bubble: the client
       * reads it straight off `user_message`. A replayed answer is editable for
       * the same reason a live one is — it is on the path, and the response is
       * still open.
       */
      await this.emit("user_message", {
        messageId: `msg_${crypto.randomUUID().slice(0, 12)}`,
        text: summarizeAnswer(block, value),
        blockRef: block.ref,
      });
    }
  }

  // ────────────────────────── turns ──────────────────────────

  /**
   * One respondent turn, and the promise that it always ends in an event.
   *
   * The client clears its typing indicator on what arrives over the stream,
   * not on the status code of the POST that started the turn — it has to,
   * because a turn can also be started by another tab, by the headless API, or
   * by a retry the browser never saw the response to. So a turn that throws
   * halfway has to say so on the stream as well, or it leaves the form frozen
   * with an error nobody can see. The `finally`-shaped tail here re-states the
   * question, which puts the controls back exactly as they were.
   */
  async handleUserTurn(input: TurnInput): Promise<{ accepted: boolean; error?: string }> {
    /**
     * A turn this session has already taken is a no-op, not a second turn.
     *
     * The client may resend an answer whose response it never saw — a request
     * that timed out, a socket that died between the write and the reply — and
     * without this the resend would append the same sentence to the transcript
     * twice and put it through the agent twice. Answering `accepted` is the
     * honest reply: the answer *was* accepted, and everything it produced is
     * already on the stream waiting to be replayed.
     */
    if (input.turnId) {
      if (!(await this.ensureLoaded())) return { accepted: false, error: "session_not_found" };
      if (this.seenTurnIds.includes(input.turnId)) return { accepted: true };
    }
    this.turnHandedBack = false;
    try {
      const result = await this.runUserTurn(input);
      // Recorded only on acceptance: a refused turn (a failed validation, a
      // closed gate) is one the respondent is expected to send again.
      if (input.turnId && result.accepted) {
        this.seenTurnIds.push(input.turnId);
        if (this.seenTurnIds.length > 20) this.seenTurnIds.splice(0, this.seenTurnIds.length - 20);
        await this.persistMeta();
      }
      /**
       * The turn returned without putting anything on screen. Say the step
       * again rather than leave them staring at a form that stopped talking.
       *
       * Only reachable when the FSM took a path that forgot to close the turn —
       * so it is logged at error level, loudly enough to find the path, and
       * recovered silently, because the respondent should never be the one who
       * has to notice. `resync` reads state and emits; it never advances.
       */
      if (result.accepted && !this.turnHandedBack) {
        console.error("turn_ended_without_handback", {
          sessionId: this.meta?.sessionId,
          formId: this.meta?.formId,
          blockRef: this.meta?.currentRef,
          turnCount: this.turnCount,
          inputType: input.type,
        });
        await this.resync();
      }
      return result;
    } catch (err) {
      console.error("turn_failed", {
        sessionId: this.meta?.sessionId,
        formId: this.meta?.formId,
        blockRef: this.meta?.currentRef,
        turnCount: this.turnCount,
        collectedCount: this.collectedCount,
        inputType: input.type,
        ...errorInfo(err),
      });
      await this.failTurn("turn_failed", "Something went wrong on our side. Please try that again.");
      return { accepted: false, error: "turn_failed" };
    }
  }

  /**
   * Tell the stream a turn is over and unsuccessful, then put the question
   * back. Every step is best-effort: this runs on the failure path, and a
   * throw here would replace one hidden error with another.
   */
  private async failTurn(code: string, message: string): Promise<void> {
    try {
      await this.emit("error_event", { code, message });
    } catch (err) {
      console.error("fail_turn_emit_failed", err);
    }
    try {
      await this.emitQuestion();
    } catch (err) {
      console.error("fail_turn_requestion_failed", err);
    }
  }

  private async runUserTurn(input: TurnInput): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };
    // The tab that never reloaded: a gate switched on while this conversation
    // sat open takes effect on the next thing they send, not whenever the
    // isolate happens to be recycled.
    await this.refreshAuthGate();
    // Re-emit rather than silently dropping: a client that lost the card (a
    // reload, a stale tab) needs it back, not a dead input box.
    if (this.authGateBlocks()) {
      await this.rememberGatedCursor();
      await this.emitAuthRequired();
      return { accepted: false, error: "auth_required" };
    }
    if (this.turnCount >= 500) return { accepted: false, error: "too_many_turns" };

    this.turnCount += 1;
    await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);

    /*
     * Ahead of the transcript append on purpose. While a code is outstanding
     * the respondent's message *is* the code, and writing it into the
     * transcript would leave a one-time code sitting in a conversation the form
     * owner can read — and hand it to the agent as an answer besides.
     */
    if (this.meta.pendingVerify) return this.handlePendingVerify(input);
    /*
     * Typing while a checkout is open is talking about the checkout. Only text:
     * a structured answer for the payment question still goes to `record`,
     * where `validateAnswer` refuses it as `payment_unverified` — which is the
     * whole point of that code.
     */
    if (this.meta.pendingPayment && input.type === "text") return this.handlePendingPaymentText(input.text);

    if (input.type === "text") {
      const msgId = await this.appendMessage("user", input.text);
      await this.emit("user_message", { messageId: msgId, text: input.text });
      this.pendingUserTextPersisted = true;
      this.pendingUserMessageId = msgId;
      this.turnUserMessageId = msgId;
      if (this.pendingEndingRef !== null && this.meta.currentRef === null) return this.handleReviewText(input.text);
      return this.handleFreeText(input.text);
    }
    this.pendingUserTextPersisted = false;
    this.pendingUserMessageId = null;
    this.turnUserMessageId = null;
    return this.handleStructured(input.ref, input.value);
  }

  private async currentBlock(): Promise<Block | null> {
    if (!this.doc || !this.meta) return null;
    if (!this.meta.currentRef) return null;
    return this.doc.blocks.find((b) => b.ref === this.meta!.currentRef) ?? null;
  }

  private async handleFreeText(text: string): Promise<{ accepted: boolean; error?: string }> {
    const block = await this.currentBlock();
    if (!block) return { accepted: false, error: "no_question" };

    // ── 1. Exact matching first: free, instant, and incapable of inventing an
    //    option that does not exist. Covers the common case where someone taps
    //    a chip or types the option back verbatim.
    if ("options" in block && block.options) {
      const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, "");
      const match = block.options.find(
        (o) =>
          o.label.toLowerCase() === normalized ||
          o.label.toLowerCase().startsWith(normalized) ||
          normalized === o.id,
      );
      if (match) return this.record(block, match.id);
    } else if (block.type === "yes_no") {
      const t = text.trim().toLowerCase().replace(/[.!?]+$/, "");
      if (["yes", "y", "yeah", "yep", "sure", "ok", "okay"].includes(t)) return this.record(block, true);
      if (["no", "n", "nope", "nah"].includes(t)) return this.record(block, false);
    } else if (block.type === "rating" || block.type === "nps" || block.type === "opinion_scale") {
      // Only when the whole message is a number — "4" yes, "4 was great but…" no.
      const bare = text.trim();
      if (/^-?\d+(\.\d+)?$/.test(bare)) return this.record(block, Number(bare));
    }

    const direct = validateAnswer(block, text);

    // ── 2. Otherwise, let the agent read it.
    //
    // People do not speak in form fields. They answer and ask in the same
    // breath ("Nothing else — also, do I get any offers for this?"), they
    // answer sideways ("weekly I guess", "4 stars"), and they push back. None
    // of that can be settled by validation: for free-text blocks ANY string
    // validates, so the FSM used to record the question itself as the answer.
    //
    // Exact-match types reach here only when matching failed, so the fast path
    // above is never given up.
    if (this.aiEnabled()) {
      const shape = needsExtraction(block)
        ? extractionGuidance(block, new Date().toISOString().slice(0, 10))
        : "";
      const options =
        "options" in block && block.options
          ? ` The allowed values are: ${block.options.map((o) => `${o.id} (${o.label})`).join(", ")} — use the id.`
          : "";

      const ok = await this.aiStreamMessage(
        `The respondent replied: "${text}"\n\n` +
          `Their message may contain an answer, a question of their own, or both — handle everything in it.\n` +
          `1. If any part of it answers "${block.title}", call record_answer with ref=${block.ref}.${shape}${options}\n` +
          `2. If they also asked something, answer that too, in one or two sentences.\n` +
          `   If instead they want to change an answer they gave EARLIER, call change_earlier_answer for that ` +
          `question and follow its result rather than steps 1 and 3.\n` +
          `3. Then, if you recorded an answer, go straight on in the same message to the question ` +
          `record_answer names in its result — not the one that follows in the list, which on a branching ` +
          `form is a different question. ` +
          `If you did not, ask "${block.title}" again.\n` +
          `Never ignore a question they asked, even when they also answered.`,
      );

      if (ok) {
        const before = this.meta?.currentRef;
        // The agent already asked whatever comes next inside that same message.
        this.suppressNextAsk = true;
        await this.applyPendingEffects();
        this.suppressNextAsk = false;
        if (this.meta?.currentRef === before) await this.emitQuestion();
        return { accepted: true };
      }
      // Model unavailable — fall through rather than strand the respondent.
    }

    // ── 3. Deterministic fallback: template mode, degraded sessions, or a
    //    failed turn.
    if (direct.ok) return this.record(block, text);

    const extracted = await this.extractTypedAnswer(block, text);
    if (extracted !== null) return this.record(block, extracted);

    /**
     * They asked something, and nothing here can answer it.
     *
     * Reached only with the agent unavailable — no key, template mode, a
     * degraded session, or a spent token budget. Treating the question as a
     * failed answer was wrong twice over: it replied with a validation hint
     * that ignored what was said, and it counted the question towards
     * `escalateAfterInvalid`, so three questions in a row pushed the
     * respondent into the "let's make this easier" widget as though they
     * could not work the form.
     */
    if (looksLikeQuestion(text)) {
      await this.emitMessage(asideText(block));
      await this.emitQuestion();
      return { accepted: true };
    }

    return this.recordInvalid(
      block,
      direct.code ?? "unclear",
      direct.hint ?? "I didn't quite catch that one.",
    );
  }

  /**
   * Something typed on the review step, where every answer is in.
   *
   * There used to be no box to type in there, and a message sent anyway (from
   * `/v1`, or a stale tab) came back `no_question`. But the review is exactly
   * when someone notices a wrong answer, and "change my email" is how people
   * say so. The agent gets a turn with the two tools that need no question on
   * screen; reopening or changing an answer walks back to the review through
   * the edit path, and anything else leaves the review where it is.
   */
  private async handleReviewText(text: string): Promise<{ accepted: boolean; error?: string }> {
    if (!this.doc || !this.meta) return { accepted: false, error: "session_not_found" };
    if (this.aiEnabled()) {
      const ok = await this.aiStreamMessage(
        `The respondent is looking at a summary of all their answers, with a button to send the form. They wrote: "${text}"\n\n` +
          `- If they want to change an answer, call change_earlier_answer for that question and follow its result.\n` +
          `- If they asked something, answer it briefly.\n` +
          `- Otherwise, say in one short line that they can tap any answer above to change it, or send the form.\n` +
          `Never ask any other question from the form — every one is answered.`,
        { review: true },
      );
      if (ok) {
        await this.applyPendingEffects();
        // Nothing moved: hand the review back, so the device that sent this
        // settles its turn and still has the answers in front of it.
        if (this.pendingEndingRef !== null && this.meta.currentRef === null) {
          await this.emit("review", { answers: this.answerSummary() });
        }
        this.pendingUserTextPersisted = false;
        this.pendingUserMessageId = null;
        return { accepted: true };
      }
    }
    this.pendingUserTextPersisted = false;
    this.pendingUserMessageId = null;
    await this.emitMessage("Tap any answer above to change it, or send the form when you're ready.");
    await this.emit("review", { answers: this.answerSummary() });
    return { accepted: true };
  }

  private async handleStructured(ref: string, value: unknown): Promise<{ accepted: boolean; error?: string }> {
    const block = await this.currentBlock();
    if (!block) return { accepted: false, error: "no_question" };
    if (block.ref !== ref) return { accepted: false, error: "stale_ref" };
    return this.record(block, value);
  }

  private async recordInvalid(block: Block, code: string, hint: string): Promise<{ accepted: boolean; error?: string }> {
    const count = (this.invalidCounts.get(block.ref) ?? 0) + 1;
    this.invalidCounts.set(block.ref, count);
    const agent = this.doc!.settings.agent;
    await this.emit("validation_error", { ref: block.ref, code, message: hint });

    if (count >= agent.escalateAfterInvalid) {
      await this.emitMessage(escalateText(block));
      await this.emit("escalate_ui", { ref: block.ref, spec: await this.publicBlockOf(block), reason: "repeated_invalid" });
      // Escalating used to be the one branch here that did not re-state the
      // question. The client arms its controls off the `question` event, so
      // the respondent reached the step meant to make answering *easier* and
      // found the affordance gone — the exact opposite of the intent, at the
      // exact moment they were already struggling.
      await this.emitQuestion();
    } else if (this.aiEnabled()) {
      // Agentic retry: address what they actually said — which is often a
      // question of their own — then steer back. The form author's per-block
      // retryHint is folded in by buildRetryObjective, and so is what a
      // half-good contact card already banked — without which the agent asks
      // for the whole card again, having just been given three quarters of it.
      const ok = await this.aiStreamMessage(buildRetryObjective(block, count, hint, this.keptFields(block)));
      if (ok) {
        await this.applyPendingEffects();
        // Same rule on a retry: the question text is never reworded. Only for
        // the question the retry was about — the agent may have reopened an
        // earlier one instead, and printing this one would ask the wrong thing.
        if (agent.rephraseQuestions === false && this.meta?.currentRef === block.ref) {
          await this.emitMessage(questionText(block));
        }
        await this.emitQuestion();
        return { accepted: true };
      }
      await this.emitMessage(clarifyText(block, hint, count));
      await this.emitQuestion();
    } else {
      await this.emitMessage(clarifyText(block, hint, count));
      await this.emitQuestion();
    }
    return { accepted: true };
  }

  /**
   * The sub-fields of this block a refused attempt already banked, as words.
   *
   * Empty for every block type but `contact_info` and `address`, which are the
   * only ones whose answer has parts that can be right while the whole is not.
   */
  private keptFields(block: Block): string[] {
    const held = this.partials.get(block.ref);
    if (!held) return [];
    return Object.keys(held).map(contactFieldPhrase);
  }

  /**
   * `opts.settledPayment` is the server's own payment record, and only
   * `settleFromRecord` passes one. Every other caller — the agent's tools, a
   * structured answer, free text — reaches a verified payment block without it
   * and is refused, whatever it claims.
   */
  private async record(
    block: Block,
    raw: unknown,
    opts: ValidateOptions = {},
  ): Promise<{ accepted: boolean; error?: string }> {
    const result = validateAnswer(block, raw, opts);

    /**
     * Uniqueness, checked here rather than inside `validateAnswer`.
     *
     * It is the one rule that cannot be decided from the block and the value —
     * it needs the rest of the database — so it is a second gate rather than a
     * branch of the first. Everything downstream then treats it as an ordinary
     * refusal: the same echo, the same `validation_error`, the same escalation
     * count, and the same agentic retry that will phrase "that name's taken"
     * in the form's own voice and fold in the author's `retryHint`.
     *
     * The check only runs once the answer is otherwise valid, so a malformed
     * one never costs a database round trip on the respondent's clock.
     */
    const duplicate =
      result.ok && result.value !== undefined && enforcesUnique(block)
        ? await this.isTaken(block, result.value)
        : false;

    if (!result.ok || duplicate) {
      /**
       * A refused answer is still something the respondent said.
       *
       * Only accepted answers used to be echoed, so a rejected chip selection
       * produced no `user_message` at all — leaving the client's local echo
       * with nothing to settle against. It stayed pending forever, and the
       * next answer replaced it and inherited its text, so the transcript
       * showed the refused answer as though it had been accepted. Echoing the
       * attempt keeps the thread honest and gives that echo its twin.
       */
      if (!this.pendingUserTextPersisted) {
        const attempt = summarizeAnswer(block, raw);
        const echoId = await this.appendMessage("user", attempt, block.ref);
        await this.emit("user_message", { messageId: echoId, text: attempt, blockRef: block.ref });
      }
      this.pendingUserTextPersisted = false;
      /**
       * Keep what the card got right, before re-asking it.
       *
       * Merged onto whatever an earlier attempt kept rather than replacing it:
       * a respondent who fixes their phone number in a message of its own has
       * sent a record holding only the phone, and overwriting would drop the
       * name and email the first attempt already banked. Only ever set from a
       * refusal that produced one — a `type` failure on the whole value knows
       * nothing about fields and must not erase what is held.
       */
      if (result.partial && Object.keys(result.partial).length > 0) {
        this.partials.set(block.ref, { ...this.partials.get(block.ref), ...result.partial });
        await this.persistMeta();
      }
      if (duplicate) return this.recordInvalid(block, "duplicate", DUPLICATE_HINT);
      return this.recordInvalid(block, result.code ?? "invalid", result.hint ?? "That answer doesn't look right.");
    }

    /**
     * A `verify` answer is echoed like any other, and then held.
     *
     * The echo comes first because they did say it — the bubble belongs in the
     * thread whether or not the code ever comes back — and its id is kept so
     * that recording the answer afterwards reuses the same bubble instead of
     * drawing the number twice.
     */
    const channel = this.verificationChannelFor(block, result.value);
    if (channel) {
      let echoId = this.pendingUserMessageId;
      if (!this.pendingUserTextPersisted) {
        const attempt = summarizeAnswer(block, result.value);
        echoId = await this.appendMessage("user", attempt, block.ref);
        await this.emit("user_message", { messageId: echoId, text: attempt, blockRef: block.ref });
      }
      this.pendingUserTextPersisted = false;
      this.pendingUserMessageId = null;
      return this.beginVerification(block, String(result.value), channel, echoId);
    }

    if (result.value !== undefined) {
      // Counted once per question, not once per answer. Re-answering after an
      // edit used to add a second tally for the same ref, which put the
      // progress bar past 100% and told `finalize` that more questions were
      // answered than the form has.
      if (this.state.answers[block.ref] === undefined) this.collectedCount += 1;
      this.state.answers[block.ref] = result.value;
    }
    this.invalidCounts.delete(block.ref);
    // Answered. Nothing to hand back next time this ref is asked — and an edit
    // from the review step must start from the stored answer, not from a
    // half-filled card two questions ago.
    this.partials.delete(block.ref);
    const echo = summarizeAnswer(block, result.value);
    this.lastAnswerDisplay = echo;
    let answerMessageId = this.pendingUserMessageId;
    if (!this.pendingUserTextPersisted) {
      answerMessageId = await this.appendMessage("user", echo, block.ref);
      await this.emit("user_message", { messageId: answerMessageId, text: echo, blockRef: block.ref });
    }
    this.pendingUserTextPersisted = false;
    this.pendingUserMessageId = null;

    // apply logic + persist
    const next = resolveNext(this.doc!, block.ref, this.state);
    await this.persistMeta();
    // Name the message this answer belongs to. The client used to guess "the
    // last user message with no ref", which walked past the right one whenever
    // an earlier turn had been refused.
    await this.emit("answer_recorded", { ref: block.ref, pct: this.progressPct(), messageId: answerMessageId });

    // projection write (async, non-blocking for the stream)
    this.ctx.waitUntil(this.projectAnswer(block, result.value));

    await this.advanceTo(next, block.ref);
    return { accepted: true };
  }

  /**
   * Required, reachable questions this response still has no answer for.
   *
   * The floor under every way of finishing. The agent's tools already refuse to
   * skip a required question, and the flow only reaches an ending by walking
   * past every question on the path — so on paper this is always empty, and on
   * paper is where it stayed: `runAction("submit")` completed unconditionally,
   * and `end_interview` went as far as computing the list before throwing it
   * away. Anything that puts the cursor somewhere other than where the walk
   * left it — an edit, a recovered turn — could therefore finish a response
   * with a required answer missing, and nothing anywhere would object.
   *
   * Visibility is checked because a hidden question is not one they declined to
   * answer; it is one the form decided not to ask.
   *
   * And so is *reachability*, which is the harder half and which this used to
   * get wrong. It filtered `doc.blocks` for `required && !answered && visible`,
   * where "visible" means only `block.visibility` — the author's show/hide
   * conditions. Branching is not expressed that way. A `goto` rule routes the
   * flow around a question without touching its visibility, so every required
   * question in every branch the respondent did not take counted as missing,
   * and the count only grew with the number of branches.
   *
   * What that did to a real respondent: they answered every question the form
   * asked them, reached the review card, and pressed send — into a refusal over
   * three questions belonging to branches they were never shown. The refusal
   * routes the cursor to the first of them, so the next press refuses again,
   * and the form cannot be submitted at all. A conditional form with a required
   * question in any branch was unsubmittable by anyone who took another branch.
   *
   * `unsatisfiedRequired` is the check the headless `/v1` path has always used:
   * it replays the stored answers through the same `resolveNext` the
   * conversation walks and reports only what is required, visible, *on that
   * path*, and empty. The two contracts now answer "is this response finished?"
   * with the same code rather than with two readings of the word "required".
   */
  private unansweredRequired(): Block[] {
    if (!this.doc) return [];
    const doc = this.doc;
    return unsatisfiedRequired(doc, this.state.answers, this.state.hidden)
      .map(({ ref }) => doc.blocks.find((b) => b.ref === ref))
      .filter((b): b is Block => b !== undefined);
  }

  /**
   * How far along this respondent is, on their own path.
   *
   * `collectedCount` over every answerable block in the document, which is what
   * this was, counts a denominator the respondent will never reach: a branch
   * routes them around most of the other arms, and those questions stay in the
   * total anyway. The Open Mic form has fourteen questions and a nine-question
   * music path, so somebody who had answered all nine was shown a bar at 64%
   * that could not move again.
   *
   * `progressOf` replays the answers and forecasts the rest of the path — the
   * same numbers `/v1` and the partial-response email already report, so the
   * three places that tell a respondent how far along they are now agree.
   *
   * `collectedCount` is untouched and stays what it was: the number of answers
   * collected, which is what the deferred sign-in gate counts down.
   */
  private progress(): { answered: number; totalEstimate: number; pct: number } {
    if (!this.doc) return { answered: 0, totalEstimate: 0, pct: 0 };
    return progressOf(this.doc, this.state.answers, this.state.hidden);
  }

  private progressPct(): number {
    return this.progress().pct;
  }

  /**
   * Where the conversation resumes after a single answer was changed.
   *
   * Correcting one answer used to hand the flow straight back to
   * `resolveNext`, which does the only thing it can: returns the question
   * after the one that was just answered. Every question after the corrected
   * one therefore got asked a second time, so changing a single word meant
   * re-answering the rest of the form — which makes the pencil worse than
   * useless, because it looks like a small edit and costs the whole tail.
   *
   * This walks forward the way the flow itself does, honouring branching at
   * every hop, and simply does not stop at questions that already have an
   * answer. Landing back where they were is the common case. The interesting
   * case is the other one: if the new answer opens a path the respondent has
   * not been down, the first unanswered question on that path is exactly where
   * the walk stops — so a changed branch does get its questions asked, and
   * nothing on the old path is asked again.
   */
  private resumeAfterEdit(
    fromRef: string,
  ): { kind: "block"; block: Block } | { kind: "ending"; ending: Ending } {
    return resumeAfterChange(this.doc!, this.state, fromRef);
  }

  /**
   * Put the cursor back on an earlier question, to be answered again.
   *
   * Shared by the pencil (`edit`) and by the agent's `change_earlier_answer`,
   * so a change asked for in words lands exactly where a tap would. The old
   * answer is kept — see the `edit` action.
   */
  private reopenQuestion(target: Block): void {
    if (!this.meta) return;
    this.invalidCounts.delete(target.ref);
    this.meta.currentRef = target.ref;
    this.meta.status = "active";
    // Remembered so `advanceTo` can put them back where they were instead of
    // re-asking everything after this question. See `resumeAfterEdit`.
    this.editingRef = target.ref;
    // Leaving the review step: the form is no longer finished.
    this.pendingEndingRef = null;
  }

  private async advanceTo(
    target: { kind: "block"; block: Block } | { kind: "ending"; ending: Ending },
    fromRef?: string,
  ): Promise<void> {
    if (!this.doc || !this.meta) return;
    /**
     * Consumed here rather than at the call sites, so every way of leaving an
     * edited question — answering it, skipping it — resumes the same way, and
     * so a bookmark can never outlive the edit that set it.
     */
    await this.releaseStalePayments();
    let next = target;
    if (this.editingRef !== null && fromRef !== undefined) {
      const wasEditing = this.editingRef === fromRef;
      this.editingRef = null;
      if (wasEditing) next = this.resumeAfterEdit(fromRef);
    }
    /**
     * A deferred gate closes here, between two questions.
     *
     * It has to be checked on the way *to* a question rather than on the way in
     * with an answer. The four older call sites all refuse an incoming turn,
     * which is the right shape for `afterBlocks: 0` — nothing has been asked
     * yet, so there is nothing to interrupt. Once questions are already flowing,
     * refusing the incoming turn would mean asking the question, letting them
     * type an answer, and only then telling them to sign in: the answer is
     * discarded and the sign-in card arrives underneath a question they have
     * already dealt with. Stopping one question short instead means the gate is
     * the last thing in the transcript, which is where a respondent will look.
     *
     * Endings are exempt on purpose. Somebody who reached the end has answered
     * everything, and holding their completed response hostage to a sign-in
     * would throw away the very thing the gate exists to collect.
     */
    if (next.kind === "block" && this.authGateBlocks()) {
      this.gatedAtRef = next.block.ref;
      await this.persistMeta();
      await this.emitAuthRequired();
      return;
    }
    if (next.kind === "block") {
      const jumped = fromRef !== undefined && next.block.ref !== nextInSequence(this.doc, fromRef);
      if (jumped) {
        await this.emit("branch_jump", { from: fromRef!, to: next.block.ref });
      }
      this.meta.currentRef = next.block.ref;
      if (next.block.type === "welcome" || next.block.type === "statement") {
        // statement/welcome: emit as assistant message, auto-advance
        await this.emitMessage(questionText(next.block, this.recallVars()));
        await this.persistMeta();
        const after = resolveNext(this.doc, next.block.ref, this.state);
        await this.advanceTo(after, next.block.ref);
        return;
      }
      const answeredBlock = this.doc.blocks.find((b) => b.ref === fromRef);
      const verbatim = this.doc.settings.agent.rephraseQuestions === false;

      // The agent asked this question already, as part of the turn that
      // recorded the previous answer. Just arm the composer.
      if (this.suppressNextAsk && !verbatim) {
        await this.emitQuestion();
        await this.persistMeta();
        return;
      }
      /*
       * Verbatim, the agent has not asked it — but it has already acknowledged
       * the answer, in the turn that recorded it. A second model turn here said
       * the same thing again in other words ("Updated to X! … Got it, updated
       * to X!") on every typed answer. The question itself is all that is left.
       */
      if (this.suppressNextAsk && verbatim) {
        await this.emitMessage(questionText(next.block));
        await this.emitQuestion();
        await this.persistMeta();
        return;
      }

      /**
       * The agent's phrasing is a nicety. The question is the product.
       *
       * Everything between here and `emitQuestion()` talks to a model or acts
       * on what a model asked for, and any of it can throw. When it did, it
       * took the `question` event with it: the browser was left holding typing
       * dots for a turn that was never going to arrive, with its answer
       * controls hidden behind them, and the only way out was a page reload.
       * A failure here costs the respondent a nicely worded sentence and
       * nothing else — the deterministic phrasing below covers it.
       */
      let aiOk = false;
      // Repeated at the point of asking as well as in the system prompt: this
      // is the instruction a model is most prone to helpfully ignoring.
      const affordance = affordanceNote(next.block);
      try {
        aiOk = await this.aiStreamMessage(
          verbatim
            ? `The respondent just answered "${answeredBlock?.title ?? fromRef}" with: ${this.lastAnswerDisplay ?? "(see conversation)"}. ` +
                `Acknowledge it in one short sentence and answer anything they asked. Do NOT ask the next question — it follows immediately, word for word.`
            : `The respondent just answered "${answeredBlock?.title ?? fromRef}" with: ${this.lastAnswerDisplay ?? "(see conversation)"}. ` +
                `Acknowledge it naturally in a few words (reference what they actually said), then ask the question with ref=${next.block.ref} — which is: "${next.block.title}" (${next.block.type}) — in your own words. Ask ONLY that question.` +
                (affordance ? ` ${affordance}` : ""),
        );
        if (aiOk) await this.applyPendingEffects();
      } catch (err) {
        console.error("advance_ai_phase_failed", { sessionId: this.meta.sessionId, err });
        // Effects from a turn that did not finish are not trustworthy.
        this.pendingEffects = [];
        aiOk = false;
      }

      // Verbatim mode: the FSM emits the question itself, so the exact wording
      // is guaranteed rather than merely requested of the model. Also covers
      // the fallback when the AI turn failed entirely.
      if (verbatim || !aiOk) await this.emitMessage(questionText(next.block));

      await this.emitQuestion();
      await this.persistMeta();
      return;
    }
    // ── ending ──
    const ending = next.ending;

    /**
     * Pause for an explicit submit.
     *
     * Answers are already saved — they have been written as each one landed —
     * so nothing is at risk here. This exists because finishing a form should
     * feel like a decision, and because it is the natural moment to show
     * someone everything they said and let them fix one thing.
     */
    /**
     * Nothing to confirm when the answer is no.
     *
     * "Review your answers and submit" in front of a screen-out is a button
     * that promises something the form has already decided against, and the
     * respondent presses it and is refused. A screen-out is announced
     * immediately.
     */
    if (this.doc.settings.onComplete.requireSubmit && this.meta.status === "active" && ending.kind !== "screen_out") {
      // Already parked here — do not announce it twice. Terminal-ish events
      // reach the headless /v1 contract too, where a duplicate reads as a
      // second state transition that never happened.
      if (this.pendingEndingRef === ending.ref) return;
      this.meta.currentRef = null;
      this.pendingEndingRef = ending.ref;
      await this.persistMeta();
      await this.emit("review", { answers: this.answerSummary() });
      return;
    }

    await this.completeWith(ending, fromRef);
  }

  /**
   * Which requirements on a screen-out ending this response actually missed.
   *
   * Evaluated here, against the answers this session holds, rather than shipped
   * as conditions for the browser to work out: the client has no evaluator, and
   * a requirement's condition can read a variable or a hidden field the
   * respondent was never shown.
   */
  private readonly isRequirementUnmet = (when: ConditionGroup): boolean =>
    isRequirementUnmet(when, this.state);

  /** The ending as the respondent sees it, with its requirements narrowed. */
  private projectEnding(ending: Ending): PublicEnding {
    return toPublicEnding(ending, this.doc!.settings.onComplete, this.isRequirementUnmet);
  }

  /** The ending this conversation ended on, projected — or null while it is still going. */
  private finishedEnding(): PublicEnding | null {
    if (!this.doc || !this.meta) return null;
    if (this.meta.status !== "completed" && this.meta.status !== "disqualified") return null;
    const ending =
      (this.meta.endingRef && this.doc.endings.find((e) => e.ref === this.meta!.endingRef)) ||
      defaultEnding(this.doc);
    return ending ? this.projectEnding(ending) : null;
  }

  /**
   * Finalize against an ending and tell the client.
   *
   * `fromRef` is the question answered on the way here, when there was one.
   * Only a screen-out keeps it, and only so the refusal can be undone — see
   * `screenedOutFrom`.
   */
  private async completeWith(ending: Ending, fromRef?: string): Promise<void> {
    if (!this.meta || !this.doc) return;
    const screenedOut = ending.kind === "screen_out";
    /*
     * Never file a response with a required answer missing.
     *
     * `submit` has always checked this, but a form with `requireSubmit` off
     * reaches here straight from `advanceTo` — and a respondent who got to an
     * ending without walking the questions in between (anything that moves
     * the cursor forward out of order) would have been completed with them
     * blank. A screen-out is exempt: a refusal is not waiting on anything.
     */
    if (!screenedOut) {
      const missing = this.unansweredRequired();
      if (missing.length > 0) {
        await this.askForMissing(missing);
        return;
      }
    }
    this.meta.currentRef = null;
    this.meta.screenedOutFrom = screenedOut ? (fromRef ?? this.lastAnsweredRef()) : null;
    this.meta.status = screenedOut ? "disqualified" : "completed";
    this.meta.completedAt = Date.now();
    // Recorded before `pendingEndingRef` is cleared: without it a headless
    // caller can see that a conversation finished but never learn where.
    this.meta.endingRef = ending.ref;
    this.pendingEndingRef = null;
    await this.emitMessage(closingText(ending.title));
    // Project rather than emitting the stored ending: the raw object carries
    // internal ids, and only the projection applies the form-level redirect
    // default that `settings.onComplete` is supposed to provide.
    await this.emit("ending", { ending: this.projectEnding(ending), canUndo: this.canUndoScreenOut() });
    const submissionId = await this.finalize(screenedOut ? "disqualified" : "completed", ending.ref);
    /**
     * `complete` fires either way, because the conversation is over either way
     * and a client that only listens for it must not hang. What it means is
     * "no more turns", not "you got a response" — the `ending` event's `kind`
     * is what says which happened.
     */
    await this.emit("complete", { submissionId, durationMs: Date.now() - this.meta.startedAt });
    await this.persistMeta();
  }

  /** Take them to the first required question still blank, instead of finishing. */
  private async askForMissing(missing: Block[]): Promise<void> {
    if (!this.meta) return;
    const target = missing[0]!;
    this.pendingEndingRef = null;
    this.meta.currentRef = target.ref;
    this.editingRef = null;
    await this.persistMeta();
    await this.emitMessage(
      missing.length === 1
        ? `Almost — I still need one answer before I can send this.`
        : `Almost — there are ${missing.length} answers still missing before I can send this.`,
    );
    await this.emitMessage(questionText(target));
    await this.emitQuestion();
  }

  /** Whether a screen-out on this session can still be taken back. */
  private canUndoScreenOut(): boolean {
    return (this.meta?.undoCount ?? 0) < MAX_SCREEN_OUT_UNDOS;
  }

  /**
   * The last question in document order that has an answer.
   *
   * The fallback for `screenedOutFrom` on the one path that reaches an ending
   * without coming from a question — an explicit `submit` whose ending
   * resolves to a screen-out. Document order rather than answer order because
   * nothing records the latter, and on that path the two agree.
   */
  private lastAnsweredRef(): string | null {
    return this.answerSummary().at(-1)?.ref ?? null;
  }

  /** Everything answered so far, in question order, for the review step. */
  private answerSummary(): { ref: string; title: string; display: string }[] {
    if (!this.doc) return [];
    return this.doc.blocks
      .filter((b) => !["welcome", "statement"].includes(b.type))
      .filter((b) => this.state.answers[b.ref] !== undefined)
      .map((b) => ({
        ref: b.ref,
        title: b.title,
        display: summarizeAnswer(b, this.state.answers[b.ref]),
      }));
  }

  /**
   * One turn, with its events returned rather than only streamed.
   *
   * `handleUserTurn` already awaits the whole turn — `record()` awaits
   * `advanceTo()`, which awaits the model call and the next `question` event —
   * so the 50ms sleep the old `/v1` route used guarded nothing, and its
   * transcript diff existed only because the result was thrown away. Nothing
   * about the turn changes here; what changes is that the caller gets to see
   * what happened.
   *
   * The deadline exists because an interview turn is a model call, and a rare
   * slow one must not become a slow POST. Past it the turn keeps running inside
   * the object — its events are already durable under `evt:` keys — and the
   * caller resumes from `sinceSeq`.
   */
  async handleUserTurnSync(
    input: TurnInput,
    opts: { deadlineMs?: number } = {},
  ): Promise<SyncTurnResult> {
    return this.runSync(() => this.handleUserTurn(input), opts);
  }

  /** The same, for skip / stop / restart / edit / submit / undo. */
  async actionSync(
    input: {
      action: SessionAction;
      ref?: string;
    },
    opts: { deadlineMs?: number } = {},
  ): Promise<SyncTurnResult> {
    return this.runSync(() => this.action(input), opts);
  }

  private async runSync(
    run: () => Promise<{ accepted: boolean; error?: string }>,
    opts: { deadlineMs?: number },
  ): Promise<SyncTurnResult> {
    if (!(await this.ensureLoaded())) {
      return {
        accepted: false,
        error: "session_not_found",
        timedOut: false,
        sinceSeq: 0,
        events: [],
        assistantMessages: [],
        question: null,
        ending: null,
        validation: null,
        complete: false,
        awaitingSubmit: false,
        status: null,
      };
    }

    const sinceSeq = this.seq;
    const journal: SSEEnvelope[] = [];
    this.turnJournal = journal;
    const turn = run().finally(() => {
      this.turnJournal = null;
    });

    const deadline = Math.min(Math.max(opts.deadlineMs ?? 20_000, 1_000), 25_000);
    let outcome: { accepted: boolean; error?: string } | null = null;
    // `number | undefined` in the Workers runtime, so it is cleared defensively
    // rather than typed as a Node timer handle.
    let timer: number | undefined;
    await Promise.race([
      turn.then((r) => {
        outcome = r;
      }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, deadline) as unknown as number;
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);

    if (!outcome) {
      // Not a failure and not a rejection: the answer is still being processed.
      // Keep the turn alive past this response so its effects still land.
      this.ctx.waitUntil(
        turn.catch((err) =>
          console.error("turn_failed_after_deadline", { sessionId: this.meta?.sessionId, ...errorInfo(err) }),
        ),
      );
      return { ...(await this.projectTurn(journal)), accepted: true, timedOut: true, sinceSeq, events: [...journal] };
    }
    const settled = outcome as { accepted: boolean; error?: string };
    return {
      ...(await this.projectTurn(journal)),
      accepted: settled.accepted,
      error: settled.error,
      timedOut: false,
      sinceSeq,
      events: journal,
    };
  }

  /**
   * Where the session is now, derived once and shared by every sync RPC, so the
   * headless contract cannot disagree with itself between endpoints.
   */
  private async projectTurn(journal: SSEEnvelope[]): Promise<Omit<SyncTurnResult, "accepted" | "error" | "timedOut" | "sinceSeq" | "events">> {
    /**
     * A gated session has no question outstanding, whatever the cursor says.
     *
     * When a deferred gate closes, `currentRef` is still the question they just
     * answered — the flow stopped short of moving it on, which is the point.
     * Reporting that block here would tell a headless caller to answer it a
     * second time, and they would loop: the answer is accepted, the gate closes
     * again, the same question comes back. The `auth_required` event in the same
     * journal is what they should act on.
     */
    const block =
      this.meta?.currentRef && !this.authGateBlocks()
        ? (this.doc?.blocks.find((b) => b.ref === this.meta!.currentRef) ?? null)
        : null;
    const endingRef = this.pendingEndingRef ?? this.meta?.endingRef ?? null;
    const ending = endingRef ? (this.doc?.endings.find((e) => e.ref === endingRef) ?? null) : null;

    /**
     * Rebuild each assistant message from the token deltas that composed it.
     *
     * Both modes stream: the model streams real deltas, and template mode chunks
     * its phrasing into word groups so the two look the same to a client. So the
     * tokens are the message, and joining them here is how a caller with no
     * stream gets the same text a streaming client saw.
     */
    const pending = new Map<string, string>();
    const assistantMessages: string[] = [];
    let validation: { ref: string; code: string; message: string } | null = null;
    for (const evt of journal) {
      if (evt.type === "message_start") {
        pending.set((evt.data as { messageId: string }).messageId, "");
      }
      if (evt.type === "token") {
        const { messageId, delta } = evt.data as { messageId: string; delta: string };
        pending.set(messageId, (pending.get(messageId) ?? "") + delta);
      }
      if (evt.type === "message_end") {
        const id = (evt.data as { messageId: string }).messageId;
        const text = pending.get(id);
        if (text) assistantMessages.push(text);
        pending.delete(id);
      }
      if (evt.type === "validation_error") {
        validation = evt.data as { ref: string; code: string; message: string };
      }
    }

    return {
      status: await this.getStatus(),
      question: block ? await this.publicBlockOf(block) : null,
      // The projection, not the raw ending: the stored object carries internal
      // ids and skips the form-level redirect default.
      ending: ending && this.doc ? this.projectEnding(ending) : null,
      validation,
      assistantMessages,
      complete: this.meta?.status === "completed" || this.meta?.status === "disqualified",
      awaitingSubmit: this.pendingEndingRef !== null,
    };
  }

  /**
   * Durable event replay, for a caller resuming after a deadline or a dropped
   * connection. Reads from storage rather than the in-memory buffer, which dies
   * with the isolate.
   */
  async eventsSince(seq: number, limit = 200): Promise<{ events: SSEEnvelope[]; latestSeq: number }> {
    await this.ensureLoaded();
    const stored = await this.ctx.storage.list<SSEEnvelope>({
      prefix: "evt:",
      start: `evt:${String(seq + 1).padStart(8, "0")}`,
      limit,
    });
    return { events: [...stored.values()], latestSeq: this.seq };
  }

  /**
   * The block the flow should be on when `currentRef` has gone missing.
   *
   * Resolved through `resolveNext` from the last block that actually has an
   * answer, so branching is honoured — walking the block list for the first
   * unanswered one would happily re-ask a question the respondent's own
   * answers had branched past. Used only for recovery: a session that is
   * active, is not waiting on a submit, and has no current block is a session
   * whose last turn died halfway, and the alternative to rebuilding it is a
   * conversation that can never be continued.
   */
  private recoverCurrentBlock(): Block | null {
    if (!this.doc) return null;
    const answered = this.doc.blocks.filter((b) => this.state.answers[b.ref] !== undefined);
    const lastAnswered = answered.length > 0 ? answered[answered.length - 1]!.ref : null;
    let cursor = resolveNext(this.doc, lastAnswered, this.state);
    // Welcome and statement blocks are narration, not questions. The FSM walks
    // past them on the way in; recovery has to do the same or it would park
    // the session on a block that can never be answered.
    for (let hops = 0; cursor.kind === "block" && hops <= this.doc.blocks.length; hops += 1) {
      if (!["welcome", "statement"].includes(cursor.block.type)) return cursor.block;
      cursor = resolveNext(this.doc, cursor.block.ref, this.state);
    }
    return null;
  }

  /** This respondent's answers so far, by ref, as they read — what `{{ref}}` recalls. */
  private recallVars(): Map<string, string> {
    const vars = new Map<string, string>();
    for (const block of this.doc?.blocks ?? []) {
      const value = this.state.answers[block.ref];
      if (value !== undefined) vars.set(block.ref, summarizeAnswer(block, value));
    }
    return vars;
  }

  private async emitQuestion(): Promise<void> {
    if (!this.doc || !this.meta) return;
    let block = await this.currentBlock();
    if (!block && this.meta.status === "active" && this.pendingEndingRef === null) {
      block = this.recoverCurrentBlock();
      if (block) {
        console.warn("question_recovered", { sessionId: this.meta.sessionId, ref: block.ref });
        this.meta.currentRef = block.ref;
        await this.persistMeta();
      }
    }
    if (!block) return;
    const pub = await this.publicBlockOf(block);
    const prefill = this.partials.get(block.ref);
    await this.emit("question", {
      messageId: crypto.randomUUID(),
      // The description is shown verbatim, so `{{ref}}` is filled here, where
      // the answers are, rather than trusting a client to do it.
      block: pub.description
        ? { ...pub, description: interpolate(pub.description, this.recallVars(), { escapeMarkdown: true }) }
        : pub,
      // What a refused card already got right, so it comes back holding it.
      ...(prefill && Object.keys(prefill).length > 0 ? { prefill } : {}),
      /*
       * All three numbers from one place. `answered` used to be every key in
       * the answer map — which counts answers to questions the flow has since
       * routed around — and `totalEstimate` every answerable block in the
       * document. The header renders them as "Question 8 of 14" on a form with
       * nine questions on this path.
       */
      progress: this.progress(),
    });
    if (block.type === "file_upload" || block.type === "signature") {
      await this.emit("upload_request", {
        ref: block.ref,
        accept: "accept" in block ? (block.accept ?? []) : ["image/png"],
        maxFiles: "maxFiles" in block ? (block.maxFiles ?? 1) : 1,
        maxSizeMB: "maxSizeMB" in block ? (block.maxSizeMB ?? 10) : 10,
      });
    }
  }

  /**
   * Say again, in fresh events, where the conversation stands.
   *
   * The client dedupes replay by sequence number — that is what makes a
   * reconnect invisible instead of a flicker — but it also means a reconnect
   * can never restore a state the browser has already seen and then lost.
   * A respondent looking at typing dots for a turn that finished is looking at
   * exactly that, and until now their only way out was to reload the page.
   * This is the same recovery, done for them: re-state the current step under
   * new sequence numbers, which the ratchet cannot swallow.
   *
   * It reads state and emits; it never advances the flow. Calling it twice in
   * a row is the same as calling it once.
   */
  async resync(): Promise<{ ok: boolean }> {
    const loaded = await this.ensureLoaded();
    if (!loaded || !this.meta || !this.doc) return { ok: false };
    await this.refreshAuthGate();

    // A screen-out is just as finished as a completion, and a reload has to
    // land back on the screen that explains it — not on the question the
    // respondent had already answered.
    if (this.meta.status === "completed" || this.meta.status === "disqualified") {
      const ending =
        (this.meta.endingRef && this.doc.endings.find((e) => e.ref === this.meta!.endingRef)) ||
        defaultEnding(this.doc);
      if (ending) {
        await this.emit("ending", { ending: this.projectEnding(ending), canUndo: this.canUndoScreenOut() });
      }
      return { ok: true };
    }
    if (this.meta.status !== "active") return { ok: true };

    // Order matters, and it is the same order the flow itself uses: the gate
    // outranks the questions, and the review step outranks the current block.
    if (this.authGateBlocks()) {
      const gate = this.doc.settings.requireAuth;
      await this.rememberGatedCursor();
      await this.emit("auth_required", { method: gate.method, message: gate.message });
      return { ok: true };
    }
    if (this.pendingEndingRef !== null) {
      await this.emit("review", { answers: this.answerSummary() });
      return { ok: true };
    }
    /*
     * A code that is still outstanding outranks the question it belongs to. A
     * reload must come back to the code step, not to the question — which would
     * invite them to answer it again while a challenge for the old answer is
     * still live. Re-armed without re-announcing: the sentence saying a code
     * went out is already in the transcript being replayed.
     */
    if (this.meta.pendingVerify) {
      await this.emitVerifyRequired(false);
      return { ok: true };
    }
    /*
     * The same for an open checkout: a reload comes back to the Pay card with
     * its launch payload, not to a question whose only answer is that card.
     * No message — the one saying checkout opened is already in the replay.
     * An expired checkout is not re-offered; the question comes back, and Pay
     * on it opens a new one.
     */
    if (this.meta.pendingPayment) {
      await this.emitPaymentRequired();
      return { ok: true };
    }
    // `emitQuestion` rebuilds `currentRef` when a dead turn left it empty.
    await this.emitQuestion();
    return { ok: true };
  }

  async action(input: {
    action: SessionAction;
    /** For `edit`: the block to go back and re-answer. */
    ref?: string;
  }): Promise<{ accepted: boolean; error?: string }> {
    // Same reasoning as `handleUserTurn`: skipping and submitting advance the
    // flow, so they can leave the client waiting on an event too.
    this.turnHandedBack = false;
    try {
      const result = await this.runAction(input);
      // The same net as `handleUserTurn` — see `turnHandedBack`. `stop` is the
      // one action that legitimately ends without a next step of its own.
      if (result.accepted && !this.turnHandedBack && input.action !== "stop") {
        console.error("action_ended_without_handback", {
          sessionId: this.meta?.sessionId,
          formId: this.meta?.formId,
          blockRef: this.meta?.currentRef,
          action: input.action,
        });
        await this.resync();
      }
      return result;
    } catch (err) {
      console.error("action_failed", {
        sessionId: this.meta?.sessionId,
        formId: this.meta?.formId,
        blockRef: this.meta?.currentRef,
        action: input.action,
        ...errorInfo(err),
      });
      await this.failTurn("action_failed", "Something went wrong on our side. Please try that again.");
      return { accepted: false, error: "action_failed" };
    }
  }

  private async runAction(input: {
    action: SessionAction;
    ref?: string;
  }): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    /*
     * The one action a closed session accepts, because it is the action that
     * closed it. Checked ahead of the `active` guard rather than inside it:
     * by the time a respondent reads "you were turned away" the session is
     * already `disqualified`, so an undo that required an open session could
     * never run.
     */
    if (input.action === "undo_screen_out") return this.undoScreenOut();
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };
    await this.refreshAuthGate();
    // `stop` and `restart` stay open while gated — someone who cannot sign in
    // must still be able to walk away or start over.
    if (this.authGateBlocks() && input.action !== "stop" && input.action !== "restart") {
      await this.rememberGatedCursor();
      await this.emitAuthRequired();
      return { accepted: false, error: "auth_required" };
    }

    /*
     * The two actions that only mean anything while a code is outstanding, and
     * mean nothing at all otherwise — a stale tab pressing "resend" after the
     * answer went through must not start a challenge nobody is waiting on.
     */
    if (input.action === "resend_code") {
      if (!this.meta.pendingVerify) return { accepted: false, error: "no_pending_verification" };
      return this.resendVerifyCode();
    }
    if (input.action === "change_answer") {
      if (!this.meta.pendingVerify) return { accepted: false, error: "no_pending_verification" };
      await this.cancelVerification();
      await this.emitQuestion();
      return { accepted: true };
    }

    /*
     * The checkout's own buttons. Like the code step's, they refuse politely
     * when there is nothing to act on rather than inventing a state: a stale
     * tab pressing "try again" after the payment settled must not reopen a
     * question that has been answered.
     */
    if (input.action === "retry_payment" || input.action === "cancel_payment") {
      const pending = this.meta.pendingPayment;
      if (!pending) {
        // Nothing open. Put whatever is current back on screen so the device
        // that pressed it settles its turn, and say it did nothing.
        await this.emitQuestion();
        return { accepted: false, error: "no_pending_payment" };
      }
      if (input.ref !== undefined && input.ref !== pending.ref) return { accepted: false, error: "stale_ref" };
      await this.clearPendingPayment();
      if (input.action === "cancel_payment") {
        await this.emit("payment_failed", {
          ref: pending.ref,
          recordId: pending.recordId,
          code: "payment_cancelled",
          message: "Payment cancelled.",
        });
      }
      await this.emitQuestion();
      return { accepted: true };
    }
    if (input.action === "simulate_payment") return this.simulatePayment(input.ref);

    /*
     * Every other way out of the code step abandons it. Leaving `pendingVerify`
     * set would read the next turn as a code — so skipping the question, going
     * back to edit another answer, or starting over would each leave the
     * conversation quietly waiting for six digits nobody is going to type.
     */
    if (this.meta.pendingVerify) await this.cancelVerification();
    /*
     * And a checkout nobody is going to finish. Retired rather than left
     * `created`, so an idempotent Pay on the question they come back to opens
     * a fresh one — but still allowed to land if the old tab pays it anyway.
     */
    if (this.meta.pendingPayment) await this.clearPendingPayment();

    if (input.action === "skip") {
      const block = await this.currentBlock();
      if (!block) return { accepted: false, error: "no_question" };
      // A skip names the question it meant, when the caller knows it. Without
      // that, a double-tapped Skip skipped the question after it too — the
      // second tap arriving after the first had already moved the cursor.
      if (input.ref !== undefined && input.ref !== block.ref) return { accepted: false, error: "stale_ref" };
      if (block.required) {
        return this.recordInvalid(block, "required", "This question is required.");
      }
      const next = resolveNext(this.doc, block.ref, this.state);
      await this.advanceTo(next, block.ref);
      return { accepted: true };
    }
    /** The explicit finish, once every question is answered. */
    if (input.action === "submit") {
      /*
       * Not while something required is still blank.
       *
       * The review card is built from the answers that exist, so a question
       * with none of its own simply is not on it — which makes "send" look like
       * the end of a finished form to the one respondent for whom it is not.
       * Sending them to the question instead is the only reading of the button
       * that does not quietly file an incomplete response.
       */
      const missing = this.unansweredRequired();
      if (missing.length > 0) {
        await this.askForMissing(missing);
        return { accepted: true };
      }
      const ending =
        (this.pendingEndingRef && this.doc.endings.find((e) => e.ref === this.pendingEndingRef)) ||
        resolveEnding(this.doc, this.state) ||
        this.doc.endings[0];
      if (!ending) return { accepted: false, error: "no_ending" };
      await this.completeWith(ending);
      return { accepted: true };
    }

    if (input.action === "stop") {
      await this.abandon("user_stop");
      return { accepted: true };
    }
    /**
     * Go back and change an answer.
     *
     * Returns the cursor to that block and asks again. Later answers are kept:
     * re-answering "how many people" should not wipe an email given three
     * questions ago. If the change reroutes the flow, `resolveNext` handles
     * that on the way forward as it always does.
     *
     * The answer being changed is kept too, until a new one replaces it.
     *
     * It used to be deleted the instant the pencil was tapped — from the state,
     * from `collectedCount`, and from the projected row — on the reasoning that
     * a respondent had retracted it. They had not: "change this answer" is an
     * intent to replace, and the replacement may never arrive. Somebody who
     * tapped it on the review card and then put their phone down left a
     * required question permanently blank, the review card gone, and no trace
     * of any of it in the transcript. Holding the old value costs nothing —
     * `record` overwrites it, and `recordAnswerRow` upserts — and it means the
     * worst an abandoned edit can do is leave the answer they already gave.
     */
    if (input.action === "edit") {
      const target = this.doc.blocks.find((b) => b.ref === input.ref);
      if (!target) return { accepted: false, error: "unknown_ref" };
      if (["welcome", "statement"].includes(target.type)) {
        return { accepted: false, error: "not_answerable" };
      }
      /*
       * Only somewhere they have already been.
       *
       * The pencil is only ever drawn beside an answer, but the action takes a
       * bare ref, and nothing checked it. Editing a question further down the
       * form put the cursor there, and `resumeAfterEdit` then walked forward
       * from it — so one request jumped past every question in between: their
       * screen-out rules, a deferred sign-in gate, and (with `requireSubmit`
       * off) their required answers. `answerability` is the same test `/v1`
       * applies to an answer: on the path already walked, or the question the
       * flow is waiting on — which is also what an undone screen-out is, its
       * answer having just been removed.
       */
      if (!answerability(this.doc, this.state.answers, target.ref, this.state.hidden).ok) {
        return { accepted: false, error: "stale_ref" };
      }

      /*
       * Already reopened: put the question back and say nothing more.
       *
       * The pencil stays on screen while an edit is in flight, and on a slow
       * phone a tap that has not visibly done anything yet gets tapped again.
       * Each repeat used to post its own "let's redo that one" and pay for its
       * own rephrase — one respondent's seventeen taps in twelve seconds left
       * thirty-four near-identical messages in the transcript. The question
       * event still goes out so the device that sent it settles its turn.
       */
      if (this.editingRef === target.ref && this.meta.currentRef === target.ref && this.meta.status === "active") {
        await this.emitQuestion();
        return { accepted: true };
      }

      this.reopenQuestion(target);
      await this.persistMeta();

      await this.emitMessage(`Sure — let's redo that one.`);
      if (this.doc.settings.agent.rephraseQuestions === false || !this.aiEnabled()) {
        await this.emitMessage(questionText(target));
      } else {
        const ok = await this.aiStreamMessage(
          `The respondent wants to change their answer to "${target.title}". Ask it again in one short sentence. Do not comment on the change.`,
        );
        if (ok) await this.applyPendingEffects();
        else await this.emitMessage(questionText(target));
      }
      await this.emitQuestion();
      return { accepted: true };
    }

    if (input.action === "restart") {
      this.state = { answers: {}, variables: {}, hidden: this.meta.hiddenFields };
      this.collectedCount = 0;
      for (const v of this.doc.variables) this.state.variables[v.name] = v.initial;
      this.meta.status = "active";
      // Starting over puts the deferred gate back in front of them too: the
      // answers that had bought their way past it are gone.
      this.gatedAtRef = null;
      // And nothing from the old attempt may steer the new one: a review step
      // left pending let a `submit` straight after this finish an empty form,
      // and a stale edit bookmark would resume past questions not yet asked.
      this.pendingEndingRef = null;
      this.editingRef = null;
      this.invalidCounts.clear();
      this.partials.clear();
      const next = resolveNext(this.doc, null, this.state);
      await this.advanceTo(next);
      return { accepted: true };
    }
    return { accepted: false, error: "unknown_action" };
  }

  /**
   * Take back a refusal, and reopen the answer that caused it.
   *
   * A screen-out used to be the end of the road with no road back. The card
   * said what was wrong — "at least two female members per team" — and offered
   * nothing to do about it, which is the wrong shape for a rule that a
   * respondent fails by mis-tapping "No" on a yes/no question. Their only
   * recourse was to reload, and reloading is worse than useless: the session
   * is terminal, so `resync` puts the same card back, and on a form with
   * `onePerIdentity` signing in again is refused outright. One wrong tap,
   * eleven answers, no way out.
   *
   * So the refusal is reversible, in the one direction that makes sense: back
   * to the question that triggered it, with that answer discarded and every
   * other one kept. It is deliberately not "start over" — a respondent who
   * filled in five team members does not want to be handed a blank form
   * because of the question after them.
   *
   * The response row is reopened first, and the reopen is what authorises the
   * rest: if another writer has since moved that row on, the D1 guard says so
   * and we leave both the row and the session alone rather than resurrecting a
   * conversation whose response has been finished elsewhere.
   */
  private async undoScreenOut(): Promise<{ accepted: boolean; error?: string }> {
    if (!this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "disqualified") return { accepted: false, error: "not_screened_out" };
    // Past the allowance the refusal stands — see `MAX_SCREEN_OUT_UNDOS`.
    if (!this.canUndoScreenOut()) return { accepted: false, error: "undo_limit" };

    const ref = this.meta.screenedOutFrom ?? this.lastAnsweredRef();
    const target = ref ? this.doc.blocks.find((b) => b.ref === ref) : undefined;
    // Nothing to reopen means nothing to correct — a form that screens out on
    // a hidden field or a variable, before anybody answered anything.
    if (!target) return { accepted: false, error: "nothing_to_change" };

    const submissionId = await this.ctx.storage.get<string>("submission_id");
    if (submissionId && !(await this.reopenForUndo(submissionId))) {
      return { accepted: false, error: "session_closed" };
    }

    this.meta.status = "active";
    this.meta.completedAt = null;
    this.meta.endingRef = null;
    this.meta.screenedOutFrom = null;
    this.meta.undoCount = (this.meta.undoCount ?? 0) + 1;
    // Reopened, so it can go idle again — and must, or a conversation walked
    // away from here would never be swept up as abandoned.
    await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);
    await this.persistMeta();

    /*
     * The session row follows the response row.
     *
     * `finalizeResponse` wrote `disqualified` here as well, and the
     * `allowResubmissions` gate in `openSession` reads exactly this column: a
     * live conversation left claiming to be a finished one would lock its own
     * respondent out of the form they are still filling in. It converges
     * anyway at the next finalize, but "eventually" is not good enough for a
     * window a respondent can sit in for half an hour.
     */
    try {
      await this.env.DB.prepare(
        `UPDATE chat_sessions SET status = 'active', last_activity_at = ?1 WHERE id = ?2`,
      )
        .bind(Date.now(), this.meta.sessionId)
        .run();
    } catch (err) {
      console.error("reopen_session_row_failed", { sessionId: this.meta.sessionId, ...errorInfo(err) });
    }

    /*
     * The answer that refused them is genuinely retracted, and this is the only
     * place that word applies.
     *
     * "Undo" says the tap should never have counted, so the value goes — from
     * the state, the tally and the projected row — and a form owner reading the
     * response must not find the "no" that the respondent has just taken back
     * sitting in their results. The pencil means the opposite (replace this
     * when I tell you what with) and keeps the old value until it is told; see
     * the `edit` action.
     */
    if (this.state.answers[target.ref] !== undefined) {
      delete this.state.answers[target.ref];
      this.collectedCount = Math.max(0, this.collectedCount - 1);
      this.ctx.waitUntil(this.unprojectAnswer(target.ref));
    }

    /*
     * The rest is an ordinary edit: putting the cursor back, re-asking, and
     * `resumeAfterEdit` walking the flow forward without re-asking the tail.
     */
    return this.runAction({ action: "edit", ref: target.ref });
  }

  /**
   * Put the response row back for an undo — and decide what a refusal means.
   *
   * The row disagreeing with this object is not, on its own, a reason to tell
   * somebody their conversation is over. It was: `reopenResponse` guards on
   * `status = 'disqualified'`, anything else came back as `session_closed`, and
   * the client renders that as "this conversation has expired" and throws the
   * session away — so a respondent who had mis-tapped one answer lost eleven,
   * pressed retry, and was screened out again by the answers the retry resumed.
   * The row was not even finished: it was `abandoned`, because an earlier
   * sitting had timed out and no adoption path had reopened it, so the
   * screen-out had never been recorded against it in the first place.
   *
   * This object is the authority on the conversation. So the only refusal left
   * is the one that is genuinely about the response: another writer finished it
   * properly, and resurrecting it would clear a real completion. Every other
   * state — abandoned, still in progress, or a row that has since been deleted
   * — reopens and carries on, because the respondent is right here asking to.
   */
  private async reopenForUndo(submissionId: string): Promise<boolean> {
    const { changed } = await reopenResponse(this.owner(), submissionId);
    if (changed) return true;

    const row = await this.env.DB.prepare(`SELECT status FROM submissions WHERE id = ?`)
      .bind(submissionId)
      .first<{ status: string }>()
      .catch(() => null);

    if (row?.status === "completed") return false;

    // Loud: reaching here means the refusal the respondent is taking back was
    // never written down, which is a hole somewhere upstream of this method.
    console.warn("undo_reopen_mismatch", {
      sessionId: this.meta?.sessionId,
      submissionId,
      rowStatus: row?.status ?? "missing",
    });
    if (row?.status === "abandoned") await this.reopenAdopted(submissionId);
    return true;
  }

  private async abandon(reason: string): Promise<void> {
    if (!this.meta) return;
    this.meta.status = "abandoned";
    await this.finalize("abandoned", null, reason);
    await this.persistMeta();
  }

  /**
   * Called by the uploads confirm route once a file body is safely in R2.
   *
   * It used to record the answer itself, with `[file]` — the single file that
   * had just landed. That was wrong in two ways on a block that accepts more
   * than one: the first confirm answered the question and advanced the
   * conversation, so the second file arrived while the *next* block was
   * current and was either recorded against it or rejected against it. Anyone
   * who selected two files at once got one saved, one lost, and a validation
   * error for a question they had not been asked yet.
   *
   * So this now only acknowledges the file. The client collects the
   * descriptors it gets back from confirm and sends one structured answer when
   * the respondent is done, which is also what makes a signature — an upload
   * that carries a typed name alongside it — expressible at all.
   */
  async notifyUpload(fileId: string, file: { fileId: string; filename: string; mime: string; size: number; r2Key: string }): Promise<void> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc || this.meta.status !== "active") return;
    const block = await this.currentBlock();
    if (!block) return;
    await this.emit("upload_received", { ref: block.ref, fileId, filename: file.filename });
  }

  async getStatus(): Promise<{
    status: string;
    currentRef: string | null;
    collected: number;
    answers: AnswerMap;
    variables: Record<string, string | number>;
    /** Human-readable answers, for the review and already-submitted screens. */
    summary: { ref: string; title: string; display: string }[];
    awaitingSubmit: boolean;
    completedAt: number | null;
    /**
     * The ending this conversation reached, once it has reached one.
     *
     * So a client that comes back to a finished session — a reload, a second
     * tab — can render the screen it ended on rather than inferring one from
     * `status`. Null while the conversation is still going.
     */
    ending: PublicEnding | null;
    /**
     * Whether this respondent may start another response.
     *
     * Answered here because the client cannot answer it. It was inferring it
     * from `allowResubmissions` on the *published* config, which is a
     * different document from the one this session is running — a form
     * republished mid-conversation moves one and not the other — and which
     * carries no idea of what the plan allows. The session knows both: it
     * holds its own clamped document, and the clamp is where an unentitled
     * setting has already been turned back off.
     */
    canRepeat: boolean;
    /** Null when the form is open to anyone. */
    auth: {
      method: RespondentAuthMethod;
      message: string;
      verified: boolean;
      label: string | null;
    } | null;
    /**
     * A code the conversation is waiting on, for a caller with no stream.
     *
     * Without this a headless caller would send the next answer into a session
     * that is going to read it as six digits. `sentTo` is where the code went;
     * the code itself comes back as an ordinary message.
     */
    pendingVerification: { ref: string; channel: "sms" | "email"; sentTo: string; sentAt: number } | null;
    /**
     * An open checkout, for a caller with no stream — the same fields
     * `payment_required` carries, so a headless integration can open the
     * gateway's checkout itself and knows not to send the payment question an
     * answer (which would be refused as `payment_unverified`).
     */
    pendingPayment: {
      ref: string;
      recordId: string;
      provider: PaymentProvider;
      amountMinor: number;
      amount: number;
      currency: string;
      display: string;
      launch: CheckoutLaunch;
      expiresAt: number;
    } | null;
  } | null> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta) return null;
    return {
      status: this.meta.status,
      currentRef: this.meta.currentRef,
      collected: this.collectedCount,
      answers: this.state.answers,
      variables: this.state.variables,
      summary: this.answerSummary(),
      awaitingSubmit: this.pendingEndingRef !== null,
      completedAt:
        this.meta.status === "completed" || this.meta.status === "disqualified"
          ? (this.meta.completedAt ?? null)
          : null,
      ending: this.finishedEnding(),
      canRepeat: this.doc?.settings.allowResubmissions !== false,
      auth: this.doc?.settings.requireAuth.enabled
        ? {
            method: this.doc.settings.requireAuth.method,
            message: this.doc.settings.requireAuth.message,
            verified: Boolean(this.meta.identity),
            label: this.meta.identity
              ? (this.meta.identity.email ?? this.meta.identity.phone ?? this.meta.identity.name ?? "Verified")
              : null,
          }
        : null,
      pendingVerification: this.meta.pendingVerify
        ? {
            ref: this.meta.pendingVerify.ref,
            channel: this.meta.pendingVerify.channel,
            sentTo: this.meta.pendingVerify.sentTo,
            sentAt: this.meta.pendingVerify.sentAt,
          }
        : null,
      pendingPayment: this.meta.pendingPayment
        ? {
            ref: this.meta.pendingPayment.ref,
            recordId: this.meta.pendingPayment.recordId,
            provider: this.meta.pendingPayment.provider,
            amountMinor: this.meta.pendingPayment.amountMinor,
            amount: this.meta.pendingPayment.amount,
            currency: this.meta.pendingPayment.currency,
            display: this.meta.pendingPayment.display,
            launch: this.meta.pendingPayment.launch,
            expiresAt: this.meta.pendingPayment.expiresAt,
          }
        : null,
    };
  }

  // ────────────────────────── persistence ──────────────────────────

  private async appendMessage(role: "user" | "assistant" | "system_event", content: string, blockRef?: string): Promise<string> {
    const id = `msg_${crypto.randomUUID().slice(0, 12)}`;
    await this.ctx.storage.put(`msg:${String(this.seq + 1).padStart(8, "0")}:${id}`, {
      id,
      role,
      content,
      blockRef: blockRef ?? null,
      createdAt: Date.now(),
    });
    await this.ctx.storage.put("msg_count", (await this.ctx.storage.get<number>("msg_count") ?? 0) + 1);
    return id;
  }

  async getTranscript(): Promise<{ id: string; role: string; content: string; blockRef: string | null; createdAt: number }[]> {
    await this.ensureLoaded();
    const entries = await this.ctx.storage.list<{ id: string; role: string; content: string; blockRef: string | null; createdAt: number }>({ prefix: "msg:" });
    return [...entries.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * The response row this session writes to, shared with the developer API.
   *
   * The DO keeps its `submission_id` storage key as the memo — an id that
   * survives isolate eviction is the whole reason this is idempotent — and the
   * insert itself lives in `lib/submissions.ts` so the two surfaces cannot
   * drift apart.
   */
  private owner(): ResponseOwner {
    if (!this.meta) throw new Error("no meta");
    return {
      env: this.env,
      formId: this.meta.formId,
      formVersionId: this.meta.formVersionId,
      organizationId: this.meta.organizationId,
      sessionId: this.meta.sessionId,
      source: this.meta.source ?? "chat",
      isTest: this.meta.isTest === true,
    };
  }

  /**
   * A response this session has just adopted is a response in progress.
   *
   * Adoption reaches this object three ways — the resume link, the sign-in
   * lookup, and the device match inside `ensureSubmissionRow` — and all three
   * are allowed to hand back a row that was abandoned when its last sitting
   * timed out. Every writer below guards on `status = 'in_progress'`, so the
   * status has to be put back at the moment the row is picked up, not left for
   * whatever finishes the conversation to discover it cannot write.
   *
   * Never throws and never blocks the adoption: the answers still land, and
   * `finalizeResponse` now accepts an abandoned row for a completion anyway.
   * This is what keeps the row honest *while* the conversation is live — the
   * partials tab, the follow-up sequence and the resume gates all read it.
   */
  private async reopenAdopted(submissionId: string): Promise<void> {
    if (!this.meta || this.meta.formVersionId === "preview") return;
    try {
      await reopenAbandonedResponse(this.env, submissionId);
    } catch (err) {
      console.error("reopen_adopted_failed", {
        sessionId: this.meta.sessionId,
        submissionId,
        ...errorInfo(err),
      });
    }
  }

  /**
   * In flight, so two callers in one turn cannot open two rows.
   *
   * The storage key alone was not enough, and the gap is not theoretical: the
   * answer is projected with `ctx.waitUntil(this.projectAnswer(...))`, which
   * runs alongside the rest of the turn on purpose, and every turn that
   * finishes the form calls this from `finalize` as well. Both read the key,
   * both miss, both insert — so ONE response produced two rows: an
   * `in_progress` one holding the answers, and a terminal one holding none.
   *
   * That was every single-question form and the last answer of every longer
   * one: the results table showed an empty completed response beside a partial
   * that had everything in it. Now the second caller awaits the first's insert.
   */
  private openingRow: Promise<string> | null = null;

  private ensureSubmissionRow(): Promise<string> {
    if (!this.meta) throw new Error("no meta");
    if (this.openingRow) return this.openingRow;
    this.openingRow = (async () => {
      const existing = await this.ctx.storage.get<string>("submission_id");
      if (existing) return existing;

      /**
       * One response in progress per person per form.
       *
       * Finished responses may multiply — that is `allowResubmissions`, and it
       * is the author's call. A *draft* cannot: being half-way through a form
       * is a fact about the person, not about the tab they happen to have open,
       * and a second open row is the same draft written down twice. It splits
       * their answers, shows the author duplicates that stand for one attempt,
       * and earns each copy its own reminder email.
       *
       * The session-level checks cannot carry this on their own, which is why
       * it is here. Nothing is written to `submissions` until the first answer
       * is projected — and for somebody who only signed in, not until the idle
       * alarm fires half an hour later. A respondent who came back inside that
       * window found no row to resume because none existed yet, so every visit
       * opened another. This is the one place rows are created, so the rule
       * holds no matter what any session managed to recognise.
       *
       * Adopting rather than merging: this session has no row, so it has
       * projected no answers, and there is nothing here that could overwrite
       * what the earlier one recorded. Answers from here land on that row
       * exactly as they would have on a fresh one.
       *
       * Started over is the exception that used to be a hole. It skipped this
       * lookup and inserted, which is how one person who asked to begin again
       * became two partial responses — and, since `0027`, is an insert the
       * database refuses. They are reusing their own draft either way; what
       * "start over" buys them is that it is empty when they get there.
       */
      const reusable = await findOpenResponseId(this.env, this.meta!.formId, {
        respondentId: this.meta!.respondentId ?? null,
        identity: this.meta!.identity ?? null,
        fingerprint: this.meta!.fingerprint ?? null,
        fingerprintSource: this.meta!.fingerprintSource ?? null,
        isTest: this.meta!.isTest === true,
        sessionId: this.meta!.sessionId,
      });
      if (reusable) {
        await this.ctx.storage.put("submission_id", reusable);
        if (this.meta!.startedOver) {
          await restartResponse(this.env, reusable, {
            sessionId: this.meta!.sessionId,
            startedAt: this.meta!.startedAt,
          });
        } else {
          // `findOpenResponseId` matches `abandoned` rows as well, so adoption
          // here has the same obligation the sign-in and resume-link paths have:
          // a row somebody is answering into is in progress, whatever it was
          // when they walked away from it. See `reopenAdopted`.
          await this.reopenAdopted(reusable);
        }
        return reusable;
      }

      /*
        The id is minted here rather than inside `openResponse` so that this can
        tell the two outcomes apart. Getting a different one back means the
        insert lost to `uq_submissions_one_open_per_respondent` and adopted the
        draft that was already there — the same race the lookup above exists to
        avoid, arriving in the gap between that read and this write — and an
        adopted row carries the obligation every other adoption path has.
      */
      const wanted = newResponseId();
      const id = await openResponse(this.owner(), {
        responseId: wanted,
        hiddenFields: this.meta!.hiddenFields,
        variables: this.state.variables,
        userAgent: this.meta!.userAgent,
        country: this.meta!.country,
        startedAt: this.meta!.startedAt,
        fingerprint: this.meta!.fingerprint ?? null,
        respondentId: this.meta!.respondentId ?? null,
        // Usually present: the gate refuses every turn until it is, and this row
        // is opened by the first accepted answer.
        identity: this.meta!.identity ?? null,
      });
      await this.ctx.storage.put("submission_id", id);
      if (id !== wanted) await this.reopenAdopted(id);
      return id;
    })();
    /*
     * A failed insert must not be remembered as the answer, or one D1 hiccup
     * would leave the session unable to record anything for as long as the
     * isolate lives. Cleared on rejection only — the resolved promise is the
     * memo.
     */
    return this.openingRow.catch((err) => {
      this.openingRow = null;
      throw err;
    });
  }

  /**
   * Whether another response has already claimed this answer.
   *
   * The respondent's own row is excluded by id, so correcting an answer and
   * putting the same value back is not a collision with themselves. Reading the
   * stored id rather than calling `ensureSubmissionRow` keeps this a pure read:
   * a question that refuses the answer must not be what creates the response
   * row, or a rejected first answer would leave an empty response behind.
   *
   * A failure here lets the answer through. The alternative is a form that
   * stops accepting answers whenever D1 hiccups, which is a far worse failure
   * than a duplicate the author sorts out in the results table.
   */
  private async isTaken(block: Block, value: unknown): Promise<boolean> {
    try {
      if (!this.meta || this.meta.formVersionId === "preview") return false;
      const submissionId = (await this.ctx.storage.get<string>("submission_id")) ?? null;
      return await findDuplicateAnswer(this.owner(), {
        blockRef: block.ref,
        value,
        excludeResponseId: submissionId,
      });
    } catch (err) {
      console.error("unique_check_failed", err);
      return false;
    }
  }

  /**
   * Last chance to notice an answer that never reached the results table.
   *
   * `projectAnswer` runs under `waitUntil` and swallows its own errors, which
   * is right for a live turn — a D1 hiccup must not fail an answer the
   * respondent has already given — but nothing was healing the miss
   * afterwards. `finalizeResponse` reads `state.answers` only to build
   * `search_text`, so a dropped row stayed dropped: the respondent was told
   * their answer was recorded, the transcript proved they gave it, and the
   * column it belonged in was empty forever.
   *
   * The DO's own `state.answers` is the authority — it is persisted with the
   * session and is what every other consumer of this response is derived from
   * — so anything in it without a row gets one here, once, at the end.
   */
  private async reconcileAnswerRows(submissionId: string): Promise<void> {
    if (!this.doc || !this.meta) return;
    if (this.meta.formVersionId === "preview") return;
    const refs = Object.keys(this.state.answers);
    if (refs.length === 0) return;
    try {
      const { results } = await this.env.DB.prepare(
        `SELECT block_ref FROM submission_answers WHERE submission_id = ?`,
      )
        .bind(submissionId)
        .all<{ block_ref: string }>();
      const have = new Set((results ?? []).map((r) => r.block_ref));
      const missing = refs.filter((ref) => !have.has(ref));
      if (missing.length === 0) return;
      // Loud on purpose: reaching this means a live projection was lost, and
      // the rate it happens at is the health of the whole answer path.
      console.warn("answer_rows_reconciled", {
        sessionId: this.meta.sessionId,
        submissionId,
        refs: missing,
      });
      for (const ref of missing) {
        const block = this.doc.blocks.find((b) => b.ref === ref);
        if (!block) continue;
        await recordAnswerRow(this.owner(), { responseId: submissionId, block, value: this.state.answers[ref] });
      }
    } catch (err) {
      console.error("reconcile_answers_failed", { sessionId: this.meta.sessionId, submissionId, ...errorInfo(err) });
    }
  }

  /**
   * Remove a retracted answer from the D1 projection.
   *
   * Retraction, not replacement — the caller is `undoScreenOut` and nothing
   * else. The pencil deliberately does not come through here: see the note on
   * the `edit` action for why an answer being changed is kept until the change
   * arrives.
   */
  private async unprojectAnswer(ref: string): Promise<void> {
    if (!this.meta || this.meta.formVersionId === "preview") return;
    const submissionId = await this.ctx.storage.get<string>("submission_id");
    if (!submissionId) return;
    try {
      await deleteAnswerRow(this.owner(), submissionId, ref);
    } catch (err) {
      console.error("unproject_failed", err);
    }
  }

  private async projectAnswer(block: Block, value: unknown): Promise<void> {
    try {
      if (!this.meta) return;
      if (this.meta.formVersionId === "preview") return; // preview sessions never project to D1
      const submissionId = await this.ensureSubmissionRow();
      await recordAnswerRow(this.owner(), { responseId: submissionId, block, value });
    } catch (err) {
      console.error("project_answer_failed", {
        sessionId: this.meta?.sessionId,
        blockRef: block.ref,
        ...errorInfo(err),
      });
    }
  }

  /** Is there anything on this session worth a row in the responses table? */
  private async hasResponseContent(): Promise<boolean> {
    // A row that already exists stays: answers may have been recorded and then
    // retracted, and deleting it here would race the writes that made it.
    if (await this.ctx.storage.get<string>("submission_id")) return true;
    if (Object.keys(this.state.answers).length > 0) return true;
    return this.meta?.identity != null;
  }

  /**
   * Close out a session that produced no response row.
   *
   * `finalizeResponse` would have done this as part of its batch; since it is
   * not running, the session still has to stop being active — otherwise it
   * keeps its state snapshot and its respondent token until the expiry sweep
   * gets to it, hours later.
   */
  private async closeEmptySession(): Promise<void> {
    if (!this.meta) return;
    try {
      await this.env.DB.prepare(
        `UPDATE chat_sessions
            SET status = ?, current_block_ref = NULL, collected_count = 0, turn_count = ?,
                state_snapshot_json = NULL, last_activity_at = ?
          WHERE id = ?`,
      )
        .bind(this.meta.status, this.turnCount, Date.now(), this.meta.sessionId)
        .run();
    } catch (err) {
      console.error("close_empty_session_failed", err);
    }
  }

  private async finalize(
    status: "completed" | "disqualified" | "abandoned",
    endingRef: string | null,
    reason?: string,
  ): Promise<string> {
    if (!this.meta) throw new Error("no meta");
    if (this.meta.formVersionId === "preview") {
      // preview sessions never touch D1: no submissions, usage, webhooks, or analytics
      return `sbm_preview`;
    }

    /**
     * Somebody opening the link and leaving is not a partial response.
     *
     * The response row is created lazily — by the first answer, or by whatever
     * gets here first — so a session that collected nothing had none until
     * this method made one purely to mark it abandoned. Every bounce, every
     * bot, every time the author opened their own live link to look at it,
     * became a row in the Partial tab with a timestamp and not one filled
     * cell: the tab that is meant to show what people told you before they
     * left was mostly people who never said anything.
     *
     * The visit is not lost by skipping it. It was already counted as a view
     * (`analytics_rollup_daily`) and metered as a response when the session
     * opened; what changes is that `starts` now means "answered at least one
     * question", which is the only reading under which the drop-off funnel
     * says anything.
     *
     * A verified identity counts as content on its own — an email is what the
     * sign-in gate exists to collect, and it is worth a row even if the
     * conversation ended there. A transcript is deliberately NOT enough: a
     * respondent who only chatted still leaves an empty row in a table of
     * answers.
     */
    if (status === "abandoned" && !(await this.hasResponseContent())) {
      await this.closeEmptySession();
      return "";
    }

    const submissionId = await this.ensureSubmissionRow();
    await this.reconcileAnswerRows(submissionId);

    /**
     * The row update, the webhook fanout and the analytics point are the shared
     * writer's job, so an API-driven response produces byte-identical rows.
     * `changed` is false when something already finalized this response — the
     * idle alarm firing after a completion, say — and everything below is then
     * correctly skipped rather than delivered twice.
     */
    const { changed } = await finalizeResponse(this.owner(), {
      responseId: submissionId,
      status,
      endingRef,
      abandonReason: reason,
      answers: this.state.answers,
      variables: this.state.variables,
      identity: this.meta.identity ?? null,
      startedAt: this.meta.startedAt,
      collectedCount: this.collectedCount,
      country: this.meta.country,
      chatSession: {
        sessionId: this.meta.sessionId,
        status: this.meta.status,
        turnCount: this.turnCount,
      },
    });
    if (!changed) return submissionId;

    // project transcript to D1 for the results dashboard
    try {
      const entries = await this.ctx.storage.list<{ id: string; role: string; content: string; blockRef: string | null; createdAt: number }>({ prefix: "msg:" });
      const msgs = [...entries.values()].sort((a, b) => a.createdAt - b.createdAt).slice(0, 200);
      if (msgs.length > 0) {
        const stmts = msgs.map((m) =>
          this.env.DB.prepare(
            `INSERT INTO chat_messages (id, session_id, role, block_ref, content, created_at) VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (id) DO NOTHING`,
          ).bind(`cm_${m.id}`, this.meta!.sessionId, m.role, m.blockRef, m.content, m.createdAt),
        );
        await this.env.DB.batch(stmts);
      }
    } catch (err) {
      console.error("transcript_projection_failed", err);
    }

    /**
     * Meter the tokens this conversation actually cost.
     *
     * `responses` is metered at session *creation* (see `routes/public.ts`), not here — an
     * abandoned session still cost us the interview, and only counting completions would
     * make the AI cap trivially avoidable. What lands here is the token total, which is
     * only knowable once the conversation is over.
     *
     * Skipped for test-mode sessions: rehearsing an integration must not spend a
     * customer's budget.
     */
    try {
      const unmetered = this.sessionTokensUsed - this.meteredTokens;
      if (unmetered > 0 && this.meta.isTest !== true) {
        await meter(this.env, this.meta.organizationId, "ai_tokens", unmetered);
        this.meteredTokens = this.sessionTokensUsed;
        await this.persistMeta();
      }
    } catch (err) {
      console.error("usage_increment_failed", err);
    }

    return submissionId;
  }

}

/**
 * The refusals a builder preview answers with Simulate. Not a sign-in, a stale question, an
 * existing payment or a closed session — each of those has its own way forward that simulating
 * would skip past.
 */
const SIMULATABLE_REFUSALS = new Set<StartPaymentErrorCode>([
  "payment_unavailable",
  "plan_required",
  "preview_live_account",
  "too_many_attempts",
  /*
   * Sign-in included, and only here.
   *
   * The gate is real for a respondent and the session still refuses to open a
   * checkout without an identity. But the preview is the author walking their
   * own form, and nobody signs into their own preview: lint forces sign-in on
   * for a gateway block, so without this every author who presses Pay in the
   * preview meets the sign-in card and can never see the payment step they
   * just built. Simulating needs no identity, so offer that instead.
   */
  "sign_in_required",
]);

function refuse(code: StartPaymentErrorCode, message: string): StartPaymentResult {
  return { ok: false, code, message };
}

/** What the Pay card says about an attempt that did not become the answer. */
function paymentFailureMessage(code: string): string {
  switch (code) {
    case "payment_expired":
      return "That checkout expired before the payment went through. Tap Pay to try again.";
    case "payment_duplicate":
      return "This was already paid for, so that payment wasn't counted — the form's owner can refund it. Tap Pay to carry on.";
    case "payment_refunded":
      return "That payment has been refunded, so this still needs paying. Tap Pay to try again.";
    case "payment_amount_mismatch":
      return "That payment didn't match what this question asks, so it wasn't counted — the form's owner can see it and refund it if it went through. Tap Pay to try again.";
    default:
      return "That payment didn't go through. Tap Pay to try again.";
  }
}

/**
 * The variables as they stand when the flow, replayed from the answers, reaches `ref` — before
 * that question's own answer applies any rule. Null when the replayed flow never gets there.
 *
 * Why a payment's price is read from here and not from the session's running variables: those
 * are not a function of the answers. `applyLogicRules` re-applies every matching `set_variable`
 * and `add_score` on each `resolveNext`, so an `add_score` whose condition an earlier answer
 * met adds itself again on every question after it — including the payment question's own
 * answer. A ₹1,500 checkout for "workshop: yes" was settled, `record` ran `resolveNext`, the
 * total became ₹2,000, and the very next step took the verified payment back off as stale.
 * Replaying stops at the question, so the price is the one it was asked at, however many
 * questions have been answered since and however an edit has walked the flow.
 *
 * Unlike `replayState`, an unanswered question is walked past rather than stopped at: a
 * skipped optional question holds no answer, and the live flow went past it just the same.
 */
function variablesReaching(
  doc: FormDoc,
  answers: AnswerMap,
  hidden: Record<string, string>,
  ref: string,
): Record<string, unknown> | null {
  const state: EvalState = { answers: {}, variables: {}, hidden };
  for (const v of doc.variables) state.variables[v.name] = v.initial;
  let cursor = resolveNext(doc, null, state);
  // As `replayState`: a ceiling no legitimate flow reaches, against a `goto` cycle.
  const ceiling = doc.blocks.length * 2 + 2;
  for (let guard = 0; guard < ceiling && cursor.kind === "block"; guard += 1) {
    const block = cursor.block;
    if (block.ref === ref) return state.variables;
    const stored = answers[block.ref];
    if (stored !== undefined && block.type !== "welcome" && block.type !== "statement") {
      state.answers[block.ref] = stored;
    }
    cursor = resolveNext(doc, block.ref, state);
  }
  return null;
}

/**
 * Where a redirect checkout sends the respondent back to.
 *
 * The web app's return page, which finds the conversation again from these
 * parameters and nudges confirm. The record id is ours and the session id is
 * already in the respondent's own URL; neither is a credential — confirming
 * still needs the respondent token the page holds.
 */
function paymentReturnUrls(
  origin: string,
  p: { recordId: string; sessionId: string; slug: string },
): { returnUrl: string; cancelUrl: string } {
  const q = new URLSearchParams({ cf_pay: p.recordId, slug: p.slug, session: p.sessionId });
  const returnUrl = `${origin.replace(/\/$/, "")}/pay/return?${q.toString()}`;
  q.set("cancelled", "1");
  return { returnUrl, cancelUrl: `${origin.replace(/\/$/, "")}/pay/return?${q.toString()}` };
}

function nextInSequence(doc: FormDoc, ref: string): string | null {
  const idx = doc.blocks.findIndex((b) => b.ref === ref);
  if (idx === -1 || idx + 1 >= doc.blocks.length) return null;
  return doc.blocks[idx + 1]!.ref;
}

