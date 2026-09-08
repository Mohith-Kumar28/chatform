/**
 * Empty type-imports, deliberately.
 *
 * `createAuth`'s inferred type reaches into `@better-auth/core`, and under
 * pnpm's nested layout with `declaration: true` TypeScript cannot name a
 * package it has no reference to (TS2742). These two lines give it one. They
 * emit nothing.
 */
import type {} from "@better-auth/core";
import type {} from "@better-auth/core/db/adapter";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP, organization } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import type { Bindings } from "../env.js";
import { ac, roles } from "./permissions.js";
import { apiKeyPlugin } from "./apikey-config.js";
import { getEntitlements, countSeats } from "./entitlements.js";
import { seatLimit } from "@repo/entitlements";
import { APIError } from "better-auth/api";
import { webOrigins, returnOrigin, needsCrossSiteCookies, isSecureOrigin } from "./origins.js";
import { enqueueMail } from "./mail.js";
import { purgeUserData } from "./delete-account.js";

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
      .slice(0, 24) || "org";

  // Retried rather than assumed: a collision leaves the user with no organization at all,
  // which is a broken dashboard, and the INSERT is the only place the race is visible.
  for (let attempt = 0; attempt < 3; attempt++) {
    const orgId = `org_${rand(8)}`;
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO organizations (id, name, slug, created_at) VALUES (?, ?, ?, ?)`).bind(
          orgId,
          user.name?.trim() || "My Organization",
          `${base}-${rand(6)}`,
          now,
        ),
        env.DB.prepare(
          `INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
        ).bind(`mem_${rand(12)}`, orgId, user.id, now),
      ]);
      await adoptOrg(env, user.id, orgId);
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

/**
 * Point the user's org-less sessions at `orgId`.
 *
 * Signup creates the session *before* this hook runs — Better Auth issues the
 * cookie, then calls `user.create.after` — so the session that just came back to
 * the browser already exists with a null active org and cannot be fixed by the
 * session hook below. This catches it after the fact.
 *
 * Scoped to `IS NULL` so it can never move a session someone deliberately
 * switched with the workspace picker.
 */
async function adoptOrg(env: Bindings, userId: string, orgId: string): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE sessions SET active_organization_id = ? WHERE user_id = ? AND active_organization_id IS NULL`,
    )
      .bind(orgId, userId)
      .run();
  } catch (err) {
    // The org and the membership are what make the account usable; a session
    // that still has to be told which org it is in is a smaller problem than a
    // signup that fails outright.
    console.error("session_adopt_org_failed", userId, err);
  }
}

/**
 * The organization a new session should start in.
 *
 * Better Auth stores this on `sessions.active_organization_id`, and nothing was
 * ever writing it. Everything that resolves an org from `members` —
 * `resolveOrgId`, and so every API route — carried on working, which is exactly
 * why this went unnoticed. The one screen that asks Better Auth itself,
 * `/team`, showed "No organization is active" to a user whose workspace was
 * named in the nav bar directly above it.
 *
 * This covers every sign-in after the first; signup is `adoptOrg`'s job,
 * because there the membership does not exist yet when the session is made.
 *
 * The choice matches `resolveOrgId`'s fallback — the oldest membership — so the
 * session's active org and the org the API reads are the same one from the
 * first request, not two answers that happen to agree.
 */
async function defaultActiveOrgId(env: Bindings, userId: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT organization_id AS org FROM members WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`,
  )
    .bind(userId)
    .first<{ org: string }>();
  return row?.org ?? null;
}

/**
 * Which web origin a link in an email should point at.
 *
 * Better Auth hands its callbacks the originating `Request` when it has one, so
 * an invite sent from a local dev app links back to local dev and one sent from
 * production links to production — the same reasoning as checkout's
 * `returnOrigin`, and the same allowlist, so this cannot be pointed at a host
 * that is not ours. No request means a background call, and the first
 * `WEB_ORIGINS` entry is the deployment's canonical front door.
 */
