import { describe, it, expect } from "vitest";
import { webOrigins, returnOrigin, isSecureOrigin, needsCrossSiteCookies } from "../src/lib/origins.js";
import type { Bindings } from "../src/env.js";

/**
 * Origin handling, which is where a split deployment quietly breaks.
 *
 * Two failures these tests exist to prevent, both of which shipped before being caught:
 * sending a paying customer to `/billing` on the API host (a 404), and serving a
 * `SameSite=Lax` cookie to a cross-origin app (sign-in appears to work, then every
 * subsequent request is a 401).
 */

const env = (over: Partial<Bindings>) =>
  ({ APP_ORIGIN: "https://api.example.com", ...over }) as unknown as Bindings;

const req = (headers: Record<string, string>) => ({
  header: (name: string) => headers[name.toLowerCase()],
});

describe("webOrigins", () => {
  it("parses a comma-separated list and strips trailing slashes", () => {
    expect(webOrigins(env({ WEB_ORIGINS: "http://localhost:3000, https://app.example.com/" }))).toEqual([
      "http://localhost:3000",
      "https://app.example.com",
    ]);
  });

  it("falls back to the API's own origin, so a single-origin deploy needs no config", () => {
    expect(webOrigins(env({}))).toEqual(["https://api.example.com"]);
  });

  it("still honours the old single-value WEB_ORIGIN", () => {
    expect(webOrigins(env({ WEB_ORIGIN: "https://app.example.com" }))).toEqual(["https://app.example.com"]);
  });

  it("ignores empty entries from a trailing comma", () => {
    expect(webOrigins(env({ WEB_ORIGINS: "https://a.com,,https://b.com," }))).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });
});

describe("returnOrigin", () => {
  const e = env({ WEB_ORIGINS: "http://localhost:3000,https://app.example.com" });

  it("returns the caller to the origin they actually came from", () => {
    // One deployed API serves a local dev app and a production one at the same time; a
    // purchase begun in either has to come back to the same place.
    expect(returnOrigin(e, req({ origin: "https://app.example.com" }))).toBe("https://app.example.com");
    expect(returnOrigin(e, req({ origin: "http://localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("falls back to the first configured origin when there is no Origin header", () => {
    // Some browsers omit Origin on top-level navigations.
    expect(returnOrigin(e, req({}))).toBe("http://localhost:3000");
  });

  it("uses the Referer when Origin is absent", () => {
    expect(returnOrigin(e, req({ referer: "https://app.example.com/billing?x=1" }))).toBe("https://app.example.com");
  });

  it("refuses an origin that is not configured", () => {
    // Reflecting an arbitrary Origin would hand anyone who can reach the endpoint control
    // of where our checkout redirects — an open redirect, for free.
    expect(returnOrigin(e, req({ origin: "https://evil.example" }))).toBe("http://localhost:3000");
    expect(returnOrigin(e, req({ origin: "not-a-url" }))).toBe("http://localhost:3000");
    // A prefix match is not a match: this is the classic bypass.
    expect(returnOrigin(e, req({ origin: "https://app.example.com.evil.test" }))).toBe("http://localhost:3000");
  });

  it("never returns the API's own origin when a web origin is configured", () => {
    // The bug this whole module exists for: /billing does not exist on the API host.
    expect(returnOrigin(e, req({ origin: "https://api.example.com" }))).not.toBe("https://api.example.com");
  });
});

describe("cookie policy", () => {
  it("needs cross-site cookies when the app is on another host over HTTPS", () => {
    expect(needsCrossSiteCookies(env({ WEB_ORIGINS: "https://app.example.com" }))).toBe(true);
    expect(needsCrossSiteCookies(env({ WEB_ORIGINS: "http://localhost:3000" }))).toBe(true);
  });

  it("does not when the app shares the API's host", () => {
    // SameSite=Lax is correct there, and stricter is better.
    expect(needsCrossSiteCookies(env({ WEB_ORIGINS: "https://api.example.com" }))).toBe(false);
    expect(needsCrossSiteCookies(env({}))).toBe(false);
  });

  it("never asks for SameSite=None over plain http", () => {
    // `None` requires `Secure`, which a http://localhost API cannot set — forcing it there
    // would break local development instead of fixing production.
    const local = env({ APP_ORIGIN: "http://localhost:8787", WEB_ORIGINS: "http://localhost:3000" });
    expect(isSecureOrigin(local)).toBe(false);
    expect(needsCrossSiteCookies(local)).toBe(false);
  });

  it("treats a port-only difference as a different site for cookie purposes", () => {
    // Cookies ignore port, which is why localhost:3000 → localhost:8787 works by accident
    // in local dev and stops working the moment the API moves to another host.
    expect(needsCrossSiteCookies(env({ APP_ORIGIN: "https://api.example.com", WEB_ORIGINS: "https://api.example.com:8443" }))).toBe(true);
  });
});
