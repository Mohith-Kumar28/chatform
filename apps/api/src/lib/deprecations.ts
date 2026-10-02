/**
 * The `/v1` paths that still work but have a better name.
 *
 * One list, read twice: `openapi.ts` marks the matching operations
 * `deprecated`, and the `/v1` middleware in `app.ts` sends the headers
 * `versioning.mdx` promises on every response from them. A second copy of this
 * list in either place is how the spec and the headers would come to disagree.
 *
 * Patterns match both a concrete request path (`/v1/chat/sessions/abc/events`)
 * and a spec template (`/v1/chat/sessions/{sid}/events`), since neither segment
 * they skip over contains a slash.
 *
 * No `sunset`: these aliases are kept for the life of `/v1`. Deprecated means
 * "use the other name in new code", not "this is going away".
 */
export interface Deprecation {
  pattern: RegExp;
  /** Epoch seconds: when the replacement shipped. */
  since: number;
  /** Where the replacement is documented. */
  link: string;
}

export const DEPRECATIONS: readonly Deprecation[] = [
  {
    // Renamed to `/v1/sessions/{sid}` in 63e31dc.
    pattern: /^\/v1\/chat\/sessions\//,
    since: Date.UTC(2026, 8, 4) / 1000,
    link: "https://chatform.in/docs/headless",
  },
  {
    // Renamed to `/v1/forms/{id}/sessions` in 63e31dc.
    pattern: /^\/v1\/forms\/[^/]+\/chat\/sessions$/,
    since: Date.UTC(2026, 8, 4) / 1000,
    link: "https://chatform.in/docs/headless",
  },
];

export function deprecationFor(path: string): Deprecation | null {
  return DEPRECATIONS.find((d) => d.pattern.test(path)) ?? null;
}

/** RFC 9745 `Deprecation` and RFC 8288 `Link`, for one response. */
export function deprecationHeaders(d: Deprecation): Record<string, string> {
  return {
    deprecation: `@${d.since}`,
    link: `<${d.link}>; rel="deprecation"`,
  };
}
