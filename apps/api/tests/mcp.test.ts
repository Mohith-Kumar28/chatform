import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";
import { TOOL_BUDGET } from "../src/mcp/server.js";
import { resetSpecIndex } from "../src/mcp/spec-index.js";

/**
 * `api_access` is a paid feature, so an unsubscribed org 402s on every `/v1` call
 * — which is the correct behaviour and is asserted on its own below. Most tests
 * here are about something else, so they need an org that has actually paid.
 */
async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(
      PLANS.pro.priceMonthlyCents,
      PLANS.pro.priceYearlyCents,
      JSON.stringify(PLANS.pro.features),
      JSON.stringify(PLANS.pro.limits),
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(
      `sub_mcp_${orgId}`,
      orgId,
      `dodo_mcp_${orgId}`,
      Date.now() - 1000,
      Date.now() + 86_400_000 * 20,
      Date.now(),
      Date.now(),
    )
    .run();
  await invalidateEntitlements(env as never, orgId);
}

/**
 * The MCP surface.
 *
 * Two classes of assertion here, and the second is the interesting one. The first
 * is that the protocol works at all. The second is that the guards `/mcp` claims to
 * inherit are actually inherited — a key that cannot read analytics over HTTP must
 * not be able to read them through a tool, and no tool may delete anything. An MCP
 * server is a second front door, and a second front door with its own idea of
 * authorization is how tenancy bugs happen.
 */

let t: Tenant;
let other: Tenant;
let free: Tenant;
let key: string;

/** One JSON-RPC call against the stateless transport. */
async function rpc(
  method: string,
  params: unknown,
  opts: { key?: string | null; id?: number } = {},
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  const presented = opts.key === undefined ? key : opts.key;
  if (presented) headers["x-api-key"] = presented;

  const res = await fetchApi("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: opts.id ?? 1, method, params }),
  });

  const text = await res.text();
  if (text === "") return { status: res.status, body: null };
  // The transport may answer a POST as a single SSE event rather than plain JSON.
  const payload = text.startsWith("event:") || text.startsWith("data:")
    ? text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join("")
    : text;
  try {
    return { status: res.status, body: JSON.parse(payload) };
  } catch {
    return { status: res.status, body: payload };
  }
}

/** Call a tool and return its first text block, plus whether it was an error. */
async function callTool(name: string, args: Record<string, unknown>, useKey?: string) {
  const res = await rpc("tools/call", { name, arguments: args }, useKey ? { key: useKey } : {});
  const result = res.body?.result;
  return {
    status: res.status,
    isError: result?.isError === true,
    text: (result?.content?.[0]?.text as string | undefined) ?? JSON.stringify(res.body),
    rpcError: res.body?.error,
  };
}

beforeAll(async () => {
  await applySchema();
  resetSpecIndex();
  t = await seedTenant("mcpmain");
  other = await seedTenant("mcpother");
  free = await seedTenant("mcpfree");
  await subscribePro(t.orgId);
  await subscribePro(other.orgId);
  key = (
    await seedKey(t, "mcpkey", {
      // The bundle an "agent" key would carry — see the scope-preset note in the
      // MCP docs. Deliberately without `response:delete`, which no endpoint
      // requires and which MCP would refuse anyway.
      scopes: {
        form: ["read", "write", "publish"],
        response: ["read", "write", "export"],
        session: ["create", "write", "read"],
        analytics: ["read"],
        webhook: ["read", "write"],
        file: ["read"],
      },
    })
  ).raw;
});

