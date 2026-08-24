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
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { ServerEvent, SSEEnvelope } from "../lib/events.js";
import { clarifyText, closingText, escalateText, greeting, questionText, transitionAck } from "../lib/phrasing.js";
import { chatModel } from "../lib/ai.js";
import { buildSystemPrompt } from "../lib/agent-prompts.js";
import { streamText } from "ai";

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
  private writers = new Set<WritableStreamDefaultWriter<Uint8Array>>();
  private eventBuffer: SSEEnvelope[] = [];
  private seq = 0;
  private turnCount = 0;
  private collectedCount = 0;
  private loaded = false;
  private encoder = new TextEncoder();
  private sessionTokensUsed = 0;
  private pendingUserTextPersisted = false;

  // ────────────────────────── lifecycle ──────────────────────────

  async init(params: {
    sessionId: string;
    formId: string;
    formVersionId: string;
    organizationId: string;
    slug: string;
    brandingHidden: boolean;
    docJson: unknown;
    respondentToken: string;
    hiddenFields: Record<string, string>;
    ipHash: string | null;
    country: string | null;
    userAgent: string | null;
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
    };
    this.loaded = true;

    // initialize variables from doc defaults
    for (const v of this.doc.variables) {
      this.state.variables[v.name] = v.initial;
    }

    await this.persistMeta();
    await this.appendMessage("assistant", greeting(this.doc));

    // seed variables/score rules that apply pre-flow
    const next = resolveNext(this.doc, null, this.state);
    await this.advanceTo(next);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);
    return { ok: true };
  }

  /** Cold hydration after eviction. */
  private async ensureLoaded(): Promise<boolean> {
    if (this.loaded) return true;
    const stored = await this.ctx.storage.get<{ meta: DoSessionMeta; docJson: unknown; answers: AnswerMap; variables: Record<string, string | number>; seq: number; turnCount: number; collectedCount: number }>("session");
    if (!stored) return false;
    const parsed = FormDoc.safeParse(stored.docJson);
    if (!parsed.success) return false;
    this.meta = stored.meta;
    this.doc = parsed.data;
    this.state = { answers: stored.answers, variables: stored.variables, hidden: this.meta.hiddenFields };
    this.seq = stored.seq;
    this.turnCount = stored.turnCount;
    this.collectedCount = stored.collectedCount;
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
    });
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
    const mode = this.doc?.settings.agent.mode ?? "template";
    return this.env.OPENROUTER_API_KEY !== undefined && mode !== "template" && this.sessionTokensUsed < (this.doc?.settings.agent.sessionTokenBudget ?? 12000);
  }

  /**
   * AI-mode message: streams real model tokens to SSE. Returns false when AI
   * is unavailable (caller falls back to deterministic template phrasing).
   */
  private async aiStreamMessage(objective: string): Promise<boolean> {
    if (!this.aiEnabled() || !this.doc || !this.meta || !this.meta.currentRef) return false;
    const block = this.doc.blocks.find((b) => b.ref === this.meta!.currentRef);
    if (!block) return false;
    try {
      const answered = Object.keys(this.state.answers).length;
      const result = streamText({
        model: chatModel(this.env),
        system: buildSystemPrompt(this.doc, block, answered),
        prompt: objective,
        maxOutputTokens: this.doc.settings.agent.responseMaxTokens,
      });
      const messageId = crypto.randomUUID();
      await this.emit("message_start", { messageId, role: "assistant" });
      let text = "";
      for await (const delta of result.textStream) {
        text += delta;
        await this.emit("token", { messageId, delta });
      }
      await this.emit("message_end", { messageId });
      const usage = await result.usage;
      this.sessionTokensUsed += (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
      await this.logAiUsage("interview_turn", usage?.inputTokens ?? 0, usage?.outputTokens ?? 0);
      await this.appendMessage("assistant", text);
      return text.trim().length > 0;
    } catch (err) {
      console.error("ai_stream_failed", err);
      return false;
    }
  }

  private async logAiUsage(kind: string, inputTokens: number, outputTokens: number): Promise<void> {
    if (!this.meta || (inputTokens + outputTokens) === 0) return;
    try {
      await this.env.DB.prepare(
        `INSERT INTO ai_generations (id, organization_id, session_id, form_id, kind, provider, model, prompt_tokens, completion_tokens, created_at)
         VALUES (?, ?, ?, ?, ?, 'openrouter', ?, ?, ?, ?)`,
      )
        .bind(`ai_${crypto.randomUUID().slice(0, 16)}`, this.meta.organizationId, this.meta.sessionId, this.meta.formId, kind, "openrouter/auto", inputTokens, outputTokens, Date.now())
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
    if (this.turnCount >= 500) return { accepted: false, error: "too_many_turns" };

    this.turnCount += 1;
    await this.ctx.storage.setAlarm(Date.now() + IDLE_ALARM_MS);

    if (input.type === "text") {
      const msgId = await this.appendMessage("user", input.text);
      await this.emit("user_message", { messageId: msgId, text: input.text });
      this.pendingUserTextPersisted = true;
      return this.handleFreeText(input.text);
    }
    this.pendingUserTextPersisted = false;
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

    // Choice-type blocks: try to match option by label (template mode NLU)
    if ("options" in block && block.options) {
      const normalized = text.trim().toLowerCase().replace(/[.!?]+$/, "");
      const match = block.options.find(
        (o) => o.label.toLowerCase() === normalized || o.label.toLowerCase().startsWith(normalized) || normalized === o.id,
      );
      if (!match) {
        return this.recordInvalid(block, "invalid_option", "Please pick one of the available options.");
      }
      return this.record(block, match.id);
    }
    if (block.type === "yes_no") {
      const t = text.trim().toLowerCase();
      if (["yes", "y", "yeah", "yep", "sure", "ok"].includes(t)) return this.record(block, true);
      if (["no", "n", "nope", "nah"].includes(t)) return this.record(block, false);
      return this.recordInvalid(block, "invalid_yes_no", "Please answer yes or no.");
    }
    if (block.type === "rating" || block.type === "nps" || block.type === "opinion_scale" || block.type === "number") {
      const n = Number(text.trim().replace(/[^\d.-]/g, ""));
      if (Number.isNaN(n)) return this.recordInvalid(block, "not_a_number", `Please reply with a number.`);
      return this.record(block, n);
    }
    // free text types
    return this.record(block, text);
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
    } else {
      await this.emitMessage(clarifyText(block, hint, count));
      await this.emitQuestion();
    }
    return { accepted: true };
  }

  private async record(block: Block, raw: unknown): Promise<{ accepted: boolean; error?: string }> {
    const result = validateAnswer(block, raw);
    if (!result.ok) {
      return this.recordInvalid(block, result.code ?? "invalid", result.hint ?? "That answer doesn't look right.");
    }
    if (result.value !== undefined) {
      this.state.answers[block.ref] = result.value;
      this.collectedCount += 1;
    }
    this.invalidCounts.delete(block.ref);
    const echo = summarizeAnswer(result.value);
    if (!this.pendingUserTextPersisted) {
      const echoId = await this.appendMessage("user", echo);
      await this.emit("user_message", { messageId: echoId, text: echo });
    }
    this.pendingUserTextPersisted = false;

    // apply logic + persist
    const next = resolveNext(this.doc!, block.ref, this.state);
    await this.persistMeta();
    await this.emit("answer_recorded", { ref: block.ref, pct: this.progressPct() });

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
      const aiOk = await this.aiStreamMessage(
        `Ask the question with ref=${next.block.ref} now. If the respondent just gave an answer, acknowledge it in a few words first, then ask.`,
      );
      if (!aiOk) await this.emitMessage(questionText(next.block));
      await this.emitQuestion();
      await this.persistMeta();
      return;
    }
    // ending
    this.meta.currentRef = null;
    this.meta.status = "completed";
    const ending = next.ending;
    await this.emitMessage(closingText(ending.title));
    await this.emit("ending", { ending });
    const submissionId = await this.finalize("completed", ending.ref);
    await this.emit("complete", { submissionId, durationMs: Date.now() - this.meta.startedAt });
    await this.persistMeta();
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

  async action(input: { action: "skip" | "stop" | "restart" }): Promise<{ accepted: boolean; error?: string }> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc) return { accepted: false, error: "session_not_found" };
    if (this.meta.status !== "active") return { accepted: false, error: "session_closed" };

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
    if (input.action === "stop") {
      await this.abandon("user_stop");
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

  /** Called by the uploads confirm route — emits upload_received and records the answer. */
  async notifyUpload(fileId: string, file: { fileId: string; filename: string; mime: string; size: number; r2Key: string }): Promise<void> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta || !this.doc || this.meta.status !== "active") return;
    const block = await this.currentBlock();
    if (!block) return;
    await this.emit("upload_received", { ref: block.ref, fileId, filename: file.filename });
    await this.record(block, [file]);
  }

  async getStatus(): Promise<{ status: string; currentRef: string | null; collected: number; answers: AnswerMap; variables: Record<string, string | number> } | null> {
    const ok = await this.ensureLoaded();
    if (!ok || !this.meta) return null;
    return {
      status: this.meta.status,
      currentRef: this.meta.currentRef,
      collected: this.collectedCount,
      answers: this.state.answers,
      variables: this.state.variables,
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

  private async ensureSubmissionRow(): Promise<string> {
    if (!this.meta) throw new Error("no meta");
    const existing = await this.ctx.storage.get<string>("submission_id");
    if (existing) return existing;
    const id = `sbm_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await this.env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, hidden_fields, meta, started_at)
       VALUES (?, ?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
    )
      .bind(
        id,
        this.meta.formId,
        this.meta.formVersionId,
        this.meta.organizationId,
        this.meta.sessionId,
        JSON.stringify(this.meta.hiddenFields),
        JSON.stringify({
          userAgent: this.meta.userAgent,
          country: this.meta.country,
          variables: this.state.variables,
        }),
        this.meta.startedAt,
      )
      .run();
    await this.ctx.storage.put("submission_id", id);
    return id;
  }

  private async projectAnswer(block: Block, value: unknown): Promise<void> {
    try {
      if (!this.meta) return;
      const submissionId = await this.ensureSubmissionRow();
      const numeric = typeof value === "number" ? value : null;
      await this.env.DB.prepare(
        `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, value_number, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (submission_id, block_ref) DO UPDATE SET value_json = excluded.value_json, value_number = excluded.value_number, updated_at = excluded.updated_at`,
      )
        .bind(
          `ans_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
          submissionId,
          this.meta.formId,
          block.ref,
          block.type,
          JSON.stringify(value),
          numeric,
          Date.now(),
        )
      .run();
    } catch (err) {
      console.error("project_answer_failed", err);
    }
  }

  private async finalize(status: "completed" | "abandoned", endingRef: string | null, reason?: string): Promise<string> {
    if (!this.meta) throw new Error("no meta");
    const submissionId = await this.ensureSubmissionRow();
    const durationMs = Date.now() - this.meta.startedAt;

    // build search text from string answers
    const searchText = Object.entries(this.state.answers)
      .map(([k, v]) => `${k} ${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ")
      .toLowerCase()
      .slice(0, 5000);

    await this.env.DB.batch([
      this.env.DB.prepare(
        `UPDATE submissions SET status = ?, completed_at = ?, duration_ms = ?, search_text = ?, meta = json_set(coalesce(meta,'{}'), '$.endingRef', ?, '$.abandonReason', ?) WHERE id = ?`,
      ).bind(status, status === "completed" ? Date.now() : null, durationMs, searchText, endingRef, reason ?? null, submissionId),
      this.env.DB.prepare(
        `UPDATE chat_sessions SET status = ?, current_block_ref = NULL, collected_count = ?, turn_count = ?, submission_id = ?, state_snapshot_json = NULL, last_activity_at = ? WHERE id = ?`,
      ).bind(this.meta.status, this.collectedCount, this.turnCount, submissionId, Date.now(), this.meta.sessionId),
    ]);

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

    // meter usage (responses)
    try {
      const period = new Date().toISOString().slice(0, 7);
      await this.env.DB.prepare(
        `INSERT INTO usage_counters (id, organization_id, period, metric, used, updated_at) VALUES (?, ?, ?, 'responses', 1, ?)
         ON CONFLICT (organization_id, period, metric) DO UPDATE SET used = used + 1, updated_at = ?`,
      )
        .bind(`uc_${crypto.randomUUID().slice(0, 16)}`, this.meta.organizationId, period, Date.now(), Date.now())
        .run();
    } catch (err) {
      console.error("usage_increment_failed", err);
    }

    // enqueue webhook fanout
    await this.env.Q_WEBHOOKS.send({
      event: status === "completed" ? "submission.completed" : "submission.abandoned",
      organizationId: this.meta.organizationId,
      formId: this.meta.formId,
      submissionId,
      sessionId: this.meta.sessionId,
    });

    // analytics event
    this.env.ANALYTICS.writeDataPoint({
      indexes: [this.meta.formId],
      blobs: [this.meta.sessionId, endingRef ?? reason ?? "", this.meta.country ?? ""],
      doubles: [durationMs, this.collectedCount],
    });

    return submissionId;
  }
}

function nextInSequence(doc: FormDoc, ref: string): string | null {
  const idx = doc.blocks.findIndex((b) => b.ref === ref);
  if (idx === -1 || idx + 1 >= doc.blocks.length) return null;
  return doc.blocks[idx + 1]!.ref;
}

function summarizeAnswer(value: unknown): string {
  if (value === undefined || value === null) return "(skipped)";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "object" && v !== null && "filename" in v ? (v as { filename: string }).filename : String(v)))
      .join(", ");
  }
  return JSON.stringify(value);
}
