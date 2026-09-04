import { HttpClient, type ClientConfig } from "./internal/http.js";
import { Sessions } from "./resources/sessions.js";
import { Blocks } from "./resources/forms.js";
import { streamSession, type StreamOptions } from "./session/stream.js";

export { ChatformError } from "./internal/errors.js";
export { streamSession, parseFrame } from "./session/stream.js";
export * from "./types/index.js";

export interface BrowserClientConfig extends Omit<ClientConfig, "apiKey"> {
  /** A `pk_live_` or `pk_test_` key. Secret keys are refused here. */
  publishableKey: string;
}

/**
 * A client that cannot leak a secret key.
 *
 * Its own entrypoint, and it throws rather than warns, because "do not put your
 * secret key in the browser" is advice everyone agrees with and someone ships
 * anyway. The type system will not catch a string; this will.
 *
 * What a publishable key can do is deliberately small — open a session, answer
 * questions, upload a file — and it is pinned to the origins you listed on it.
 */
export function createBrowserClient(config: BrowserClientConfig) {
  if (config.publishableKey.startsWith("sk_")) {
    throw new Error(
      "That is a secret key. Anything in a browser is readable by everyone who loads the page — " +
        "use a publishable pk_ key, or have your server open the session and hand the page the " +
        "respondentToken it returns.",
    );
  }

  const http = new HttpClient({ ...config, apiKey: config.publishableKey });
  return {
    sessions: new Sessions(http),
    blocks: new Blocks(http),
    stream(sessionId: string, options: Omit<StreamOptions, "apiKey" | "baseUrl"> = {}) {
      return streamSession(sessionId, {
        ...options,
        apiKey: config.publishableKey,
        baseUrl: config.baseUrl,
      });
    },
  };
}

export type ChatformBrowserClient = ReturnType<typeof createBrowserClient>;
