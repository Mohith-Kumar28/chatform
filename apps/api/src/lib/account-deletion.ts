import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, createAuthMiddleware, sensitiveSessionMiddleware, sessionMiddleware } from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { purgeUserData } from "./delete-account.js";
import { NOTICE_HOUR_UTC, NOTICE_LEAD_MS, type PurgeNotice } from "./form-archive.js";
import { enqueueMail } from "./mail.js";

/**
 * Deleting an account, with a way back.
 *
 * Asking to delete an account marks it and signs the person out everywhere.
 * Nothing is removed yet: for thirty days they can sign in again and recover
 * it exactly as it was, and their workspaces stop serving forms in the
 * meantime. After that `purgeDeletedAccounts` does what deletion always did,
 * through `purgeUserData`.
 *
 * Better Auth's own `/delete-user` is switched off, because it can only delete
 * on the spot. These two endpoints replace it.
 */

export const ACCOUNT_GRACE_DAYS = 30;
const GRACE_MS = ACCOUNT_GRACE_DAYS * 86_400_000;

export function purgeDateFor(deletedAt: number): number {
  return deletedAt + GRACE_MS;
}

/**
 * An organization whose every member has deleted their account: its forms stop
 * answering until one of them comes back. Derived rather than stored, so a
 * recovery reopens everything without anyone having to remember what was live.
 */
export function orgClosedSql(orgColumn: string): string {
  return `(EXISTS (SELECT 1 FROM members cm WHERE cm.organization_id = ${orgColumn})
           AND NOT EXISTS (SELECT 1 FROM members cm JOIN users cu ON cu.id = cm.user_id
                            WHERE cm.organization_id = ${orgColumn} AND cu.deleted_at IS NULL))`;
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export function accountDeletionPlugin(env: Bindings): BetterAuthPlugin {
  return {
    id: "chatform-account-deletion",
    endpoints: {
      /**
       * Schedule it. The person types their email to confirm, and proves it is
       * them the way Better Auth's delete did: the password when the account
       * has one, a recent sign-in when it does not.
       */
      scheduleAccountDeletion: createAuthEndpoint(
        "/account/delete",
        {
          method: "POST",
          use: [sensitiveSessionMiddleware],
          body: z.object({
            confirmation: z.string(),
            password: z.string().optional(),
          }),
        },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          if (ctx.body.confirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
            throw new APIError("BAD_REQUEST", {
              code: "CONFIRMATION_MISMATCH",
              message: "Type your email address exactly to confirm.",
            });
          }

          const credential = await ctx.context.internalAdapter.findCredentialAccount(user.id);
          if (credential?.password) {
            const ok =
              !!ctx.body.password &&
              (await ctx.context.password.verify({ hash: credential.password, password: ctx.body.password }));
            if (!ok) throw new APIError("BAD_REQUEST", { code: "INVALID_PASSWORD", message: "Invalid password" });
          } else if (Date.now() - new Date(session.createdAt).getTime() >= ctx.context.sessionConfig.freshAge * 1000) {
            throw new APIError("FORBIDDEN", { code: "SESSION_NOT_FRESH", message: "Session is not fresh" });
          }

          const deletedAt = Date.now();
          await ctx.context.internalAdapter.updateUser(user.id, { deletedAt: new Date(deletedAt) });
          // A fresh thirty days gets both warnings again, even after an earlier recovery.
          await env.DB.prepare(`UPDATE users SET deletion_notice = NULL WHERE id = ?`).bind(user.id).run();
          await ctx.context.internalAdapter.deleteUserSessions(user.id);
          deleteSessionCookie(ctx);

          await enqueueMail(env, { kind: "account_deletion", userId: user.id, stage: "scheduled" });
          console.log("account_deletion_scheduled", user.id);
          return ctx.json({ deletedAt, purgeAt: purgeDateFor(deletedAt) });
        },
      ),

      /** Undo it. Signing in again is the proof; this only clears the mark. */
      restoreAccount: createAuthEndpoint(
        "/account/restore",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          await ctx.context.internalAdapter.updateUser(user.id, { deletedAt: null });
          await env.DB.prepare(`UPDATE users SET deletion_notice = NULL WHERE id = ?`).bind(user.id).run();
          // The cached session cookie still carries the old mark for up to five
          // minutes; rewrite it so the dashboard opens on the next request.
          await setSessionCookie(ctx, { session, user: { ...user, deletedAt: null } as typeof user });
          console.log("account_restored", user.id);
          return ctx.json({ ok: true });
        },
      ),
    },
    hooks: {
      before: [
        {
          /**
           * Signing up again with the address of an account waiting to be
           * erased. The address is taken until the purge, so say why, and
           * point at the way back.
           */
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            if (typeof email !== "string") return;
            const row = await env.DB.prepare(`SELECT deleted_at FROM users WHERE email = ? AND deleted_at IS NOT NULL`)
              .bind(email.trim().toLowerCase())
              .first<{ deleted_at: number }>();
            if (!row) return;
            const purgeAt = purgeDateFor(row.deleted_at);
            const days = Math.max(1, Math.ceil((purgeAt - Date.now()) / 86_400_000));
            throw new APIError("FORBIDDEN", {
              code: "ACCOUNT_PENDING_DELETION",
              message: `You deleted the account for this email recently. Its data is erased on ${shortDate(purgeAt)} (${days} ${days === 1 ? "day" : "days"} from now). Sign in to recover it.`,
            });
          }),
        },
      ],
    },
  };
}

