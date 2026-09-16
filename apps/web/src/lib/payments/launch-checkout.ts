import type { CheckoutLaunch } from "./types";
import { loadScript } from "./load-script";

/**
 * Open the checkout the server created, in whichever way that gateway opens.
 *
 * The server decides the shape (`CheckoutLaunch`) and this decides nothing but
 * how to put it on screen. In particular nothing that comes back from here is
 * evidence of a payment: a modal's "completed" callback runs in the
 * respondent's browser and can be faked by anyone with devtools. The chat only
 * moves on when `payment_settled` arrives on the stream, which the server sends
 * after asking the gateway itself. What this reports is only what to show while
 * waiting, and when it is worth nudging the server to go and look.
 *
 * Three kinds:
 *
 *   - `cashfree_sdk`: Cashfree's JS SDK v3 in its own modal. Its promise
 *     resolves with `paymentDetails` once the flow finishes (whatever the
 *     result), `error` when the respondent closes it, and `redirect` when it
 *     had to leave the page.
 *   - `razorpay_checkout`: Checkout.js in its own modal. `handler` runs on a
 *     successful payment and `modal.ondismiss` when it is closed. A failed
 *     attempt keeps the modal open so they can try another method, so
 *     `payment.failed` is deliberately not treated as the end.
 *   - `redirect`: Stripe Checkout, which refuses to run inside an iframe. The
 *     top window simply goes there. A framed form (an embed) or the builder
 *     preview cannot hand its window over, so it opens a tab, and the caller
 *     polls confirm until the stream says it settled.
 */

export const CASHFREE_SDK_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";
export const RAZORPAY_SDK_URL = "https://checkout.razorpay.com/v1/checkout.js";

export type CheckoutOutcome =
  /** The gateway's own UI finished. Not proof of payment. Worth a confirm nudge. */
  | { kind: "completed" }
  /** The caller gave up on this attempt while the script was loading. Nothing was opened. */
  | { kind: "abandoned" }
  /** Closed without finishing. They may still have paid in a UPI app, so also worth a nudge. */
  | { kind: "dismissed" }
  /** This window is leaving for the gateway. */
  | { kind: "navigating" }
  /** Checkout is open in another tab. Poll. */
  | { kind: "tab_opened" }
  /** The browser refused the tab. The caller shows a real link, which a tap can always open. */
  | { kind: "blocked"; url: string }
  /** The SDK could not be loaded or did not start. */
  | { kind: "unavailable"; message: string };

interface CashfreeResult {
  error?: { message?: string } | null;
  redirect?: boolean;
  paymentDetails?: unknown;
}

interface CashfreeInstance {
  checkout(opts: { paymentSessionId: string; redirectTarget: "_modal" }): Promise<CashfreeResult>;
}

export interface RazorpayOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  handler: (response: unknown) => void;
  modal: { ondismiss: () => void };
}

interface RazorpayInstance {
  open(): void;
  on(event: string, cb: (response: unknown) => void): void;
}

/** The parts of `window` checkout touches, so a test can stand in for all of them. */
export interface CheckoutWindow {
  Cashfree?: (opts: { mode: "sandbox" | "production" }) => CashfreeInstance;
  Razorpay?: new (opts: RazorpayOptions) => RazorpayInstance;
  location: { assign(url: string): void };
  open(url: string, target: string): Window | null;
}

export interface LaunchOptions {
  /**
   * Checkout may not take this window over: the form is framed, or it is the
   * builder's preview. Only a `redirect` launch reads it; the modals open
   * inside the page either way.
   */
  newTab: boolean;
  /**
   * A tab opened during the tap, before the order existed. See
   * `preopenCheckoutTab`.
   */
  preopened?: Window | null;
  loadScript?: (src: string) => Promise<void>;
  win?: CheckoutWindow;
  /**
   * "Is this attempt still wanted?", asked once the gateway's script is in and before anything
   * is put on screen.
   *
   * Loading a script is the one slow step here — twenty seconds on a bad connection — and the
   * card offers Cancel throughout it. Without this the modal opened afterwards, on an order the
   * respondent had cancelled and the server had superseded, and paying it charged them for a
   * checkout they had walked away from.
   */
  abandoned?: () => boolean;
}

const UNAVAILABLE =
  "Checkout couldn't load. Check your connection, or allow this page past any content blocker, then try again.";

