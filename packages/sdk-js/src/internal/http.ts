import { ChatformError, errorFromResponse } from "./errors.js";

/**
 * The transport.
 *
 * Small on purpose. It authenticates, retries the things worth retrying, and
 * turns failures into a typed error; everything else is the resources' job.
 */

export interface ClientConfig {
  /** `sk_live_…`, `sk_test_…`, or a publishable key in the browser entrypoint. */
  apiKey: string;
  baseUrl?: string;
  /** Injectable for tests, and for runtimes with their own fetch. */
  fetch?: typeof globalThis.fetch;
  /** Retries for 429 and 5xx. Default 2. */
  maxRetries?: number;
  /** Extra headers on every request — a trace id, say. */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  /** Makes a retried write safe. Generated automatically for writes when omitted. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

const DEFAULT_BASE_URL = "https://api.chatform.in";
const IDEMPOTENT_METHODS = new Set(["POST"]);

export class HttpClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly maxRetries: number;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: ClientConfig) {
    if (!config.apiKey) throw new Error("An API key is required.");
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = config.maxRetries ?? 2;
    this.headers = config.headers ?? {};
  }

  async request<T>(
    method: string,
    path: string,
    args: {
      query?: Record<string, unknown>;
      body?: unknown;
      /**
       * Bytes to send as-is, for a file upload. Mutually exclusive with `body`,
       * which is always JSON-encoded.
       */
      raw?: { body: BodyInit; contentType: string };
      options?: RequestOptions;
    } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(args.query ?? {})) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      "x-api-key": this.config.apiKey,
      ...this.headers,
      ...args.options?.headers,
    };
    if (args.body !== undefined) headers["content-type"] = "application/json";
    if (args.raw) headers["content-type"] = args.raw.contentType;

    /**
     * A write gets an idempotency key whether or not the caller thought about
     * it. A timeout tells them nothing about whether it landed, and the retry
     * below would otherwise create a second response.
     */
    if (IDEMPOTENT_METHODS.has(method)) {
      headers["idempotency-key"] = args.options?.idempotencyKey ?? crypto.randomUUID();
    }

    /**
     * A stream can only be read once, so a retry would send an empty body and
     * the size check would reject it. Buffers and blobs are re-readable and
     * keep the normal retry behaviour.
     */
    const oneShot = args.raw?.body instanceof ReadableStream;
    const attempts = oneShot ? 0 : this.maxRetries;

    let lastError: ChatformError | undefined;
    for (let attempt = 0; attempt <= attempts; attempt++) {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: args.raw ? args.raw.body : args.body === undefined ? undefined : JSON.stringify(args.body),
        signal: args.options?.signal,
      });

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      lastError = await errorFromResponse(res);

      // 429 and 5xx are worth retrying. 4xx otherwise is the caller's to fix,
      // and a quota error will refuse for the rest of the month.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === attempts) throw lastError;

      // Retry-After is authoritative when present. The jitter keeps a fleet of
      // workers from retrying in lockstep.
      const wait = (lastError.retryAfter ?? 2 ** attempt) * 1000 + Math.random() * 400;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    throw lastError ?? new Error("Request failed");
  }

  /**
   * Follow a signed URL, deliberately without the API key.
   *
   * Signed download links carry their own credential and are handed out
   * complete, so sending an `sk_live_` alongside would put it somewhere it does
   * not belong for no gain. It still goes through the configured `fetch`, which
   * is what a caller's proxy, instrumentation or test double is attached to.
   */
  fetchSigned(url: string, options?: RequestOptions): Promise<Response> {
    return this.fetchImpl(url, { signal: options?.signal, headers: options?.headers });
  }

  get<T>(path: string, query?: Record<string, unknown>, options?: RequestOptions) {
    return this.request<T>("GET", path, { query, options });
  }
  post<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("POST", path, { body, options });
  }
  put<T>(path: string, body?: unknown, options?: RequestOptions) {
    return this.request<T>("PUT", path, { body, options });
  }
  /** PUT raw bytes — the upload step, which is not JSON. */
  putRaw<T>(path: string, body: BodyInit, contentType: string, options?: RequestOptions) {
    return this.request<T>("PUT", path, { raw: { body, contentType }, options });
  }
  delete<T>(path: string, options?: RequestOptions) {
    return this.request<T>("DELETE", path, { options });
  }
}
