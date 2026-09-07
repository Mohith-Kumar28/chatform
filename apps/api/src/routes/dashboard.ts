import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { createAuth, googleAuthConfigured } from "../lib/auth.js";
// Memoized per-env, unlike `createAuth`, which rebuilds the whole instance —
// five plugins now — on every single /api/auth/* request.
import { getAuth } from "../lib/guards.js";

export const dashboardRouter = new Hono<{ Bindings: Bindings }>();

/**
 * Which sign-in methods this deployment actually has configured.
 *
 * Public and unauthenticated on purpose — the sign-in page is what calls it, before anyone
 * has a session. It reports only booleans: the client id is not in the response, because
 * nothing in a redirect-based OAuth flow needs it in the browser.
 *
 * Named `/auth-providers` rather than `/auth/providers` so it does not collide with the
 * `/auth/*` catch-all below, which hands everything under it to Better Auth.
 */
dashboardRouter.get(
  "/auth-providers",
  describeRoute({
    tags: ["dashboard"],
    summary: "Configured sign-in providers",
    responses: {
      200: {
        description: "Providers",
        content: {
          "application/json": {
            schema: resolver(z.object({ emailPassword: z.boolean(), google: z.boolean() })),
          },
        },
      },
    },
  }),
  (c) => c.json({ emailPassword: true, google: googleAuthConfigured(c.env) }),
);

/**
 * What an invitation link points at, before anybody has signed in.
 *
 * Better Auth's `GET /organization/get-invitation` needs a session *and* a
 * session whose email is the invitee's, and it collapses every other case into
 * one 400/403. So the page that consumes an invitation link could not tell
 * "revoked" from "expired" from "you are signed in as someone else" — and the
 * common case, an invitee who has no account yet, produced the worst reading of
 * all: a pending invitation rendered as "no longer valid".
 *
 * This answers the question that page actually has to ask, with no session:
 * who is this invitation for, to what workspace, from whom, and is it still
 * live. The invitation id is a random 32-character bearer credential that only
 * exists in one person's inbox, so it gates the response the same way the
 * accept endpoint does — and the response deliberately carries nothing an
 * invitation email does not already contain.
 *
 * Nothing here is a substitute for the real check. Accepting still goes through
 * Better Auth, which still demands a matching signed-in address.
 *
 * Registered before the `/auth/*` catch-all, and named outside it, for the same
 * reason `/auth-providers` is.
 */
dashboardRouter.get(
  "/invitation-preview",
  describeRoute({
    tags: ["dashboard"],
    summary: "Public summary of an invitation link",
    responses: {
      200: {
        description: "Invitation",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                state: z.enum(["pending", "expired", "accepted", "rejected", "canceled", "not_found"]),
                email: z.string().nullable(),
                role: z.string().nullable(),
                organizationName: z.string().nullable(),
                inviterName: z.string().nullable(),
                inviterEmail: z.string().nullable(),
                expiresAt: z.number().nullable(),
                recipientHasAccount: z.boolean(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const id = c.req.query("id")?.trim();
    const miss = {
      state: "not_found" as const,
      email: null,
      role: null,
      organizationName: null,
      inviterName: null,
      inviterEmail: null,
      expiresAt: null,
      recipientHasAccount: false,
    };
    if (!id) return c.json(miss);

    const row = await c.env.DB.prepare(
      `SELECT i.email        AS email,
              i.role         AS role,
              i.status       AS status,
              i.expires_at   AS expiresAt,
              o.name         AS organizationName,
              u.name         AS inviterName,
              u.email        AS inviterEmail,
              (SELECT 1 FROM users WHERE lower(email) = lower(i.email) LIMIT 1) AS hasAccount
         FROM invitations i
         LEFT JOIN organizations o ON o.id = i.organization_id
         LEFT JOIN users u ON u.id = i.inviter_id
        WHERE i.id = ?`,
    )
      .bind(id)
      .first<{
        email: string;
        role: string | null;
        status: string;
        expiresAt: number | null;
        organizationName: string | null;
        inviterName: string | null;
        inviterEmail: string | null;
        hasAccount: number | null;
      }>();

    if (!row) return c.json(miss);

    /**
     * Expiry outranks the stored status. Better Auth never rewrites `pending`
     * to `expired` on a lapsed row — it compares the column at read time — so a
     * row that says `pending` past its date is expired, and saying so is the
     * difference between "ask for a new invite" and "this was cancelled".
     */
    const expired = typeof row.expiresAt === "number" && row.expiresAt < Date.now();
    const state =
      row.status === "pending"
        ? expired
          ? ("expired" as const)
          : ("pending" as const)
        : row.status === "accepted" || row.status === "rejected" || row.status === "canceled"
          ? (row.status as "accepted" | "rejected" | "canceled")
          : ("not_found" as const);

    return c.json({
      state,
      email: row.email,
      role: row.role,
      organizationName: row.organizationName,
      inviterName: row.inviterName,
      inviterEmail: row.inviterEmail,
      expiresAt: row.expiresAt ?? null,
      recipientHasAccount: Boolean(row.hasAccount),
    });
  },
);

/**
 * The api-key plugin's own endpoints are not part of the public surface.
 *
 * Registering the plugin mounts `/api/auth/api-key/{create,update,delete,list,get}`
 * under this catch-all, where none of our gates run — no `api_access` feature
 * check, no RBAC, no audit row, none of the metadata conventions the rest of the
 * system relies on. A session cookie would be enough to mint an unrestricted
 * key. `/api/keys` is the only door; this shuts the other one.
 *
 * Registered before the catch-all, because Hono matches in registration order.
 */
dashboardRouter.all("/auth/api-key", (c) =>
  c.json({ error: { code: "not_found", message: "Route not found" } }, 404),
);
dashboardRouter.all("/auth/api-key/*", (c) =>
  c.json({ error: { code: "not_found", message: "Route not found" } }, 404),
);

dashboardRouter.on(["POST", "GET"], "/auth/*", (c) => getAuth(c.env).handler(c.req.raw));

dashboardRouter.get(
  "/auth/ok",
  describeRoute({
    tags: ["dashboard"],
    summary: "Auth liveness check",
    responses: { 200: { description: "ok", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } } },
  }),
  (c) => c.json({ ok: true }),
);

/**
 * Session-guard middleware: resolves the Better Auth session and stashes it.
 * Usage: dashboardRouter.use("/forms/*", requireSession)
 */
export async function requireSession(c: { env: Bindings; req: Request; set: (k: string, v: unknown) => void }, next: () => Promise<void>) {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.headers });
  if (!session) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  }
  c.set("session", session.session);
  c.set("user", session.user);
  await next();
}
