import type { HttpClient, RequestOptions } from "../internal/http.js";

export class WebhookEndpoints {
  constructor(private readonly http: HttpClient) {}

  list(request?: RequestOptions) {
    return this.http.get<unknown[]>("/api/webhooks", undefined, request);
  }

  create(input: { url: string; events: string[]; formId?: string }, request?: RequestOptions) {
    return this.http.post<{ id: string; secret: string }>("/api/webhooks", input, request);
  }

  delete(id: string, request?: RequestOptions) {
    return this.http.delete<{ ok: boolean }>(`/api/webhooks/${id}`, request);
  }

  /** Recent deliveries, for working out why an endpoint is not hearing anything. */
  deliveries(id: string, request?: RequestOptions) {
    return this.http.get<unknown[]>(`/api/webhooks/${id}/deliveries`, undefined, request);
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
