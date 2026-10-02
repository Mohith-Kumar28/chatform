import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, app, seedTenant, type Tenant } from "./helpers.js";
import { handleRequest } from "../src/mcp/oauth.js";
import type { Bindings } from "../src/env.js";

/**
 * "Connect your AI": the whole OAuth round trip an assistant makes, through the
 * worker's real `fetch` (provider in front of the app), on a Free organization.
 *
 * Free on purpose. The connector is meant to work on every plan, and the only
 * thing that makes that true is the `/v1` gate recognising the minted key, so a
 * test on a paid org would pass whether or not it did.
 */

const ORIGIN = "http://localhost";
const REDIRECT = "http://127.0.0.1:43210/callback";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

function call(path: string, init?: RequestInit): Promise<Response> {
  return handleRequest(app.fetch, new Request(`${ORIGIN}${path}`, init), env as unknown as Bindings, ctx);
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return { verifier, challenge };
}

async function rpc(token: string | null, method: string, params: unknown = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await call("/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const text = await res.text();
  const payload = text.startsWith("event:") || text.startsWith("data:")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
    : text;
  let body: any = null;
  try {
    body = payload ? JSON.parse(payload) : null;
  } catch {
    body = payload;
  }
  return { status: res.status, headers: res.headers, body };
}

let t: Tenant;

/** Register, authorize, consent, exchange: the access token an assistant ends up holding. */
async function connect(tenant: Tenant, decision: "allow" | "deny" = "allow") {
  const reg = await call("/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Test Assistant",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  expect(reg.status).toBe(201);
  const { client_id } = (await reg.json()) as { client_id: string };

  const { verifier, challenge } = await pkce();
  const q = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT,
    state: "st4te",
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "chatform offline_access",
    resource: `${ORIGIN}/mcp`,
  });
  const authz = await call(`/oauth/authorize?${q}`, { redirect: "manual" });
  expect(authz.status).toBe(302);
  const consentUrl = new URL(authz.headers.get("location")!);
  expect(consentUrl.pathname).toBe("/oauth/consent");
  const requestId = consentUrl.searchParams.get("request")!;
  expect(requestId).toMatch(/^[a-f0-9]{40}$/);

  const info = await call(`/api/mcp/consent/${requestId}`, { headers: { cookie: tenant.cookie } });
  expect(info.status).toBe(200);
  const details = (await info.json()) as {
    client: { name: string; redirectHost: string; local: boolean };
    orgs: { id: string; canConnect: boolean }[];
    defaultOrgId: string;
  };

  const decided = await call(`/api/mcp/consent/${requestId}`, {
    method: "POST",
    headers: { cookie: tenant.cookie, "content-type": "application/json" },
    body: JSON.stringify({ decision, orgId: tenant.orgId }),
  });
  expect(decided.status).toBe(200);
  const { redirectTo } = (await decided.json()) as { redirectTo: string };
  const back = new URL(redirectTo);
  expect(back.origin + back.pathname).toBe(REDIRECT);
  expect(back.searchParams.get("state")).toBe("st4te");
  if (decision === "deny") return { details, back, token: null as string | null, refresh: null as string | null, client_id };

  const tokenRes = await call("/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: back.searchParams.get("code")!,
      redirect_uri: REDIRECT,
      client_id,
      code_verifier: verifier,
      resource: `${ORIGIN}/mcp`,
    }),
  });
  expect(tokenRes.status).toBe(200);
  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  return { details, back, token: tokens.access_token, refresh: tokens.refresh_token ?? null, client_id };
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("oauthfree");
});

