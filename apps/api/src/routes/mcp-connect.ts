/**
 * The person-facing half of MCP OAuth: the consent screen's data, and the list
 * of connected assistants with a Disconnect button.
 *
 * The flow, end to end:
 *
 * 1. An assistant sends the browser to `GET /oauth/authorize`. The provider
 *    validates the client, the redirect URI and PKCE; the request is parked in
 *    KV for fifteen minutes and the browser goes on to the web app's
 *    `/oauth/consent?request=…`, which signs the person in first if it has to.
 * 2. That page reads `GET /api/mcp/consent/:id` (who is asking, where the
 *    access goes, which organizations this person can connect).
 * 3. Allow posts to `POST /api/mcp/consent/:id`, which mints the key, completes
 *    the grant and answers with the client's redirect, which the page follows.
 *
 * The consent page lives on the web app, not here, so it is the same product
 * the person signed in to: their session, their theme, their organization
 * names. This API sees the session cookie on all three steps.
 */
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
  AuthorizationError,
  CimdFetchError,
  authorizationErrorRedirect,
  type AuthRequest,
  type ConsentDescription,
} from "@cloudflare/workers-oauth-provider";
import type { Bindings } from "../env.js";
import { validator } from "../lib/validator.js";
import { requireOrg, requireSession, resolveOrgId, type GuardVars } from "../lib/guards.js";
import { requirePermission, type AuthzVars } from "../lib/authorize.js";
import { orgTier, roleAllows } from "../lib/permissions.js";
import { getAuth } from "../lib/auth-instance.js";
import { MCP_SCOPES } from "../lib/scopes.js";
import { RATE_LIMIT_DEFAULTS, environmentOf, storedConfigId } from "../lib/apikey-config.js";
import { audit } from "../lib/gate-log.js";
import { webOrigins } from "../lib/origins.js";
import { AUTHORIZE_PATH, CONNECTOR_SCOPE, oauthApi, type ConnectorProps } from "../mcp/oauth.js";

/** How long a person has between the assistant opening the browser and clicking Allow. */
const PENDING_TTL_SECONDS = 15 * 60;
const pendingKey = (id: string) => `consent_req:${id}`;

interface Pending {
  request: AuthRequest;
  details: ConsentDescription;
}

/** Stored on the minted key, so the key list and Disconnect know what it is for. */
export interface ConnectorMeta {
  clientId: string;
  clientName: string;
  /** Names the grant this key belongs to (`grant.metadata.connectionId`). */
  connectionId: string;
}

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/** The grant's user id. The provider forbids `:` in it; Better Auth ids never contain one, but say so. */
const grantUser = (userId: string) => encodeURIComponent(userId);

// ─────────────────────────── /oauth/authorize ───────────────────────────

export const mcpAuthorizeRouter = new Hono<{ Bindings: Bindings }>();