describe("transport", () => {
  it("answers initialize with the protocol version and server name", async () => {
    const res = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "vitest", version: "1.0.0" },
    });
    expect(res.status).toBe(200);
    expect(res.body?.result?.serverInfo?.name).toBe("chatform");
    expect(res.body?.result?.protocolVersion).toBeTruthy();
  });

  it("refuses an unauthenticated call, and not with the REST envelope", async () => {
    const res = await rpc("tools/list", {}, { key: null });
    expect(res.status).toBe(401);
    // The REST surface would answer `{error:{code,message}}`; a 401 here is the
    // HTTP-level refusal an MCP client needs in order to prompt for a credential.
    expect(res.body?.error?.code).toBe("unauthorized");
  });

  /**
   * A publishable key is refused, and which refusal it gets depends on how it
   * arrives — both are asserted because both are load-bearing. Without an `Origin`
   * the existing per-key allowlist rejects it first; with a permitted one it gets
   * past `requireApiKey` and `/mcp`'s own check has to be the thing that stops it.
   */
  it("refuses a publishable key however it arrives", async () => {
    const pk = (
      await seedKey(t, "mcppk", { type: "pk_live", origins: ["https://shop.example.com"] })
    ).raw;

    const noOrigin = await rpc("tools/list", {}, { key: pk });
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body?.error?.code).toBe("origin_not_allowed");

    const res = await fetchApi("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": pk,
        origin: "https://shop.example.com",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(403);
    expect((await res.json<any>()).error.code).toBe("secret_key_required");
  });

  /**
   * The connector must install on a plan that has not paid for API access, and the
   * refusal must arrive as a readable tool error rather than a failed connection —
   * a 402 at the transport level shows up in every client as "could not connect",
   * which loses both the user and the upsell.
   */
  it("lists tools without api_access, and sells the upgrade on the first call", async () => {
    const freeKey = (await seedKey(free, "mcpfreekey", { scopes: { form: ["read"] } })).raw;

    const list = await rpc("tools/list", {}, { key: freeKey });
    expect(list.status).toBe(200);
    expect(list.body?.result?.tools?.length).toBeGreaterThan(0);

    const out = await callTool("list_forms", {}, freeKey);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("feature_locked");
    expect(out.text).toMatch(/upgrade|plan/i);
  });
});

describe("tools/list", () => {
  /**
   * The exact roster, by name.
   *
   * Hardcoded so that adding a tool is a deliberate diff rather than a drift: the
   * budget is shared with every other server the user has connected, and the
   * cheapest way to overrun it is one convenient addition at a time.
   */
  it("exposes exactly the intended roster, inside the budget every client enforces", async () => {
    const res = await rpc("tools/list", {});
    const names = (res.body.result.tools as { name: string }[]).map((x) => x.name).sort();
    expect(names).toEqual(
      [
        "chatform_api_details",
        "chatform_api_read",
        "chatform_api_search",
        "chatform_api_write",
        "check_export",
        "create_form",
        "create_spreadsheet_feed",
        "create_webhook",
        "export_responses",
        "generate_form_with_ai",
        "get_file",
        "get_form",
        "get_form_analytics",
        "get_response",
        "list_blocks",
        "list_events",
        "list_form_versions",
        "list_forms",
        "list_responses",
        "list_templates",
        "list_webhook_deliveries",
        "list_webhooks",
        "publish_form",
        "replay_webhook_delivery",
        "restore_form_version",
        "search_responses",
        "submit_response",
        "update_form",
        "use_template",
        "whoami",
      ].sort(),
    );
    expect(names.length).toBeLessThanOrEqual(TOOL_BUDGET);
  });

  it("gives every tool a description and annotations", async () => {
    const res = await rpc("tools/list", {});
    for (const tool of res.body.result.tools as { name: string; description?: string; annotations?: unknown }[]) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.annotations, tool.name).toBeTruthy();
    }
  });

  it("names tools within the 60 characters Cursor allows", async () => {
    const res = await rpc("tools/list", {});
    for (const tool of res.body.result.tools as { name: string }[]) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(60);
    }
  });

  /**
   * Cursor supports neither `$ref` nor `anyOf` in a tool schema, and OpenAI's
   * agents reject root-level unions. A schema that trips either is silently
   * dropped by the client, so the tool simply stops existing for that user.
   */
  it("emits self-contained object schemas with no $ref", async () => {
    const res = await rpc("tools/list", {});
    for (const tool of res.body.result.tools as { name: string; inputSchema: any }[]) {
      expect(tool.inputSchema?.type, tool.name).toBe("object");
      expect(JSON.stringify(tool.inputSchema)).not.toContain("$ref");
    }
  });

  it("exposes no tool that deletes anything", async () => {
    const res = await rpc("tools/list", {});
    const names = (res.body.result.tools as { name: string }[]).map((x) => x.name);
    expect(names.filter((n) => /delete|remove|destroy/i.test(n))).toEqual([]);
  });

  it("annotates read-only tools so hosts do not prompt for them", async () => {
    const res = await rpc("tools/list", {});
    const tools = res.body.result.tools as { name: string; annotations?: Record<string, unknown> }[];
    const list = tools.find((x) => x.name === "list_forms");
    expect(list?.annotations?.readOnlyHint).toBe(true);
    expect(list?.annotations?.destructiveHint).toBe(false);
  });
});

