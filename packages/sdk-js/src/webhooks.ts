/**
 * Verifying a webhook delivery.
 *
 * An unverified webhook endpoint is a public API that writes to your database,
 * so this is the one part of the SDK worth using even if you write everything
 * else yourself.
 *
 * Web Crypto, so the same code runs in Node, Workers, Deno and Bun.
 */

export interface VerifyWebhookArgs {
  /** The raw body. Not a parsed object — the signature is over the bytes. */
  body: string;
  headers: Headers | Record<string, string | string[] | undefined>;
  secret: string;
  /** How much clock skew to tolerate, in seconds. Default 300. */
  toleranceSeconds?: number;
}

export class WebhookVerificationError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "missing_headers"
      | "bad_timestamp"
      | "stale_timestamp"
      | "signature_mismatch",
  ) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

function headerOf(headers: VerifyWebhookArgs["headers"], name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function timingSafeEqual(a: string, b: string): boolean {
  // Folded rather than early-returned: comparing with === leaks where two
  // signatures first differ, which is enough to forge one a byte at a time.
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Verify a delivery and return its parsed body.
 *
 * Throws rather than returning false: a caller who forgets to check a boolean
 * has written an unauthenticated endpoint, and the failure should not be silent.
 */
export async function verifyWebhook<T = unknown>(args: VerifyWebhookArgs): Promise<T> {
  const id = headerOf(args.headers, "webhook-id");
  const timestamp = headerOf(args.headers, "webhook-timestamp");
  const signature = headerOf(args.headers, "webhook-signature");
  if (!id || !timestamp || !signature) {
    throw new WebhookVerificationError("Missing webhook signature headers", "missing_headers");
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) {
    throw new WebhookVerificationError("Malformed webhook-timestamp", "bad_timestamp");
  }
  // Checked before the HMAC: rejecting a replay should not cost a signature
  // computation, and an old delivery is not worth verifying however valid.
  const tolerance = args.toleranceSeconds ?? 300;
  if (Math.abs(Date.now() / 1000 - sentAt) > tolerance) {
    throw new WebhookVerificationError("Webhook timestamp is outside the tolerance window", "stale_timestamp");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(args.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${args.body}`),
  );
  let binary = "";
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  const expected = btoa(binary);

  // Several signatures may be present while a secret is being rotated.
  const matched = signature
    .split(" ")
    .some((part) => timingSafeEqual(part.replace(/^v1,/, ""), expected));
  if (!matched) {
    throw new WebhookVerificationError("Webhook signature does not match", "signature_mismatch");
  }

  return JSON.parse(args.body) as T;
}
