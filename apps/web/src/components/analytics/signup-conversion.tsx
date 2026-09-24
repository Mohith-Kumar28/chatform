"use client";

import { useEffect } from "react";
import { useSession } from "@/lib/auth/auth-client";
import { GOOGLE_ADS_ID } from "./google-tag-manager";

/**
 * Reports a completed sign-up to Google Ads.
 *
 * The obvious place for this is the sign-up form's `onSuccess`, and it is the
 * wrong one. There are three ways to end up with an account here — the email
 * and password form, a Google button that leaves the page and comes back
 * through an OAuth redirect, and a six-digit code — and only the first has a
 * success callback that runs in the page that submitted it. A conversion
 * wired to that callback silently counts a third of the sign-ups and makes
 * bidding optimise against the wrong number.
 *
 * So this does not watch the forms at all. It watches the session: the app
 * shell renders it, and when the session belongs to an account created a
 * moment ago, that account is new however it was made. `createdAt` is the
 * server's own record, not a client guess.
 */

/**
 * The event snippet's `send_to` label, from the "Account signup (code)"
 * conversion action (Goals → Conversions, created 2026-09-20). The conversion
 * action is set to a fixed ₹1 value and "One conversion per click", so the
 * event carries no value of its own.
 */
const SIGNUP_CONVERSION_LABEL = "mSfbCIz58_4cEIjv99cB";

/**
 * How recently the account must have been created for its first authenticated
 * page view to count as the sign-up.
 *
 * A day is generous on purpose. Verification by email can put hours between
 * creating the account and first reaching the app, and the common case for
 * someone who never arrives is that they never arrive at all, not that they
 * arrive a week later. Double counting is what a long window risks, and two
 * separate things prevent it: the `transaction_id` below, which is how Google
 * de-duplicates the same conversion reported twice, and the local flag, which
 * stops the event being sent again on this device.
 */
const FRESH_ACCOUNT_MS = 24 * 60 * 60 * 1000;

/** How long to keep waiting for the tag, which loads `afterInteractive`. */
const GTAG_WAIT_MS = 15_000;
const GTAG_POLL_MS = 500;

declare global {
  interface Window {
    gtag?: (
      command: "event",
      action: string,
      params: Record<string, unknown>
    ) => void;
  }
}

const flagKey = (userId: string) => `chatform.ads-signup-conversion.${userId}`;

/**
 * `localStorage` throws rather than returning null in a private window with
 * site data blocked, and a thrown analytics call would take the dashboard
 * down with it. A device that cannot remember is treated as one that has not
 * reported yet; `transaction_id` is what stops that becoming a double count.
 */
function alreadyReported(userId: string): boolean {
  try {
    return window.localStorage.getItem(flagKey(userId)) !== null;
  } catch {
    return false;
  }
}

function markReported(userId: string): void {
  try {
    window.localStorage.setItem(flagKey(userId), String(Date.now()));
  } catch {
    /* Nothing to do: see `alreadyReported`. */
  }
}

export function SignupConversion() {
  const { data: session } = useSession();
  const user = session?.user;
  const userId = user?.id;
  const createdAt = user?.createdAt;

  useEffect(() => {
    if (!userId || !createdAt) return;

    const created = new Date(createdAt).getTime();
    if (Number.isNaN(created)) return;
    if (Date.now() - created > FRESH_ACCOUNT_MS) return;
    if (alreadyReported(userId)) return;

    // Claim the sign-up before the tag has answered. Effects run twice in
    // development, and both passes would otherwise sit in the same poll.
    markReported(userId);

    let elapsed = 0;
    let timer = 0;
    const send = () => {
      if (window.gtag) {
        window.gtag("event", "conversion", {
          send_to: `${GOOGLE_ADS_ID}/${SIGNUP_CONVERSION_LABEL}`,
          // Google de-duplicates on this, so the same account reported from a
          // second device, or after site data is cleared, stays one sign-up.
          transaction_id: userId,
        });
        return;
      }
      elapsed += GTAG_POLL_MS;
      if (elapsed >= GTAG_WAIT_MS) return;
      timer = window.setTimeout(send, GTAG_POLL_MS);
    };

    timer = window.setTimeout(send, 0);
    return () => window.clearTimeout(timer);
  }, [userId, createdAt]);

  return null;
}
