import { DurableObject } from "cloudflare:workers";
import {
  FormDoc,
  resolveNext,
  validateAnswer,
  toPublicBlock,
  toPublicEnding,
  type AnswerMap,
  type Block,
  type Ending,
  type EvalState,
  migrateFormDoc,
  allowedNextRefs,
  needsExtraction,
  extractionSchema,
  extractionGuidance,
  resolveEnding,
  displayAnswer as summarizeAnswer,
  type PublicBlock,
  type PublicEnding,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { ServerEvent, SSEEnvelope } from "../lib/events.js";
import { asideText, clarifyText, closingText, escalateText, greeting, looksLikeQuestion, questionText, transitionAck } from "../lib/phrasing.js";
import {
  chatModel,
  interviewModel,
  extractAnswer,
  MODELS,
  INTERVIEW_PROVIDER_OPTIONS,
  REASONING_HEADROOM_TOKENS,
} from "../lib/ai.js";
import {
  buildStablePrefix,
  buildTurnSuffix,
  buildRetryObjective,
} from "../lib/agent-prompts.js";
import { buildAgentTools, type ToolOutcome } from "./agent-tools.js";
import { meter } from "../lib/entitlements.js";
import {
  openResponse,
  recordAnswerRow,
  deleteAnswerRow,
  finalizeResponse,
  type ResponseOwner,
} from "../lib/submissions.js";
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
  status: "active" | "completed" | "abandoned" | "blocked";
  currentRef: string | null;
  startedAt: number;
  hiddenFields: Record<string, string>;
  ipHash: string | null;
  country: string | null;
  userAgent: string | null;
  /** Set when the respondent submits, for the already-submitted screen. */
  completedAt?: number | null;
  /** Set once the sign-in gate is satisfied. Null while it still blocks. */
  identity?: RespondentIdentity | null;
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
  degraded?: boolean;
  pendingEndingRef?: string | null;
}

/**
 * Block types whose validator accepts any non-empty string, so "is this an
 * answer or a question back?" cannot be decided by validation alone.
 */
function acceptsAnyString(block: Block): boolean {
  return block.type === "short_text" || block.type === "long_text";
}

