import { HttpClient, type ClientConfig, type RequestOptions } from "./internal/http.js";
import { Responses } from "./resources/responses.js";
import { Forms, Blocks } from "./resources/forms.js";
import { Sessions } from "./resources/sessions.js";
import { WebhookEndpoints } from "./resources/webhooks.js";
import { streamSession, type StreamOptions } from "./session/stream.js";
import type { KeyIdentity } from "./types/index.js";

export { ChatformError } from "./internal/errors.js";
export { streamSession, parseFrame } from "./session/stream.js";
export * from "./types/index.js";
export type { ClientConfig, RequestOptions, StreamOptions };

/**
 * The Chatform client.
 *
 * ```ts
 * const chatform = createClient({ apiKey: process.env.CHATFORM_SECRET_KEY! });
 * ```
 *
 * Secret keys belong on a server. The API refuses one that arrives with an
 * `Origin` header, because such a request came from a page and the key is
 * already public — see `@chatform/js/browser` for the browser path.
 */
export function createClient(config: ClientConfig) {
  const http = new HttpClient(config);

  return {
    forms: new Forms(http),
    responses: new Responses(http),
    sessions: new Sessions(http),
    webhooks: new WebhookEndpoints(http),
    blocks: new Blocks(http),

    /** Who this key is, what it may do, and what is left of the plan. */
    me(options?: RequestOptions) {
      return http.get<KeyIdentity>("/v1/me", undefined, options);
    },

    /** A session's events, as they happen. */
    stream(sessionId: string, options: Omit<StreamOptions, "apiKey" | "baseUrl"> = {}) {
      return streamSession(sessionId, { ...options, apiKey: config.apiKey, baseUrl: config.baseUrl });
    },

    /** For anything this client does not wrap yet. */
    request: http.request.bind(http),
  };
}

export type ChatformClient = ReturnType<typeof createClient>;
