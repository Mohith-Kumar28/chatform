import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

/** epoch-ms timestamp */
const ts = (name: string) => integer(name, { mode: "timestamp_ms" });
const bool = (name: string) => integer(name, { mode: "boolean" });

// ───────────────────────── Better Auth core ─────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: bool("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    activeOrganizationId: text("active_organization_id"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_sessions_user").on(t.userId), index("idx_sessions_expires").on(t.expiresAt)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    issuer: text("issuer"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_accounts_provider").on(t.providerId, t.accountId), index("idx_accounts_user").on(t.userId)],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").$defaultFn(() => new Date()),
  },
  (t) => [index("idx_verifications_identifier").on(t.identifier)],
);

// ─────────────────────── Better Auth organizations ───────────────────────

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
});

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_members_org_user").on(t.organizationId, t.userId), index("idx_members_user").on(t.userId)],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: ts("expires_at").notNull(),
    inviterId: text("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_invitations_org").on(t.organizationId), index("idx_invitations_email").on(t.email)],
);

// ─────────────────────── Better Auth API keys ───────────────────────

/**
 * API keys, owned by the `@better-auth/api-key` plugin.
 *
 * Exported as `apikeys`, not `apiKeys`, and that is load-bearing. The drizzle
 * adapter runs with `usePlural: true`, which appends an "s" to whatever model
 * name it resolves — so the plugin's model `apikey` finds `apikeys` with no
 * override at all, while a `modelName: "apiKeys"` override would resolve to
 * `apiKeyss` and throw at the first query.
 *
 * `user_id` is nullable because these keys belong to an organization: the
 * plugin writes `reference_id` and never a user. `created_by` keeps the thing
 * `user_id` actually meant — who minted it — and survives that person leaving.
 */
export const apikeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    /**
     * Which of the four key configurations minted this: sk_live (stored as the
     * literal `'default'`, because that config is the plugin's default one),
     * sk_test, pk_live, pk_test. Derive the display type from `prefix`, which is
     * stored in plaintext — not from this.
     */
    configId: text("config_id").notNull().default("default"),
    /** The owning organization id. Canonical for the plugin. */
    referenceId: text("reference_id").notNull(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull().unique(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Who minted the key. An org key outlives its creator's membership. */
    createdBy: text("created_by"),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: ts("last_refill_at"),
    enabled: bool("enabled").default(true),
    rateLimitEnabled: bool("rate_limit_enabled").default(true),
    rateLimitMax: integer("rate_limit_max"),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    /** Requests inside the current window. Written by the plugin on every verify. */
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: ts("last_request"),
    expiresAt: ts("expires_at"),
    permissions: text("permissions"),
    metadata: text("metadata"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
    /**
     * Mirror of `reference_id`, written by our own key routes.
     *
     * Kept because it is what carries `ON DELETE CASCADE` when an organization
     * is deleted, and what every org-scoped query and tenancy test already
     * reads. Single writer, so the two cannot drift.
     */
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    /** @deprecated legacy scope array, superseded by `permissions`. Read-only. */
    scopes: text("scopes"),
    environment: text("environment").notNull().default("live"),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [
    index("idx_apikeys_user").on(t.userId),
    index("idx_apikeys_org").on(t.organizationId),
    index("idx_apikeys_ref").on(t.referenceId),
    index("idx_apikeys_config").on(t.configId),
  ],
);

// ─────────────────────────── Product core ───────────────────────────

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdBy: text("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_workspaces_org_slug").on(t.organizationId, t.slug)],
);

export const forms = sqliteTable(
  "forms",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    status: text("status").notNull().default("draft"),
    activeVersionId: text("active_version_id"),
    workingSchema: text("working_schema").notNull(),
    themeJson: text("theme_json"),
    settingsJson: text("settings_json"),
    ogImageR2Key: text("og_image_r2_key"),
    closeAt: ts("close_at"),
    closedReason: text("closed_reason"),
    fingerprintSalt: text("fingerprint_salt").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("idx_forms_workspace").on(t.workspaceId),
    index("idx_forms_org").on(t.organizationId),
    index("idx_forms_status").on(t.status),
  ],
);