/**
 * The three-day and one-day warnings before an account is erased.
 *
 * Sent in the same morning hour as the Archive's form warnings, and claimed on
 * the row before it is queued, so a retried tick never sends one twice.
 */
export async function sweepAccountDeletionNotices(env: Bindings, now = Date.now()): Promise<number> {
  if (new Date(now).getUTCHours() !== NOTICE_HOUR_UTC) return 0;
  // Deleted at or before these moments, the account is erased within that lead.
  const by3d = now + NOTICE_LEAD_MS["3d"] - GRACE_MS;
  const by1d = now + NOTICE_LEAD_MS["1d"] - GRACE_MS;
  const { results } = await env.DB.prepare(
    `SELECT id, deleted_at, deletion_notice FROM users
      WHERE deleted_at IS NOT NULL AND deleted_at > ?1 AND deleted_at <= ?2
        AND (deletion_notice IS NULL OR (deletion_notice = '3d' AND deleted_at <= ?3))
      LIMIT 200`,
  )
    .bind(now - GRACE_MS, by3d, by1d)
    .all<{ id: string; deleted_at: number; deletion_notice: string | null }>();

  let sent = 0;
  for (const row of results ?? []) {
    const stage: PurgeNotice = row.deleted_at <= by1d ? "1d" : "3d";
    const claimed = await env.DB.prepare(`UPDATE users SET deletion_notice = ?1 WHERE id = ?2 AND deletion_notice IS ?3`)
      .bind(stage, row.id, row.deletion_notice)
      .run();
    if ((claimed.meta?.changes ?? 0) === 0) continue;
    await enqueueMail(env, { kind: "account_deletion", userId: row.id, stage });
    sent++;
  }
  return sent;
}

/** What erasing this account takes with it: the organizations nobody else is in, and what they hold. */
export async function accountErasureTally(
  env: Bindings,
  userId: string,
): Promise<{ organizations: number; forms: number; responses: number; files: number }> {
  const solo = `SELECT m.organization_id FROM members m
                 WHERE m.user_id = ?1
                   AND NOT EXISTS (SELECT 1 FROM members x WHERE x.organization_id = m.organization_id AND x.user_id <> ?1)`;
  const row = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM (${solo})) AS organizations,
            (SELECT COUNT(*) FROM forms f WHERE f.organization_id IN (${solo})) AS forms,
            (SELECT COUNT(*) FROM submissions s JOIN forms f ON f.id = s.form_id
              WHERE f.organization_id IN (${solo}) AND s.status = 'completed') AS responses,
            (SELECT COUNT(*) FROM files fl WHERE fl.organization_id IN (${solo})) AS files`,
  )
    .bind(userId)
    .first<{ organizations: number; forms: number; responses: number; files: number }>();
  return row ?? { organizations: 0, forms: 0, responses: 0, files: 0 };
}

/**
 * Erase accounts whose thirty days are up. A few per tick: each one can take a
 * whole workspace's uploads with it, and the next tick is five minutes away.
 */
export async function purgeDeletedAccounts(env: Bindings): Promise<number> {
  const due = await env.DB.prepare(
    `SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at LIMIT 5`,
  )
    .bind(Date.now() - GRACE_MS)
    .all<{ id: string }>();

  let purged = 0;
  for (const { id } of due.results ?? []) {
    try {
      await purgeUserData(env, id);
      await env.DB.prepare(`DELETE FROM users WHERE id = ? AND deleted_at IS NOT NULL`).bind(id).run();
      // The one line that outlives the account, and it names no address.
      console.log("account_deleted", id);
      purged++;
    } catch (err) {
      console.error("account_purge_failed", id, err instanceof Error ? err.message : String(err));
    }
  }
  return purged;
}
