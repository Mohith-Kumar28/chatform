"use client";

/**
 * "Which device is this?", and the only file that knows how we answer it.
 *
 * The server pairs with `lib/respondent-key.ts`, which salts whatever comes out
 * of here per form and stores the result. Between the two, nothing else in the
 * codebase names the library or assumes one is involved — replacing
 * FingerprintJS with another provider, or with something we compute ourselves,
 * means rewriting `compute()` below and nothing above it.
 *
 * ── What this is for ──
 *
 * Two things, both about a respondent who has not signed in:
 *
 * Telling apart a hundred people behind one office address, which a hashed IP
 * could not do — it is a network, not a person, and it was the only input the
 * duplicate-response gate had.
 *
 * And handing somebody back a half-finished response after they cleared their
 * storage or reopened the form in a private window. That is the one thing this
 * does that `localStorage` cannot: the identifier survives both.
 *
 * ── What it is not ──
 *
 * Not a credential, and never a substitute for signing in. It is computed here,
 * in the browser, and posted to us, so anybody who wants a second response can
 * have one. It is a better hint than the IP was, at the job the IP was doing.
 * Where a form requires sign-in, the verified identity is the key and this is
 * not consulted.
 */

/**
 * Loaded on demand, never at module scope.
 *
 * The agent is ~30KB and runs a canvas, audio and font probe on first call.
 * Paying for that during the first paint of a conversation — the one moment the
 * respondent is waiting on us — would be a poor trade for a value nothing needs
 * until the session is opened.
 */
async function compute(): Promise<string | null> {
  try {
    const FingerprintJS = (await import("@fingerprintjs/fingerprintjs")).default;
    const agent = await FingerprintJS.load();
    const { visitorId } = await agent.get();
    return typeof visitorId === "string" && visitorId.length >= 8 ? visitorId : null;
  } catch {
    /*
     * Blocked by an extension, refused by a hardened browser, or simply
     * unavailable. Null is a supported answer everywhere this is used: the
     * server falls back to the IP, which is what it had before.
     */
    return null;
  }
}

const CACHE_KEY = "chatform:device";

/** One in-flight computation per page, however many callers ask. */
let pending: Promise<string | null> | null = null;
let memo: string | null = null;

/**
 * The device signal for this browser.
 *
 * Cached in memory for the page and in `localStorage` across visits — not
 * because the value would change, but because recomputing it costs a canvas
 * and an audio probe on every session. The cached copy is a convenience; when
 * storage is unavailable (private mode, a partitioned embed frame) it simply
 * recomputes, which is exactly the case this whole mechanism exists for.
 *
 * Never throws, never rejects. Every caller is on a path where a respondent is
 * waiting to answer a form, and none of them should fail because a device could
 * not be identified.
 */
export async function getRespondentSignal(): Promise<string | null> {
  if (memo) return memo;
  if (pending) return pending;

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached && cached.length >= 8) {
      memo = cached;
      return memo;
    }
  } catch {
    // Storage unavailable. Fall through and compute it.
  }

  pending = compute()
    .then((id) => {
      memo = id;
      if (id) {
        try {
          localStorage.setItem(CACHE_KEY, id);
        } catch {
          // A signal we cannot cache is still a signal we can send.
        }
      }
      return id;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
}

/**
 * Forget the cached signal.
 *
 * For "start over" and for anyone clearing their own trail: the next call
 * recomputes rather than handing back a value from a session the respondent has
 * asked us to leave behind.
 */
export function clearRespondentSignal(): void {
  memo = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing stored is nothing to clear.
  }
}
