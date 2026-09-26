import { z } from "zod";

/**
 * Response schemas for the `/v1` surface.
 *
 * Forty-seven of the sixty-nine operations declared no response body at all.
 * Their reference pages showed a status code and a sentence, and nothing about
 * what comes back — and the gap was not in the new endpoints. Templates,
 * versions, knowledge, integrations, AI, exports and uploads all declared
 * theirs. It was the original core that did not: `GET /v1/me`, `GET /v1/forms`,
 * the whole response lifecycle, and all of `/v1/sessions`.
 *
 * Every shape here was read off a live response from production rather than
 * from the handler, because the handler is what the reader does not have.
 *
 * Where a field is genuinely freeform it says so. `distributions` differs per
 * block type, `config_schema` is a JSON Schema document, `answers` is keyed by
 * whatever refs the author chose. Declaring those as `unknown` is honest;
 * inventing a shape for them would put a promise in the reference that the API
 * does not keep, which is the problem being fixed rather than a smaller version
 * of it.
 */

/** The documented list envelope. */
export const Paged = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    has_more: z.boolean(),
    next_cursor: z.string().nullable(),
  });

/** A question as a respondent receives it. Fields beyond these vary by block type. */
export const PublicBlockView = z
  .object({
    id: z.string(),
    ref: z.string(),
    type: z.string(),
    title: z.string(),
    required: z.boolean(),
    imageKey: z.string().nullable().optional(),
    media: z.unknown().optional(),
  })
  .loose();

export const PublicEndingView = z
  .object({
    ref: z.string(),
    title: z.string(),
    bodyMd: z.string().optional(),
    /** `screen_out` means the respondent was turned away rather than accepted. */
    kind: z.enum(["success", "screen_out"]).optional(),
    requirements: z.array(z.unknown()).optional(),
  })
  .loose();

export const ProgressView = z.object({
  answered: z.number(),
  totalEstimate: z.number(),
  pct: z.number(),
});

export const NextView = z
  .object({
    kind: z.string(),
    block: PublicBlockView.optional(),
    ending: PublicEndingView.optional(),
  })
  .loose()
  .nullable();

const MissingRequired = z.object({ ref: z.string(), title: z.string() });

/**
 * Who filled a response in and from where: channel, host page, referrer, UTMs,
 * device, and IP geo. Built by `lib/respondent-context.ts` when the session
 * opened; the same object is the webhook payload's `metadata`. Every leaf can
 * be null, and a response from before this was recorded carries only country
 * and device.
 */
export const MetadataView = z
  .object({
    channel: z.enum(["link", "inline", "popup", "side_tab", "fullpage", "embed", "api"]),
    pageUrl: z.string().nullable(),
    referrer: z.string().nullable(),
    referrerHost: z.string().nullable(),
    utm: z.record(z.string(), z.string()),
    language: z.string().nullable(),
    screen: z.string().nullable(),
    timezone: z.string().nullable(),
    device: z.object({
      type: z.enum(["mobile", "tablet", "desktop", "bot"]).nullable(),
      browser: z.string().nullable(),
      browserVersion: z.string().nullable(),
      os: z.string().nullable(),
      osVersion: z.string().nullable(),
    }),
    geo: z.object({
      country: z.string().nullable(),
      region: z.string().nullable(),
      regionCode: z.string().nullable(),
      city: z.string().nullable(),
      postalCode: z.string().nullable(),
      latitude: z.number().nullable(),
      longitude: z.number().nullable(),
      continent: z.string().nullable(),
      timezone: z.string().nullable(),
    }),
    network: z.object({ asn: z.number().nullable(), organization: z.string().nullable() }),
  })
  .nullable();

/** One response, as every lifecycle endpoint returns it. */
export const ResponseView = z
  .object({
    id: z.string(),
    object: z.literal("response"),
    form_id: z.string(),
    status: z.enum(["in_progress", "completed", "abandoned", "disqualified"]),
    source: z.string(),
    mode: z.string(),
    started_at: z.number(),
    updated_at: z.number(),
    completed_at: z.number().nullable(),
    expires_at: z.number().nullable(),
    duration_ms: z.number().nullable(),
    ending_ref: z.string().nullable(),
    abandon_reason: z.string().nullable(),
    metadata: MetadataView,
    progress: ProgressView,
    /** Keyed by the variable and hidden-field names the author chose. */
    variables: z.record(z.string(), z.unknown()),
    hidden_fields: z.record(z.string(), z.unknown()),
    next: NextView,
    complete_ready: z.boolean(),
    missing_required: z.array(MissingRequired),
    /** Answers recorded against questions the flow did not route through. */
    off_path_answers: z.array(z.string()),
    answers: z.array(z.object({ ref: z.string(), type: z.string(), value: z.unknown() })).optional(),
    /** Present on the append-answers response: what that call wrote. */
    recorded: z.array(z.object({ ref: z.string(), value: z.unknown() })).optional(),
  })
  .loose();

export const NextQuestionView = z.object({
  next: NextView,
  progress: ProgressView,
  answered: z.array(z.unknown()),
  missing_required: z.array(MissingRequired),
  complete_ready: z.boolean(),
});

