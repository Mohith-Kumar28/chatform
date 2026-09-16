import { describe, it, expect } from "vitest";
import { deliverableUrl } from "../src/lib/webhook-url.js";
import type { Bindings } from "../src/env.js";

/**
 * The one rule both webhook create routes and the delivery worker apply.
 *
 * Pinned as a unit because the environment is what decides half of it, and a
 * route test runs in exactly one environment. The loopback affordance exists
 * so an integration can be built against a local server; it must not survive
 * into production, where the same URL is an internal address.
 */
const asEnv = (environment: string) => ({ ENVIRONMENT: environment }) as unknown as Bindings;

const production = asEnv("production");
const development = asEnv("test");

describe("deliverableUrl", () => {
  it("accepts a public https endpoint everywhere", () => {
    for (const env of [production, development]) {
      expect(deliverableUrl(env, "https://hooks.acme.example/chatform")).toBe(true);
      expect(deliverableUrl(env, "https://hooks.acme.example:8443/x?y=1")).toBe(true);
      // Underscore labels are invalid per RFC 1123 and common on real vendor
      // endpoints, so a webhook is allowed one.
      expect(deliverableUrl(env, "https://my_hook.acme.example/x")).toBe(true);
    }
  });

  it("refuses a private or internal address in every environment", () => {
    for (const env of [production, development]) {
      for (const url of [
        "https://10.0.0.1/hook",
        "https://169.254.169.254/latest/meta-data/",
        "https://192.168.1.1/hook",
        "https://metadata.google.internal/x",
        "https://db.internal/hook",
        "https://[fd00::1]/hook",
      ]) {
        expect(deliverableUrl(env, url), `${url} in ${String(env.ENVIRONMENT)}`).toBe(false);
      }
    }
  });

  it("refuses credentials and a scheme that is not http", () => {
    for (const env of [production, development]) {
      expect(deliverableUrl(env, "https://user:pw@acme.example/hook")).toBe(false);
      expect(deliverableUrl(env, "ftp://acme.example/hook")).toBe(false);
      expect(deliverableUrl(env, "javascript:alert(1)")).toBe(false);
    }
  });

  it("allows loopback and plain http only outside production", () => {
    expect(deliverableUrl(development, "http://localhost:8787/hook")).toBe(true);
    expect(deliverableUrl(development, "http://127.0.0.1:8787/hook")).toBe(true);
    expect(deliverableUrl(development, "http://hooks.acme.example/hook")).toBe(true);

    expect(deliverableUrl(production, "http://localhost:8787/hook")).toBe(false);
    expect(deliverableUrl(production, "http://127.0.0.1:8787/hook")).toBe(false);
    expect(deliverableUrl(production, "http://hooks.acme.example/hook")).toBe(false);
  });

  it("recognises loopback however it is spelled", () => {
    // The spellings a hostname denylist misses. In production every one of
    // these is refused; in development every one is the developer's own
    // machine, which is the same fact read two ways.
    for (const url of [
      "https://127.0.0.1/hook",
      "https://127.1/hook",
      "https://2130706433/hook",
      "https://0x7f.0.0.1/hook",
      "https://0177.0.0.1/hook",
      "https://[::1]/hook",
      "https://[::ffff:127.0.0.1]/hook",
    ]) {
      expect(deliverableUrl(production, url), `${url} in production`).toBe(false);
      expect(deliverableUrl(development, url), `${url} in development`).toBe(true);
    }
  });
});