function linkOrigin(env: Bindings, request?: Request): string {
  if (!request) return webOrigins(env)[0]!;
  return returnOrigin(env, { header: (name: string) => request.headers.get(name) ?? undefined });
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
      /**
       * No session until the address is proven.
       *
       * Sign-up used to hand back a working session the instant the form was
       * submitted, which meant an address was never anything more than a string
       * somebody typed: you could open an account on a colleague's email, a
       * competitor's, or one that does not exist. Every downstream promise this
       * product makes — password reset, team invitations, submission
       * notifications — assumes the address on the account belongs to the person
       * holding it, and none of them were entitled to assume that.
       *
       * `autoSignIn` is off for the same reason `requireEmailVerification` is on:
       * with verification required the sign-up response carries no session
       * anyway, and leaving the flag true only makes the intent ambiguous.
       */
      autoSignIn: false,
      requireEmailVerification: true,
      /**
       * The reset link, mailed.
       *
       * The `url` Better Auth builds is ignored on purpose: it is derived from
       * `baseURL`, which is this API's origin, so following it would land the
       * customer on `api.chatform.in` — a host with no reset form on it. The
       * token is what matters, and the page that consumes it lives in the web
       * app.
       *
       * Queued rather than sent inline so a slow or failing provider cannot
       * turn "forgot password" into a 500. The endpoint answers the same way
       * whether or not the address exists, which is what keeps it from being a
       * way to enumerate our customers — and that promise only holds if the
       * response does not depend on a send.
       */
      sendResetPassword: async ({ user, token }, request) => {
        const resetUrl = `${linkOrigin(env, request)}/reset-password?token=${encodeURIComponent(token)}`;
        await enqueueMail(env, {
          kind: "password_reset",
          to: user.email,
          name: user.name ?? null,
          resetUrl,
        });
      },
    },
    emailVerification: {
      /**
       * No `sendVerificationEmail` here, deliberately.
       *
       * The `emailOTP` plugin supplies one from its `init`, and that is the
       * only reason `overrideDefaultEmailVerification` does anything: plugin
       * options are merged with `defu`, which lets the *caller's* value win, so
       * a `sendVerificationEmail` written at this level silently outranks the
       * override and every sign-up goes back to mailing a link. It looks like
       * belt and braces and behaves like a switch that does nothing — which is
       * exactly what it did until somebody read the mail the local queue
       * printed and found a link in it.
       */
      sendOnSignUp: true,
      /**
       * A link that expires in an hour will be missed, and the person who missed
       * it goes back to the sign-in form rather than hunting for a resend button.
       * Sending a fresh one on that attempt is the difference between a recovered
       * sign-up and a lost one; the sign-in page says so where the error appears.
       */
      sendOnSignIn: true,
      /**
       * Following the link is proof of the same two things a sign-in proves —
       * the address and, since only somebody with the password could have
       * created the account, the password. Making them type it again on the next
       * screen adds no security and loses people at the last step.
       */
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
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
    user: {
      /**
       * Closing an account, and meaning it.
       *
       * Gated on the password rather than on an emailed link. Better Auth asks
       * for the credential on `deleteUser` when the account has one, and the
       * card in settings puts that field in front of the confirmation — which
       * is the check that actually matters here, because the person who can
       * do damage with this button is somebody sitting at an unlocked laptop,
       * and they already have the inbox.
       *
       * `beforeDelete` is where the real work happens: the account row itself
       * cascades to four tables and would leave the workspace, its forms and
       * every response behind. See `purgeUserData`. It throws rather than
       * logs, so a failure leaves the account intact instead of half-deleted.
       */
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await purgeUserData(env, user.id);
        },
        afterDelete: async (user) => {
          // The one line that outlives the account, and it names no address.
          console.log("account_deleted", user.id);
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await createDefaultOrg(env, user as { id: string; name?: string | null; email: string });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // Never worth failing a sign-in over: a session with no active org
            // is the state we already handle, and the web client repairs it on
            // the next page load.
            try {
              const orgId = await defaultActiveOrgId(env, session.userId);
              if (orgId) return { data: { ...session, activeOrganizationId: orgId } };
            } catch (err) {
              console.error("session_active_org_failed", session.userId, err);
            }
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
      apiKeyPlugin(),
      /**
       * Six digits instead of a link.
       *
       * A link is the wrong shape for the flow it sits in. Somebody signing up
       * on a laptop reads the code off their phone and types it into the tab
       * they are already looking at; a link asks them to open mail on the
       * machine the session lives on, and drops the ones who cannot. It also
       * survives the corporate scanners that follow every URL in an inbound
       * message — which, with a one-shot link, silently consumes the token
       * before the customer ever sees it.
       *
       * `overrideDefaultEmailVerification` is what makes this the *only* path:
       * without it Better Auth would keep mailing links for sign-up while the
       * app asked for a code.
       */
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        // Three is Better Auth's default and is a support ticket waiting to
        // happen for anyone who fat-fingers a digit twice. Five still leaves a
        // 6-digit code with a ~1-in-200,000 chance per issued code.
        allowedAttempts: 5,
        /**
         * Hashed at rest. A code is a credential for ten minutes, and the one
         * thing worse than a database leak is a database leak that hands over
         * live sign-in codes with it.
         */
        storeOTP: "hashed",
        /**
         * No account is created by a code alone. Without this, anyone who can
         * receive mail at an address gets an account with no password —
         * quietly reintroducing exactly the hole this change closes, from the
         * other side.
         */
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        /**
         * `verifyCurrentEmail` makes a change prove both ends: a code to the
         * address on the account, then a code to the new one. A stolen session
         * cannot move the account — and so cannot redirect password resets —
         * without also holding the original inbox.
         */
        changeEmail: { enabled: true, verifyCurrentEmail: true },
        sendVerificationOTP: async ({ email, otp, type }) => {
          await enqueueMail(env, { kind: "otp", to: email, code: otp, purpose: type });
        },
      }),
      organization({
        ac,
        roles,
        /**
         * The sender's postal address, owned by Better Auth's own update
         * endpoint rather than a route of ours.
         *
         * CAN-SPAM requires a physical address in the footer of any commercial
         * message, which is what a follow-up reminder is. Declaring it here
         * means `authClient.organization.update()` can write it and the column
         * stays the single place it lives — no second endpoint, and no copy of
         * the organization record that can disagree with this one.
         */
        schema: {
          organization: {
            additionalFields: {
              postalAddress: { type: "string", required: false, input: true },
            },
          },
        },
        /**
         * The invitation, mailed.
         *
         * Better Auth deliberately does not build this URL — it stores the
         * invitation and leaves delivery to the application — which is why
         * `invitations` rows have been accumulating since this plugin was
         * added while nobody was ever told they had been invited. The id is
         * the whole credential; `/accept-invitation` exchanges it.
         */
        sendInvitationEmail: async (data, request) => {
          const acceptUrl = `${linkOrigin(env, request)}/accept-invitation?id=${encodeURIComponent(data.id)}`;
          await enqueueMail(env, {
            kind: "invitation",
            to: data.email,
            inviterName: data.inviter.user.name ?? null,
            inviterEmail: data.inviter.user.email ?? null,
            organizationName: data.organization.name,
            role: data.role,
            acceptUrl,
            expiresAt: data.invitation.expiresAt ? new Date(data.invitation.expiresAt).getTime() : null,
          });
        },
        organizationHooks: {
          /**
           * Seat limit, enforced where invitations are actually created.
           *
           * Better Auth owns the invite endpoint, so this cannot be a Hono
           * middleware — hooking the plugin is the only place that sees every
           * path into `invitations`, including the client SDK calling it
           * directly.
           *
           * Pending invitations count against the total: without that, three
           * simultaneous invites all pass on a one-seat plan and the org
           * quietly ends up over.
           *
           * Creating an *organization* is deliberately not gated here any more.
           * It used to be, against `workspaces_count` — which read the plan of
           * whichever organization the person already owned and refused them a
           * second one. That only made sense while "workspace" was the name the
           * UI gave an organization. Workspaces are their own table now, and
           * `POST /workspaces` gates them against the plan of the organization
           * that actually pays. An organization is an account; a person may
           * have more than one, and each brings its own subscription.
           */
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
