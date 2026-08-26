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

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    start: text("start"),
    prefix: text("prefix"),
    key: text("key").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: ts("last_refill_at"),
    enabled: bool("enabled").default(true),
    rateLimitEnabled: bool("rate_limit_enabled").default(true),
    rateLimitMax: integer("rate_limit_max"),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    remaining: integer("remaining"),
    lastRequest: ts("last_request"),
    expiresAt: ts("expires_at"),
    permissions: text("permissions"),
    metadata: text("metadata"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
    // chatform extensions
    organizationId: text("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    scopes: text("scopes"),
    environment: text("environment").notNull().default("live"),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [index("idx_apikeys_user").on(t.userId), index("idx_apikeys_org").on(t.organizationId)],
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
    startedAt: ts("started_at").notNull().$defaultFn(() => new Date()),
    completedAt: ts("completed_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("idx_submissions_form_status").on(t.formId, t.status, t.startedAt),
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
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    lastActivityAt: ts("last_activity_at").notNull().$defaultFn(() => new Date()),
    expiresAt: ts("expires_at"),
  },
  (t) => [
    index("idx_chat_sessions_form_activity").on(t.formId, t.lastActivityAt),
    index("idx_chat_sessions_status").on(t.status),
    index("idx_chat_sessions_org_created").on(t.organizationId, t.createdAt),
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

export const formTemplates = sqliteTable("form_templates", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description"),
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

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  dodoProductId: text("dodo_product_id"),
  dodoPriceMonthlyId: text("dodo_price_monthly_id"),
  dodoPriceYearlyId: text("dodo_price_yearly_id"),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
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
    status: text("status").notNull().default("active"),
    currentPeriodStart: ts("current_period_start"),
    currentPeriodEnd: ts("current_period_end"),
    cancelAtPeriodEnd: bool("cancel_at_period_end").notNull().default(false),
    seats: integer("seats").notNull().default(1),
    metadata: text("metadata"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_subscriptions_org_status").on(t.organizationId, t.status)],
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
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_idem_endpoint_key_org").on(t.endpoint, t.requestHash, t.organizationId)],
);
