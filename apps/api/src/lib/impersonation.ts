import type { Bindings } from "../env.js";
import { isPlatformAdmin } from "./platform-admin.js";

/**
 * Acting as a customer, without minting a second credential.
 *
 * The obvious implementation is to insert a `sessions` row for the target user
 * and hand over its cookie. That works and is wrong in one specific way: it
 * creates a real, indistinguishable login that outlives the support ticket, sits
 * in the session table looking exactly like the customer's own, and has to be
 * remembered about and revoked. A leaked one is a permanent account compromise.
 *
 * This is a signed assertion instead — "admin A may act as user B until T" —
 * carried in a header, verified per request, and expiring on its own. Nothing is
 * written to the database, there is nothing to revoke, and a leaked token dies
 * within the hour.
 *
 * Two conditions must both hold for it to be honoured, and the second is the
 * important one: the signature must verify, **and the caller's own session must
 * still be an allowlisted platform admin**. A token alone is not enough. Someone
 * who steals one and replays it from an ordinary account gets nothing, and an
 * admin removed from `PLATFORM_ADMIN_EMAILS` loses their outstanding tokens the
 * moment the secret is redeployed.
 */

/** An hour. Long enough for a support session, short enough to be forgotten safely. */
const TTL_MS = 60 * 60 * 1000;

const encoder = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function key(env: Bindings): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(env.BETTER_AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface ImpersonationClaim {
  /** The platform admin doing the impersonating. */
  adminId: string;
  /** The customer being acted as. */
  userId: string;
  /**
   * Which of their organizations to land in.
   *
   * Without it, `resolveOrgId` falls back to the target's own session or their
   * oldest membership — so clicking "Sign in as" on one account and arriving in
   * a different one is not a bug in the resolution, it is the resolution working
   * as designed on a question nobody asked it. The console asks about a specific
   * organization, so the token carries which.
   *
   * Still verified at use: honoured only if the target is actually a member.
   */
  orgId?: string;
  /** Epoch ms. */
  exp: number;
}

export async function signImpersonation(
  env: Bindings,
  adminId: string,
  userId: string,
  orgId?: string,
): Promise<{ token: string; expiresAt: number }> {
  const claim: ImpersonationClaim = { adminId, userId, orgId, exp: Date.now() + TTL_MS };
  const payload = b64url(encoder.encode(JSON.stringify(claim)));
  const sig = b64url(await crypto.subtle.sign("HMAC", await key(env), encoder.encode(payload)));
  return { token: `${payload}.${sig}`, expiresAt: claim.exp };
}

/**
 * Verify a token's signature and expiry. Returns null on anything suspect.
 *
 * Says nothing about whether the presenter is allowed to use it — that check
 * belongs to the caller, which has the session, and keeping the two separate is
 * what stops a future caller from forgetting the second half.
 */
export async function verifyImpersonation(env: Bindings, token: string): Promise<ImpersonationClaim | null> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  let expected: string;
  try {
    expected = b64url(await crypto.subtle.sign("HMAC", await key(env), encoder.encode(payload)));
  } catch {
    return null;
  }
  // Constant-time-ish: compare full strings of equal length rather than
  // short-circuiting on the first differing character.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  try {
    const json = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const claim = JSON.parse(json) as ImpersonationClaim;
    if (!claim.adminId || !claim.userId || typeof claim.exp !== "number") return null;
    if (claim.exp < Date.now()) return null;
    return claim;
  } catch {
    return null;
  }
}

export const IMPERSONATION_HEADER = "x-chatform-impersonate";

/**
 * Resolve who a request is really acting as.
 *
 * Called by `requireSession` with the *real* session's user already resolved.
 * Returns the impersonated user id when every condition holds, and null
 * otherwise — including when the header is present but the presenter is not an
 * admin, which is the case worth being strict about.
 */
export async function resolveImpersonation(
  env: Bindings,
  realUserEmail: string | null | undefined,
  header: string | undefined,
): Promise<{ userId: string; adminId: string; orgId: string | null } | null> {
  if (!header) return null;
  // The allowlist is checked against the *live* secret on every request, not
  // against what was true when the token was minted.
  if (!isPlatformAdmin(env, realUserEmail)) return null;
  const claim = await verifyImpersonation(env, header);
  if (!claim) return null;

  /**
   * The organization in the token is a preference, not an authority.
   *
   * It is re-checked against `members` on every request, so a token cannot be
   * edited into access the impersonated person does not have — and a membership
   * removed after the token was minted takes effect immediately.
   */
  let orgId: string | null = null;
  if (claim.orgId) {
    const member = await env.DB.prepare(
      `SELECT 1 AS ok FROM members WHERE user_id = ? AND organization_id = ?`,
    )
      .bind(claim.userId, claim.orgId)
      .first<{ ok: number }>();
    if (member) orgId = claim.orgId;
  }
  return { userId: claim.userId, adminId: claim.adminId, orgId };
}
