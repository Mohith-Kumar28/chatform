/**
 * The shapes the API returns, named.
 *
 * Every type here is an alias into `../generated/openapi.ts`, which is generated
 * from the API's own spec. None is written by hand: when a route's schema
 * changes, `pnpm --filter @chatformhq/js gen:types` changes these with it, and
 * CI fails until it has run. A field the API declares as open (`unknown`) is
 * open here too: answer values span every block type, and the API publishes a
 * full JSON Schema per block at `GET /v1/blocks/{type}` instead.
 */
import type { Accepted, Body, Item, Res } from "./spec.js";

export type { ErrorEnvelope } from "./spec.js";

// ─────────────────────────────── responses ───────────────────────────────

export type ChatformResponse = Res<"/v1/responses/{id}", "get">;
/**
 * `disqualified` is a response the form itself refused: it reached an ending
 * whose `kind` is `"screen_out"`. Terminal like `completed`, and never a
 * completion: it does not fire `response.completed` and is not in the
 * completion rate.
 */
export type ResponseStatus = ChatformResponse["status"];
export type ResponseSource = ChatformResponse["source"];
export type Mode = ChatformResponse["mode"];
export type Progress = ChatformResponse["progress"];
export type ResponseMetadata = ChatformResponse["metadata"];
export type NextStep = Res<"/v1/responses/{id}/next", "get">;

/** Anything a block can hold. Per-type shapes are in the block reference. */
export type AnswerValue = unknown;

/** A question as a respondent receives it. Fields beyond these vary by block type. */
export type PublicBlock = Extract<NonNullable<ChatformResponse["next"]>, { kind: "block" }>["block"];
export type PublicEnding = Extract<NonNullable<ChatformResponse["next"]>, { kind: "ending" }>["ending"];

/** The documented list envelope. */
export interface Page<T> {
  data: T[];
  has_more: boolean;
  next_cursor: string | null;
}

// ───────────────────────────────── forms ─────────────────────────────────

export type FormSummary = Item<Res<"/v1/forms", "get">["data"]>;
export type CreatedForm = Res<"/v1/forms", "post">;
/** The published config, or the working draft when nothing is published yet. */
export type FormRead = Res<"/v1/forms/{id}", "get">;
export type FormDocumentRead = Extract<FormRead, { doc: unknown }>;
export type PublicFormConfig = Exclude<FormRead, { doc: unknown }>;
export type DocSaved = Res<"/v1/forms/{id}/doc", "put">;
export type LintIssue = Item<DocSaved["issues"]>;
export type Published = Res<"/v1/forms/{id}/publish", "post">;
export type Analytics = Res<"/v1/forms/{id}/analytics", "get">;
/**
 * How the follow-up emails for one form are doing. `holdout` and `liftPoints`
 * are null until a holdout group has had time to not come back.
 */
export type FollowUpStats = Res<"/v1/forms/{id}/followup-analytics", "get">;
export type Overview = Res<"/v1/analytics/overview", "get">;
export type FormSettings = Res<"/v1/forms/{id}/settings", "get">;
export type FormSetting = Item<FormSettings["settings"]>;
export type SettingsPatch = Body<"/v1/forms/{id}/settings", "patch">;
export type SettingsPatched = Res<"/v1/forms/{id}/settings", "patch">;
export type SettingChange = Item<SettingsPatched["changes"]>;

/**
 * A form document.
 *
 * The envelope is typed; blocks, endings and rules are open, because they span
 * every question type and the API publishes a full JSON Schema per type at
 * `GET /v1/blocks/{type}`. Compose one and hand it to `forms.updateDocument()`;
 * the linter it returns is the validator that counts.
 */
export type FormDocument = FormDocumentRead["doc"];

export type Imported = Res<"/v1/import", "post">;
export type ImportInput = Body<"/v1/import", "post">;

// ───────────────────────────── blocks and meta ─────────────────────────────

export type BlockCatalogue = Res<"/v1/blocks", "get">;
export type BlockDefinition = Res<"/v1/blocks/{type}", "get">;
export type EventCatalogue = Res<"/v1/events", "get">;
export type KeyIdentity = Res<"/v1/me", "get">;