describe("curated tools", () => {
  it("lists the caller's own forms", async () => {
    const out = await callTool("list_forms", { status: "all" });
    expect(out.isError).toBe(false);
    expect(out.text).toContain(t.formId);
  });

  it("returns the block catalogue an agent needs to author a form", async () => {
    const out = await callTool("list_blocks", {});
    expect(out.isError).toBe(false);
    const parsed = JSON.parse(out.text);
    expect(parsed.blocks.length).toBeGreaterThan(20);
    expect(parsed.blocks[0]).toHaveProperty("config_schema");
  });

  /**
   * The default view has to be the one that works on a draft. `/v1` defaults to
   * the published config, which 404s for a form nobody has published — an agent
   * asked to look at a draft would be told it does not exist.
   */
  it("reads an unpublished form by default, and explains the public view", async () => {
    const doc = await callTool("get_form", { form_id: t.formId });
    expect(doc.isError).toBe(false);
    expect(JSON.parse(doc.text)).toHaveProperty("doc");

    const published = await callTool("get_form", { form_id: t.formId, view: "public" });
    if (published.isError) {
      expect(published.text).toContain("never been published");
    }
  });

  /**
   * The self-diagnosis path. A key minted with the defaults cannot publish, read
   * analytics or export, and this is how an agent finds that out and says something
   * useful instead of relaying a bare 403.
   */
  it("tells an under-scoped key exactly what it is missing", async () => {
    const narrow = (await seedKey(t, "mcpwhoami", { scopes: { form: ["read"] } })).raw;
    const out = await callTool("whoami", {}, narrow);
    expect(out.isError).toBe(false);
    const parsed = JSON.parse(out.text);
    expect(parsed.key.type).toBe("sk_live");
    expect(parsed.missing_for_full_mcp_use).toContain("form:write");
    expect(parsed.missing_for_full_mcp_use).toContain("analytics:read");
    expect(parsed.how_to_fix).toContain("/docs/mcp");
  });

  it("says nothing is missing for a fully scoped key", async () => {
    const out = await callTool("whoami", {});
    const parsed = JSON.parse(out.text);
    expect(parsed.missing_for_full_mcp_use).toBeUndefined();
  });

  it("lists the webhook events create_webhook will accept", async () => {
    const out = await callTool("list_events", {});
    expect(out.isError).toBe(false);
    expect(out.text).toContain("response.completed");
  });

  it("says out loud that response search is a substring match", async () => {
    const res = await rpc("tools/list", {});
    const search = (res.body.result.tools as { name: string; description: string }[]).find(
      (x) => x.name === "search_responses",
    );
    // An agent that assumes semantic search will trust an empty result. The
    // description is the only place it can learn otherwise.
    expect(search?.description).toMatch(/substring/i);
  });
});

describe("the guards are inherited, not reimplemented", () => {
  it("passes an insufficient_scope refusal through, naming the scope", async () => {
    const narrow = (await seedKey(t, "mcpnarrow", { scopes: { form: ["read"] } })).raw;
    const out = await callTool("get_form_analytics", { form_id: t.formId }, narrow);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("insufficient_scope");
    expect(out.text).toContain("analytics:read");
  });

  it("cannot read another organization's form", async () => {
    const out = await callTool("get_form", { form_id: other.formId });
    expect(out.isError).toBe(true);
    // 404 rather than 403: the API never confirms that another tenant's id exists.
    expect(out.text).toContain("not_found");
  });
});

