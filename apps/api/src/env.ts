/// <reference types="@cloudflare/workers-types/2023-07-01" />

export interface Bindings {
  DB: D1Database;
  KV_CONFIG: KVNamespace;
  R2: R2Bucket;
  SESSION_DO: DurableObjectNamespace;
  Q_WEBHOOKS: Queue;
  Q_EXPORTS: Queue;
  ANALYTICS: AnalyticsEngineDataset;
  /** Per-request API telemetry. Optional: Miniflare does not always provide it. */
  ANALYTICS_API?: AnalyticsEngineDataset;
  /**
   * Burst limiters, keyed by the presented key's digest and by IP.
   *
   * Optional because the `ratelimits` binding is not implemented by every local
   * runtime — a hard dependency here would fail the whole test suite rather than
   * degrade.
   */
  RATE_LIMIT?: RateLimit;
  RATE_LIMIT_PK?: RateLimit;
  WORKERS_AI?: Ai;

  ENVIRONMENT: string;
  /**
   * This API's own public origin. Better Auth uses it as `baseURL`, so it must be where
   * the API actually answers — not where the browser app lives.
   */
  APP_ORIGIN: string;
/**
   * Comma-separated list of browser origins allowed to drive this API — the deployed web
   * app and a local dev one at the same time, so both work against one deployed API with
   * no redeploy between them. The first entry is the default redirect target.
   *
   * Separate from `APP_ORIGIN` because the two are only the same thing while the API and
   * the web app share a host. A single variable serving both sends paying customers to a
   * 404 on the API domain. See `lib/origins.ts`.
   */
  WEB_ORIGINS?: string;
  /** @deprecated single-value predecessor of `WEB_ORIGINS`; still honoured as a fallback. */
  WEB_ORIGIN?: string;

  BETTER_AUTH_SECRET: string;
  OPENROUTER_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  RESEND_API_KEY?: string;
  DODO_API_KEY?: string;
  DODO_WEBHOOK_SECRET?: string;
  /** "test" | "live". Absent means test — a missing variable must not charge real cards. */
  DODO_ENVIRONMENT?: string;
  TURNSTILE_SECRET_KEY?: string;
  FILE_ENCRYPTION_KEY?: string;

  /**
   * Google client for RESPONDENT sign-in on a public form — the Google Identity Services
   * button in the chat, verified as an ID token by `verifyGoogleIdToken`.
   *
   * Only the id, never a secret: GIS is a browser flow with no code exchange, and the web
   * app ships the same value as `NEXT_PUBLIC_GOOGLE_RESPONDENT_CLIENT_ID` to draw the button.
   */
  GOOGLE_RESPONDENT_CLIENT_ID?: string;
  /**
   * Google client for DASHBOARD sign-in — Better Auth's `socialProviders.google`, the
   * server-side authorization-code flow behind "Continue with Google" on /signin.
   *
   * Deliberately a different Google client from `GOOGLE_RESPONDENT_CLIENT_ID` above.
   * `verifyGoogleIdToken` accepts any token whose `aud` equals the respondent client id, so
   * one shared client would make a token minted for a dashboard sign-in also valid as a
   * respondent identity on every form that gates on Google. Two clients keep those
   * audiences apart — which is what the two names are for.
   *
   * Both halves must be present or the provider stays unregistered: a client id with no
   * secret cannot complete the code exchange, so a half-configured pair would render the
   * button and then fail the callback.
   */
  GOOGLE_DASHBOARD_CLIENT_ID?: string;
  GOOGLE_DASHBOARD_CLIENT_SECRET?: string;
  /** SMS for phone OTP. Absent in dev, where codes are logged instead of sent. */
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  SIGNING_SALT: string;
}

export type Env = Bindings;