mcpAuthorizeRouter.get(AUTHORIZE_PATH, async (c) => {
  const web = webOrigins(c.env)[0]!;
  const api = oauthApi(c.env);
  let request: AuthRequest;
  let details: ConsentDescription;
  try {
    request = await api.parseAuthRequest(c.req.raw);
    details = await api.describeConsent(request);
  } catch (err) {
    // Only a validated redirect URI may be redirected to; anything else is shown on our own page.
    if (err instanceof AuthorizationError && err.redirectTo) return c.redirect(err.redirectTo, 302);
    if (err instanceof AuthorizationError || err instanceof CimdFetchError) {
      console.warn("mcp_authorize_rejected", {
        error: err instanceof AuthorizationError ? err.code : err.message,
        clientId: c.req.query("client_id") ?? null,
      });
      return c.redirect(`${web}/oauth/consent?error=invalid_request`, 302);
    }
    throw err;
  }
  const id = randomId();
  await c.env.OAUTH_KV.put(pendingKey(id), JSON.stringify({ request, details } satisfies Pending), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
  return c.redirect(`${web}/oauth/consent?request=${id}`, 302);
});

// ─────────────────────────── /api/mcp/* ───────────────────────────

export const mcpConnectRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

mcpConnectRouter.use("/mcp/*", requireSession);

async function loadPending(env: Bindings, id: string): Promise<Pending | null> {
  if (!/^[a-f0-9]{40}$/.test(id)) return null;
  return env.OAUTH_KV.get<Pending>(pendingKey(id), "json");
}

const expired = {
  error: { code: "consent_expired", message: "This sign-in link has expired. Start connecting again from your AI app." },
};

interface OrgChoice {
  id: string;
  name: string;
  role: string;
  /** Minting an organization-wide key is an owner/admin act, the same rule as Settings → API keys. */
  canConnect: boolean;
}

async function orgChoices(env: Bindings, userId: string): Promise<OrgChoice[]> {
  const rows = await env.DB.prepare(
    `SELECT o.id, o.name, m.role
       FROM members m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = ? ORDER BY m.created_at ASC`,
  )
    .bind(userId)
    .all<{ id: string; name: string; role: string }>();
  return (rows.results ?? []).map((r) => ({
    ...r,
    canConnect: roleAllows(orgTier(r.role), "apikey", "create"),
  }));
}

mcpConnectRouter.get(
  "/mcp/consent/:id",
  describeRoute({
    tags: ["dashboard"],
    summary: "An AI app's pending connection request, for the consent page",
    responses: { 200: { description: "Who is asking and which organizations can be connected" }, 404: { description: "Expired" } },
  }),
  async (c) => {
  const pending = await loadPending(c.env, c.req.param("id"));
  if (!pending) return c.json(expired, 404);
  const userId = c.get("userId")!;
  const orgs = await orgChoices(c.env, userId);
  const active = await resolveOrgId(c.env, userId);
  const { details } = pending;
  return c.json({
    client: {
      name: details.clientName,
      /** Set only for a client whose identity is a URL it controls; otherwise the name is self-asserted. */
      verifiedDomain: details.clientDomain ?? null,
      redirectHost: details.redirectHost,
      local: details.redirectIsLoopback,
    },
    orgs,
    defaultOrgId: orgs.find((o) => o.id === active && o.canConnect)?.id ?? orgs.find((o) => o.canConnect)?.id ?? null,
  });
  },
);

const Decision = z.object({
  decision: z.enum(["allow", "deny"]),
  orgId: z.string().max(64).optional(),
});

mcpConnectRouter.post(
  "/mcp/consent/:id",
  describeRoute({
    tags: ["dashboard"],
    summary: "Allow or deny an AI app's connection",
    responses: { 200: { description: "Where to send the browser back to the app" }, 404: { description: "Expired" } },
  }),
  validator("json", Decision),
  async (c) => {
  const id = c.req.param("id");
  const pending = await loadPending(c.env, id);
  if (!pending) return c.json(expired, 404);
  const body = c.req.valid("json");
  const userId = c.get("userId")!;

  if (body.decision === "deny") {
    await c.env.OAUTH_KV.delete(pendingKey(id));
    return c.json({ redirectTo: authorizationErrorRedirect(pending.request, "access_denied") });
  }

  /**
   * Not while a platform admin is acting as the customer: the connection would
   * outlive the impersonation by a year, as a credential they never issued.
   */
  if (c.get("impersonatorId")) {
    return c.json(
      { error: { code: "impersonation_forbidden", message: "AI apps can't be connected while signed in as a customer." } },
      403,
    );
  }

  const org = (await orgChoices(c.env, userId)).find((o) => o.id === body.orgId);
  if (!org) return c.json({ error: { code: "not_found", message: "Organization not found" } }, 404);
  if (!org.canConnect) {
    return c.json(
      {
        error: {
          code: "forbidden",
          message: "Only an owner or admin of this organization can connect an AI app. Ask one of them to connect it.",
        },
      },
      403,
    );
  }

  // Consumed before anything is minted, so a double click cannot mint two keys.
  await c.env.OAUTH_KV.delete(pendingKey(id));

  const { request, details } = pending;
  const connector: ConnectorMeta = {
    clientId: request.clientId,
    clientName: details.clientName.slice(0, 80),
    connectionId: randomId(),
  };
  const created = await getAuth(c.env).api.createApiKey({
    body: {
      configId: storedConfigId("sk_live"),
      name: `${connector.clientName.slice(0, 40)} (AI connector)`,
      organizationId: org.id,
      userId,
      permissions: MCP_SCOPES,
      rateLimitEnabled: true,
      rateLimitMax: RATE_LIMIT_DEFAULTS.sk_live,
      rateLimitTimeWindow: 60_000,
      metadata: { createdBy: userId, origins: [], formIds: [], connector },
    },
    // No `headers`: see keys.ts. A request-bearing call would drop `permissions`.
  });
  await c.env.DB.prepare(`UPDATE api_keys SET organization_id = ?, environment = ?, created_by = ? WHERE id = ?`)
    .bind(org.id, environmentOf("sk_live"), userId, created.id)
    .run();

  const props: ConnectorProps = { apiKey: created.key, keyId: created.id, orgId: org.id, userId };
  const { redirectTo } = await oauthApi(c.env).completeAuthorization({
    request,
    userId: grantUser(userId),
    metadata: { connectionId: connector.connectionId, orgId: org.id, keyId: created.id },
    // Whatever was asked for, the grant is the one scope there is, plus a refresh token.
    scope: [CONNECTOR_SCOPE, "offline_access"],
    props,
  });

  await audit(c.env, {
    orgId: org.id,
    actorType: "user",
    actorId: userId,
    action: "mcp.connect",
    resourceType: "api_key",
    resourceId: created.id,
    meta: { client: connector.clientName, clientId: connector.clientId, redirectHost: details.redirectHost },
  });

  // Reconnecting the same app replaced its old grant; retire the key that grant carried.
  await retireOrphanedKeys(c.env, userId).catch((err: unknown) =>
    console.error("mcp_orphan_sweep_failed", { error: err instanceof Error ? err.message : String(err) }),
  );

  return c.json({ redirectTo });
  },
);

// ─────────────────────────── connections ───────────────────────────

interface ConnectionRow {
  id: string;
  metadata: string | null;
  last_request: number | null;
  created_at: number;
  created_by: string | null;
  creator_name: string | null;
  creator_email: string | null;
}

function connectorOf(metadata: string | null): ConnectorMeta | null {
  try {
    return (JSON.parse(metadata ?? "null") as { connector?: ConnectorMeta } | null)?.connector ?? null;
  } catch {
    return null;
  }
}

/** Live connection ids for one person, across every organization. */
async function liveConnections(env: Bindings, userId: string): Promise<Set<string>> {
  const api = oauthApi(env);
  const live = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await api.listUserGrants(grantUser(userId), { cursor, limit: 100 });
    for (const grant of page.items) {
      const id = (grant.metadata as { connectionId?: string } | null)?.connectionId;
      if (id) live.add(id);
    }
    cursor = page.cursor;
  } while (cursor);
  return live;
}