export const formVersions = sqliteTable(
  "form_versions",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    schemaJson: text("schema_json").notNull(),
    themeJson: text("theme_json"),
    settingsJson: text("settings_json"),
    checksum: text("checksum").notNull(),
    note: text("note"),
    publishedAt: ts("published_at"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_versions_form_version").on(t.formId, t.version), index("idx_versions_form_pub").on(t.formId, t.publishedAt)],
);

export const submissions = sqliteTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    formVersionId: text("form_version_id").references(() => formVersions.id),
    organizationId: text("organization_id").notNull(),
    sessionId: text("session_id"),
    status: text("status").notNull().default("in_progress"),
    searchText: text("search_text"),
    fingerprint: text("fingerprint"),
    hiddenFields: text("hidden_fields"),
    meta: text("meta"),
    /**
     * The verified respondent, when the form required sign-in. Denormalized
     * onto the submission rather than joined from the session, because
     * sessions are pruned and a submission has to stay attributable.
     */
    respondentProvider: text("respondent_provider"),
    respondentSubject: text("respondent_subject"),
    respondentEmail: text("respondent_email"),
    respondentPhone: text("respondent_phone"),
    respondentName: text("respondent_name"),
    /**
     * Which surface produced this response: the hosted/embedded chat, or the
     * developer API.
     *
     * The dashboard's funnel defaults to `chat` because that is what its numbers
     * have always meant — one bulk import through the API would otherwise move a
     * completion rate the customer reads as a product metric.
     */
    source: text("source").notNull().default("chat"),
    /**
     * Written by an API key minted with a `*_test_` prefix. Test rows are real
     * rows — same tables, same validation — but they are excluded from metering,
     * webhooks and analytics, and swept after a week. A test mode that only
     * changed a label would be a promise the product does not keep.
     */
    isTest: bool("is_test").notNull().default(false),
    /**
     * Last touch, answer or status change alike.
     *
     * Without it there is no `updated_since` filter, no cursor that can order by
     * recency, and no way to tell a partial that has settled from one being
     * written to right now — which is what the partial webhook throttles on.
     */
    updatedAt: ts("updated_at"),
    /**
     * When an unfinished API response should be abandoned. Null on the chat
     * path, where the session Durable Object's idle alarm owns that decision.
     */
    expiresAt: ts("expires_at"),
    /** Attribution, and what makes a leaked key's traffic identifiable. */
    apiKeyId: text("api_key_id"),
    /** Last time a `response.partial` webhook went out for this row. */
    partialNotifiedAt: ts("partial_notified_at"),
    startedAt: ts("started_at").notNull().$defaultFn(() => new Date()),
    completedAt: ts("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("idx_submissions_form_status").on(t.formId, t.status, t.startedAt),
    index("idx_submissions_form_updated").on(t.formId, t.updatedAt),
    index("idx_submissions_form_source").on(t.formId, t.source, t.startedAt),
    index("idx_submissions_expiry").on(t.status, t.expiresAt),
    index("idx_submissions_org_started").on(t.organizationId, t.startedAt),
    index("idx_submissions_form_fp").on(t.formId, t.fingerprint),
    // Backs `requireAuth.onePerIdentity`: one lookup, not a table scan.
    index("idx_submissions_form_respondent").on(t.formId, t.respondentProvider, t.respondentSubject),
  ],
);

export const submissionAnswers = sqliteTable(
  "submission_answers",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    formId: text("form_id").notNull(),
    blockRef: text("block_ref").notNull(),
    blockType: text("block_type").notNull(),
    valueJson: text("value_json").notNull(),
    valueNumber: real("value_number"),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_answers_sub_ref").on(t.submissionId, t.blockRef),
    index("idx_answers_form_ref").on(t.formId, t.blockRef),
  ],
);

/**
 * One-time codes for phone sign-in.
 *
 * Codes are stored hashed — a leaked read of this table must not let anyone
 * complete a challenge. Rows are consumed on success and swept by the existing
 * cron; `attempts` caps brute force at a handful of guesses per code, and
 * `sendCount` caps how many SMS one session can make us pay for.
 */
export const otpChallenges = sqliteTable(
  "otp_challenges",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    /** E.164. */
    destination: text("destination").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    sendCount: integer("send_count").notNull().default(1),
    consumedAt: ts("consumed_at"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_otp_session").on(t.sessionId, t.createdAt),
    index("idx_otp_expires").on(t.expiresAt),
  ],
);

