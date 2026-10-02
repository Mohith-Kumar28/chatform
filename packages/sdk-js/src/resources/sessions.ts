import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { Body } from "../types/spec.js";
import type {
  AnswerValue,
  PaymentConfirmed,
  PaymentStarted,
  RotatedToken,
  SessionAction,
  SessionCreated,
  SessionEvents,
  SessionState,
  TurnProcessing,
  TurnResult,
} from "../types/index.js";
import { RespondentAuth } from "./respondent-auth.js";

export type CreateSessionOptions = Body<"/v1/forms/{id}/sessions", "post">;
export type { SessionAction };

/**
 * A turn's result. When it outran `deadlineMs` the API answers 202 with
 * `status: "processing"` and a `pollUrl`: nothing failed, the turn is still
 * running, and `events(sessionId, result.sinceSeq)` picks it up.
 */
export type TurnOutcome = TurnResult | TurnProcessing;

export class Sessions {
  /** Attaching a verified identity to a respondent, mid-conversation. */
  readonly auth: RespondentAuth;

  constructor(private readonly http: HttpClient) {
    this.auth = new RespondentAuth(http);
  }

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
    return this.http.request<TurnOutcome>("POST", `/v1/sessions/${sessionId}/messages`, {
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
    return this.http.request<TurnOutcome>("POST", `/v1/sessions/${sessionId}/messages`, {
      query: { deadlineMs: options.deadlineMs },
      body: { type: "structured", ...answer },
      options: request,
    });
  }

  /**
   * Skip, stop, restart, edit, submit — or settle a code step.
   *
   * `submit` matters more than it looks: forms show a review step by default, so
   * without it such a form can never be finished. `resend_code` and
   * `change_answer` are refused unless the turn before set `pendingVerification`.
   */
  act(sessionId: string, action: SessionAction, ref?: string, request?: RequestOptions) {
    return this.http.post<TurnOutcome>(`/v1/sessions/${sessionId}/actions`, { action, ref }, request);
  }

  /** Where the conversation stands, including any code or checkout it is waiting on. */
  get(sessionId: string, request?: RequestOptions) {
    return this.http.get<SessionState>(`/v1/sessions/${sessionId}`, undefined, request);
  }

  /** Events since a sequence number, for resuming after a gap. */
  events(sessionId: string, since = 0, request?: RequestOptions) {
    return this.http.get<SessionEvents>(
      `/v1/sessions/${sessionId}/events`,
      { since },
      request,
    );
  }

  rotateToken(sessionId: string, request?: RequestOptions) {
    return this.http.post<RotatedToken>(
      `/v1/sessions/${sessionId}/token/rotate`,
      undefined,
      request,
    );
  }

  /**
   * Settle a pending phone verification on a question.
   *
   * Deliberately not under `auth`. This attaches no identity and files nothing
   * under a respondent: it proves the phone number *answering a question* is
   * real, and the conversation moves on. It belongs beside
   * `act(sessionId, "resend_code")`, which is the other half of the same
   * moment.
   */
  verifyPhoneAnswer(sessionId: string, input: { idToken: string }, request?: RequestOptions) {
    return this.http.post<{ ok: boolean }>(`/v1/sessions/${sessionId}/verify/phone-token`, input, request);
  }

  /**
   * Open the gateway's checkout for the payment question the session is on.
   *
   * The amount comes from the form, never the caller. Hand `launch` to the
   * gateway in the respondent's browser; the session moves on when the gateway
   * confirms payment, which `confirmPayment()` asks it to do now.
   */
  startPayment(sessionId: string, input: Body<"/v1/sessions/{sid}/payments", "post">, request?: RequestOptions) {
    return this.http.post<PaymentStarted>(`/v1/sessions/${sessionId}/payments`, input, request);
  }

  /** Ask the gateway where a checkout stands, and settle it if it was paid. */
  confirmPayment(sessionId: string, recordId: string, request?: RequestOptions) {
    return this.http.post<PaymentConfirmed>(
      `/v1/sessions/${sessionId}/payments/${recordId}/confirm`,
      undefined,
      request,
    );
  }
}
