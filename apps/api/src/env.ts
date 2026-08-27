/// <reference types="@cloudflare/workers-types/2023-07-01" />

export interface Bindings {
  DB: D1Database;
  KV_CONFIG: KVNamespace;
  R2: R2Bucket;
  SESSION_DO: DurableObjectNamespace;
  Q_SUBMISSIONS: Queue;
  Q_WEBHOOKS: Queue;
  Q_EXPORTS: Queue;
  ANALYTICS: AnalyticsEngineDataset;
  RATE_LIMIT: RateLimit;
  WORKERS_AI?: Ai;

  ENVIRONMENT: string;
  /**
   * This API's own public origin. Better Auth uses it as `baseURL`, so it must be where
   * the API actually answers — not where the browser app lives.
   */
  APP_ORIGIN: string;
  /**
   * Where the browser app lives, for anything a customer is redirected back to: the
   * post-checkout return, the cancel URL, the billing portal's "back to" link.
   *
   * Separate from `APP_ORIGIN` because the two are only the same thing while the API and
   * the web app share a host. They stopped being the same the moment the API was deployed
   * to workers.dev with the app still on another origin, and a single variable serving both
   * silently sends paying customers to a 404 on the API domain. Falls back to APP_ORIGIN
   * when unset, so a single-origin deployment needs no extra configuration.
   */
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

  /** Respondent sign-in. Public — the client needs it to render the Google button. */
  GOOGLE_CLIENT_ID?: string;
  /** SMS for phone OTP. Absent in dev, where codes are logged instead of sent. */
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM?: string;
  SIGNING_SALT: string;
}

export type Env = Bindings;
