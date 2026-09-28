import { AsyncLocalStorage } from "node:async_hooks";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { serializeSignedCookie } from "better-call";
import type { Bindings } from "../env.js";
import { isPlatformAdmin } from "./platform-admin.js";

/**
 * Acting as a customer.
 *
 * The admin gets a real session for the customer, so the whole product,
 * Better Auth's own endpoints included, answers exactly as it would for them:
 * their avatar and profile, their organization list, switching between their
 * organizations, their plan and usage. The previous design was a signed
 * assertion honoured only by our own routes, and every screen that read Better
 * Auth directly (the organization switcher, the account menu) showed the admin
 * instead, so those screens had to be hidden.
 *
 * What keeps it from being an ordinary login:
 *
 *   - **Never a cookie.** The token lives in the impersonating tab's
 *     `sessionStorage` and rides in the `x-chatform-impersonate` header. The
 *     plugin below rewrites the request's cookies to that session and nothing
 *     else, and the auth route strips `Set-Cookie` from the answer, so the
 *     admin's own browser session is never read or overwritten, and the
 *     console tab stays the admin.
 *   - **Marked.** `sessions.impersonated_by` names the admin. It attributes
 *     audit rows, keeps the session out of "last seen", and is required: the
 *     header is refused for any session without it, so it cannot become a way
 *     to replay an ordinary stolen token.
 *   - **Short.** An hour from creation, enforced here against `created_at`, not
 *     only against `expires_at`, which Better Auth's refresh could move.
 *   - **Still an admin.** The allowlist is checked against the live secret on
 *     every request, so removing someone from `PLATFORM_ADMIN_EMAILS` ends
 *     their outstanding sessions at once.
 *   - **Account-safe.** Changing the customer's password, email or sessions,
 *     deleting the account, and inviting people are refused.
 */

/** An hour. Long enough for a support session, short enough to be forgotten safely. */
export const IMPERSONATION_TTL_MS = 60 * 60 * 1000;

export const IMPERSONATION_HEADER = "x-chatform-impersonate";

/**
 * Who is really at the keyboard, for the rest of this request.
 *
 * Set by `requireSession` around the handler, and read by `audit()`, so every
 * activity-log row written while acting as someone names the admin without
 * each of the routes that write one having to remember to ask.
 */
export const actingAdmin = new AsyncLocalStorage<{ adminId: string; adminEmail: string; userId: string }>();

/**
 * Better Auth endpoints an admin may not reach while acting as someone.
 *
 * Each of these changes who controls the account, or who else is in the
 * organization, and none of them is ever the thing a support visit needs.
 */