export async function launchCheckout(launch: CheckoutLaunch, opts: LaunchOptions): Promise<CheckoutOutcome> {
  const win = opts.win ?? (typeof window === "undefined" ? null : (window as unknown as CheckoutWindow));
  if (!win) return { kind: "unavailable", message: UNAVAILABLE };
  const gone = () => opts.abandoned?.() === true;
  const load = async (src: string) => {
    await (opts.loadScript ?? loadScript)(src);
  };

  switch (launch.kind) {
    case "cashfree_sdk": {
      try {
        await load(CASHFREE_SDK_URL);
      } catch {
        return { kind: "unavailable", message: UNAVAILABLE };
      }
      if (gone()) return { kind: "abandoned" };
      if (typeof win.Cashfree !== "function") return { kind: "unavailable", message: UNAVAILABLE };
      try {
        const result = await win
          .Cashfree({ mode: launch.mode })
          .checkout({ paymentSessionId: launch.paymentSessionId, redirectTarget: "_modal" });
        if (result?.paymentDetails) return { kind: "completed" };
        if (result?.redirect) return { kind: "navigating" };
        // `error` is both the close icon and a failure inside the modal, and
        // the two cannot be told apart from here. Either way the server is the
        // one that finds out whether money moved.
        return { kind: "dismissed" };
      } catch {
        return { kind: "unavailable", message: UNAVAILABLE };
      }
    }

    case "razorpay_checkout": {
      try {
        await load(RAZORPAY_SDK_URL);
      } catch {
        return { kind: "unavailable", message: UNAVAILABLE };
      }
      if (gone()) return { kind: "abandoned" };
      const Razorpay = win.Razorpay;
      if (typeof Razorpay !== "function") return { kind: "unavailable", message: UNAVAILABLE };
      return new Promise<CheckoutOutcome>((resolve) => {
        try {
          const rzp = new Razorpay({
            key: launch.key,
            order_id: launch.orderId,
            amount: launch.amountMinor,
            currency: launch.currency,
            name: launch.name,
            ...(launch.description ? { description: launch.description } : {}),
            ...(launch.prefill ? { prefill: launch.prefill } : {}),
            // The signature in this response cannot be checked without the
            // merchant's key secret, which never leaves the server — so it is
            // not sent anywhere. Confirm asks Razorpay directly instead.
            handler: () => resolve({ kind: "completed" }),
            modal: { ondismiss: () => resolve({ kind: "dismissed" }) },
          });
          rzp.open();
        } catch {
          resolve({ kind: "unavailable", message: UNAVAILABLE });
        }
      });
    }

    case "redirect": {
      // Nothing is loaded for a redirect, so this can only be a cancel that
      // raced the request that created the order.
      if (gone()) return { kind: "abandoned" };
      if (!opts.newTab) {
        win.location.assign(launch.url);
        return { kind: "navigating" };
      }
      const tab = opts.preopened && !opts.preopened.closed ? opts.preopened : null;
      if (tab) {
        tab.location.href = launch.url;
        return { kind: "tab_opened" };
      }
      const opened = win.open(launch.url, "_blank");
      if (!opened) return { kind: "blocked", url: launch.url };
      // On the handle, not as a `noopener` feature: that makes `open` return
      // null by specification, which would read as blocked every time.
      opened.opener = null;
      return { kind: "tab_opened" };
    }
  }
}

/**
 * Open a blank tab while the tap that asked for it is still on the stack.
 *
 * Creating the order is a network round trip, and by the time it returns some
 * browsers (Safari, most in-app webviews) no longer count the tap as the reason
 * for a new window and refuse it. Opening the tab first and pointing it at
 * checkout afterwards keeps the gesture. Only worth doing when the gateway is
 * known to redirect and this window cannot be the one that goes; the caller
 * closes it again if the order is refused.
 */
export function preopenCheckoutTab(win: Pick<CheckoutWindow, "open"> | null = typeof window === "undefined" ? null : window): Window | null {
  if (!win) return null;
  try {
    const tab = win.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    return tab;
  } catch {
    return null;
  }
}

/**
 * Whether this page is inside someone else's frame.
 *
 * Reading `top` across origins throws in some older engines, and the only way
 * that can happen is if we are framed.
 */
export function isFramed(win: { self: unknown; top: unknown } | null = typeof window === "undefined" ? null : window): boolean {
  if (!win) return false;
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}
