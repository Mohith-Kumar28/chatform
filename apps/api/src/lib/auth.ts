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
