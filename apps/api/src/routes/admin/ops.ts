import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { invalidateEntitlements } from "../../lib/entitlements.js";
import { signImpersonation } from "../../lib/impersonation.js";
import { rows } from "./shared.js";

/**
 * The console's write side — the four things that were runbook steps.
 *
 * Everything else in the platform console reads. These do not, so they share one
 * rule: **every one of them writes an `audit_logs` row against the organization
 * it touched**, with `actor_type = 'platform_admin'` and the admin's own email
 * as the label. A privileged action nobody can reconstruct afterwards is worse
 * than the manual `wrangler d1 execute` it replaced, because at least the shell
 * command left a trace in somebody's history.
 *
 * The customer sees these rows in their own activity log, which is deliberate.
 * If we change what an account is entitled to, the account's owner is entitled
 * to know.
 */

export const opsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

async function audit(
  c: { env: Bindings; get: (k: "platformAdminEmail" | "userId") => string | undefined },
  orgId: string,
  action: string,
  meta: Record<string, unknown>,
): Promise<void> {
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, actor_label, action, resource_type, resource_id, meta, created_at)
     VALUES (?, ?, 'platform_admin', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `aud_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      orgId,
      c.get("userId") ?? null,
      c.get("platformAdminEmail") ?? "platform admin",
      action,
      (meta.resourceType as string) ?? null,
      (meta.resourceId as string) ?? null,
      JSON.stringify(meta),
      Date.now(),
    )
    .run();
}

// ───────────────────────── billing repair ─────────────────────────

/**
 * Re-run a billing event the handler choked on.
 *
 * The payload was stored verbatim when it arrived, precisely so this is
 * possible: fix the bug, replay the event. Previously the recovery was "replay
 * it from the Dodo dashboard", which works only while the event is still in
 * Dodo's retention window and requires leaving the product to do it.
 */
opsRouter.post(
  "/admin/billing-events/:id/reprocess",
  describeRoute({
    tags: ["admin"],
    summary: "Re-run a stored Dodo webhook event through the handler",
    responses: {
      200: { description: "Reprocessed", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), outcome: z.string() })) } } },
      404: { description: "Not an admin, or no such event" },
    },
  }),
  async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT dodo_event_id, type, payload FROM dodo_events WHERE id = ? OR dodo_event_id = ?`,
    )
      .bind(c.req.param("id"), c.req.param("id"))
      .first<{ dodo_event_id: string; type: string; payload: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);

    const { dispatch } = await import("../billing.js");
    try {
      const evt = JSON.parse(row.payload) as Parameters<typeof dispatch>[1];
      const outcome = await dispatch(c.env, evt);
      await c.env.DB.prepare(
        `UPDATE dodo_events SET status = 'processed', processed_at = ?, error = ? WHERE dodo_event_id = ?`,
      )
        .bind(Date.now(), `replayed by admin: ${outcome}`.slice(0, 500), row.dodo_event_id)
        .run();
      // No organization to attribute this to until the handler has run, and it
      // may well be the thing that creates the link — so the platform row is
      // written against a sentinel rather than guessed at.
      await audit(c, "_platform", "admin.billing_event.reprocessed", {
        resourceType: "dodo_event",
        resourceId: row.dodo_event_id,
        type: row.type,
        outcome,
      });
      return c.json({ ok: true, outcome });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await c.env.DB.prepare(`UPDATE dodo_events SET status = 'failed', error = ? WHERE dodo_event_id = ?`)
        .bind(message.slice(0, 500), row.dodo_event_id)
        .run();
      return c.json({ ok: false, outcome: message }, 200);
    }
  },
);

/**
 * Extend a failing renewal's grace window.
 *
 * `GRACE_MS` is a week by default, set by the webhook on the first failure.
 * Extending it is what you do for a customer whose card is genuinely being
 * fixed, and the alternative — revoking a paying account's analytics while they
 * sort out their bank — is how you manufacture churn.
 */
