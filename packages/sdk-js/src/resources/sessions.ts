import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { AnswerValue, SessionCreated, SessionEvent, TurnResult } from "../types/index.js";

export interface CreateSessionOptions {
  hiddenFields?: Record<string, string>;
  externalId?: string;
  expiresIn?: number;
  respondent?: { ipHash?: string; country?: string; userAgent?: string };
}

export type SessionAction = "skip" | "stop" | "restart" | "edit" | "submit";

export class Sessions {
  constructor(private readonly http: HttpClient) {}

  /**
   * Open a conversation.
   *
   * The `respondentToken` in the result is what a browser should be given — it
   * is scoped to this session and expires, so a leaked one is worth a single
   * half-finished response rather than your whole account.
   */
  create(formId: string, options: CreateSessionOptions = {}, request?: RequestOptions) {
    return this.http.post<SessionCreated>(`/v1/forms/${formId}/sessions`, options, request);
  }

  /** Free text, interpreted against whatever was just asked. */
  send(sessionId: string, text: string, options: { deadlineMs?: number } = {}, request?: RequestOptions) {
    return this.http.request<TurnResult>("POST", `/v1/sessions/${sessionId}/messages`, {
      query: { deadlineMs: options.deadlineMs },
      body: { type: "text", text },
      options: request,
    });
  }

  /** A specific answer to a specific question — what a form control produces. */
  answer(
    sessionId: string,
    answer: { ref: string; value: AnswerValue },
    options: { deadlineMs?: number } = {},
    request?: RequestOptions,
  ) {
    return this.http.request<TurnResult>("POST", `/v1/sessions/${sessionId}/messages`, {
      query: { deadlineMs: options.deadlineMs },
      body: { type: "structured", ...answer },
      options: request,
    });
  }

  /**
   * Skip, stop, restart, edit or submit.
   *
   * `submit` matters more than it looks: forms show a review step by default, so
   * without it such a form can never be finished.
   */
  act(sessionId: string, action: SessionAction, ref?: string, request?: RequestOptions) {
    return this.http.post<TurnResult>(`/v1/sessions/${sessionId}/actions`, { action, ref }, request);
  }

  get(sessionId: string, request?: RequestOptions) {
    return this.http.get<Record<string, unknown>>(`/v1/sessions/${sessionId}`, undefined, request);
  }

  /** Events since a sequence number, for resuming after a gap. */
  events(sessionId: string, since = 0, request?: RequestOptions) {
    return this.http.get<{ events: SessionEvent[]; latest_seq: number; has_more: boolean }>(
      `/v1/sessions/${sessionId}/events`,
      { since },
      request,
    );
  }

  rotateToken(sessionId: string, request?: RequestOptions) {
    return this.http.post<{ respondentToken: string; rotatedAt: number }>(
      `/v1/sessions/${sessionId}/token/rotate`,
      undefined,
      request,
    );
  }
}
