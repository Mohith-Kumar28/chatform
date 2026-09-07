import { isGateError, type GateError } from "@repo/entitlements";

/**
 * Returned instead of a result when the plan refused and the paywall took over.
 *
 * A sentinel rather than `null`, because `null` is a value several Better Auth
 * calls legitimately return, and a caller that confused the two would treat
 * "you cannot afford this" as "it worked and there was nothing to show".
 */
export const PAYWALLED = Symbol("paywalled");

/**
 * Pull a gate envelope out of whatever Better Auth threw, or `null`.
 *
 * The app's own fetch mutator already routes 402s to the paywall, so a gated
 * `/api` call opens the right dialog with no work at the call site. Better
 * Auth's client is a second HTTP stack that never passes through it — so a limit
 * enforced in an `organizationHooks` guard surfaced as a toast reading
 * `PAYMENT_REQUIRED`: the raw enum, shown to a person, naming neither what was
 * refused nor what would fix it. Choosing a hook that can carry a real envelope
 * is worth nothing if the envelope is discarded one layer up.
 *
 * The shape check is deliberately loose. Better Auth wraps thrown `APIError`
 * bodies differently depending on the path a call took, so the envelope turns up
 * as the error itself or under `.error` / `.body`. Anything that is not a gate
 * error returns `null` and must be handled normally — a network failure is not a
 * sales opportunity.
 */
export function gateErrorFrom(err: unknown): GateError | null {
  const candidates: unknown[] = [
    err,
    (err as { error?: unknown })?.error,
    (err as { body?: unknown })?.body,
  ];

  for (const candidate of candidates) {
    if (isGateError(candidate)) return candidate.error;
    // Some paths hand back the inner error object without its wrapper.
    if (isGateError({ error: candidate })) return candidate as GateError;
  }

  return null;
}