opsRouter.post(
  "/admin/subscriptions/:id/grace",
  validator("json", z.object({ days: z.number().int().min(1).max(90), reason: z.string().max(300).optional() })),
  describeRoute({
    tags: ["admin"],
    summary: "Extend the dunning grace period on a subscription",
    responses: {
      200: { description: "Extended", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), graceUntil: z.number() })) } } },
      404: { description: "Not an admin, or no such subscription" },
    },
  }),
  async (c) => {
    const { days, reason } = c.req.valid("json");
    const sub = await c.env.DB.prepare(
      `SELECT id, organization_id, grace_until FROM subscriptions WHERE id = ?`,
    )
      .bind(c.req.param("id"))
      .first<{ id: string; organization_id: string; grace_until: number | null }>();
    if (!sub) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);

    // Extended from now, or from the existing deadline when it is still ahead —
    // so granting a week twice does not silently give less the second time.
    const base = Math.max(Date.now(), sub.grace_until ?? 0);
    const graceUntil = base + days * 24 * 60 * 60 * 1000;
    await c.env.DB.prepare(`UPDATE subscriptions SET grace_until = ?, updated_at = ? WHERE id = ?`)
      .bind(graceUntil, Date.now(), sub.id)
      .run();
    await invalidateEntitlements(c.env, sub.organization_id);
    await audit(c, sub.organization_id, "admin.grace.extended", {
      resourceType: "subscription",
      resourceId: sub.id,
      days,
      reason: reason ?? null,
      graceUntil,
    });
    return c.json({ ok: true, graceUntil });
  },
);

/**
 * Comp a feature or raise a limit for one account.
 *
 * This is `tooling/grant-founder-access.sql` and every ad-hoc "we bumped you to
 * 500 while you evaluate", made into something with a reason field and an
 * expiry. `entitlement_overrides` already had both columns and nothing to write
 * them.
 *
 * Deliberately does not change `subscriptions`: the plan pill and the Upgrade
 * button read only from there, so a comp that rewrote it would tell the customer
 * they are on Business when nothing is being billed. An override grants the
 * capability and leaves the plan honest.
 */