export const chatSessions = sqliteTable(
  "chat_sessions",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    formVersionId: text("form_version_id").references(() => formVersions.id),
    organizationId: text("organization_id").notNull(),
    respondentTokenHash: text("respondent_token_hash").notNull().unique(),
    status: text("status").notNull().default("active"),
    currentBlockRef: text("current_block_ref"),
    currentIndex: integer("current_index"),
    collectedCount: integer("collected_count").notNull().default(0),
    turnCount: integer("turn_count").notNull().default(0),
    variablesJson: text("variables_json"),
    stateSnapshotJson: text("state_snapshot_json"),
    tokenUsageJson: text("token_usage_json"),
    submissionId: text("submission_id"),
    ipHash: text("ip_hash"),
    country: text("country"),
    hiddenFields: text("hidden_fields"),
    meta: text("meta"),
    /** JSON `RespondentIdentity`, set once the sign-in gate is satisfied. */
    respondentIdentity: text("respondent_identity"),
    /** `chat` | `embed` | `api` — mirrors `submissions.source`. */
    source: text("source").notNull().default("chat"),
    /** Set when the session was opened with a `*_test_` API key. */
    isTest: bool("is_test").notNull().default(false),
    /** Last respondent-token rotation, for the audit trail. */
    tokenRotatedAt: ts("token_rotated_at"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    lastActivityAt: ts("last_activity_at").notNull().$defaultFn(() => new Date()),
    expiresAt: ts("expires_at"),
  },
  (t) => [
    index("idx_chat_sessions_form_activity").on(t.formId, t.lastActivityAt),
    index("idx_chat_sessions_status").on(t.status),
    index("idx_chat_sessions_org_created").on(t.organizationId, t.createdAt),
    index("idx_chat_sessions_expiry").on(t.status, t.expiresAt),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => chatSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    blockRef: text("block_ref"),
    content: text("content").notNull(),
    meta: text("meta"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_chat_messages_session").on(t.sessionId, t.createdAt)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    formId: text("form_id"),
    sessionId: text("session_id"),
    uploadedBy: text("uploaded_by").notNull().default("respondent"),
    uploaderUserId: text("uploader_user_id"),
    r2Key: text("r2_key").notNull().unique(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: text("checksum_sha256"),
    status: text("status").notNull().default("pending"),
    rejectReason: text("reject_reason"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    confirmedAt: ts("confirmed_at"),
  },
  (t) => [index("idx_files_session").on(t.sessionId), index("idx_files_status_created").on(t.status, t.createdAt)],
);

// ───────────────────────── Webhooks & integrations ─────────────────────────

export const webhooks = sqliteTable(
  "webhooks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    formId: text("form_id").references(() => forms.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: text("events").notNull(),
    active: bool("active").notNull().default(true),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_webhooks_org").on(t.organizationId), index("idx_webhooks_form").on(t.formId)],
);

export const webhookDeliveries = sqliteTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: text("payload").notNull(),
    /**
     * The original queue message, verbatim.
     *
     * The retry sweep used to rebuild a message from the delivery row and got it
     * wrong — it hardcoded `submission.completed` and dropped the submission id,
     * so a retried abandonment was redelivered as a completion with no payload.
     * Storing the message means a retry re-sends what was actually sent.
     */
    messageJson: text("message_json"),
    attempt: integer("attempt").notNull().default(0),
    status: text("status").notNull().default("pending"),
    responseStatus: integer("response_status"),
    lastError: text("last_error"),
    nextRetryAt: ts("next_retry_at"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_wh_deliveries_webhook").on(t.webhookId, t.createdAt),
    index("idx_wh_deliveries_retry").on(t.status, t.nextRetryAt),
  ],
);

export const integrations = sqliteTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    formId: text("form_id").references(() => forms.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    configJson: text("config_json").notNull(),
    status: text("status").notNull().default("connected"),
    lastError: text("last_error"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_integrations_org").on(t.organizationId)],
);

/**
 * The template catalogue.
 *
 * This table was declared with the first migration and then never read or
 * written — the four templates the product shipped with lived in a `SEEDS`
 * array inside the route that served them. Templates are content, and content
 * belongs in the database, so the route reads from here now and the array is
 * gone.
 *
 * The presentation columns (`blurb` through `block_count`) exist because a
 * gallery needs more than a title to be worth browsing: a longer description
 * for the preview panel, an icon and an accent so thirty cards are not thirty
 * grey rectangles, and the size of the form so someone can tell a three-
 * question survey from a twelve-question intake before opening it.
 *
 * `block_count` and `est_minutes` are denormalised from `schema_json` on
 * purpose — the list endpoint would otherwise parse every document to render
 * a grid. The generator computes both, so they cannot be set by hand and
 * cannot drift from the document they describe.
 */
export const formTemplates = sqliteTable("form_templates", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  /** Two or three sentences, for the preview panel. */
  blurb: text("blurb"),
  /** JSON array of strings. */
  tags: text("tags"),
  /** A key into the frontend icon registry. */
  icon: text("icon"),
  /** A `--family-*` accent key. */
  accent: text("accent"),
  estMinutes: integer("est_minutes"),
  blockCount: integer("block_count"),
  schemaJson: text("schema_json").notNull(),
  thumbnailR2Key: text("thumbnail_r2_key"),
  official: bool("official").notNull().default(false),
  organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  usageCount: integer("usage_count").notNull().default(0),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
});

export const aiGenerations = sqliteTable(
  "ai_generations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    userId: text("user_id"),
    sessionId: text("session_id"),
    formId: text("form_id"),
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsdMicro: integer("cost_usd_micro").notNull().default(0),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull().default("ok"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_ai_gen_org_created").on(t.organizationId, t.createdAt), index("idx_ai_gen_kind").on(t.kind, t.createdAt)],
);

// ─────────────────────────── Billing & usage ───────────────────────────

/**
 * The plan catalogue, seeded from `@repo/entitlements` — see `tooling/seed-plans.sql`.
 *
 * A Dodo subscription product carries its own billing frequency, so there is no separate
 * price object: a monthly plan and a yearly plan are two *products*. The
 * `dodo_price_*_id` columns below are the old, wrongly-named version of that idea; they
 * are unused and a later migration drops them (D1 migrations are forward-only and SQLite
 * column drops are awkward, so they linger rather than churn a migration).
 */
export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  /** Mirrors `id`; kept so a rename of the primary key never breaks the catalogue join. */
  slug: text("slug"),
  name: text("name").notNull(),
  dodoProductId: text("dodo_product_id"),
  /** @deprecated superseded by `dodoProductMonthlyId` */
  dodoPriceMonthlyId: text("dodo_price_monthly_id"),
  /** @deprecated superseded by `dodoProductYearlyId` */
  dodoPriceYearlyId: text("dodo_price_yearly_id"),
  dodoProductMonthlyId: text("dodo_product_monthly_id"),
  dodoProductYearlyId: text("dodo_product_yearly_id"),
  seatAddonProductId: text("seat_addon_product_id"),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  /** Total charged once a year, not the per-month equivalent. */
  priceYearlyCents: integer("price_yearly_cents").notNull().default(0),
  /** Per extra seat above the plan's included count; 0 when extras are not sold. */
  seatPriceCents: integer("seat_price_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  /** `FeatureKey[]` as JSON. Booleans the plan grants. */
  featuresJson: text("features_json").notNull().default("[]"),
  /** `Record<LimitKey, number | null>` as JSON. Quantities the plan allows. */
  limitsJson: text("limits_json").notNull(),
  isActive: bool("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const dodoCustomers = sqliteTable("dodo_customers", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().unique().references(() => organizations.id, { onDelete: "cascade" }),
  dodoCustomerId: text("dodo_customer_id").notNull().unique(),
  billingEmail: text("billing_email"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
});

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    planId: text("plan_id").notNull().references(() => plans.id),
    dodoSubscriptionId: text("dodo_subscription_id").notNull().unique(),
    dodoProductId: text("dodo_product_id"),
    dodoCustomerId: text("dodo_customer_id"),
    cycle: text("cycle").notNull().default("monthly"),
    status: text("status").notNull().default("active"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: bool("cancel_at_period_end").notNull().default(false),
    trialEndsAt: ts("trial_ends_at"),
    /**
     * How long a failed renewal keeps its paid entitlements. Dodo's dunning retries a
     * declining card for days; revoking a paying customer's analytics the instant their
     * card blips is how you manufacture churn. Set by the webhook on the first failure.
     */
    graceUntil: ts("grace_until"),
    /** A downgrade Dodo will apply at the period boundary, not now. */
    scheduledPlanId: text("scheduled_plan_id"),
    scheduledAt: ts("scheduled_at"),
    seats: integer("seats").notNull().default(1),
    metadata: text("metadata"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_subscriptions_org_status").on(t.organizationId, t.status)],
);

/**
 * Per-org grants that beat the plan — comps, enterprise deals, "we bumped you to 500
 * this month while you evaluate". Keeps one-off arrangements out of the plan catalogue.
 */
export const entitlementOverrides = sqliteTable(
  "entitlement_overrides",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    /** `feature` | `limit` */
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    /** `"true"`/`"false"` for features; a decimal string or `""` (unlimited) for limits. */
    value: text("value").notNull(),
    reason: text("reason"),
    expiresAt: ts("expires_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_override_org_key").on(t.organizationId, t.kind, t.key)],
);

/**
 * Which lock an org hit, how many times, and whether they then bought — the conversion
 * funnel. One row per (org, feature); high-volume per-evaluation telemetry goes to
 * Analytics Engine instead, and anything a human needs to audit goes to `audit_logs`.
 */
export const featureAccessLog = sqliteTable(
  "feature_access_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    feature: text("feature").notNull(),
    /** Where they hit it: "results.partial", "publish", "design.branding". */
    surface: text("surface"),
    firstDeniedAt: ts("first_denied_at").notNull(),
    lastDeniedAt: ts("last_denied_at").notNull(),
    denialCount: integer("denial_count").notNull().default(1),
    convertedAt: ts("converted_at"),
  },
  (t) => [uniqueIndex("uq_fal_org_feature").on(t.organizationId, t.feature)],
);

export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  subscriptionId: text("subscription_id"),
  dodoPaymentId: text("dodo_payment_id").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull(),
  invoiceUrl: text("invoice_url"),
  paidAt: ts("paid_at"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
});

export const dodoEvents = sqliteTable("dodo_events", {
  id: text("id").primaryKey(),
  dodoEventId: text("dodo_event_id").notNull().unique(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  processedAt: ts("processed_at"),
  status: text("status").notNull().default("received"),
  error: text("error"),
  createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
});

export const usageCounters = sqliteTable(
  "usage_counters",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    metric: text("metric").notNull(),
    used: integer("used").notNull().default(0),
    limitOverride: integer("limit_override"),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_usage_org_period_metric").on(t.organizationId, t.period, t.metric)],
);

// ──────────────────────── Analytics & audit ────────────────────────

export const analyticsRollupDaily = sqliteTable(
  "analytics_rollup_daily",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    views: integer("views").notNull().default(0),
    sessionsStarted: integer("sessions_started").notNull().default(0),
    sessionsCompleted: integer("sessions_completed").notNull().default(0),
    avgCompletionMs: integer("avg_completion_ms"),
    medianCompletionMs: integer("median_completion_ms"),
    p90CompletionMs: integer("p90_completion_ms"),
    perBlockJson: text("per_block_json"),
  },
  (t) => [uniqueIndex("uq_rollup_date_form").on(t.date, t.formId), index("idx_rollup_form_date").on(t.formId, t.date)],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    meta: text("meta"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_audit_org_created").on(t.organizationId, t.createdAt), index("idx_audit_resource").on(t.resourceType, t.resourceId)],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    endpoint: text("endpoint").notNull(),
    /**
     * The caller's `Idempotency-Key` header, not a hash of anything.
     *
     * The column name predates the feature and is left alone: renaming a column
     * in D1 means a table rebuild, which is not worth it for a name. `bodyHash`
     * below is the actual digest, and comparing it is what turns "same key,
     * different request" into an error instead of a wrong replay.
     */
    requestHash: text("request_hash").notNull(),
    bodyHash: text("body_hash"),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    expiresAt: ts("expires_at"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_idem_endpoint_key_org").on(t.endpoint, t.requestHash, t.organizationId),
    index("idx_idem_expires").on(t.expiresAt),
  ],
);

/**
 * Asynchronous response exports.
 *
 * The synchronous CSV route is fine for a dashboard click on a few hundred rows
 * and wrong for an API caller with a hundred thousand: a Worker has a wall-clock
 * budget and the caller has a timeout. `Q_EXPORTS` has been declared with a
 * consumer since the beginning and has never had a producer — this is it.
 */
export const exports = sqliteTable(
  "exports",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    /** Who asked. A user id for a dashboard export, an api key id for a programmatic one. */
    requestedBy: text("requested_by"),
    actorType: text("actor_type").notNull().default("user"),
    format: text("format").notNull().default("csv"),
    /** The query this export froze, so a re-run means the same thing. */
    filtersJson: text("filters_json"),
    status: text("status").notNull().default("queued"),
    r2Key: text("r2_key"),
    rowCount: integer("row_count"),
    bytes: integer("bytes"),
    error: text("error"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    completedAt: ts("completed_at"),
    /** Exports hold respondent data, so they are not kept indefinitely. */
    expiresAt: ts("expires_at"),
  },
  (t) => [
    index("idx_exports_org_created").on(t.organizationId, t.createdAt),
    index("idx_exports_expiry").on(t.status, t.expiresAt),
  ],
);