// ──────────────────────────────── sessions ────────────────────────────────

export type SessionCreated = Res<"/v1/forms/{id}/sessions", "post">;
export type TurnResult = Res<"/v1/sessions/{sid}/messages", "post">;
/** A turn that outran its deadline. Nothing failed: resume from `pollUrl`. */
export type TurnProcessing = Accepted<"/v1/sessions/{sid}/messages", "post">;
export type SessionEvent = Item<TurnResult["events"]>;
export type SessionEvents = Res<"/v1/sessions/{sid}/events", "get">;
export type SessionState = Res<"/v1/sessions/{sid}", "get">;
export type SessionAction = Body<"/v1/sessions/{sid}/actions", "post">["action"];
export type PendingVerification = NonNullable<TurnResult["pendingVerification"]>;
export type PendingPayment = NonNullable<TurnResult["pendingPayment"]>;
export type CheckoutLaunch = PendingPayment["launch"];
export type PaymentStarted = Res<"/v1/sessions/{sid}/payments", "post">;
export type PaymentConfirmed = Res<"/v1/sessions/{sid}/payments/{recordId}/confirm", "post">;
export type RotatedToken = Res<"/v1/sessions/{sid}/token/rotate", "post">;
export type RespondentAuthResult = Res<"/v1/sessions/{sid}/auth/google", "post">;
export type EmailCodeSent = Res<"/v1/sessions/{sid}/auth/email/start", "post">;

// ─────────────────────────── templates, versions ───────────────────────────

export type TemplateSummary = Item<Res<"/v1/templates", "get">["data"]>;
export type TemplateDetail = Res<"/v1/templates/{slug}", "get">;
export type FormVersionSummary = Item<Res<"/v1/forms/{id}/versions", "get">["data"]>;
export type FormVersion = Res<"/v1/forms/{id}/versions/{version}", "get">;
export type RestoredVersion = Res<"/v1/forms/{id}/versions/{version}/restore", "post">;

// ─────────────────────────────── knowledge ───────────────────────────────

export type KnowledgeIndex = Res<"/v1/forms/{id}/knowledge", "get">;
export type KnowledgeSource = Item<KnowledgeIndex["sources"]>;

// ────────────────────────────── integrations ──────────────────────────────

export type Integration = Item<Res<"/v1/forms/{id}/integrations", "get">["data"]>;
export type SpreadsheetIntegration = Res<"/v1/forms/{id}/integrations/spreadsheet", "put">;

// ─────────────────────────────────── AI ───────────────────────────────────

export type AiGenerateInput = Body<"/v1/ai/generate-form", "post">;
export type AiGenerateResult = Res<"/v1/ai/generate-form", "post">;
export type AiEditInput = Body<"/v1/ai/edit-form", "post">;
export type AiEditResult = Res<"/v1/ai/edit-form", "post">;
export type AiClarifyInput = Body<"/v1/ai/clarify-form", "post">;
export type ClarifyQuestion = Item<Res<"/v1/ai/clarify-form", "post">["questions"]>;

// ──────────────────────────────── webhooks ────────────────────────────────

export type WebhookEndpoint = Item<Res<"/v1/webhooks", "get">["data"]>;
export type WebhookCreated = Res<"/v1/webhooks", "post">;
export type WebhookDelivery = Item<Res<"/v1/webhooks/{id}/deliveries", "get">["data"]>;
export type WebhookAttempt = Item<WebhookDelivery["attempts"]>;
export type WebhookQueueStats = Res<"/v1/webhooks/stats", "get">;
export type WebhookQueueCounts = WebhookQueueStats["total"];

// ──────────────────────────────── payments ────────────────────────────────

export type PaymentAccounts = Res<"/v1/payment-accounts", "get">;
export type PaymentAccount = Item<PaymentAccounts["accounts"]>;
export type FormPayments = Res<"/v1/forms/{id}/payments", "get">;

// ───────────────────────────── exports, files ─────────────────────────────

export type ExportJob = Res<"/v1/exports/{id}", "get">;
export type StoredFileView = Res<"/v1/files/{id}", "get">;