opsRouter.post(
  "/admin/accounts/:orgId/overrides",
  validator(
    "json",
    z.object({
      kind: z.enum(["feature", "limit"]),
      key: z.string().min(1).max(60),
      value: z.string().max(40),
      reason: z.string().min(1).max(300),
      expiresInDays: z.number().int().min(1).max(3650).nullable().optional(),
    }),
  ),
  describeRoute({
    tags: ["admin"],
    summary: "Grant a feature or raise a limit for one organization",
    responses: {
      200: { description: "Granted", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin, or no such organization" },
    },
  }),
  async (c) => {
    const orgId = c.req.param("orgId");
    const { kind, key, value, reason, expiresInDays } = c.req.valid("json");
    const org = await c.env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(orgId).first();
    if (!org) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);

    const expiresAt = expiresInDays ? Date.now() + expiresInDays * 24 * 60 * 60 * 1000 : null;
    await c.env.DB.prepare(
      `INSERT INTO entitlement_overrides (id, organization_id, kind, key, value, reason, expires_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (organization_id, kind, key) DO UPDATE SET
         value = excluded.value, reason = excluded.reason, expires_at = excluded.expires_at,
         created_by = excluded.created_by, created_at = excluded.created_at`,
    )
      .bind(
        `ovr_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        orgId,
        kind,
        key,
        value,
        reason,
        expiresAt,
        c.get("platformAdminEmail") ?? "platform admin",
        Date.now(),
      )
      .run();
    // The KV cache is what the runbook told you to delete by hand afterwards.
    await invalidateEntitlements(c.env, orgId);
    await audit(c, orgId, "admin.override.granted", { resourceType: "entitlement", resourceId: key, kind, value, reason, expiresAt });
    return c.json({ ok: true });
  },
);

opsRouter.delete(
  "/admin/accounts/:orgId/overrides/:key",
  describeRoute({
    tags: ["admin"],
    summary: "Revoke an entitlement override",
    responses: {
      200: { description: "Revoked", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const orgId = c.req.param("orgId");
    const key = c.req.param("key");
    await c.env.DB.prepare(`DELETE FROM entitlement_overrides WHERE organization_id = ? AND key = ?`)
      .bind(orgId, key)
      .run();
    await invalidateEntitlements(c.env, orgId);
    await audit(c, orgId, "admin.override.revoked", { resourceType: "entitlement", resourceId: key });
    return c.json({ ok: true });
  },
);

/**
 * Bust an organization's entitlement cache.
 *
 * The five-minute KV cache in front of `getEntitlements` is the reason a manual
 * database change appears not to have worked. This is the `wrangler kv key
 * delete --binding KV_CONFIG "ent:<org>"` from the runbook, as a button.
 */
opsRouter.post(
  "/admin/accounts/:orgId/refresh-entitlements",
  describeRoute({
    tags: ["admin"],
    summary: "Drop the cached entitlements for one organization",
    responses: {
      200: { description: "Dropped", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const orgId = c.req.param("orgId");
    await invalidateEntitlements(c.env, orgId);
    await audit(c, orgId, "admin.entitlements.refreshed", {});
    return c.json({ ok: true });
  },
);

// ───────────────────────── impersonation ─────────────────────────

/**
 * Sign in as a customer, with everything they can do.
 *
 * Not a read-only view. The point of impersonation is to reproduce a problem and
 * then fix it, and half of the reports that need it are about something that
 * does not work — a publish that fails, an integration that will not connect, a
 * webhook that will not save. A mode that can look but not touch cannot confirm
 * any of those.
 *
 * What impersonation changes is exactly one thing: attribution. Actions taken
 * while impersonating write `audit_logs` rows naming the real admin, so a
 * customer's activity log never shows work they did not do, and every action is
 * traceable to a person. That is a record, not a restriction.
 *
 * A token rather than a real session row: nothing is written to `sessions`, so
 * there is no second credential to leak or forget to revoke, and it expires on
 * its own. Signed with `BETTER_AUTH_SECRET`, and honoured only when the caller's
 * real session is itself an allowlisted platform admin — see `guards.ts`.
 */
opsRouter.post(
  "/admin/impersonate",
  validator(
    "json",
    z.object({
      userId: z.string().min(1).max(80),
      /** Which of their organizations to open. Verified as a real membership on every request. */
      orgId: z.string().min(1).max(80).optional(),
      reason: z.string().max(300).optional(),
    }),
  ),
  describeRoute({
    tags: ["admin"],
    summary: "Mint a short-lived token to act as a customer",
    responses: {
      200: {
        description: "Token",
        content: {
          "application/json": {
            schema: resolver(
              z.object({ token: z.string(), expiresAt: z.number(), user: z.object({ id: z.string(), name: z.string(), email: z.string() }) }),
            ),
          },
        },
      },
      404: { description: "Not an admin, or no such user" },
    },
  }),
  async (c) => {
    const { userId, orgId, reason } = c.req.valid("json");
    const user = await c.env.DB.prepare(`SELECT id, name, email FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ id: string; name: string; email: string }>();
    if (!user) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);

    const adminId = c.get("userId")!;
    const { token, expiresAt } = await signImpersonation(c.env, adminId, user.id, orgId);

    // Written against every organization the person belongs to, because that is
    // where the customer would look for it.
    const memberships = await rows<{ organization_id: string }>(
      c.env.DB.prepare(`SELECT organization_id FROM members WHERE user_id = ?`).bind(user.id),
    );
    for (const m of memberships) {
      await audit(c, m.organization_id, "admin.impersonation.started", {
        resourceType: "user",
        resourceId: user.id,
        targetEmail: user.email,
        reason: reason ?? null,
        expiresAt,
      });
    }

    return c.json({ token, expiresAt, user: { id: user.id, name: user.name, email: user.email } });
  },
);