describe("discovery", () => {
  it("publishes protected resource metadata for /mcp", async () => {
    const res = await call("/.well-known/oauth-protected-resource/mcp");
    expect(res.status).toBe(200);
    const meta = (await res.json()) as { resource: string; authorization_servers: string[] };
    expect(meta.resource).toBe(`${ORIGIN}/mcp`);
    expect(meta.authorization_servers).toEqual([ORIGIN]);
  });

  it("publishes authorization server metadata with S256 and both registration styles", async () => {
    const res = await call("/.well-known/oauth-authorization-server");
    expect(res.status).toBe(200);
    const meta = (await res.json()) as Record<string, unknown>;
    expect(meta.authorization_endpoint).toBe(`${ORIGIN}/oauth/authorize`);
    expect(meta.code_challenge_methods_supported).toContain("S256");
    expect(meta.registration_endpoint).toBe(`${ORIGIN}/oauth/register`);
    expect(meta.client_id_metadata_document_supported).toBe(true);
    expect(meta.scopes_supported).toContain("offline_access");
  });

  it("answers an unauthenticated /mcp call with a 401 that points at the metadata", async () => {
    const res = await rpc(null, "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate") ?? "").toContain("resource_metadata=");
  });
});

describe("connecting", () => {
  it("runs the whole flow on a Free plan and the token reaches the tools", async () => {
    const { details, token, refresh } = await connect(t);
    expect(details.client.name).toBe("Test Assistant");
    expect(details.client.local).toBe(true);
    // Sign-up made an organization of its own too; the seeded one is listed beside it.
    expect(details.orgs.map((o) => o.id)).toContain(t.orgId);
    expect(details.orgs.every((o) => o.canConnect)).toBe(true);
    expect(refresh).toBeTruthy();

    const list = await rpc(token, "tools/list");
    expect(list.status).toBe(200);
    expect((list.body.result.tools as { name: string }[]).some((tool) => tool.name === "list_forms")).toBe(true);

    // A real call through `/v1`: on Free this used to be a 402 for want of `api_access`.
    const forms = await rpc(token, "tools/call", { name: "list_forms", arguments: {} });
    expect(forms.status).toBe(200);
    expect(forms.body.result.isError).not.toBe(true);
    expect(forms.body.result.content[0].text).toContain(t.formId);

    const used = await env.DB.prepare(
      `SELECT used FROM usage_counters WHERE organization_id = ? AND metric = 'connector_requests'`,
    )
      .bind(t.orgId)
      .first<{ used: number }>();
    expect(used?.used).toBeGreaterThanOrEqual(1);
  });

  it("lists the connection and disconnecting cuts the token off", async () => {
    const { token } = await connect(t);
    const listed = await call("/api/mcp/connections", { headers: { cookie: t.cookie } });
    expect(listed.status).toBe(200);
    const rows = (await listed.json()) as { id: string; client: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const mine = rows[0]!;
    expect(mine.client).toBe("Test Assistant");

    const off = await call(`/api/mcp/connections/${mine.id}`, { method: "DELETE", headers: { cookie: t.cookie } });
    expect(off.status).toBe(200);

    // Every connection made above was a separate client registration; this
    // token belongs to the newest, which is the one just disconnected.
    const after = await rpc(token, "tools/list");
    expect(after.status).toBe(401);
  });

  it("sends a deny back to the client as access_denied", async () => {
    const { back } = await connect(t, "deny");
    expect(back.searchParams.get("error")).toBe("access_denied");
  });

  it("refuses a consent request id it never issued", async () => {
    const res = await call(`/api/mcp/consent/${"a".repeat(40)}`, { headers: { cookie: t.cookie } });
    expect(res.status).toBe(404);
  });

  it("refuses the consent data without a session", async () => {
    const res = await call(`/api/mcp/consent/${"a".repeat(40)}`);
    expect(res.status).toBe(401);
  });
});

describe("pasted keys", () => {
  it("still reach /mcp as a bearer, and the plan gate still applies to them", async () => {
    // A Free org has no `api_access`, so a pasted key is refused by the plan, not by OAuth.
    const viaBearer = await rpc(t.apiKeyRaw, "tools/call", { name: "list_forms", arguments: {} });
    expect(viaBearer.status).toBe(200);
    expect(viaBearer.body.result.isError).toBe(true);
    expect(viaBearer.body.result.content[0].text).toContain("api_access");
  });
});
