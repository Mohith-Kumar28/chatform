import { integer, primaryKey, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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
  /**
   * The sender's physical postal address, for the footer of marketing mail.
   *
   * Required by CAN-SPAM on any commercial message, which is what a follow-up
   * to somebody who abandoned a form is — the transactional exemption is a
   * closed list and none of it covers a transaction the recipient never agreed
   * to enter into. Null until the customer fills it in, and the follow-up
   * feature will not turn on without it.
   */
  postalAddress: text("postal_address"),
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

/**
 * What changed in a form, and when — the builder's history.
 *
 * Separate from `audit_logs` on purpose. That table answers "who did what in this
 * organization", is read by an admin, and is gated at Business. This one answers "what
 * happened to *this form*", is read by whoever is building it, and is free: it is the
 * safety net under the editor, and charging for undo makes people afraid to edit.
 *
 * One row is one sitting, not one autosave. `changes` holds the semantic diff and
 * later saves from the same author merge into it while it is still open, so a minute
 * of typing is one entry rather than twelve.
 *
 * `form_version_id` is null until the work ships. Publishing stamps every open row
 * with the version it went out in, which is what turns a flat log into a changelog:
 * the null rows are "unpublished changes", and the stamped ones group under the
 * version they produced.
 */
export const formActivity = sqliteTable(
  "form_activity",
  {
    id: text("id").primaryKey(),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull(),
    /** The publish this work shipped in. Null while it is still only a draft change. */
    formVersionId: text("form_version_id").references(() => formVersions.id, { onDelete: "set null" }),
    /** "created" | "edited" | "published" | "restored" | "unpublished" | "closed" | "reopened" */
    kind: text("kind").notNull(),
    actorType: text("actor_type").notNull().default("user"),
    actorId: text("actor_id"),
    actorLabel: text("actor_label"),
    /** Which surface made the change: "builder", "api", "ai", "template", "system". */
    source: text("source").notNull().default("builder"),
    /** One human sentence, computed at write time so a list render needs no diff logic. */
    summary: text("summary").notNull(),
    /** The `DocChange[]` from `@repo/form-schema`, as JSON. Null for non-edit kinds. */
    changes: text("changes"),
    changeCount: integer("change_count").notNull().default(0),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    /** Bumped when a later save merges into this row. Ordering uses `created_at`. */
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_activity_form_created").on(t.formId, t.createdAt),
    index("idx_activity_form_version").on(t.formId, t.formVersionId),
  ],
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
    /**
     * Answering time, accumulated across sittings.
     *
     * `duration_ms` is `now - started_at`, which was right while a response
     * could only be finished in one go. A follow-up can bring someone back
     * three days later, and wall clock would then report a three-day
     * completion — in the completion-time analytics a customer pays to read.
     * This carries the time actually spent in the conversation so the
     * abandonment gap can be excluded.
     */
    activeMs: integer("active_ms").notNull().default(0),
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
    /**
     * Backs the `unique` block flag: "has anybody already given this answer?"
     *
     * Declared `COLLATE NOCASE` in the migration, which is what lets the lookup
     * seek rather than read every answer this question has ever collected —
     * "Team Alpha" and "team alpha" are the same name, and a `lower()` in the
     * predicate would rule the index out. Drizzle has no collation on an index
     * column, so `0011_unique_answers.sql` is the authority for this one; the
     * entry here exists so `drizzle-kit` does not propose dropping it.
     */
    index("idx_answers_unique_lookup").on(t.formId, t.blockRef, t.valueJson),
  ],
);

/**
 * One-time codes, for a respondent signing in and for an answer proving itself.
 *
 * Codes are stored hashed — a leaked read of this table must not let anyone
 * complete a challenge. Rows are consumed on success and swept by the existing
 * cron; `attempts` caps brute force at a handful of guesses per code, and
 * `sendCount` caps how many messages one session can make us pay for.
 */
