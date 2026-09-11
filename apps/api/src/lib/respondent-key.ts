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

/** Whether there was a fingerprint to key on at all. */
export type RespondentKeySource = "device" | "none";

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
 * The browser's fingerprint is the only input. There is no second source and
 * no fallback: a respondent whose browser does not produce one has no key, and
 * every decision that reads this key is simply not made for them. A network
 * address was once folded in behind the signal, and it was the wrong thing to
 * key a person on — one campus or one office is a single value shared by
 * everybody sitting in it, so it merged strangers into one respondent and split
 * one respondent in two as they walked out of the building.
 *
 * Salted with the form's own `fingerprint_salt`, so the same browser answering
 * two customers' forms produces two unrelated values. Without that, this table
 * would be a cross-tenant record of which devices filled in which forms, which
 * is not a thing we should be able to compute even for ourselves.
 */
export function respondentKey(input: {
  signal?: string | null;
  /** `forms.fingerprint_salt`. */
  salt: string;
}): RespondentKey {
  const signal = readDeviceSignal(input.signal);
  if (signal) return { value: sha256Hex(`${input.salt}:d:${signal}`), source: "device" };
  return { value: "", source: "none" };
}
