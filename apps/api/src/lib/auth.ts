import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import type { Bindings } from "../env.js";
import { ac, roles } from "./permissions.js";
import { getEntitlements, countSeats } from "./entitlements.js";
import { seatLimit } from "@repo/entitlements";
import { APIError } from "better-auth/api";
import { webOrigins, needsCrossSiteCookies, isSecureOrigin } from "./origins.js";

/**
 * Give a brand-new user an organization to land in.
 *
 * The dashboard is useless without one: `requireOrg` 403s with `no_organization`, and
 * `resolveOrgId` resolves an org purely from the caller's `members` rows.
 *
 * This has to be server-side because of OAuth. The email flow could create the org from
 * the browser after `signUp.email` resolved, but a Google sign-in is a redirect — the
 * browser leaves for Google and comes back to a finished session, with no point in between
 * where the client could make that call. Running it on user creation covers both flows
 * from one place.
 *
 * Idempotent by design: it no-ops if the user already belongs to an organization, so a
 * retried hook or a user linking a second provider never ends up with two.
 */
async function createDefaultOrg(env: Bindings, user: { id: string; name?: string | null; email: string }) {
  const existing = await env.DB.prepare(`SELECT 1 AS n FROM members WHERE user_id = ? LIMIT 1`)
    .bind(user.id)
    .first<{ n: number }>();
  if (existing) return;

  const now = Date.now();
  const rand = (n: number) => crypto.randomUUID().replace(/-/g, "").slice(0, n);
  // `organizations.slug` is UNIQUE, so a readable base gets a random suffix rather than
  // trusting the base to be free. Google display names are arbitrary user input; anything
  // that is not slug-safe is dropped, and an empty result falls back to a fixed word so the
  // slug is never just the suffix.
  const base =
    (user.email.split("@")[0] ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "workspace";

  // Retried rather than assumed: a collision leaves the user with no organization at all,
  // which is a broken dashboard, and the INSERT is the only place the race is visible.
  for (let attempt = 0; attempt < 3; attempt++) {
    const orgId = `org_${rand(8)}`;
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)`).bind(
          orgId,
          user.name?.trim() || "My Workspace",
          `${base}-${rand(6)}`,
          now,
        ),
        env.DB.prepare(
          `INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
        ).bind(`mem_${rand(12)}`, orgId, user.id, now),
      ]);
      return;
    } catch (err) {
      if (attempt === 2) {
        // Surfaced, not swallowed: the user exists but cannot use the dashboard, and a
        // silent failure here looks like a frontend bug.
        console.error("default_org_create_failed", user.id, err);
        throw err;
      }
    }
  }
}

export function createAuth(env: Bindings) {
  const db = createDb(env.DB);
  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema, usePlural: true }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_ORIGIN,
    trustedOrigins: [env.APP_ORIGIN, ...webOrigins(env)],
    /**
     * Cookie flags for a browser app on a different origin from the API.
     *
     * A cross-site request only receives a session cookie if it is `SameSite=None`, and
     * `None` is only accepted alongside `Secure`. Better Auth defaults to `Lax`, which is
     * right for a same-origin app and silently breaks sign-in for a split deployment —
     * the request succeeds, no cookie is stored, and every later call is a 401.
     *
     * Applied only when it is actually needed: a plain-http localhost API cannot set a
     * `Secure` cookie at all, so forcing these there would break local dev instead.
     */
    advanced: needsCrossSiteCookies(env)
      ? {
          defaultCookieAttributes: { sameSite: "none", secure: true, httpOnly: true },
          useSecureCookies: true,
        }
      : { useSecureCookies: isSecureOrigin(env) },
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
    },
    /**
     * Google is registered only when both halves of the credential are present, so a
     * checkout with no Google setup keeps working on email and password alone instead of
     * failing the callback. `GET /api/auth-providers` reports the same condition, which is
     * how the sign-in page decides whether to draw the button.
     */
    socialProviders: googleAuthConfigured(env)
      ? {
          google: {
            clientId: env.GOOGLE_DASHBOARD_CLIENT_ID!,
            clientSecret: env.GOOGLE_DASHBOARD_CLIENT_SECRET!,
          },
        }
      : {},
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createDefaultOrg(env, user as { id: string; name?: string | null; email: string });
          },
        },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    // `ac`/`roles` come from lib/permissions.ts so the server and the web client check
    // the same statements. Without them the plugin falls back to owner/admin/member and
    // `editor`/`viewer` would resolve to no permissions at all.
    plugins: [
      organization({
        ac,
        roles,
        /**
         * Seat limit, enforced where invitations are actually created.
         *
         * Better Auth owns the invite endpoint, so this cannot be a Hono middleware —
         * hooking the plugin is the only place that sees every path into `invitations`,
         * including the client SDK calling it directly.
         *
         * Pending invitations count against the total: without that, three simultaneous
         * invites all pass on a one-seat plan and the org quietly ends up over.
         */
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation }) => {
            const orgId = invitation.organizationId;
            if (!orgId) return;
            const ent = await getEntitlements(env, orgId);
            const limit = ent.limits.seats;
            if (limit == null) return;
            const used = await countSeats(env, orgId);
            if (used >= limit) {
              const body = seatLimit(ent.planId, used, limit);
              throw new APIError("PAYMENT_REQUIRED", body as unknown as Record<string, unknown>);
            }
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Whether dashboard Google sign-in is usable. Both halves are required — see `Bindings`.
 */
export function googleAuthConfigured(env: Bindings): boolean {
  return Boolean(env.GOOGLE_DASHBOARD_CLIENT_ID && env.GOOGLE_DASHBOARD_CLIENT_SECRET);
}
