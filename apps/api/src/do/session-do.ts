import { DurableObject } from "cloudflare:workers";
import {
  FormDoc,
  resolveNext,
  isBlockVisible,
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
  needsExtraction,
  extractionSchema,
  extractionGuidance,
  resolveEnding,
  displayAnswer as summarizeAnswer,
  isRequirementUnmet,
  defaultEnding,
  normalizeE164,
  type ConditionGroup,
  type PublicBlock,
  type PublicEnding,
  interpolate,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
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
} from "../lib/ai.js";
import {
  affordanceNote,
  buildStablePrefix,
  buildTurnSuffix,
  buildRetryObjective,
} from "../lib/agent-prompts.js";
import { buildAgentTools, nextStepAfter, type ToolOutcome } from "./agent-tools.js";
import { knowledgeStore, knowledgeAvailable } from "../lib/knowledge/index.js";
import { getEntitlements } from "../lib/entitlements.js";
import { clampForRuntime } from "../lib/doc-entitlements.js";
import { can } from "@repo/entitlements";
import { meter } from "../lib/entitlements.js";
import { costUsdMicro } from "../lib/ai-pricing.js";
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

interface StoredSession {
  meta: DoSessionMeta;
  docJson: unknown;
  answers: AnswerMap;
  variables: Record<string, string | number>;
  seq: number;
  turnCount: number;
  collectedCount: number;
  invalidCounts?: Record<string, number>;
  sessionTokensUsed?: number;
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
    // `phrasingTokensUsed` was the larger of the two while both existed, so a
    // session written before they merged carries its spend across rather than
    // being handed a fresh allowance mid-conversation.
    this.sessionTokensUsed = Math.max(stored.sessionTokensUsed ?? 0, stored.phrasingTokensUsed ?? 0);
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
      sessionTokensUsed: this.sessionTokensUsed,
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
    if (this.meta.status === "active") {
      await this.abandon("idle_timeout");
    }
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
    // The five events that put the respondent back in control. See `turnHandedBack`.
    if (
      type === "question" ||
      type === "ending" ||
      type === "auth_required" ||
      type === "verify_required" ||
      type === "review"
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
  private async aiStreamMessage(objective: string): Promise<boolean> {
    if (!this.aiEnabled() || !this.doc || !this.meta || !this.meta.currentRef) return false;
    const block = this.doc.blocks.find((b) => b.ref === this.meta!.currentRef);
    if (!block) return false;

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

    try {
      const answered = Object.keys(this.state.answers).length;
      const context = await this.conversationContext();
      const outcomes: ToolOutcome[] = [];
      const formId = this.meta?.formId ?? "";
      const hasKnowledge = await this.resolveHasKnowledge(formId);
      const tools = buildAgentTools(
        {
          doc: this.doc,
          currentBlock: block,
          nextAfter: (value?: unknown) => nextStepAfter(this.doc!, block, this.state, value),
          verbatimQuestions: this.doc.settings.agent.rephraseQuestions === false,
          clarifications: this.invalidCounts.get(block.ref) ?? 0,
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
        prompt: `${buildTurnSuffix(this.doc, block, answered, { ...context, turnCount: this.turnCount })}\n\n${objective}`,
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
      const inTok = usage?.inputTokens ?? 0;
      const outTok = usage?.outputTokens ?? 0;
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
      await this.logAiUsage("interview_turn", inTok, outTok, modelId, Date.now() - started);
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
      await this.logAiUsage("extraction", out.tokens, 0, MODELS.extraction, Date.now() - started);
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
    const effects = this.pendingEffects;
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
        return `- ${block?.title ?? ref}: ${typeof v === "object" && v !== null ? JSON.stringify(v) : String(v)}`;
      })
      .join("\n");
    return { transcript, answers };
  }

  private async logAiUsage(
    kind: string,
    inputTokens: number,
    outputTokens: number,
    model: string,
    latencyMs: number,
  ): Promise<void> {
    if (!this.meta || inputTokens + outputTokens === 0) return;
    try {
      await this.env.DB.prepare(
        // model was hardcoded "openrouter/auto" and latency was never recorded,
        // so per-model cost analysis was impossible. `cost_usd_micro` was the
        // other half of that: the column existed and every row said zero, so the
        // platform's largest variable cost was invisible. Priced at write time
        // from `ai-pricing.ts`, which means a row keeps the cost it was actually
        // incurred at rather than being re-priced later at today's rates.
        `INSERT INTO ai_generations (id, organization_id, session_id, form_id, kind, provider, model, prompt_tokens, completion_tokens, cost_usd_micro, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, 'openrouter', ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          `ai_${crypto.randomUUID().slice(0, 16)}`,
          this.meta.organizationId,
          this.meta.sessionId,
          this.meta.formId,
          kind,
          model,
          inputTokens,
          outputTokens,
          costUsdMicro(model, inputTokens, outputTokens),
          latencyMs,
          Date.now(),
        )
        .run();
    } catch (err) {
      console.error("ai_usage_log_failed", err);
    }
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

    if (input.type === "text") {
      const msgId = await this.appendMessage("user", input.text);
      await this.emit("user_message", { messageId: msgId, text: input.text });
      this.pendingUserTextPersisted = true;
      this.pendingUserMessageId = msgId;
      return this.handleFreeText(input.text);
    }
    this.pendingUserTextPersisted = false;
    this.pendingUserMessageId = null;
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
      await this.emit("escalate_ui", { ref: block.ref, spec: toPublicBlock(block), reason: "repeated_invalid" });
      // Escalating used to be the one branch here that did not re-state the
      // question. The client arms its controls off the `question` event, so
      // the respondent reached the step meant to make answering *easier* and
      // found the affordance gone — the exact opposite of the intent, at the
      // exact moment they were already struggling.
      await this.emitQuestion();
    } else if (this.aiEnabled()) {
      // Agentic retry: address what they actually said — which is often a
      // question of their own — then steer back. The form author's per-block
      // retryHint is folded in by buildRetryObjective.
      const ok = await this.aiStreamMessage(buildRetryObjective(block, count, hint));
      if (ok) {
        await this.applyPendingEffects();
        // Same rule on a retry: the question text is never reworded.
        if (agent.rephraseQuestions === false) await this.emitMessage(questionText(block));
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

  private async record(block: Block, raw: unknown): Promise<{ accepted: boolean; error?: string }> {
    const result = validateAnswer(block, raw);

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
   */
  private unansweredRequired(): Block[] {
    if (!this.doc) return [];
    return this.doc.blocks.filter(
      (b) =>
        b.required &&
        !["welcome", "statement"].includes(b.type) &&
        this.state.answers[b.ref] === undefined &&
        isBlockVisible(b, this.state),
    );
  }

  private progressPct(): number {
    if (!this.doc) return 0;
    const answerable = this.doc.blocks.filter((b) => !["welcome", "statement"].includes(b.type)).length;
    if (answerable === 0) return 100;
    return Math.min(100, Math.round((this.collectedCount / answerable) * 100));
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
    let cursor = resolveNext(this.doc!, fromRef, this.state);
    for (let hops = 0; cursor.kind === "block" && hops <= this.doc!.blocks.length; hops += 1) {
      const settled =
        this.state.answers[cursor.block.ref] !== undefined ||
        ["welcome", "statement"].includes(cursor.block.type);
      if (!settled) return cursor;
      cursor = resolveNext(this.doc!, cursor.block.ref, this.state);
    }
    return cursor;
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
    await this.emit("ending", { ending: this.projectEnding(ending) });
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
      action: "skip" | "stop" | "restart" | "edit" | "submit" | "resend_code" | "change_answer" | "undo_screen_out";
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
      question: block ? toPublicBlock(block) : null,
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
    const answered = Object.keys(this.state.answers).length;
    const pub = toPublicBlock(block);
    await this.emit("question", {
      messageId: crypto.randomUUID(),
      // The description is shown verbatim, so `{{ref}}` is filled here, where
      // the answers are, rather than trusting a client to do it.
      block: pub.description
        ? { ...pub, description: interpolate(pub.description, this.recallVars(), { escapeMarkdown: true }) }
        : pub,
      progress: {
        answered,
        totalEstimate: this.doc.blocks.filter((b) => !["welcome", "statement"].includes(b.type)).length,
        pct: this.progressPct(),
      },
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
        await this.emit("ending", { ending: this.projectEnding(ending) });
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
    // `emitQuestion` rebuilds `currentRef` when a dead turn left it empty.
    await this.emitQuestion();
    return { ok: true };
  }

  async action(input: {
    action: "skip" | "stop" | "restart" | "edit" | "submit" | "resend_code" | "change_answer" | "undo_screen_out";
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
    action: "skip" | "stop" | "restart" | "edit" | "submit" | "resend_code" | "change_answer" | "undo_screen_out";
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
     * Every other way out of the code step abandons it. Leaving `pendingVerify`
     * set would read the next turn as a code — so skipping the question, going
     * back to edit another answer, or starting over would each leave the
     * conversation quietly waiting for six digits nobody is going to type.
     */
    if (this.meta.pendingVerify) await this.cancelVerification();

    if (input.action === "skip") {
      const block = await this.currentBlock();
      if (!block) return { accepted: false, error: "no_question" };
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

      this.invalidCounts.delete(target.ref);
      this.meta.currentRef = target.ref;
      this.meta.status = "active";
      // Remembered so `advanceTo` can put them back where they were instead of
      // re-asking everything after this question. See `resumeAfterEdit`.
      this.editingRef = target.ref;
      // Leaving the review step: the form is no longer finished.
      this.pendingEndingRef = null;
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
      if (this.sessionTokensUsed > 0 && this.meta.isTest !== true) {
        await meter(this.env, this.meta.organizationId, "ai_tokens", this.sessionTokensUsed);
      }
    } catch (err) {
      console.error("usage_increment_failed", err);
    }

    return submissionId;
  }

}

function nextInSequence(doc: FormDoc, ref: string): string | null {
  const idx = doc.blocks.findIndex((b) => b.ref === ref);
  if (idx === -1 || idx + 1 >= doc.blocks.length) return null;
  return doc.blocks[idx + 1]!.ref;
}

