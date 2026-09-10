/// <reference types="@cloudflare/workers-types/2023-07-01" />

export interface Bindings {
  DB: D1Database;
  KV_CONFIG: KVNamespace;
  R2: R2Bucket;
  SESSION_DO: DurableObjectNamespace;
  Q_WEBHOOKS: Queue;
  Q_EXPORTS: Queue;
  Q_EMAIL: Queue;
  /**
   * Knowledge ingestion. Extraction, chunking and embedding all take far longer
   * than a request can wait — a single PDF is a `toMarkdown` call, an OCR
   * fallback and dozens of embedding calls — so the upload route registers a
   * row and hands the work to this queue.
   */
  Q_KNOWLEDGE: Queue;
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
  /**
   * The respondent surface, keyed by address rather than by key.
   *
   * `/p` has no API key to key on — that is the whole point of it — so these
   * three are the only limiters that surface has. Split by cost rather than by
   * route: a message turn may call a model, opening a session writes rows and
   * meters a response, and a sign-in fetches a JWKS document over the network.
   * One shared counter would have to be set for the most expensive of them.
   */
  RATE_LIMIT_P?: RateLimit;
  RATE_LIMIT_P_START?: RateLimit;
  RATE_LIMIT_P_AUTH?: RateLimit;
  /**
   * The builder's autosave, keyed by the author.
   *
   * The dashboard save path is the one write in the product that a client is
   * expected to call unprompted and repeatedly, and it was the only one with no
   * ceiling at all — `/v1`'s twin of it is burst-limited and metered, so the
   * cheaper path to the same row was the unmetered one. This bounds a runaway
   * client rather than a person: nobody editing a form reaches it.
   */
  RATE_LIMIT_SAVE?: RateLimit;
  WORKERS_AI?: Ai;
  /**
   * The knowledge base's vector index, one namespace per form.
   *
   * Optional for the same reason as `EMAIL`: Miniflare does not implement the
   * binding, so a hard dependency would fail the whole test suite rather than
   * degrade. `lib/knowledge` treats an absent binding as "retrieval is off",
   * which is also what a local dev run without a remote index should do.
   */
  VECTORIZE?: VectorizeIndex;
  /**
   * Which `KnowledgeStore` implementation to build — see `lib/knowledge/index.ts`.
   * Absent means `vectorize`, the only one currently shipped.
   */
  KNOWLEDGE_BACKEND?: string;
  /**
   * Cloudflare Email Service, bound directly rather than reached over HTTP.
   *
   * Optional because Miniflare does not implement the binding: local dev and the
   * test suite would fail on a hard dependency, so `sendMail` logs the message
   * instead when this is absent. That also means nothing developed locally can
   * accidentally mail a real customer.
   *
   * `RESEND_API_KEY` below is the deliberate second path — see `lib/mail.ts`.
   */
  EMAIL?: SendEmail;

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

  /**
   * The From address on everything we send. A bare address or `Name <addr>`.
   *
   * Its domain must be onboarded for Email Sending in the Cloudflare dashboard, or
   * every send fails `E_SENDER_NOT_VERIFIED`. Absent, `lib/mail.ts` derives
   * `noreply@<apex of APP_ORIGIN>`, which is right for the deployment we have and
   * wrong quietly enough that setting it explicitly is worth the variable.
   */
  EMAIL_FROM?: string;
  /** Where replies land. Absent, replies go to the From address. */
  EMAIL_REPLY_TO?: string;
  /**
   * The From address for marketing mail — follow-ups, and nothing else yet.
   *
   * A separate subdomain from the transactional sender so the two reputations
   * can be judged separately by receivers. See `MailClass` in `lib/mail.ts` for
   * why the two never share a pipe.
   */
  EMAIL_FROM_MARKETING?: string;
  /**
   * Which transport carries transactional mail: `auto` (default), `resend` or
   * `cloudflare`.
   *
   * A variable rather than a code path because the Cloudflare binding is in
   * beta with unpublished quotas that scale by reputation — the day that
   * becomes a problem for password resets, the fix should be one line here.
   * Marketing mail ignores it and always uses Resend.
   */
  MAIL_TRANSPORT?: string;

  /**
   * Who may open the platform console at `/admin` — a comma-separated list of
   * email addresses.
   *
   * A secret rather than a `users.role` column on purpose. This is the one
   * capability in the product that crosses every tenant boundary, and a column
   * would mean a stray `UPDATE`, a compromised row or a mis-scoped admin endpoint
   * could mint one. A worker secret can only be changed by somebody who can
   * already deploy. Absent, the console does not exist: `isPlatformAdmin` returns
   * false for everyone and every `/api/admin` route answers 404.
   */
  PLATFORM_ADMIN_EMAILS?: string;

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
  /**
   * Firebase project that carries every SMS in the product — phone sign-in at
   * the gate, and the code that confirms a `verify` phone answer. Firebase
   * sends and checks the message itself, which is why there is no number to
   * rent, no DLT registration and no SMS provider of ours anywhere; this
   * worker only verifies the resulting ID token, so the project id is all it
   * needs and there is no service-account key to keep. The browser needs the
   * matching `NEXT_PUBLIC_FIREBASE_*` set, and without them no phone number
   * can be proved at all.
   */
  FIREBASE_PROJECT_ID?: string;
  SIGNING_SALT: string;
}

export type Env = Bindings;
