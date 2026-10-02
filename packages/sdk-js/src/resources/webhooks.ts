import type { HttpClient, RequestOptions } from "../internal/http.js";
import { rows } from "../internal/rows.js";
import type { Body, Query, Res } from "../types/spec.js";
import type {
  EventCatalogue,
  WebhookAttempt,
  WebhookCreated,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookQueueCounts,
  WebhookQueueStats,
} from "../types/index.js";

export type { WebhookAttempt, WebhookDelivery, WebhookEndpoint, WebhookQueueCounts };

export class WebhookEndpoints {
  constructor(private readonly http: HttpClient) {}

  /**
   * These are the `/v1` routes, not the dashboard's.
   *
   * They used to point at `/api/webhooks`, which is guarded by a session — so
   * every method here answered 401 with a perfectly valid API key, and the
   * `webhook:read`/`webhook:write` scopes described an ability no key had.
   */
  async list(options: Query<"/v1/webhooks", "get"> = {}, request?: RequestOptions): Promise<WebhookEndpoint[]> {
    return rows(await this.http.get<WebhookEndpoint[] | { data: WebhookEndpoint[] }>("/v1/webhooks", options, request));
  }

  /** The signing secret comes back once. Store it now. */
  create(input: Body<"/v1/webhooks", "post">, request?: RequestOptions) {
    return this.http.post<WebhookCreated>("/v1/webhooks", input, request);
  }

  delete(id: string, request?: RequestOptions) {
    return this.http.delete<Res<"/v1/webhooks/{id}", "delete">>(`/v1/webhooks/${id}`, request);
  }

  /** Turn an endpoint on or off. Turning it on clears its failure count. */
  update(id: string, input: Body<"/v1/webhooks/{id}", "patch">, request?: RequestOptions) {
    return this.http.patch<Res<"/v1/webhooks/{id}", "patch">>(`/v1/webhooks/${id}`, input, request);
  }

  /** Recent deliveries with every attempt, for working out why an endpoint is not hearing anything. */
  deliveries(id: string, options: Query<"/v1/webhooks/{id}/deliveries", "get"> = {}, request?: RequestOptions) {
    return this.http.get<Res<"/v1/webhooks/{id}/deliveries", "get">>(`/v1/webhooks/${id}/deliveries`, options, request);
  }

  /** How many deliveries are pending, failed, and delivered in the last 24 hours. */
  stats(options: Query<"/v1/webhooks/stats", "get"> = {}, request?: RequestOptions) {
    return this.http.get<WebhookQueueStats>(
      "/v1/webhooks/stats",
      options,
      request,
    );
  }

  /** Send every failed delivery of an endpoint again. */
  retryFailed(id: string, request?: RequestOptions) {
    return this.http.post<Res<"/v1/webhooks/{id}/retry-failed", "post">>(`/v1/webhooks/${id}/retry-failed`, undefined, request);
  }

  /**
   * Send one delivery again.
   *
   * Automatic retries give up after about ten hours; after a deploy that fixed
   * the endpoint, this is the recovery path.
   */
  replay(webhookId: string, deliveryId: string, request?: RequestOptions) {
    return this.http.post<Res<"/v1/webhooks/{id}/deliveries/{deliveryId}/replay", "post">>(
      `/v1/webhooks/${webhookId}/deliveries/${deliveryId}/replay`,
      undefined,
      request,
    );
  }

  /** The event catalogue, including the older names that still match. */
  events(request?: RequestOptions) {
    return this.http.get<EventCatalogue>(
      "/v1/events",
      undefined,
      request,
    );
  }
}