const IDLE_ALARM_MS = 30 * 60 * 1000;
const MAX_REPLAY = 200;

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
  /** Human-readable summary of the most recent recorded answer (for AI acks). */
  private lastAnswerDisplay: string | null = null;
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private eventBuffer: SSEEnvelope[] = [];
  /** Non-null while a synchronous turn is collecting the events it produces. */
  private turnJournal: SSEEnvelope[] | null = null;
  private seq = 0;
  private turnCount = 0;
  private collectedCount = 0;
  private loaded = false;
  private encoder = new TextEncoder();
  private sessionTokensUsed = 0;
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
    country: string | null;
    userAgent: string | null;
    /** Which surface opened this. Defaults to a conversation. */
    source?: "chat" | "embed" | "api";
    /** Opened with a test-mode key: real rows, excluded from every count. */
    isTest?: boolean;
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

    await this.persistMeta();
    await this.appendMessage("assistant", greeting(this.doc));
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
    const next = resolveNext(this.doc, null, this.state);
    await this.advanceTo(next);
  }

  // ────────────────────────── respondent auth ──────────────────────────

  /** True while the form requires a verified respondent and has not got one. */
  private authGateBlocks(): boolean {
    if (!this.doc || !this.meta) return false;
    return this.doc.settings.requireAuth.enabled && !this.meta.identity;
  }

  private async emitAuthRequired(): Promise<void> {
    if (!this.doc || !this.meta) return;
    const gate = this.doc.settings.requireAuth;
    // The prompt is a real assistant message so it lands in the transcript and
    // survives replay; the card below it is the event.
    await this.emitMessage(gate.message);
    await this.appendMessage("assistant", gate.message);
    await this.emit("auth_required", { methods: gate.methods, message: gate.message });
  }

  /**
   * Record a verified identity and start (or resume) the interview.
   *
   * Verification itself happens in the route — the DO never sees an ID token or
   * an OTP, only the attested result — so this method must stay the single
   * place that clears the gate.
   */
  async attachIdentity(identity: RespondentIdentity): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };
    if (this.meta.identity) return { accepted: true }; // idempotent: a double-submit is not an error

    this.meta.identity = identity;
    await this.persistMeta();
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

    // Only start the flow if the gate is what was holding it. A session that
    // verified mid-conversation (a settings change, a resumed session) must not
    // be rewound to question one.
    if (!this.meta.currentRef && this.collectedCount === 0) await this.beginInterview();
    return { accepted: true };
  }

  /** The identity, for the route that needs to enforce `onePerIdentity`. */
  async getIdentity(): Promise<RespondentIdentity | null> {
    const ok = await this.ensureLoaded();
    return ok ? (this.meta?.identity ?? null) : null;
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
    this.seq = stored.seq;
    this.turnCount = stored.turnCount;
    this.collectedCount = stored.collectedCount;
    // These two used to live only in memory. A DO eviction therefore reset the
    // escalation counter (so a respondent could loop on a bad answer forever)
    // and reset the token budget to zero (so `sessionTokenBudget` was not
    // actually a cap). They are part of session state and must survive.
    this.invalidCounts = new Map(Object.entries(stored.invalidCounts ?? {}));
    this.sessionTokensUsed = stored.sessionTokensUsed ?? 0;
    this.degraded = stored.degraded ?? false;
    this.pendingEndingRef = stored.pendingEndingRef ?? null;
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
      degraded: this.degraded,
      pendingEndingRef: this.pendingEndingRef,
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
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();
    this.writers.add(writer);

    // replay from durable storage (in-memory buffer dies with the isolate)
    const stored = await this.ctx.storage.list<SSEEnvelope>({ prefix: "evt:", limit: MAX_REPLAY * 4 });
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
        },
      };
      void writer.write(this.encoder.encode(this.serialize(ready)));
    }
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
    const evt: SSEEnvelope = { v: 1, seq: ++this.seq, ts: Date.now(), type, data };
    // The one line that makes a turn returnable over HTTP as well as streamable:
    // when a *Sync RPC is collecting, every event it would have streamed is also
    // handed back to the caller. One event contract, two transports.
    if (this.turnJournal) this.turnJournal.push(evt);
    this.eventBuffer.push(evt);
    if (this.eventBuffer.length > MAX_REPLAY * 2) this.eventBuffer.splice(0, MAX_REPLAY);
    // persist for replay after eviction (key sorts by seq)
    await this.ctx.storage.put(`evt:${String(evt.seq).padStart(8, "0")}`, evt);
    const payload = this.encoder.encode(this.serialize(evt));
    const dead: WritableStreamDefaultWriter<Uint8Array>[] = [];
    for (const w of this.writers) {
      try {
        await w.write(payload);
      } catch {
        dead.push(w);
      }
    }
    for (const w of dead) this.writers.delete(w);
  }

  /** True when the LLM layer should phrase this turn. */
  private aiEnabled(): boolean {
    if (this.degraded) return false;
    const mode = this.doc?.settings.agent.mode ?? "template";
    return (
      this.env.OPENROUTER_API_KEY !== undefined &&
      mode !== "template" &&
      this.sessionTokensUsed < (this.doc?.settings.agent.sessionTokenBudget ?? 12000)
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

    try {
      const answered = Object.keys(this.state.answers).length;
      const context = await this.conversationContext();
      const outcomes: ToolOutcome[] = [];
      const tools = buildAgentTools(
        {
          doc: this.doc,
          currentBlock: block,
          allowedNext: allowedNextRefs(this.doc, block.ref, this.state),
          clarifications: this.invalidCounts.get(block.ref) ?? 0,
        },
        (o: ToolOutcome) => outcomes.push(o),
      );

      const result = streamText({
        model,
        // Stable prefix first so the provider's prompt cache can serve the
        // persona, goal, knowledge base and question manifest across turns.
        system: `${buildStablePrefix(this.doc)}\n\n${buildTurnSuffix(this.doc, block, answered, { ...context, turnCount: this.turnCount })}`,
        prompt: objective,
        tools,
        // A tool call ends a step. Without this the model looks something up
        // (or records an answer) and the turn ends having said nothing, so the
        // respondent sees the deterministic fallback instead of a reply.
        // Four steps is enough for look-up → answer → record → ask.
        stopWhen: stepCountIs(4),
        // The author's setting governs the visible reply; reasoning gets its
        // own headroom on top so it can never starve the answer.
        maxOutputTokens: this.doc.settings.agent.responseMaxTokens + REASONING_HEADROOM_TOKENS,
        providerOptions: INTERVIEW_PROVIDER_OPTIONS,
      });

      // Open the bubble lazily, on the first token. A turn that spends itself
      // on tool calls and says nothing used to leave an empty bubble in the
      // transcript, immediately followed by the deterministic fallback.
      const messageId = crypto.randomUUID();
      let opened = false;
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
       * Reasoning tokens are billed to the org but not to the conversation.
       *
       * `sessionTokenBudget` decides when the agent stops phrasing and the
       * scripted fallback takes over, so what it counts decides how long a
       * respondent gets a real interviewer. Charging it for thinking nobody
       * reads spends that allowance three times faster than the words do —
       * measured, ~590 input plus up to 1,600 output per turn against a free
       * plan clamped to 6,000, which is how a conversation reached its seventh
       * exchange and answered "why do you want my phone number?" with a canned
       * "Please enter a valid phone number with country code."
       *
       * The same reasoning as `REASONING_HEADROOM_TOKENS`: a budget expressed
       * in what the respondent sees should not be consumed by what they don't.
       * `logAiUsage` and the org-level meter still receive the true totals.
       */
      const reasoningTok = usage?.outputTokenDetails?.reasoningTokens ?? 0;
      const budget = this.doc.settings.agent.sessionTokenBudget;
      const wasWithinBudget = this.sessionTokensUsed < budget;
      this.sessionTokensUsed += inTok + Math.max(0, outTok - reasoningTok);
      // Running out is not an error, but it changes the product mid-conversation
      // — the interviewer becomes a form — so it should not be invisible.
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
      console.error("ai_stream_failed", err);
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
    if (!this.aiEnabled() || !needsExtraction(block)) return null;
    const schema = extractionSchema(block);
    if (!schema) return null;

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
      this.sessionTokensUsed += out.tokens;
      await this.logAiUsage("extraction", out.tokens, 0, MODELS.extraction, Date.now() - started);
      if (!out.confident || out.value === null || out.value === undefined) return null;
      return out.value;
    } catch (err) {
      console.error("extract_failed", err);
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
            this.doc.endings[0];
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

  /** Remove a retracted answer from the D1 projection. */
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

  /** Recent conversation + collected answers, for the agent's system prompt. */
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
        // so per-model cost analysis was impossible.
        `INSERT INTO ai_generations (id, organization_id, session_id, form_id, kind, provider, model, prompt_tokens, completion_tokens, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, 'openrouter', ?, ?, ?, ?, ?)`,
      )
        .bind(`ai_${crypto.randomUUID().slice(0, 16)}`, this.meta.organizationId, this.meta.sessionId, this.meta.formId, kind, model, inputTokens, outputTokens, latencyMs, Date.now())
        .run();
    } catch (err) {
      console.error("ai_usage_log_failed", err);
    }
  }

  /** Stream text as token events (template mode: chunked; AI mode: real tokens). */
  private async emitMessage(text: string): Promise<string> {
    const messageId = crypto.randomUUID();
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

  // ────────────────────────── turns ──────────────────────────

  async handleUserTurn(input: { type: "text"; text: string } | { type: "structured"; ref: string; value: unknown }): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };
    // Re-emit rather than silently dropping: a client that lost the card (a
    // reload, a stale tab) needs it back, not a dead input box.
    if (this.authGateBlocks()) {
      await this.emitAuthRequired();
      return { accepted: false, error: "auth_required" };
    }
    if (this.turnCount >= 500) return { accepted: false, error: "too_many_turns" };

    this.turnCount += 1;
    await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);

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
          `3. Then, if you recorded an answer, go straight on to the next question in the same message. ` +
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
    if (!result.ok) {
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
      return this.recordInvalid(block, result.code ?? "invalid", result.hint ?? "That answer doesn't look right.");
    }
    if (result.value !== undefined) {
      this.state.answers[block.ref] = result.value;
      this.collectedCount += 1;
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

  private progressPct(): number {
    if (!this.doc) return 0;
    const answerable = this.doc.blocks.filter((b) => !["welcome", "statement"].includes(b.type)).length;
    if (answerable === 0) return 100;
    return Math.min(100, Math.round((this.collectedCount / answerable) * 100));
  }

  private async advanceTo(
    next: { kind: "block"; block: Block } | { kind: "ending"; ending: Ending },
    fromRef?: string,
  ): Promise<void> {
    if (!this.doc || !this.meta) return;
    if (next.kind === "block") {
      const jumped = fromRef !== undefined && next.block.ref !== nextInSequence(this.doc, fromRef);
      if (jumped) {
        await this.emit("branch_jump", { from: fromRef!, to: next.block.ref });
      }
      this.meta.currentRef = next.block.ref;
      if (next.block.type === "welcome" || next.block.type === "statement") {
        // statement/welcome: emit as assistant message, auto-advance
        await this.emitMessage(questionText(next.block));
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

      const aiOk = await this.aiStreamMessage(
        verbatim
          ? `The respondent just answered "${answeredBlock?.title ?? fromRef}" with: ${this.lastAnswerDisplay ?? "(see conversation)"}. ` +
              `Acknowledge it in one short sentence and answer anything they asked. Do NOT ask the next question — it follows immediately, word for word.`
          : `The respondent just answered "${answeredBlock?.title ?? fromRef}" with: ${this.lastAnswerDisplay ?? "(see conversation)"}. ` +
              `Acknowledge it naturally in a few words (reference what they actually said), then ask the question with ref=${next.block.ref} — which is: "${next.block.title}" (${next.block.type}) — in your own words. Ask ONLY that question.`,
      );
      if (aiOk) await this.applyPendingEffects();

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
    if (this.doc.settings.onComplete.requireSubmit && this.meta.status === "active") {
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

    await this.completeWith(ending);
  }

  /** Finalize against an ending and tell the client. */
  private async completeWith(ending: Ending): Promise<void> {
    if (!this.meta || !this.doc) return;
    this.meta.currentRef = null;
    this.meta.status = "completed";
    this.meta.completedAt = Date.now();
    // Recorded before `pendingEndingRef` is cleared: without it a headless
    // caller can see that a conversation finished but never learn where.
    this.meta.endingRef = ending.ref;
    this.pendingEndingRef = null;
    await this.emitMessage(closingText(ending.title));
    // Project rather than emitting the stored ending: the raw object carries
    // internal ids, and only the projection applies the form-level redirect
    // default that `settings.onComplete` is supposed to provide.
    await this.emit("ending", { ending: toPublicEnding(ending, this.doc.settings.onComplete) });
    const submissionId = await this.finalize("completed", ending.ref);
    await this.emit("complete", { submissionId, durationMs: Date.now() - this.meta.startedAt });
    await this.persistMeta();
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
    input: { type: "text"; text: string } | { type: "structured"; ref: string; value: unknown },
    opts: { deadlineMs?: number } = {},
  ): Promise<SyncTurnResult> {
    return this.runSync(() => this.handleUserTurn(input), opts);
  }

  /** The same, for skip / stop / restart / edit / submit. */
  async actionSync(
    input: { action: "skip" | "stop" | "restart" | "edit" | "submit"; ref?: string },
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
      this.ctx.waitUntil(turn.catch((err) => console.error("turn_failed_after_deadline", err)));
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
    const block = this.meta?.currentRef
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
      ending: ending && this.doc ? toPublicEnding(ending, this.doc.settings.onComplete) : null,
      validation,
      assistantMessages,
      complete: this.meta?.status === "completed",
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

  private async emitQuestion(): Promise<void> {
    const block = await this.currentBlock();
    if (!block || !this.doc) return;
    const answered = Object.keys(this.state.answers).length;
    await this.emit("question", {
      messageId: crypto.randomUUID(),
      block: toPublicBlock(block),
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

  async action(input: {
    action: "skip" | "stop" | "restart" | "edit" | "submit";
    /** For `edit`: the block to go back and re-answer. */
    ref?: string;
  }): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };
    // `stop` and `restart` stay open while gated — someone who cannot sign in
    // must still be able to walk away or start over.
    if (this.authGateBlocks() && input.action !== "stop" && input.action !== "restart") {
      await this.emitAuthRequired();
      return { accepted: false, error: "auth_required" };
    }

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
     * Discards the stored answer, returns the cursor to that block, and asks
     * again. Later answers are kept: re-answering "how many people" should not
     * wipe an email given three questions ago. If the change reroutes the flow,
     * `resolveNext` handles that on the way forward as it always does.
     */
    if (input.action === "edit") {
      const target = this.doc.blocks.find((b) => b.ref === input.ref);
      if (!target) return { accepted: false, error: "unknown_ref" };
      if (["welcome", "statement"].includes(target.type)) {
        return { accepted: false, error: "not_answerable" };
      }

      if (this.state.answers[target.ref] !== undefined) {
        delete this.state.answers[target.ref];
        this.collectedCount = Math.max(0, this.collectedCount - 1);
        // Drop the projected row too, or the submission keeps a value the
        // respondent has explicitly retracted.
        this.ctx.waitUntil(this.unprojectAnswer(target.ref));
      }
      this.invalidCounts.delete(target.ref);
      this.meta.currentRef = target.ref;
      this.meta.status = "active";
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
      const next = resolveNext(this.doc, null, this.state);
      await this.advanceTo(next);
      return { accepted: true };
    }
    return { accepted: false, error: "unknown_action" };
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
    /** Null when the form is open to anyone. */
    auth: {
      methods: RespondentAuthMethod[];
      message: string;
      verified: boolean;
      label: string | null;
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
      completedAt: this.meta.status === "completed" ? (this.meta.completedAt ?? null) : null,
      auth: this.doc?.settings.requireAuth.enabled
        ? {
            methods: this.doc.settings.requireAuth.methods,
            message: this.doc.settings.requireAuth.message,
            verified: Boolean(this.meta.identity),
            label: this.meta.identity
              ? (this.meta.identity.email ?? this.meta.identity.phone ?? this.meta.identity.name ?? "Verified")
              : null,
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

  private async ensureSubmissionRow(): Promise<string> {
    if (!this.meta) throw new Error("no meta");
    const existing = await this.ctx.storage.get<string>("submission_id");
    if (existing) return existing;
    const id = await openResponse(this.owner(), {
      hiddenFields: this.meta.hiddenFields,
      variables: this.state.variables,
      userAgent: this.meta.userAgent,
      country: this.meta.country,
      startedAt: this.meta.startedAt,
    });
    await this.ctx.storage.put("submission_id", id);
    return id;
  }

  private async projectAnswer(block: Block, value: unknown): Promise<void> {
    try {
      if (!this.meta) return;
      if (this.meta.formVersionId === "preview") return; // preview sessions never project to D1
      const submissionId = await this.ensureSubmissionRow();
      await recordAnswerRow(this.owner(), { responseId: submissionId, block, value });
    } catch (err) {
      console.error("project_answer_failed", err);
    }
  }

  private async finalize(status: "completed" | "abandoned", endingRef: string | null, reason?: string): Promise<string> {
    if (!this.meta) throw new Error("no meta");
    if (this.meta.formVersionId === "preview") {
      // preview sessions never touch D1: no submissions, usage, webhooks, or analytics
      return `sbm_preview`;
    }
    const submissionId = await this.ensureSubmissionRow();

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