export const SessionCreatedView = z.object({
  sessionId: z.string(),
  /** Scoped to this session and expiring. Hand a browser this, never an API key. */
  respondentToken: z.string(),
  expiresAt: z.number(),
  streamUrl: z.string(),
  greeting: z.string().optional(),
  question: PublicBlockView.nullable().optional(),
});

export const SessionEventView = z.object({
  v: z.number(),
  seq: z.number(),
  ts: z.number(),
  type: z.string(),
  data: z.unknown(),
});

export const TurnResultView = z
  .object({
    accepted: z.boolean(),
    complete: z.boolean(),
    awaitingSubmit: z.boolean(),
    assistantMessages: z.array(z.string()),
    question: PublicBlockView.nullable(),
    ending: PublicEndingView.nullable(),
    /** A rejected answer. Not an error: the same question stays open. */
    validation: z.object({ ref: z.string(), code: z.string(), message: z.string() }).nullable(),
    answers: z.record(z.string(), z.unknown()),
    collected: z.number(),
    pendingVerification: z.unknown().nullable(),
    events: z.array(SessionEventView),
    sinceSeq: z.number(),
  })
  .loose();

export const SessionStateView = z
  .object({
    sessionId: z.string(),
    status: z.string(),
    currentRef: z.string().nullable(),
    collected: z.number(),
    answers: z.record(z.string(), z.unknown()),
    variables: z.record(z.string(), z.unknown()),
    summary: z.array(z.unknown()),
    awaitingSubmit: z.boolean(),
    completedAt: z.number().nullable(),
    ending: PublicEndingView.nullable(),
    canRepeat: z.boolean(),
    auth: z.unknown().nullable(),
    pendingVerification: z.unknown().nullable(),
    expiresAt: z.number().nullable(),
    mode: z.string(),
    source: z.string(),
  })
  .loose();

export const SessionEventsView = z.object({
  events: z.array(SessionEventView),
  latest_seq: z.number(),
  has_more: z.boolean(),
});

export const RotatedTokenView = z.object({ respondentToken: z.string(), rotatedAt: z.number() });

export const RespondentAuthView = z.object({ ok: z.boolean() }).loose();

export const FormSummaryView = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  published: z.boolean(),
  created_at: z.number(),
  updated_at: z.number(),
});

export const OkView = z.object({ ok: z.boolean() });
export const DeletedView = z.object({ ok: z.boolean(), deleted: z.boolean() });

export const LintIssueView = z.object({
  level: z.string(),
  code: z.string(),
  message: z.string(),
  path: z.string().optional(),
  refs: z.array(z.string()).optional(),
});

/** Lint issues are returned, not enforced: a warning saves, an error does not. */
export const DocSavedView = z.object({ ok: z.boolean(), issues: z.array(LintIssueView) });

export const PublishedView = z.object({
  ok: z.boolean(),
  version: z.number(),
  versionId: z.string(),
  /** Anything the plan does not allow, removed on the way to the live version. */
  stripped: z.array(z.unknown()),
});

export const KeyIdentityView = z
  .object({
    organization_id: z.string(),
    key: z.object({
      id: z.string(),
      type: z.string(),
      mode: z.string(),
      scopes: z.record(z.string(), z.array(z.string())),
    }),
    scope_vocabulary: z.record(z.string(), z.array(z.string())),
    /** Withheld from a publishable key, which is readable by anyone loading the page. */
    plan: z.string().optional(),
    limits: z.record(z.string(), z.unknown()).optional(),
  })
  .loose();

export const BlockDefinitionView = z
  .object({
    type: z.string(),
    summary: z.string(),
    config_hint: z.string().nullable(),
    needs_options: z.boolean(),
    answered_by: z.string(),
    /** A JSON Schema document for this block type's configuration. */
    config_schema: z.unknown(),
    public_block: PublicBlockView,
    answer: z.unknown(),
  })
  .loose();

export const BlockCatalogueView = z.object({
  schema_version: z.number(),
  blocks: z.array(BlockDefinitionView),
});

export const EventCatalogueView = z.object({
  events: z.array(z.object({ name: z.string(), also_matches: z.array(z.string()) })),
});