const REFUSED_PATHS = [
  /^\/change-password/,
  /^\/change-email/,
  /^\/email-otp\/(request|change)-email/,
  /^\/set-password/,
  /^\/delete-user/,
  /^\/revoke-/,
  /^\/sign-out/,
  /^\/multi-session\/(set-active|revoke)/,
  /^\/(link-social|unlink-account)/,
  /^\/organization\/(invite-member|delete|leave|remove-member|update-member-role|accept-invitation|reject-invitation)/,
  /^\/api-key\//,
];

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Open a session as `userId`, landing in `orgId` when they belong to it.
 *
 * Written straight to `sessions` rather than through Better Auth's adapter, on
 * purpose: its create hooks would record a "sign in" by the customer (from the
 * admin's machine) and overwrite the organization the console asked for.
 */
export async function startImpersonation(
  env: Bindings,
  params: { adminId: string; userId: string; orgId?: string; ipAddress?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: number }> {
  let orgId: string | null = null;
  if (params.orgId) {
    const member = await env.DB.prepare(`SELECT 1 AS ok FROM members WHERE user_id = ? AND organization_id = ?`)
      .bind(params.userId, params.orgId)
      .first<{ ok: number }>();
    if (member) orgId = params.orgId;
  }
  if (!orgId) {
    // Where they were last, as `resolveOrgId` would pick it for them; the
    // oldest membership when none of their sessions chose one.
    const last = await env.DB.prepare(
      `SELECT m.organization_id AS org
         FROM members m
        WHERE m.user_id = ?1
        ORDER BY (m.organization_id = (
                    SELECT s.active_organization_id FROM sessions s
                     WHERE s.user_id = ?1 AND s.active_organization_id IS NOT NULL
                       AND s.impersonated_by IS NULL
                     ORDER BY s.updated_at DESC LIMIT 1
                  )) DESC,
                 m.created_at ASC
        LIMIT 1`,
    )
      .bind(params.userId)
      .first<{ org: string }>();
    orgId = last?.org ?? null;
  }

  const now = Date.now();
  const token = newToken();
  const expiresAt = now + IMPERSONATION_TTL_MS;
  await env.DB.prepare(
    `INSERT INTO sessions (id, token, user_id, expires_at, ip_address, user_agent, active_organization_id, impersonated_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      token,
      params.userId,
      expiresAt,
      params.ipAddress ?? "",
      params.userAgent ?? "",
      orgId,
      params.adminId,
      now,
      now,
    )
    .run();
  return { token, expiresAt };
}

/** End it. Only ever deletes an impersonation session this admin opened, whatever token is sent. */
export async function endImpersonation(env: Bindings, token: string, adminId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM sessions WHERE token = ? AND impersonated_by = ?`).bind(token, adminId).run();
}

/**
 * The admin behind a live impersonation token, or null when anything is off:
 * no such session, not an impersonation, older than an hour, or the admin is no
 * longer on the allowlist.
 */
export async function resolveImpersonation(
  env: Bindings,
  token: string | null | undefined,
): Promise<{ adminId: string; adminEmail: string; userId: string; orgId: string | null } | null> {
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.user_id, s.active_organization_id, s.impersonated_by, s.created_at, a.email AS admin_email
       FROM sessions s JOIN users a ON a.id = s.impersonated_by
      WHERE s.token = ? AND s.impersonated_by IS NOT NULL`,
  )
    .bind(token)
    .first<{
      user_id: string;
      active_organization_id: string | null;
      impersonated_by: string;
      created_at: number;
      admin_email: string;
    }>();
  if (!row) return null;
  if (row.created_at + IMPERSONATION_TTL_MS < Date.now()) return null;
  if (!isPlatformAdmin(env, row.admin_email)) return null;
  return {
    adminId: row.impersonated_by,
    adminEmail: row.admin_email,
    userId: row.user_id,
    orgId: row.active_organization_id,
  };
}

/**
 * Turns the header into the customer's session for every Better Auth call,
 * including `auth.api.getSession` from our own guards.
 *
 * When the header is present the request's cookies are *replaced*, never
 * merged: a valid token becomes the customer's session cookie, and an invalid
 * one becomes no cookie at all. Falling back to the admin's own cookie would
 * quietly show the admin's account inside a tab that says it is the customer's.
 *
 * The "don't remember me" cookie rides along so Better Auth never refreshes the
 * session's expiry out to its usual seven days.
 */
export function impersonationPlugin(env: Bindings): BetterAuthPlugin {
  return {
    id: "chatform-impersonation",
    hooks: {
      before: [
        {
          matcher: (context) =>
            Boolean(context.request?.headers.get(IMPERSONATION_HEADER) || context.headers?.get(IMPERSONATION_HEADER)),
          handler: createAuthMiddleware(async (c) => {
            const existing = c.request?.headers ?? c.headers;
            const token = existing?.get(IMPERSONATION_HEADER);
            if (!token) return;
            if (REFUSED_PATHS.some((re) => re.test(c.path))) {
              throw new APIError("FORBIDDEN", { message: "Not available while acting as a customer." });
            }
            const headers = new Headers(existing ?? undefined);
            /*
              Set, never deleted: Better Auth merges the headers a hook returns
              into the request's, so a removed cookie header comes back as the
              admin's own. An empty one replaces it.
            */
            headers.set("cookie", "");
            if (await resolveImpersonation(env, token)) {
              const cookies = c.context.authCookies;
              const session = await serializeSignedCookie(cookies.sessionToken.name, token, c.context.secret);
              const dontRemember = await serializeSignedCookie(cookies.dontRememberToken.name, "true", c.context.secret);
              headers.set("cookie", `${session}; ${dontRemember}`);
            }
            return { context: { headers } };
          }),
        },
      ],
    },
  };
}
