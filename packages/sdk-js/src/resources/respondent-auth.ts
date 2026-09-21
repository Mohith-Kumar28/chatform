import type { HttpClient, RequestOptions } from "../internal/http.js";
import type { RespondentAuthResult } from "../types/index.js";

/**
 * Proving who a respondent is, mid-conversation.
 *
 * You run the Google or Firebase flow in your own page and post the token it
 * produces here. Chatform never sends an SMS itself and never sees a password;
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
}