export const otpChallenges = sqliteTable(
  "otp_challenges",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    /**
     * What this code proves: `auth` for the sign-in gate, `block:<ref>` for a
     * `verify` email or phone answer. One session can have a live challenge in
     * each, and each verifies only against its own — see `0019`.
     */
    scope: text("scope").notNull().default("auth"),
    /** How it was sent. Decides the resend the respondent is offered. */
    channel: text("channel", { enum: ["sms", "email"] }).notNull().default("sms"),
    /** E.164 for `sms`, an address for `email`. */
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
    index("idx_otp_session_scope").on(t.sessionId, t.scope, t.createdAt),
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
    /**
     * The respondent asked for this attempt to begin from nothing.
     *
     * Set by "Start over". The device match is declined at creation time, but a
     * gated form only learns who it is talking to when they sign in — several
     * turns later — and the identity lookup would then hand back the very
     * response they had just asked to leave. This is how that later moment
     * knows what the earlier one decided.
     */
    startedOver: bool("started_over").notNull().default(false),
    /** `chat` | `embed` | `api` — mirrors `submissions.source`. */
    source: text("source").notNull().default("chat"),
    /** Set when the session was opened with a `*_test_` API key. */
    isTest: bool("is_test").notNull().default(false),
    /** Last respondent-token rotation, for the audit trail. */
    tokenRotatedAt: ts("token_rotated_at"),
    /**
     * The respondent declined follow-up emails when we asked for their address.
     *
     * Lives on the session rather than the response because the offer is made
     * as the address question is shown, which can be before a response row
     * exists — answers create it lazily.
     */
    followupOptOut: bool("followup_opt_out").notNull().default(false),
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

// ───────────────────────── Knowledge base ─────────────────────────

/**
 * One row per thing an author added to a form's knowledge base.
 *
 * This is the app's table, not the retrieval backend's: the builder lists it,
 * the plan caps meter it, and `status` is what tells an author their upload is
 * still being read — or could not be read at all. A knowledge base that
 * silently indexes nothing is the failure mode this column exists to prevent.
 *
 * Deliberately NOT part of the form document. Knowledge used to live in
 * `settings.agent.knowledge`, which meant it was versioned and republished with
 * the form and capped at what fits in a system prompt. A 200-page PDF is not a
 * document field.
 *
 * `organization_id` is carried even though `form_id` implies it, so a
 * workspace-level library later is a join table rather than a backfill.
 */
export const knowledgeSources = sqliteTable(
  "knowledge_sources",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    formId: text("form_id").notNull().references(() => forms.id, { onDelete: "cascade" }),
    /** How it arrived: file | text | link | image | audio | crawl. */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** The URL it came from, or the original filename. */
    origin: text("origin"),
    /**
     * The uploaded bytes, when there are any.
     *
     * No FK on purpose, matching `files` itself: that table is the only index
     * of what is in R2, so it outlives the rows that reference it and is
     * cleared last by the sweep.
     */
    fileId: text("file_id"),
    /**
     * Extraction input for sources that never touch R2 — pasted text, and the
     * knowledge the template and demo generators seed. Seeded rows cannot
     * carry embeddings (seed SQL runs nowhere near Workers AI), so they land
     * here as `pending` and the ingest sweep picks them up.
     */
    rawText: text("raw_text"),
    /** The retrieval backend's own handle, when it has one. Unused by Vectorize. */
    externalId: text("external_id"),
    /** pending | extracting | indexing | ready | failed */
    status: text("status").notNull().default("pending"),
    /** Why it failed, in words an author can act on. */
    error: text("error"),
    bytes: integer("bytes").notNull().default(0),
    chunkCount: integer("chunk_count").notNull().default(0),
    /** Of the extracted text, so re-adding the same document is a no-op. */
    checksumSha256: text("checksum_sha256"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    indexedAt: ts("indexed_at"),
  },
  (t) => [
    index("idx_knowledge_sources_form").on(t.formId),
    // The ingest sweep's query: everything stuck in a non-terminal state,
    // oldest first.
    index("idx_knowledge_sources_status").on(t.status, t.createdAt),
  ],
);

/**
 * One row per chunk, and the text behind one vector.
 *
 * Owned by the Vectorize adapter — a backend that chunks for us (Supermemory
 * does) simply leaves this empty. The text lives here rather than in vector
 * metadata because Vectorize allows 10 KiB of metadata per vector and indexes
 * only the first 64 bytes of a string, so metadata carries the form and source
 * ids for filtering and nothing else.
 *
 * `id` is also the vector id, which is what makes deletion possible: Vectorize
 * deletes by id, so the mapping has to be durable somewhere we control.
 */
export const knowledgeChunks = sqliteTable(
  "knowledge_chunks",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull().references(() => knowledgeSources.id, { onDelete: "cascade" }),
    formId: text("form_id").notNull(),
    /** Position within the source, so retrieved passages can be read in order. */
    ordinal: integer("ordinal").notNull(),
    text: text("text").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_knowledge_chunks_source").on(t.sourceId), index("idx_knowledge_chunks_form").on(t.formId)],
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
    /**
     * SHA-256 of the integration's own token, when it has one.
     *
     * The spreadsheet feed is addressed by an unguessable URL and by nothing
     * else — Google Sheets refreshes it on a schedule, with no cookie and no
     * header to carry — so the token needs an indexed, constant-shape lookup.
     * Hashing it means the column that is queried is not the column that would
     * hand someone the feed if the table ever leaked.
     */
    secretHash: text("secret_hash"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_integrations_org").on(t.organizationId),
    index("idx_integrations_form").on(t.formId, t.provider),
    uniqueIndex("idx_integrations_secret").on(t.secretHash),
  ],
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

/**
 * The platform's own numbers, pre-aggregated by the cron — the super-admin console's
 * read path.
 *
 * Deliberately long and narrow: `(date, metric, dimension) → value`. Everything else
 * in this file names its columns, and that is right for a table someone joins against;
 * this one exists because the list of things a founder wants to watch changes weekly
 * and a column per measure would mean a migration per question. `dimension` is `''`
 * for a plain daily total and carries the breakout otherwise — a plan id, a block
 * type, a model slug, a response source.
 *
 * `WITHOUT ROWID` in `0014_platform_metrics.sql`, which drizzle cannot express: the
 * whole row is the key plus one number, so the extra rowid indirection is pure cost.
 */
export const platformMetricsDaily = sqliteTable(
  "platform_metrics_daily",
  {
    /** `YYYY-MM-DD`, UTC. */
    date: text("date").notNull(),
    metric: text("metric").notNull(),
    dimension: text("dimension").notNull().default(""),
    value: real("value").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.date, t.metric, t.dimension] }),
    index("idx_pmd_metric_date").on(t.metric, t.date),
  ],
);

