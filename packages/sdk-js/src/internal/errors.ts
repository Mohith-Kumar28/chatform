/**
 * What the API returns when something goes wrong, as a typed error.
 *
 * One class with a `code` rather than a class per failure: the codes are the
 * documented contract and there are dozens of them, so a hierarchy would be a
 * second thing to keep in sync with the API for no gain. `status` covers the
 * cases worth branching on structurally.
 */

export interface ApiIssue {
  ref?: string;
  path?: string;
  code: string;
  message: string;
}

export class ChatformError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: ApiIssue[];
  /** Quote this to support and the exact request can be found. */
  readonly requestId?: string;
  readonly docUrl?: string;
  /** Seconds to wait, when the API said to wait. */
  readonly retryAfter?: number;
  readonly body: unknown;

  constructor(args: {
    status: number;
    code: string;
    message: string;
    issues?: ApiIssue[];
    requestId?: string;
    docUrl?: string;
    retryAfter?: number;
    body?: unknown;
  }) {
    super(args.message);
    this.name = "ChatformError";
    this.status = args.status;
    this.code = args.code;
    this.issues = args.issues ?? [];
    this.requestId = args.requestId;
    this.docUrl = args.docUrl;
    this.retryAfter = args.retryAfter;
    this.body = args.body;
  }

  /** The key is wrong, missing, revoked or expired. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** Too fast. `retryAfter` says how long to wait. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }

  /**
   * A plan limit — not a rate limit.
   *
   * Retrying a 429 makes sense; retrying this does not, and conflating them is
   * how a client ends up hammering an endpoint that will refuse it all month.
   */
  get isQuotaExhausted(): boolean {
    return this.status === 402;
  }

  /** An answer or a document was rejected. `issues` says which and why. */
  get isValidationError(): boolean {
    return this.status === 422;
  }
}

export async function errorFromResponse(res: Response): Promise<ChatformError> {
  let body: unknown;
  let error: Record<string, unknown> = {};
  try {
    body = await res.json();
    error = ((body as { error?: Record<string, unknown> }).error ?? {}) as Record<string, unknown>;
  } catch {
    // A non-JSON error body — a gateway page, say. The status still means something.
  }
  const retryAfter = Number(res.headers.get("retry-after"));
  return new ChatformError({
    status: res.status,
    code: typeof error.code === "string" ? error.code : `http_${res.status}`,
    message: typeof error.message === "string" ? error.message : `Request failed with ${res.status}`,
    issues: Array.isArray(error.issues) ? (error.issues as ApiIssue[]) : [],
    requestId:
      (typeof error.request_id === "string" ? error.request_id : undefined) ??
      res.headers.get("x-request-id") ??
      undefined,
    docUrl: typeof error.doc_url === "string" ? error.doc_url : undefined,
    retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
    body,
  });
}
