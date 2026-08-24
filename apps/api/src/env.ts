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
  APP_ORIGIN: string;

  BETTER_AUTH_SECRET: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  RESEND_API_KEY?: string;
  DODO_API_KEY?: string;
  DODO_WEBHOOK_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  FILE_ENCRYPTION_KEY?: string;
  SIGNING_SALT: string;
}

export type Env = Bindings;
