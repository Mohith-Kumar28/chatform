import type { HttpClient, RequestOptions } from "../internal/http.js";

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

export class WebhookEndpoints {
  constructor(private readonly http: HttpClient) {}

  /**
   * These are the `/v1` routes, not the dashboard's.
   *
   * They used to point at `/api/webhooks`, which is guarded by a session — so
   * every method here answered 401 with a perfectly valid API key, and the
   * `webhook:read`/`webhook:write` scopes described an ability no key had.
   */
  list(options: { formId?: string } = {}, request?: RequestOptions) {
    return this.http.get<WebhookEndpoint[]>("/v1/webhooks", options, request);
  }

  /** The signing secret comes back once. Store it now. */
  create(input: { url: string; events: string[]; formId?: string }, request?: RequestOptions) {
    return this.http.post<WebhookEndpoint & { secret: string }>("/v1/webhooks", input, request);
  }

  delete(id: string, request?: RequestOptions) {
    return this.http.delete<{ ok: boolean; deleted: boolean }>(`/v1/webhooks/${id}`, request);
  }

  /** Recent attempts, for working out why an endpoint is not hearing anything. */
  deliveries(id: string, request?: RequestOptions) {
    return this.http.get<{ data: unknown[] }>(`/v1/webhooks/${id}/deliveries`, undefined, request);
  }

  /**
   * Send one delivery again.
   *
   * The retry schedule runs out at two hours; after a deploy that fixed the
   * endpoint, waiting for a sweep that will never come again is not a recovery
   * path.
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
