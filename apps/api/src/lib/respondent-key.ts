import { sha256Hex } from "@repo/form-schema";

/**
 * One value that stands for "this respondent's device", and one place that
 * decides how it is computed.
 *
 * Everything anonymous used to key on a hashed IP. An IP is a network, not a
 * person: a hundred people in one office share one, and one person walking from
 * wifi to mobile data stops sharing it with themselves. As the sole input to
 * `allowResubmissions` that was wrong in both directions at once.
 *
 * The browser now sends a device signal alongside it, and this module folds the
 * two into a single key. It exists so that nothing else in the codebase knows
 * which library produced that signal, or that a library was involved at all:
 * swapping the client implementation, or dropping it for something we compute
 * ourselves, should touch this file and its client-side twin and nothing else.
 *
 * ── What this key is, and is not ──
 *
 * It is a de-duplication hint. The signal is computed in the browser and posted
 * to us, so a person who wants two responses can have them by clearing one
 * value in devtools — exactly as they could by changing networks before. It is
 * better than the IP at the thing it is for, and it is not an identity.
 *
 * Where a *verified* respondent exists, that is the key, and this is not
 * consulted: see `respondent-history.ts`. Sign-in is the only de-duplication
 * here that actually holds.
 */

/** How the key was derived, for the caller that wants to know how much to trust it. */
export type RespondentKeySource = "device" | "ip" | "none";

export interface RespondentKey {
  /** Salted hash, or "" when there was nothing to hash. */
  value: string;
  source: RespondentKeySource;
}

/**
 * The device signal as the browser reported it.
 *
 * Bounded and character-checked before it reaches a hash or a column: this is
 * unauthenticated input from a public endpoint, and "we only hash it" is not a
 * reason to accept an arbitrary megabyte.
 */
export function readDeviceSignal(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length < 8 || s.length > 128) return null;
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : null;
}

/**
 * Derive the key for one respondent on one form.
 *
 * Salted with the form's own `fingerprint_salt`, so the same device answering
 * two customers' forms produces two unrelated values. Without that, this table
 * would be a cross-tenant record of which devices filled in which forms, which
 * is not a thing we should be able to compute even for ourselves.
 *
 * The IP is folded in beside the device signal rather than replaced by it. A
 * signal that fails to arrive — the script blocked, an old browser, a bot —
 * would otherwise collapse every such respondent onto one shared key and have
 * them de-duplicate each other; falling back to the IP keeps them as separate
 * as they used to be, which is the behaviour this replaces.
 */
export function respondentKey(input: {
  signal?: string | null;
  ip?: string | null;
  /** `forms.fingerprint_salt`. */
  salt: string;
}): RespondentKey {
  const signal = readDeviceSignal(input.signal);
  if (signal) return { value: sha256Hex(`${input.salt}:d:${signal}`), source: "device" };
  if (input.ip) return { value: sha256Hex(`${input.salt}:i:${input.ip}`), source: "ip" };
  return { value: "", source: "none" };
}