/**
 * Disable connector keys whose grant no longer exists — replaced by a
 * reconnect, revoked by the client, or lapsed after two idle months. The key
 * is unreachable by then (only the grant ever held it), so this is tidiness,
 * not security; it keeps the list showing what is actually connected.
 */
async function retireOrphanedKeys(env: Bindings, userId: string, orgId?: string): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT id, metadata FROM api_keys
      WHERE created_by = ? AND enabled = 1 AND json_extract(metadata, '$.connector.connectionId') IS NOT NULL
        ${orgId ? "AND organization_id = ?" : ""}`,
  )
    .bind(...(orgId ? [userId, orgId] : [userId]))
    .all<{ id: string; metadata: string | null }>();
  const keys = rows.results ?? [];
  if (keys.length === 0) return;
  const live = await liveConnections(env, userId);
  const dead = keys.filter((k) => !live.has(connectorOf(k.metadata)?.connectionId ?? ""));
  if (dead.length === 0) return;
  await env.DB.batch(
    dead.map((k) =>
      env.DB.prepare(`UPDATE api_keys SET enabled = 0, updated_at = ? WHERE id = ?`).bind(Date.now(), k.id),
    ),
  );
}

mcpConnectRouter.use("/mcp/connections", requireOrg, requirePermission("apikey", "read"));
mcpConnectRouter.use("/mcp/connections/*", requireOrg);

mcpConnectRouter.get(
  "/mcp/connections",
  describeRoute({
    tags: ["dashboard"],
    summary: "AI apps connected to the organization",
    responses: { 200: { description: "Connections" } },
  }),
  async (c) => {
  const orgId = c.get("orgId")!;
  const query = () =>
    c.env.DB.prepare(
      `SELECT k.id, k.metadata, k.last_request, k.created_at, k.created_by,
              u.name AS creator_name, u.email AS creator_email
         FROM api_keys k LEFT JOIN users u ON u.id = k.created_by
        WHERE k.organization_id = ? AND k.enabled = 1
          AND json_extract(k.metadata, '$.connector.connectionId') IS NOT NULL
        ORDER BY k.created_at DESC LIMIT 50`,
    )
      .bind(orgId)
      .all<ConnectionRow>();

  let rows = (await query()).results ?? [];
  const creators = [...new Set(rows.map((r) => r.created_by).filter((u): u is string => Boolean(u)))];
  if (creators.length > 0) {
    await Promise.all(creators.map((u) => retireOrphanedKeys(c.env, u, orgId))).catch((err: unknown) =>
      console.error("mcp_orphan_sweep_failed", { error: err instanceof Error ? err.message : String(err) }),
    );
    rows = (await query()).results ?? [];
  }

  return c.json(
    rows.map((r) => ({
      id: r.id,
      client: connectorOf(r.metadata)?.clientName ?? "AI app",
      connectedBy: r.creator_name || r.creator_email || null,
      lastUsedAt: r.last_request,
      connectedAt: r.created_at,
    })),
  );
  },
);

mcpConnectRouter.delete(
  "/mcp/connections/:id",
  describeRoute({
    tags: ["dashboard"],
    summary: "Disconnect an AI app",
    responses: { 200: { description: "Disconnected" }, 404: { description: "Not found" } },
  }),
  requirePermission("apikey", "revoke"),
  async (c) => {
  const orgId = c.get("orgId")!;
  const id = c.req.param("id");
  const row = await c.env.DB.prepare(
    `SELECT id, metadata, created_by FROM api_keys WHERE id = ? AND organization_id = ? AND enabled = 1`,
  )
    .bind(id, orgId)
    .first<{ id: string; metadata: string | null; created_by: string | null }>();
  const connector = connectorOf(row?.metadata ?? null);
  if (!row || !connector) return c.json({ error: { code: "not_found", message: "Connection not found" } }, 404);

  // The key first: once it is disabled the connection is dead whatever happens to the grant.
  await c.env.DB.prepare(`UPDATE api_keys SET enabled = 0, updated_at = ? WHERE id = ?`).bind(Date.now(), id).run();

  /**
   * Then the grant, so the app's next call is a clean 401 that asks the
   * person to sign in again, rather than a stream of "key revoked" errors.
   */
  if (row.created_by) {
    const api = oauthApi(c.env);
    let cursor: string | undefined;
    do {
      const page = await api.listUserGrants(grantUser(row.created_by), { cursor, limit: 100 });
      for (const grant of page.items) {
        if ((grant.metadata as { connectionId?: string } | null)?.connectionId === connector.connectionId) {
          await api.revokeGrant(grant.id, grantUser(row.created_by));
        }
      }
      cursor = page.cursor;
    } while (cursor);
  }

  await audit(c.env, {
    orgId,
    actorType: "user",
    actorId: c.get("userId") ?? null,
    action: "mcp.disconnect",
    resourceType: "api_key",
    resourceId: id,
    meta: { client: connector.clientName },
  });
  return c.json({ ok: true });
  },
);
