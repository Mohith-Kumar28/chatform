import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { EmailCodeSent, RespondentAuthResult } from "../types/index.js";

/**
 * Proving who a respondent is, mid-conversation.
 *
 * You run the Google or Firebase flow in your own page and post the token it
 * produces here, or drive the emailed code from your own UI. Chatform never sends an SMS itself and never sees a password;
 * what arrives is an identity token somebody else already checked.
 *
 * Reached as `chatform.sessions.auth`, and available on the browser client too,
 * because that is where the token is minted.
 */
export class RespondentAuth {
  constructor(private readonly http: HttpClient) {}

  /** Attach a Google identity to the session. */
  google(sessionId: string, input: { idToken: string }, request?: RequestOptions) {
    return this.http.post<RespondentAuthResult>(`/v1/sessions/${sessionId}/auth/google`, input, request);
  }

  /** Attach a phone identity, from a Firebase phone sign-in. */
  phone(sessionId: string, input: { idToken: string }, request?: RequestOptions) {
    return this.http.post<RespondentAuthResult>(`/v1/sessions/${sessionId}/auth/phone/token`, input, request);
  }

  /**
   * Email sign-in, in two steps: a six-digit code to the address, then the
   * code back. Five sends per session, ten minutes to use each code. Refused
   * with `email_signin_off` on a form that does not sign in by email.
   */
  readonly email = {
    start: (sessionId: string, input: { email: string }, request?: RequestOptions) =>
      this.http.post<EmailCodeSent>(`/v1/sessions/${sessionId}/auth/email/start`, input, request),
    verify: (sessionId: string, input: { code: string }, request?: RequestOptions) =>
      this.http.post<RespondentAuthResult>(`/v1/sessions/${sessionId}/auth/email/verify`, input, request),
  };
}