/**
 * What people are actually asking in their forms.
 *
 * Questions live inside `forms.working_schema` as a JSON document, so "which question
 * is most common" cannot be asked in SQL. This is that answer, rebuilt daily by
 * walking the documents in batches.
 *
 * Keyed on the normalised text so "What's your email?" and "what's your email?" are
 * one row. `org_count` is what makes a row safe to read as a product signal rather
 * than a peek at one customer's form: a question thirty accounts ask is a pattern.
 */
export const platformQuestionStats = sqliteTable(
  "platform_question_stats",
  {
    /** Lowercased, whitespace-collapsed, punctuation-trimmed question title. */
    normText: text("norm_text").primaryKey(),
    /** One real casing, so the console renders what somebody wrote. */
    sampleText: text("sample_text").notNull(),
    blockType: text("block_type").notNull(),
    formCount: integer("form_count").notNull().default(0),
    orgCount: integer("org_count").notNull().default(0),
    updatedAt: ts("updated_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [index("idx_pqs_forms").on(t.formCount)],
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

/**
 * Scheduled nudges for a response somebody walked away from.
 *
 * One row per nudge, written the moment a response is abandoned and picked up
 * by the cron that already runs every five minutes. A row rather than a delayed
 * queue message because Cloudflare Queues caps `delaySeconds` at twelve hours
 * and this cadence runs to days — and because a row can be cancelled when the
 * respondent comes back, shown in the results table, and re-checked at send
 * time against settings that changed after it was scheduled. An in-flight
 * message can do none of those.
 */
export const followups = sqliteTable(
  "followups",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
    formId: text("form_id").notNull(),
    organizationId: text("organization_id").notNull(),
    /**
     * `email` today. The column exists so WhatsApp and SMS are additive rather
     * than a migration — neither is built, and both are blocked on approvals
     * outside this codebase.
     */
    channel: text("channel").notNull().default("email"),
    /**
     * Snapshotted when the nudge is scheduled, never re-resolved at send time.
     * Editing the form hours later must not be able to redirect mail that is
     * already queued at somebody's address.
     */
    address: text("address").notNull(),
    /** `identity` | `answer` | `contact_info` | `hidden` — for the audit trail. */
    addressSource: text("address_source").notNull(),
    /** 1-based position in the configured sequence. */
    step: integer("step").notNull(),
    /**
     * `scheduled` | `queued` | `sent` | `skipped` | `cancelled` | `failed` | `holdout`
     *
     * `queued` sits between `scheduled` and `sent`: handed to the mail queue,
     * not yet delivered. The sweep only ever picks up `scheduled`, so this is
     * also what stops a message in flight from being enqueued a second time.
     */
    status: text("status").notNull().default("scheduled"),
    /** Why it was skipped or cancelled, in words the results table can show. */
    reason: text("reason"),
    scheduledAt: ts("scheduled_at").notNull(),
    sentAt: ts("sent_at"),
    /**
     * When the resume link in this message was opened.
     *
     * Set once and never moved. A second visit from the same message is the
     * same recovery, and overwriting would drag the click into whichever day
     * the respondent last happened to reopen their inbox.
     */
    clickedAt: ts("clicked_at"),
    /**
     * When the response this message was about was finally completed.
     *
     * Credited to the most recently *clicked* step rather than to every step
     * that was sent, so a sequence of three cannot claim three recoveries for
     * one person.
     */
    recoveredAt: ts("recovered_at"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    /**
     * Scheduling is idempotent. `INSERT … ON CONFLICT DO NOTHING` against this
     * is what makes `scheduleFollowUps` safe to call twice — the same defence
     * `openResponse` already uses for the submission row itself.
     */
    uniqueIndex("uq_followups_submission_step").on(t.submissionId, t.step),
    /** The sweep's only query. */
    index("idx_followups_due").on(t.status, t.scheduledAt),
    /** Cancelling on completion or resume, and the results table's badge. */
    index("idx_followups_submission").on(t.submissionId),
    /** The recovery report, which groups one form's rows by step. */
    index("idx_followups_form_step").on(t.formId, t.step),
  ],
);

/**
 * Addresses that must not be mailed.
 *
 * `organizationId` null means global, and that nullability is the whole design:
 * a hard bounce or a spam complaint is a fact about an address and applies
 * everywhere, while somebody opting out of one customer's nudges has said
 * nothing about anybody else's. Collapsing the two would either leak one
 * customer's unsubscribes into another's list or keep mailing an address that
 * is actively burning our sending reputation.
 *
 * Transactional mail deliberately does not consult this table. Someone who
 * opted out of a customer's follow-ups must still be able to reset their
 * password.
 */
export const emailSuppressions = sqliteTable(
  "email_suppressions",
  {
    organizationId: text("organization_id"),
    /** Lowercased by the writer; comparisons here are exact. */
    address: text("address").notNull(),
    /** `unsubscribe` | `bounce` | `complaint` | `manual` | `at_capture` */
    reason: text("reason").notNull(),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    /**
     * SQLite treats NULLs as distinct in a unique index, so this does not
     * deduplicate the global rows — those go through a guarded insert instead.
     */
    uniqueIndex("uq_suppressions_org_address").on(t.organizationId, t.address),
    index("idx_suppressions_address").on(t.address),
  ],
);

/**
 * Every message the platform sends, and whether the provider accepted it.
 *
 * Everything transactional shares one queue — sign-in codes, password resets,
 * invitations, submission notifications, auto-replies and abandoned-response
 * nudges — and the only record of any of it used to be a line in the worker
 * log. `followups` tracks its own schedule and `emailSuppressions` records who
 * we stopped mailing, but neither answers "did that OTP go out", which is the
 * question an expired provider key or an unverified sender makes urgent: it
 * takes sign-in down for every new account at once.
 *
 * **No recipient address, by construction.** The column does not exist, so no
 * query against this table can leak one to the platform console. The domain
 * answers the operational question — is this provider rejecting us — and is the
 * most that should reach a cross-tenant screen.
 */
export const mailDeliveries = sqliteTable(
  "mail_deliveries",
  {
    id: text("id").primaryKey(),
    /** `invitation` | `password_reset` | `otp` | `submission` | `followup` */
    kind: text("kind").notNull(),
    /**
     * `sent` | `skipped` | `failed`
     *
     * `skipped` is a job that ran correctly and mailed nobody — a form with no
     * notification addresses, a follow-up step the author deleted. It used to
     * be written down as `sent`, which made a delivery that never happened
     * indistinguishable from one that did.
     */
    status: text("status").notNull(),
    /**
     * How many messages the job produced.
     *
     * One completed response fans out to as many as eleven — ten notification
     * addresses plus the auto-reply — so a count of jobs is not a count of mail.
     */
    messages: integer("messages").notNull().default(0),
    /**
     * The queue's own attempt number.
     *
     * A failure at the retry ceiling is a message that has gone to the
     * dead-letter queue and will not be tried again, which is a different and
     * much worse fact than a first attempt that failed and then succeeded.
     */
    attempt: integer("attempt").notNull().default(1),
    /**
     * The domains a job actually wrote to, deduped and comma-separated. Never
     * an address.
     *
     * Empty on a job that failed before it reached anybody, and on the auth
     * jobs only as far as their single recipient — everything else reports its
     * own, because `submission` and `followup` carry identifiers rather than
     * addresses and this column was blank for all of them.
     */
    domain: text("domain").notNull().default(""),
    /**
     * `cloudflare` | `resend` | `noop`, comma-separated across a job.
     *
     * `noop` is why this exists: it is a message that was rendered, counted and
     * never sent because no provider was configured, which otherwise looks
     * exactly like a delivery.
     */
    transport: text("transport"),
    /**
     * The provider's ids for the messages this job sent, as a JSON array.
     *
     * What makes one of these rows findable in Cloudflare's
     * `emailSendingAdaptive` log or Resend's dashboard — the only place that
     * knows whether the recipient's server accepted the message or dropped it.
     */
    messageIds: text("message_ids"),
    error: text("error"),
    organizationId: text("organization_id"),
    createdAt: ts("created_at").notNull().$defaultFn(() => new Date()),
  },
  (t) => [
    index("idx_mail_deliveries_at").on(t.createdAt),
    index("idx_mail_deliveries_kind").on(t.kind, t.status, t.createdAt),
  ],
);
