import ipaddr from "ipaddr.js";
import { z } from "zod";

export type GuardErrorCode =
  | "bad_url"
  | "bad_scheme"
  | "bad_host"
  | "blocked_host"
  | "userinfo"
  | "too_many_redirects"
  | "too_large"
  | "bad_content_type";

/** One error type for every refusal, so a caller can branch on `code`. */
export class GuardError extends Error {
  readonly code: GuardErrorCode;

  constructor(code: GuardErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GuardError";
    this.code = code;
  }
}

/* ────────────────────────────── host classification ───────────────────────── */

/**
 * Names that never point anywhere a server-side request should go. The suffix
 * list covers the reserved and internal-use TLDs; the exact list covers the
 * well-known metadata endpoints by name, because a name resolves without any
 * IP literal ever appearing in the URL.
 */
const BLOCKED_NAMES = new Set(["localhost", "metadata", "instance-data", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home.arpa",
  ".lan",
  ".intranet",
  ".corp",
  ".onion",
  ".test",
  ".invalid",
];

/**
 * Address classification is `ipaddr.js`'s job, not ours.
 *
 * The hard part of this check is not the range table — it is that
 * `127.0.0.1`, `127.1`, `2130706433`, `0x7f.0.0.1` and `0177.0.0.1` are the
 * same address, and that `::ffff:169.254.169.254` is the metadata endpoint
 * wearing an IPv6 hat. A denylist that matches on dotted-quad text misses all
 * of them, which is how most hand-written SSRF guards fail.
 *
 * `ipaddr.js` parses every one of those spellings and answers with a range
 * name (`loopback`, `private`, `linkLocal`, `carrierGradeNat`, `uniqueLocal`,
 * `ipv4Mapped`, …). At ~100M downloads a week with no dependencies and no
 * runtime assumptions, it is a better bet than our own parser — and notably it
 * is *not* the `ip` package, whose `isPublic`/`isPrivate` bypasses were
 * CVE-2024-29415.
 *
 * The policy here is an allowlist, not a denylist: the only address a fetch
 * may target is a plain global unicast one. Anything else — including the
 * IPv6 transition ranges that embed an IPv4 address — is refused, so a range
 * `ipaddr.js` adds in a future version fails closed.
 */
export type HostClass = "public" | "loopback" | "blocked" | "name";

export function classifyHost(hostname: string): HostClass {
  const host = hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (host.length === 0) return "blocked";

  if (!ipaddr.isValid(host)) {
    if (BLOCKED_NAMES.has(host)) return host === "localhost" ? "loopback" : "blocked";
    if (host.endsWith(".localhost")) return "loopback";
    if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "blocked";
    return "name";
  }

  let address = ipaddr.parse(host);
  // An IPv4-mapped IPv6 address is an IPv4 address; judge it as one.
  if (address.kind() === "ipv6") {
    const v6 = address as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) address = v6.toIPv4Address();
  }

  const range = address.range();
  if (range === "loopback") return "loopback";
  return range === "unicast" ? "public" : "blocked";
}

/**
 * Whether a hostname is somewhere a server-side fetch must not go.
 *
 * The honest limitation, stated here because it decides how much this is
 * worth: a Worker cannot resolve DNS, so a public name that resolves to
 * `10.0.0.1` cannot be caught at this layer. What this does catch is every
 * literal spelling of an internal address — which is what an attacker reaches
 * for first — and it is paired with `guardedFetch` re-checking every redirect
 * hop, which is where the DNS trick usually has to surface anyway. Cloudflare
 * also refuses egress into private space at the platform level, so this is the
 * inner of two doors rather than the only one.
 */
export function isBlockedHost(hostname: string): boolean {
  const verdict = classifyHost(hostname);
  return verdict === "blocked" || verdict === "loopback";
}

/** Loopback, and only loopback — the subset `allowLoopback` forgives. */
function isLoopback(hostname: string): boolean {
  return classifyHost(hostname) === "loopback";
}