describe("write tools", () => {
  it("marks a whole-document replacement as destructive, and a publish as not", async () => {
    const res = await rpc("tools/list", {});
    const tools = res.body.result.tools as { name: string; annotations?: Record<string, unknown> }[];
    // `update_form` discards the previous draft, which is what the hint is for —
    // hosts use it to decide whether to confirm with the user first.
    expect(tools.find((x) => x.name === "update_form")?.annotations?.destructiveHint).toBe(true);
    // Publishing adds a version; it removes nothing.
    expect(tools.find((x) => x.name === "publish_form")?.annotations?.destructiveHint).toBe(false);
  });

  it("tells the agent to read the document before replacing it", async () => {
    const res = await rpc("tools/list", {});
    const update = (res.body.result.tools as { name: string; description: string }[]).find(
      (x) => x.name === "update_form",
    );
    // A partial document silently deletes every question missing from it. The
    // description is the only thing standing between an agent and that.
    expect(update?.description).toMatch(/get_form first|read it with get_form/i);
  });

  /**
   * The whole point of the server, end to end: an agent reads the question
   * contract, authors a document itself, creates the form, publishes it, submits a
   * response and reads the analytics back. No chatform model spend anywhere in it.
   */
  it("authors, publishes, answers and measures a form", async () => {
    const catalogue = await callTool("list_blocks", { type: "short_text" });
    expect(catalogue.isError).toBe(false);

    const created = await callTool("create_form", {
      title: "MCP end to end",
      doc: {
        schemaVersion: 1,
        title: "MCP end to end",
        blocks: [{ id: "blk_e2e1", ref: "q_email", type: "email", title: "Email?", required: true }],
        endings: [{ id: "end_e2e", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
        logic: [],
        endingRules: [],
        variables: [],
        hiddenFields: [],
        layout: {},
        settings: {},
        theme: {},
      },
    });
    expect(created.isError).toBe(false);
    const formId = JSON.parse(created.text).id as string;
    expect(formId).toBeTruthy();

    const published = await callTool("publish_form", { form_id: formId });
    expect(published.isError).toBe(false);

    const submitted = await callTool("submit_response", {
      form_id: formId,
      answers: { q_email: "maya@northwind.co" },
      complete: true,
    });
    expect(submitted.isError).toBe(false);
    expect(JSON.parse(submitted.text).status).toBe("completed");

    const listed = await callTool("list_responses", { form_id: formId, include_answers: true });
    expect(listed.isError).toBe(false);
    expect(listed.text).toContain("maya@northwind.co");

    const analytics = await callTool("get_form_analytics", { form_id: formId });
    expect(analytics.isError).toBe(false);
    expect(JSON.parse(analytics.text).completed).toBe(1);
  });

  it("says why a response cannot be submitted to an unpublished form", async () => {
    const out = await callTool("submit_response", { form_id: t.formId, answers: {} });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("publish_form");
  });

  it("refuses a write the key has no scope for", async () => {
    const readOnly = (await seedKey(t, "mcpreadonly", { scopes: { form: ["read"] } })).raw;
    const out = await callTool("create_form", { title: "nope" }, readOnly);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("form:write");
  });
});

/**
 * The four capabilities that were dashboard-only until now.
 *
 * None of them was excluded on purpose: templates predate `/v1`, integrations and
 * version history shipped after it, and AI generation was refused by
 * deny-by-default because `PERMISSION_TO_SCOPE` had no `ai.generate` entry. These
 * assert the reach, and that the guards came with it.
 */
describe("capabilities that used to be dashboard-only", () => {
  it("lists templates and starts a form from one", async () => {
    const listed = await callTool("list_templates", {});
    expect(listed.isError).toBe(false);

    const catalogue = JSON.parse(listed.text) as { slug: string }[];
    if (catalogue.length === 0) return; // no seeded templates in this environment

    const slug = catalogue[0]!.slug;
    const one = await callTool("list_templates", { slug });
    expect(one.isError).toBe(false);
    expect(JSON.parse(one.text)).toHaveProperty("doc");

    const used = await callTool("use_template", { slug });
    expect(used.isError).toBe(false);
    expect(JSON.parse(used.text).id).toMatch(/^frm_/);
  });

  it("lists versions and rolls the draft back to one", async () => {
    const created = await callTool("create_form", {
      title: "Rollback subject",
      doc: {
        schemaVersion: 1,
        title: "Rollback subject",
        blocks: [{ id: "blk_v1", ref: "q_one", type: "email", title: "First email?", required: false }],
        endings: [{ id: "end_rollback", ref: "end_thanks", title: "Thanks", bodyMd: "" }],
        logic: [],
        endingRules: [],
        variables: [],
        hiddenFields: [],
        layout: {},
        settings: {},
        theme: {},
      },
    });
    const formId = JSON.parse(created.text).id as string;
    expect((await callTool("publish_form", { form_id: formId })).isError).toBe(false);

    const versions = await callTool("list_form_versions", { form_id: formId });
    expect(versions.isError).toBe(false);
    const list = JSON.parse(versions.text) as { version: number; responses: number }[];
    expect(list.length).toBeGreaterThan(0);
    // The response count is what makes a rollback a decision rather than a tidy-up.
    expect(list[0]).toHaveProperty("responses");

    // Change the draft, then put version 1 back over it.
    await callTool("update_form", {
      form_id: formId,
      doc: {
        schemaVersion: 1,
        title: "Rollback subject",
        blocks: [{ id: "blk_v2", ref: "q_two", type: "email", title: "Replaced email?", required: false }],
        endings: [{ id: "end_rollback", ref: "end_thanks", title: "Thanks", bodyMd: "" }],
        logic: [],
        endingRules: [],
        variables: [],
        hiddenFields: [],
        layout: {},
        settings: {},
        theme: {},
      },
    });

    const restored = await callTool("restore_form_version", { form_id: formId, version: list[0]!.version });
    expect(restored.isError).toBe(false);
    // Restoring writes the draft, never the live form — the tool has to say so, or
    // an agent will report the rollback as live when respondents still see the old one.
    expect(restored.text).toContain("publish_form");
    const back = await callTool("get_form", { form_id: formId });
    expect(back.text).toContain("q_one");
  });

  it("creates a spreadsheet feed and rotates it", async () => {
    const first = await callTool("create_spreadsheet_feed", { form_id: t.formId });
    expect(first.isError).toBe(false);
    const url = JSON.parse(first.text).feedUrl as string;
    expect(url).toContain("/p/feed/cff_");

    const rotated = await callTool("create_spreadsheet_feed", { form_id: t.formId, rotate: true });
    expect(JSON.parse(rotated.text).feedUrl).not.toBe(url);

    const listed = await callTool("chatform_api_read", { path: `/v1/forms/${t.formId}/integrations` });
    expect(listed.text).toContain("spreadsheet_feed");
  });

  it("refuses a feed to a key without response:export", async () => {
    const narrow = (await seedKey(t, "mcpnofeed", { scopes: { form: ["read", "write"] } })).raw;
    const out = await callTool("create_spreadsheet_feed", { form_id: t.formId }, narrow);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("response:export");
  });

  /**
   * AI generation is now reachable by a key, but only one that asked for it. The
   * agent preset omits `ai:generate` because it is the one scope that spends money,
   * so the default outcome for an MCP key is this refusal plus the free alternative.
   */
  it("refuses AI generation without ai:generate, and points at the free path", async () => {
    const out = await callTool("generate_form_with_ai", { prompt: "a customer onboarding form" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("ai:generate");
    expect(out.text).toContain("create_form");
  });

  it("warns in the tool description that generation costs money", async () => {
    const res = await rpc("tools/list", {});
    const gen = (res.body.result.tools as { name: string; description: string }[]).find(
      (x) => x.name === "generate_form_with_ai",
    );
    expect(gen?.description).toContain("COSTS MONEY");
    // And that there is a free way to do the same thing.
    expect(gen?.description).toMatch(/create_form/);
  });
});

describe("passthrough tools", () => {
  it("finds an endpoint by keyword and reports its required scope", async () => {
    const out = await callTool("chatform_api_search", { query: "export responses" });
    expect(out.isError).toBe(false);
    const parsed = JSON.parse(out.text);
    expect(parsed.matches.length).toBeGreaterThan(0);
    expect(parsed.matches.some((m: any) => m.path.includes("/exports"))).toBe(true);
    expect(parsed.matches.some((m: any) => m.required_scope === "response:export")).toBe(true);
  });

  it("indexes only the developer surface", async () => {
    const out = await callTool("chatform_api_search", { query: "keys billing dashboard", limit: 30 });
    const parsed = JSON.parse(out.text);
    for (const match of parsed.matches) {
      expect(match.path.startsWith("/api/")).toBe(false);
      expect(match.path.startsWith("/p/")).toBe(false);
    }
  });

  it("returns a schema for a templated path", async () => {
    const out = await callTool("chatform_api_details", { method: "GET", path: "/v1/forms/{id}" });
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text).required_scope).toBe("form:read");
  });

  it("reads through a concrete path", async () => {
    const out = await callTool("chatform_api_read", { path: "/v1/me" });
    expect(out.isError).toBe(false);
    expect(JSON.parse(out.text).organization_id).toBe(t.orgId);
  });

  /**
   * The two refusals that make the passthrough safe to ship. Neither is enforced
   * by the API — a key with `form:write` may delete a form over HTTP — so if these
   * regress, nothing else catches it.
   */
  it("refuses DELETE outright", async () => {
    const out = await callTool("chatform_api_write", {
      method: "POST",
      path: `/v1/forms/${t.formId}/publish`,
    });
    // Sanity: a write that IS allowed reaches the API.
    expect(out.rpcError).toBeUndefined();

    const del = await rpc("tools/call", {
      name: "chatform_api_write",
      arguments: { method: "DELETE", path: `/v1/forms/${t.formId}` },
    });
    // `DELETE` is not even in the enum, so the schema refuses it before the guard
    // does — either way the call cannot happen.
    const refused =
      del.body?.error !== undefined || del.body?.result?.isError === true;
    expect(refused).toBe(true);
  });

  it("refuses a path the spec does not publish", async () => {
    const out = await callTool("chatform_api_write", { method: "POST", path: "/api/keys", body: { name: "x" } });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("not a documented Chatform endpoint");
  });

  it("refuses an off-spec read", async () => {
    const out = await callTool("chatform_api_read", { path: "/api/billing/usage" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("not a documented Chatform endpoint");
  });
});
