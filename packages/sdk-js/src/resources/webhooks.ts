import type { HttpClient, RequestOptions } from "../internal/http.js";
import { rows } from "../internal/rows.js";

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  formId: string | null;
  active: boolean;
  consecutiveFailures: number;
  createdAt: number;
  /** The first characters, for telling endpoints apart. */
  secretPreview: string;
}

export interface WebhookAttempt {
  attempt: number;
  status: number | null;
  error: string | null;
  responseBody: string | null;
  durationMs: number | null;
  at: number;
}

export interface WebhookDelivery {
  id: string;
  /** Sent as `webhook-id`; the same on every retry. */
  eventId: string | null;
  event: string;
  /** `pending` (queued or waiting to retry), `success`, or `failed` (out of retries). */
  status: "pending" | "success" | "failed";
  attempt: number;
  maxAttempts: number;
  responseStatus: number | null;
  lastError: string | null;
  nextAttemptAt: number | null;
  deliveredAt: number | null;
  createdAt: number;
  attempts: WebhookAttempt[];
}

export interface WebhookQueueCounts {
  pending: number;
  failed: number;
  delivered24h: number;
  lastDeliveredAt: number | null;
}

export class WebhookEndpoints {
  constructor(private readonly http: HttpClient) {}

  /**
   * These are the `/v1` routes, not the dashboard's.
   *
   * They used to point at `/api/webhooks`, which is guarded by a session — so
   * every method here answered 401 with a perfectly valid API key, and the
   * `webhook:read`/`webhook:write` scopes described an ability no key had.
   */
  async list(options: { formId?: string } = {}, request?: RequestOptions): Promise<WebhookEndpoint[]> {
    return rows(await this.http.get<WebhookEndpoint[] | { data: WebhookEndpoint[] }>("/v1/webhooks", options, request));
  }

  /** The signing secret comes back once. Store it now. */
  create(input: { url: string; events: string[]; formId?: string }, request?: RequestOptions) {
    return this.http.post<WebhookEndpoint & { secret: string }>("/v1/webhooks", input, request);
  }

  delete(id: string, request?: RequestOptions) {
    return this.http.delete<{ ok: boolean; deleted: boolean }>(`/v1/webhooks/${id}`, request);
  }

  /** Turn an endpoint on or off. Turning it on clears its failure count. */
  update(id: string, input: { active: boolean }, request?: RequestOptions) {
    return this.http.patch<WebhookEndpoint>(`/v1/webhooks/${id}`, input, request);
  }

  /** Recent deliveries with every attempt, for working out why an endpoint is not hearing anything. */
  deliveries(id: string, options: { status?: "pending" | "failed" | "success" } = {}, request?: RequestOptions) {
    return this.http.get<{ data: WebhookDelivery[] }>(`/v1/webhooks/${id}/deliveries`, options, request);
  }

  /** How many deliveries are pending, failed, and delivered in the last 24 hours. */
  stats(options: { formId?: string } = {}, request?: RequestOptions) {
    return this.http.get<{ total: WebhookQueueCounts; endpoints: (WebhookQueueCounts & { webhookId: string })[] }>(
      "/v1/webhooks/stats",
      options,
      request,
    );
  }

  /** Send every failed delivery of an endpoint again. */
  retryFailed(id: string, request?: RequestOptions) {
    return this.http.post<{ ok: boolean; queued: number }>(`/v1/webhooks/${id}/retry-failed`, undefined, request);
  }

  /**
   * Send one delivery again.
   *
   * Automatic retries give up after about ten hours; after a deploy that fixed
   * the endpoint, this is the recovery path.
   */
  replay(webhookId: string, deliveryId: string, request?: RequestOptions) {
    return this.http.post<{ ok: boolean; queued: boolean }>(
      `/v1/webhooks/${webhookId}/deliveries/${deliveryId}/replay`,
      undefined,
      request,
    );
  }

  /** The event catalogue, including the older names that still match. */
  events(request?: RequestOptions) {
    return this.http.get<{ events: { name: string; also_matches: string[] }[] }>(
      "/v1/events",
      undefined,
      request,
    );
  }
}