/** `isBlockedHost`, with the loopback carve-out applied. */
function isAcceptableFetchHost(hostname: string, { allowLoopback }: { allowLoopback?: boolean }): boolean {
  const verdict = classifyHost(hostname);
  if (verdict === "loopback") return allowLoopback === true;
  return verdict !== "blocked";
}

/* ─────────────────────────────── url schemas ──────────────────────────────── */

/**
 * Hostnames that are legal in the wild but not in a domain regex.
 *
 * Underscore labels are invalid per RFC 1123 and nevertheless common on
 * internal and vendor endpoints, so a webhook URL is allowed to have one. A
 * respondent-facing URL is not, because there it buys nothing and `_` in a
 * hostname is a reliable phishing tell.
 */
const RELAXED_HOSTNAME = /^(?=.{1,253}\.?$)([a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,63}\.?$/i;

/** Rejects `https://user:pw@host` — a credential leak and a parser-confusion trick. */
function noUserinfo(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/**
 * The URL schema for anything that will be handed to a browser: a redirect
 * after submit, a call-to-action link, an image source.
 *
 * `http`/`https` only — zod's own `.url()` accepts `javascript:` and `data:`,
 * which is exactly how a stored XSS gets into a form — and the hostname must
 * be a real domain, so an IP literal and `localhost` are both out.
 */
export function safeUrl(max = 2000): z.ZodType<string> {
  return z
    .string()
    .max(max)
    .url({ protocol: /^https?$/, hostname: z.regexes.domain })
    .refine(noUserinfo, { error: "URL must not contain a username or password" });
}

/**
 * The URL schema for a webhook endpoint the customer owns.
 *
 * `https` only in production, the relaxed hostname, and a blocked-host check —
 * because unlike a redirect, we are the one making this request.
 */
export function safeWebhookUrl({
  max = 2000,
  allowInsecure = false,
  allowLoopback = false,
}: { max?: number; allowInsecure?: boolean; allowLoopback?: boolean } = {}): z.ZodType<string> {
  const hostname = allowLoopback ? /^[^\s/?#@]+$/ : RELAXED_HOSTNAME;
  return z
    .string()
    .max(max)
    .url({ protocol: allowInsecure ? /^https?$/ : /^https$/, hostname })
    .refine(noUserinfo, { error: "URL must not contain a username or password" })
    .refine((raw) => isAcceptableFetchHost(new URL(raw).hostname, { allowLoopback }), {
      error: "URL must not point at a private or internal address",
    });
}

export type SafeUrlOptions = {
  /** Allow `http:` as well as `https:`. Off by default. */
  allowInsecure?: boolean;
  /** Allow a hostname with an underscore label or a trailing dot. */
  relaxedHostname?: boolean;
  /**
   * Allow loopback — `localhost`, `127.0.0.1`, `::1` — and nothing else that
   * `classifyHost` refuses.
   *
   * This exists because `POST /api/webhooks` accepts `http://localhost` today
   * and a developer testing an integration against their own machine is the
   * reason. Gate it on `ENVIRONMENT !== "production"` at the call site: the
   * option is a development affordance, not a policy.
   */
  allowLoopback?: boolean;
  /** Skip the address check entirely. Only for a host we control. */
  allowBlockedHost?: boolean;
};

/**
 * Parse and vet a URL, throwing `GuardError` with a reason. This is the check
 * `guardedFetch` runs on the original URL and on every redirect it follows.
 */
export function assertSafeUrl(raw: string, options: SafeUrlOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new GuardError("bad_url", "Not a URL");
  }

  const allowed = options.allowInsecure ? ["http:", "https:"] : ["https:"];
  if (!allowed.includes(url.protocol)) throw new GuardError("bad_scheme", `Scheme ${url.protocol} is not allowed`);
  if (url.username !== "" || url.password !== "") throw new GuardError("userinfo", "URL carries credentials");

  // An IP literal and a bare `localhost` are not domains; whether they are
  // *allowed* is the address question below, not a shape question.
  const shape = classifyHost(url.hostname);
  if (shape === "name") {
    const pattern = options.relaxedHostname ? RELAXED_HOSTNAME : z.regexes.domain;
    if (!pattern.test(url.hostname)) throw new GuardError("bad_host", "Not a valid hostname");
  }
  if (!options.allowBlockedHost && !isAcceptableFetchHost(url.hostname, options)) {
    throw new GuardError("blocked_host", "Host is a private or internal address");
  }
  return url;
}

/** The boolean form, for a caller that wants to skip rather than fail. */
export function isSafeUrl(raw: string, options: SafeUrlOptions = {}): boolean {
  try {
    assertSafeUrl(raw, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser-side companion: is this stored URL safe to put in an `href`, a
 * `src`, or `window.open`?
 *
 * Deliberately more permissive than `assertSafeUrl` — an IP literal or an
 * intranet hostname in a link is the author's business, and blocking it here
 * would break a legitimate internal form. The only thing this refuses is a
 * scheme that executes: `javascript:`, `data:`, `vbscript:`, `blob:`, `file:`.
 */
export function safeHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (text.startsWith("/") || text.startsWith("#") || text.startsWith("?")) return text;
  try {
    const url = new URL(text);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}

/** `safeHref` for an image or media source: no `mailto:`/`tel:`, and no `data:`. */
export function safeMediaSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  if (text.startsWith("/")) return text;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}

/* ──────────────────────────────── guarded fetch ───────────────────────────── */

export type GuardedFetchOptions = SafeUrlOptions & {
  init?: RequestInit;
  timeoutMs?: number;
  maxRedirects?: number;
  /** Response `content-type` allowlist. A mismatch throws `bad_content_type`. */
  contentTypes?: RegExp;
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The only way this codebase fetches a URL that came from a user.
 *
 * `redirect: "manual"` is the point. A check applied to the URL a customer
 * typed is worth very little on its own, because `https://example.com/r` can
 * answer `302 Location: http://169.254.169.254/` and a client with
 * `redirect: "follow"` will go there without asking anyone. Every hop is
 * re-vetted here, and the hop count is bounded.
 */
export async function guardedFetch(
  raw: string,
  { init, timeoutMs = 6000, maxRedirects = 3, contentTypes, ...urlOptions }: GuardedFetchOptions = {},
): Promise<{ response: Response; url: URL }> {
  let target = assertSafeUrl(raw, urlOptions);
  let method = init?.method ?? "GET";
  let body = init?.body;

  for (let hop = 0; ; hop += 1) {
    const response = await fetch(target, {
      ...init,
      method,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!REDIRECT_STATUSES.has(response.status)) {
      const type = response.headers.get("content-type") ?? "";
      if (contentTypes && !contentTypes.test(type)) {
        await response.body?.cancel();
        throw new GuardError("bad_content_type", `Unexpected content-type ${type || "(none)"}`);
      }
      return { response, url: target };
    }

    const location = response.headers.get("location");
    // A redirect with no Location is not a redirect. Hand it back as it came.
    if (!location) return { response, url: target };
    await response.body?.cancel();
    if (hop >= maxRedirects) throw new GuardError("too_many_redirects", `More than ${maxRedirects} redirects`);

    target = assertSafeUrl(new URL(location, target).toString(), urlOptions);
    // 301/302/303 turn the follow-up into a GET, as every real client does;
    // 307/308 preserve the method and therefore the body.
    if (response.status === 301 || response.status === 302 || response.status === 303) {
      method = "GET";
      body = undefined;
    }
  }
}

/**
 * Read a response body up to a byte ceiling and **refuse** past it.
 *
 * `await response.text()` on a stranger's URL is an unbounded allocation in a
 * 128 MB isolate: a `content-length` header is a claim, not a limit. Use this
 * when an oversized body means the request has failed — a webhook's reply, a
 * JSON document we are about to parse.
 */
export async function readCappedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new GuardError("too_large", `Body exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Read a response body up to a byte ceiling and **stop there**, keeping what
 * arrived.
 *
 * The other semantic, and the right one for reading a page: a 40 MB article is
 * not an attack, and its first half is still worth something to the extractor.
 * Streams the decode so a multi-byte character split across the cut survives.
 */
export async function readTruncatedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (read >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out;
}
