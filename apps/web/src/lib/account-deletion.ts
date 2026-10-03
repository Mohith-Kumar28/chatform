/** How long a deleted account can be recovered. Matches `ACCOUNT_GRACE_DAYS` in the API. */
export const ACCOUNT_GRACE_DAYS = 30;

const DAY_MS = 86_400_000;

/** "2 November 2026": the day an account deleted at `deletedAt` is erased. */
export function purgeDate(deletedAt: number): string {
  return new Date(deletedAt + ACCOUNT_GRACE_DAYS * DAY_MS).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Whole days left to recover it, never less than one while it still exists. */
export function daysUntilPurge(deletedAt: number): number {
  return Math.max(1, Math.ceil((deletedAt + ACCOUNT_GRACE_DAYS * DAY_MS - Date.now()) / DAY_MS));
}

/** When the signed-in account was deleted, or null. The API adds `deletedAt` to the session's user. */
export function deletedAtOf(user: unknown): number | null {
  const raw = (user as { deletedAt?: string | number | Date | null } | null | undefined)?.deletedAt;
  if (raw == null) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}
