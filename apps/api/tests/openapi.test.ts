import { describe, it, expect, beforeAll } from "vitest";
import { fetchApi } from "./helpers.js";
import { PUBLISHABLE_SCOPES } from "../src/lib/scopes.js";

/**
 * What the spec promises, against what the guards do.
 *
 * The spec is the only artefact where being wrong about a guard is a security
 * claim rather than a typo, and it had two: it published 47 session-authenticated
 * dashboard operations as developer documentation, and it told every reader that a
 * publishable key — the kind that ships inside a page — could reach all 43 `/v1`
 * routes, `DELETE /v1/forms/{id}` included. Both were stamped by prefix, which is
 * why neither could notice the guard it was describing.
 */

const METHODS = ["get", "post", "put", "patch", "delete"];

type Operation = {
  security?: Record<string, string[]>[];
  tags?: string[];
  "x-internal"?: boolean;
  "x-required-scope"?: string;
};
type Spec = { paths: Record<string, Record<string, Operation>>; tags?: { name: string }[] };

function operations(spec: Spec) {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, op]) => ({ path, method, op })),
  );
}

let publicSpec: Spec;
let fullSpec: Spec;

beforeAll(async () => {
  publicSpec = (await (await fetchApi("/openapi.json")).json()) as Spec;
  fullSpec = (await (await fetchApi("/openapi.json?include=internal")).json()) as Spec;
});

describe("GET /openapi.json", () => {
  it("publishes only what a key can reach", () => {
    const surfaces = [...new Set(operations(publicSpec).map(({ path }) => path.split("/")[1]))].sort();
    expect(surfaces).toEqual(["d", "health", "v1"]);
  });

  it("withholds the dashboard and the respondent channel", () => {
    const withheld = operations(fullSpec).filter(({ op }) => op["x-internal"]);
    expect(withheld.length).toBeGreaterThan(0);
    for (const { path } of withheld) expect(path).toMatch(/^\/(api|p)\//);
    // Nothing marked internal survives into the published document.
    const published = new Set(operations(publicSpec).map(({ method, path }) => `${method} ${path}`));
    for (const { method, path } of withheld) expect(published.has(`${method} ${path}`)).toBe(false);
  });

  it("keeps the complete surface behind ?include=internal, for orval", () => {
    expect(operations(fullSpec).length).toBeGreaterThan(operations(publicSpec).length);
    const paths = Object.keys(fullSpec.paths);
    expect(paths.some((p) => p.startsWith("/api/"))).toBe(true);
    expect(paths.some((p) => p.startsWith("/p/"))).toBe(true);
  });

  it("drops tags that no longer have an operation", () => {
    const names = (publicSpec.tags ?? []).map((t) => t.name);
    expect(names).not.toContain("dashboard");
    expect(names).not.toContain("billing");
    expect(names).toContain("v1");
  });
});

describe("the security block on /v1", () => {
  /**
   * Derived from the route table by `stampSecurity`, so this asserts the
   * derivation rather than a list someone maintains: a `/v1` route that gains a
   * guard changes the spec, and a route that gains no guard at all is caught by
   * the next test.
   */
  it("offers a publishable key exactly where the ceiling allows one", () => {
    const v1 = operations(publicSpec).filter(({ path }) => path.startsWith("/v1/"));
    expect(v1.length).toBeGreaterThan(0);
    for (const { path, method, op } of v1) {
      const schemes = (op.security ?? []).flatMap((entry) => Object.keys(entry));
      const scope = op["x-required-scope"];
      const [resource, action] = scope?.split(":") ?? [];
      const withinCeiling =
        scope === undefined || (PUBLISHABLE_SCOPES[resource!] ?? []).includes(action!);
      expect(schemes, `${method.toUpperCase()} ${path}`).toContain("secretKey");
      expect(schemes, `${method.toUpperCase()} ${path}`).toContain("apiKeyHeader");
      expect(schemes.includes("publishableKey"), `${method.toUpperCase()} ${path} (${scope ?? "no scope"})`).toBe(
        withinCeiling,
      );
    }
  });

  it("never offers a publishable key on a destructive route", () => {
    for (const { path, method, op } of operations(publicSpec)) {
      if (!path.startsWith("/v1/") || method !== "delete") continue;
      const schemes = (op.security ?? []).flatMap((entry) => Object.keys(entry));
      expect(schemes, `DELETE ${path}`).not.toContain("publishableKey");
    }
  });

  /**
   * A route with no scope guard is reachable by any key including a publishable
   * one, so each is a deliberate decision rather than an oversight. These four are
   * static catalogues and the key's own identity; anything else appearing here
   * wants a guard, not a longer list.
   */
  it("has only the self-describing routes ungated", () => {
    const ungated = operations(publicSpec)
      .filter(({ path, op }) => path.startsWith("/v1/") && op["x-required-scope"] === undefined)
      .map(({ path }) => path)
      .sort();
    expect(ungated).toEqual(["/v1/blocks", "/v1/blocks/{type}", "/v1/events", "/v1/me"]);
  });

  it("records the required scope for every guarded route", () => {
    const v1 = operations(publicSpec).filter(({ path }) => path.startsWith("/v1/"));
    const guarded = v1.filter(({ op }) => op["x-required-scope"] !== undefined);
    // The bulk of the surface is guarded; a regression that stopped reading the
    // route table would leave the scope absent everywhere and pass the tests above.
    expect(guarded.length).toBeGreaterThan(v1.length - 6);
  });
});
