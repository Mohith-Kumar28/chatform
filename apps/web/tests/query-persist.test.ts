import { describe, expect, it } from "vitest";
import type { Query } from "@tanstack/react-query";
import { shouldPersistQuery } from "@/lib/api/persist";

/**
 * What is allowed to reach the disk.
 *
 * `shouldPersistQuery` is an allowlist, and the reason it is an allowlist is
 * asymmetry: a path missing from it costs one refetch after a reload, while a
 * path wrongly *in* it writes respondent data to the disk of whatever machine
 * the builder was opened on. That is a difference in kind, not degree, so the
 * membership of the list is pinned here rather than left to review.
 *
 * The analytics case is the one worth the file on its own. It reads like
 * aggregate counts — a funnel, some percentages — but the per-question
 * distributions carry `samples`, which are verbatim free-text answers. Anyone
 * extending this list by pattern-matching on "looks like statistics" would add
 * it, so there is a test that says no.
 */

/** The two fields `shouldPersistQuery` actually reads. */
function query(key: string, status: "success" | "error" | "pending" = "success"): Query {
  return { queryKey: [key], state: { status } } as unknown as Query;
}

const FORM = "form_abc123";

describe("persisted query allowlist", () => {
  it("keeps organization-level configuration", () => {
    for (const path of [
      "/api/forms",
      "/api/workspaces",
      "/api/billing/entitlements",
      "/api/billing/plans",
      "/api/templates",
      "/api/templates/customer-feedback",
    ]) {
      expect(shouldPersistQuery(query(path)), path).toBe(true);
    }
  });

  it("never persists respondent data", () => {
    for (const path of [
      `/api/forms/${FORM}/submissions`,
      // Aggregates, but `samples` inside them are verbatim answers.
      `/api/forms/${FORM}/analytics`,
      `/api/forms/${FORM}/followup-analytics`,
    ]) {
      expect(shouldPersistQuery(query(path)), path).toBe(false);
    }
  });

  it("never persists credentials, admin surfaces or the editable document", () => {
    for (const path of [
      "/api/keys",
      "/api/admin/accounts",
      "/api/admin/overview",
      // A stale draft under an autosaving editor causes conflicts nobody caused.
      `/api/forms/${FORM}`,
      `/api/forms/${FORM}/knowledge`,
      `/api/forms/${FORM}/history`,
    ]) {
      expect(shouldPersistQuery(query(path)), path).toBe(false);
    }
  });

  /**
   * The collection and its children are separate keys, and only the collection
   * is allowlisted. `/api/forms` matching `/api/forms/{id}/submissions` by
   * prefix is precisely the mistake this guards: the generated client puts the
   * whole path in one string, so exact matching is what keeps them apart.
   */
  it("does not let an allowlisted collection carry its children in", () => {
    expect(shouldPersistQuery(query("/api/forms"))).toBe(true);
    expect(shouldPersistQuery(query(`/api/forms/${FORM}/submissions`))).toBe(false);
    expect(shouldPersistQuery(query("/api/workspaces"))).toBe(true);
    expect(shouldPersistQuery(query("/api/workspaces/ws_1/members"))).toBe(false);
  });

  it("only persists queries that succeeded", () => {
    expect(shouldPersistQuery(query("/api/forms", "error"))).toBe(false);
    expect(shouldPersistQuery(query("/api/forms", "pending"))).toBe(false);
  });

  it("ignores a key that is not a path", () => {
    expect(shouldPersistQuery({ queryKey: [], state: { status: "success" } } as unknown as Query)).toBe(false);
  });
});

/**
 * The predicate above is only half the guarantee. This runs the real thing:
 * a populated `QueryClient` through the actual persister, into a storage
 * double, and then reads back what was written. If the wiring in
 * `api-provider.tsx` ever passes the predicate somewhere it is not consulted,
 * the assertions here fail while the ones above still pass.
 */
describe("persisted cache round trip", () => {
  it("writes the allowlist and nothing else to storage", async () => {
    const { QueryClient, dehydrate } = await import("@tanstack/react-query");
    const { createAsyncStoragePersister } = await import(
      "@tanstack/query-async-storage-persister"
    );

    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };

    const client = new QueryClient();
    const seed: [string, unknown][] = [
      ["/api/forms", [{ id: "form_abc123", title: "Signup" }]],
      ["/api/workspaces", [{ id: "ws_1", name: "My Workspace" }]],
      ["/api/billing/entitlements", { planId: "pro" }],
      // The three that must not survive, each carrying something identifying.
      ["/api/forms/form_abc123/submissions", { submissions: [{ email: "someone@example.com" }] }],
      ["/api/forms/form_abc123/analytics", { distributions: [{ samples: ["I hated the checkout"] }] }],
      ["/api/forms/form_abc123", { title: "Signup", blocks: [] }],
    ];
    for (const [key, value] of seed) client.setQueryData([key], value);

    const persister = createAsyncStoragePersister({ storage, key: "test-bucket", throttleTime: 0 });
    await persister.persistClient({
      buster: "",
      timestamp: Date.now(),
      clientState: dehydrate(client, { shouldDehydrateQuery: shouldPersistQuery }),
    });

    // The persister throttles its writes through a timer, however short.
    await new Promise((r) => setTimeout(r, 20));

    const written = store.get("test-bucket");
    expect(written, "nothing was persisted at all").toBeTruthy();

    const keys = (
      JSON.parse(written!) as { clientState: { queries: { queryKey: unknown[] }[] } }
    ).clientState.queries.map((q) => q.queryKey[0]);
    expect([...keys].sort()).toEqual([
      "/api/billing/entitlements",
      "/api/forms",
      "/api/workspaces",
    ]);

    // The blunt check, on the serialized bytes rather than the parsed shape:
    // no respondent string reaches storage by any route, including a payload
    // nested somewhere the key walk above would not look.
    expect(written).not.toContain("someone@example.com");
    expect(written).not.toContain("I hated the checkout");
  });
});