export const AnalyticsView = z
  .object({
    views: z.number(),
    starts: z.number(),
    completed: z.number(),
    abandoned: z.number(),
    avgDurationMs: z.number(),
    medianDurationMs: z.number(),
    completionRate: z.number(),
    perBlock: z.array(
      z.object({
        blockRef: z.string(),
        blockType: z.string(),
        title: z.string(),
        answered: z.number(),
        answerRate: z.number(),
        dropOff: z.number(),
      }),
    ),
    /** Shape varies by block type: options for a select, a summary for a number. */
    distributions: z.array(z.unknown()),
    daily: z.array(z.object({ date: z.string(), views: z.number(), starts: z.number(), completed: z.number() })),
    bySource: z.array(z.unknown()),
    byCountry: z.array(z.unknown()),
    byDevice: z.record(z.string(), z.number()),
    /** One point per city: `{ country, region, city, lat, lon, count }`. */
    places: z.array(z.unknown()).optional(),
    byBrowser: z.array(z.object({ label: z.string(), count: z.number() })).optional(),
    byOs: z.array(z.object({ label: z.string(), count: z.number() })).optional(),
    byChannel: z.array(z.object({ label: z.string(), count: z.number() })).optional(),
    byReferrer: z.array(z.object({ label: z.string(), count: z.number() })).optional(),
    /** Each segment also carries `completed`: how many of `count` finished. */
    byCampaign: z.array(z.object({ label: z.string(), count: z.number(), completed: z.number() })).optional(),
    byDeviceType: z.array(z.object({ label: z.string(), count: z.number(), completed: z.number() })).optional(),
    byLanguage: z.array(z.object({ label: z.string(), count: z.number(), completed: z.number() })).optional(),
    /** Seven rows (Monday first) of 24 hours, on each respondent's own clock. */
    byWeekHour: z.array(z.array(z.number())).optional(),
    durationBuckets: z.array(z.object({ label: z.string(), count: z.number() })),
    /** Names what a plan withheld, rather than omitting it silently. */
    locked: z.array(z.string()).optional(),
  })
  .loose();

export const FollowUpStatsView = z
  .object({
    everScheduled: z.boolean(),
    sent: z.number(),
    pending: z.number(),
    clicked: z.number(),
    recovered: z.number(),
    clickRate: z.number(),
    recoveryRate: z.number(),
    byStep: z.array(z.unknown()),
    daily: z.array(z.object({ date: z.string(), sent: z.number(), recovered: z.number() })),
    /** Null until a holdout group has had time to not come back. */
    holdout: z.number().nullable(),
    liftPoints: z.number().nullable(),
  })
  .loose();

export const WebhookView = z
  .object({
    id: z.string(),
    url: z.string(),
    events: z.array(z.string()),
    formId: z.string().nullable(),
    active: z.boolean(),
    consecutiveFailures: z.number(),
    createdAt: z.number(),
    secretPreview: z.string(),
    /** Returned by create and never again. Store it then. */
    secret: z.string().optional(),
  })
  .loose();

export const WebhookAttemptView = z.object({
  attempt: z.number(),
  status: z.number().nullable(),
  error: z.string().nullable(),
  /** The first KB of what the endpoint answered. */
  responseBody: z.string().nullable(),
  durationMs: z.number().nullable(),
  at: z.number(),
});

export const WebhookDeliveryView = z
  .object({
    id: z.string(),
    /** Sent as `webhook-id`; the same on every retry, for de-duplicating. */
    eventId: z.string().nullable(),
    event: z.string(),
    /** `pending` (queued or waiting to retry), `success` or `failed` (gave up). */
    status: z.enum(["pending", "success", "failed"]),
    attempt: z.number(),
    maxAttempts: z.number(),
    responseStatus: z.number().nullable(),
    lastError: z.string().nullable(),
    nextAttemptAt: z.number().nullable(),
    deliveredAt: z.number().nullable(),
    createdAt: z.number(),
    attempts: z.array(WebhookAttemptView),
  })
  .loose();

export const WebhookQueueCountsView = z.object({
  /** Queued, in flight, or waiting for a retry. */
  pending: z.number(),
  /** Out of retries: the failed list. */
  failed: z.number(),
  delivered24h: z.number(),
  lastDeliveredAt: z.number().nullable(),
});

export const WebhookQueueStatsView = z.object({
  total: WebhookQueueCountsView,
  endpoints: z.array(WebhookQueueCountsView.extend({ webhookId: z.string() })),
});

export const AiDocumentView = z
  .object({ doc: z.unknown(), issues: z.array(LintIssueView).optional() })
  .loose();

export const RestoredVersionView = z
  .object({
    ok: z.boolean(),
    version: z.number(),
    summary: z.string(),
    changes: z.array(z.unknown()),
    doc: z.unknown(),
  })
  .loose();

export const FormVersionView = z
  .object({
    version: z.number(),
    versionId: z.string(),
    note: z.string().nullable(),
    publishedAt: z.number(),
    doc: z.unknown(),
    comparedTo: z.number().optional(),
    changes: z.array(z.unknown()),
    summary: z.string(),
  })
  .loose();

/** The working draft, as `view=document` and as an unpublished form both answer. */
export const FormDocumentView = z
  .object({ id: z.string(), slug: z.string(), status: z.string(), doc: z.unknown() })
  .loose();

/** A published form's public projection: the same one a respondent receives. */
export const PublicFormConfigView = z
  .object({ slug: z.string(), blocks: z.array(PublicBlockView) })
  .loose();

/**
 * What `GET /v1/forms/{id}` answers.
 *
 * Two shapes, and which one you get is in the request rather than a surprise:
 * the public config for a published form, the working draft for one that has
 * no published version yet or when `view=document` asks for it. `status` on
 * the second is what tells them apart.
 */
export const FormReadView = z.union([FormDocumentView, PublicFormConfigView]);
