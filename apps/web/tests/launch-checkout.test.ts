import { describe, expect, it, vi } from "vitest";
import {
  CASHFREE_SDK_URL,
  RAZORPAY_SDK_URL,
  isFramed,
  launchCheckout,
  preopenCheckoutTab,
  type CheckoutWindow,
  type RazorpayOptions,
} from "../src/lib/payments/launch-checkout";
import type { CheckoutLaunch } from "../src/lib/payments/types";

/**
 * Each launch kind opens the way its gateway opens, and reports only what to
 * show while the server finds out whether money moved.
 */

const cashfree: CheckoutLaunch = {
  kind: "cashfree_sdk",
  orderId: "rpay_1",
  paymentSessionId: "session_abc",
  mode: "sandbox",
};

const razorpay: CheckoutLaunch = {
  kind: "razorpay_checkout",
  orderId: "order_9A33XWu170gUtm",
  key: "rzp_test_public",
  amountMinor: 49900,
  currency: "INR",
  name: "Acme",
  description: "Registration",
  prefill: { email: "a@example.com" },
};

const stripe: CheckoutLaunch = {
  kind: "redirect",
  url: "https://checkout.stripe.com/c/pay/cs_test_1",
  sessionId: "cs_test_1",
};

function fakeWindow(over: Partial<CheckoutWindow> = {}) {
  const win: CheckoutWindow = {
    location: { assign: vi.fn() },
    open: vi.fn(() => null),
    ...over,
  };
  return win;
}

const loaded = () => vi.fn(async () => {});

describe("launchCheckout: cashfree_sdk", () => {
  type Result = { error?: { message?: string }; redirect?: boolean; paymentDetails?: unknown };
  function withCashfree(result: Result) {
    const checkout = vi.fn<(opts: { paymentSessionId: string; redirectTarget: "_modal" }) => Promise<Result>>(
      async () => result,
    );
    const Cashfree = vi.fn(() => ({ checkout }));
    return { win: fakeWindow({ Cashfree }), Cashfree, checkout };
  }

  it("loads SDK v3 and opens its modal with the session id", async () => {
    const { win, Cashfree, checkout } = withCashfree({ paymentDetails: { paymentMessage: "ok" } });
    const loadScript = loaded();
    const outcome = await launchCheckout(cashfree, { newTab: false, win, loadScript });

    expect(loadScript).toHaveBeenCalledWith(CASHFREE_SDK_URL);
    expect(Cashfree).toHaveBeenCalledWith({ mode: "sandbox" });
    expect(checkout).toHaveBeenCalledWith({ paymentSessionId: "session_abc", redirectTarget: "_modal" });
    expect(outcome).toEqual({ kind: "completed" });
  });

  it("reads a closed modal as dismissed, and a redirect as leaving", async () => {
    const closed = withCashfree({ error: { message: "closed" } });
    expect(await launchCheckout(cashfree, { newTab: false, win: closed.win, loadScript: loaded() })).toEqual({
      kind: "dismissed",
    });
    const away = withCashfree({ redirect: true });
    expect(await launchCheckout(cashfree, { newTab: false, win: away.win, loadScript: loaded() })).toEqual({
      kind: "navigating",
    });
  });

  it("is unavailable when the script is blocked or defines nothing", async () => {
    const blocked = vi.fn(async () => {
      throw new Error("script_failed");
    });
    expect((await launchCheckout(cashfree, { newTab: false, win: fakeWindow(), loadScript: blocked })).kind).toBe(
      "unavailable",
    );
    expect((await launchCheckout(cashfree, { newTab: false, win: fakeWindow(), loadScript: loaded() })).kind).toBe(
      "unavailable",
    );
  });
});

describe("launchCheckout: razorpay_checkout", () => {
  function withRazorpay() {
    const made: RazorpayOptions[] = [];
    const open = vi.fn();
    class Razorpay {
      constructor(opts: RazorpayOptions) {
        made.push(opts);
      }
      open = open;
      on = vi.fn();
    }
    return { win: fakeWindow({ Razorpay }), made, open };
  }

  it("loads checkout.js and opens it on the order, in minor units", async () => {
    const { win, made, open } = withRazorpay();
    const loadScript = loaded();
    const pending = launchCheckout(razorpay, { newTab: true, win, loadScript });
    await vi.waitFor(() => expect(open).toHaveBeenCalled());

    expect(loadScript).toHaveBeenCalledWith(RAZORPAY_SDK_URL);
    expect(made[0]).toMatchObject({
      key: "rzp_test_public",
      order_id: "order_9A33XWu170gUtm",
      amount: 49900,
      currency: "INR",
      name: "Acme",
      description: "Registration",
      prefill: { email: "a@example.com" },
    });
    made[0]!.handler({ razorpay_payment_id: "pay_1" });
    expect(await pending).toEqual({ kind: "completed" });
  });

  it("reports a dismissed modal", async () => {
    const { win, made, open } = withRazorpay();
    const pending = launchCheckout(razorpay, { newTab: false, win, loadScript: loaded() });
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    made[0]!.modal.ondismiss();
    expect(await pending).toEqual({ kind: "dismissed" });
  });
});

describe("launchCheckout: redirect", () => {
  it("takes the whole window when it may", async () => {
    const win = fakeWindow();
    const loadScript = loaded();
    expect(await launchCheckout(stripe, { newTab: false, win, loadScript })).toEqual({ kind: "navigating" });
    expect(win.location.assign).toHaveBeenCalledWith(stripe.url);
    expect(win.open).not.toHaveBeenCalled();
    expect(loadScript).not.toHaveBeenCalled();
  });

  it("opens a tab from a frame, without an opener", async () => {
    const tab = { opener: {} as unknown } as Window;
    const win = fakeWindow({ open: vi.fn(() => tab) });
    expect(await launchCheckout(stripe, { newTab: true, win })).toEqual({ kind: "tab_opened" });
    expect(win.open).toHaveBeenCalledWith(stripe.url, "_blank");
    expect(tab.opener).toBeNull();
    expect(win.location.assign).not.toHaveBeenCalled();
  });

  it("says so when the tab is refused, with the URL for a real link", async () => {
    const win = fakeWindow();
    expect(await launchCheckout(stripe, { newTab: true, win })).toEqual({ kind: "blocked", url: stripe.url });
  });

  it("points a tab opened during the tap at checkout instead of opening another", async () => {
    const preopened = { closed: false, location: { href: "about:blank" } } as unknown as Window;
    const win = fakeWindow();
    expect(await launchCheckout(stripe, { newTab: true, win, preopened })).toEqual({ kind: "tab_opened" });
    expect(preopened.location.href).toBe(stripe.url);
    expect(win.open).not.toHaveBeenCalled();
  });

  it("does not reuse a pre-opened tab the respondent already closed", async () => {
    const preopened = { closed: true, location: { href: "about:blank" } } as unknown as Window;
    const tab = { opener: null } as Window;
    const win = fakeWindow({ open: vi.fn(() => tab) });
    expect(await launchCheckout(stripe, { newTab: true, win, preopened })).toEqual({ kind: "tab_opened" });
    expect(win.open).toHaveBeenCalledWith(stripe.url, "_blank");
  });
});

describe("helpers", () => {
  it("pre-opens a blank tab with no opener", () => {
    const tab = { opener: {} as unknown } as Window;
    const open = vi.fn(() => tab);
    expect(preopenCheckoutTab({ open })).toBe(tab);
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(tab.opener).toBeNull();
  });

  it("knows a framed page from a top-level one", () => {
    const top = {};
    expect(isFramed({ self: top, top })).toBe(false);
    expect(isFramed({ self: {}, top })).toBe(true);
    expect(isFramed(null)).toBe(false);
  });
});

/**
 * Loading a gateway's script is the one slow step in opening checkout — twenty seconds on bad
 * mobile data — and the card's Cancel is live throughout it. A cancel has to stop the modal that
 * load was going to put up, because the order behind it has been superseded and paying it anyway
 * charges somebody for a checkout they walked away from.
 */
describe("launchCheckout: an attempt given up on while its script loaded", () => {
  it("opens no Cashfree modal", async () => {
    const checkout = vi.fn();
    const Cashfree = vi.fn(() => ({ checkout }));
    const outcome = await launchCheckout(cashfree, {
      newTab: false,
      win: fakeWindow({ Cashfree } as Partial<CheckoutWindow>),
      loadScript: loaded(),
      abandoned: () => true,
    });
    expect(outcome).toEqual({ kind: "abandoned" });
    expect(Cashfree).not.toHaveBeenCalled();
    expect(checkout).not.toHaveBeenCalled();
  });

  it("opens no Razorpay modal", async () => {
    const open = vi.fn();
    const Razorpay = vi.fn(() => ({ open, on: vi.fn() })) as unknown as CheckoutWindow["Razorpay"];
    const outcome = await launchCheckout(razorpay, {
      newTab: false,
      win: fakeWindow({ Razorpay }),
      loadScript: loaded(),
      abandoned: () => true,
    });
    expect(outcome).toEqual({ kind: "abandoned" });
    expect(open).not.toHaveBeenCalled();
  });

  it("neither navigates nor opens a tab for a redirect", async () => {
    const win = fakeWindow();
    const outcome = await launchCheckout(stripe, { newTab: false, win, abandoned: () => true });
    expect(outcome).toEqual({ kind: "abandoned" });
    expect(win.location.assign).not.toHaveBeenCalled();
    expect(win.open).not.toHaveBeenCalled();
  });

  it("still opens when the attempt is the one that is wanted", async () => {
    const { win } = (() => {
      const checkout = vi.fn(async () => ({ paymentDetails: {} }));
      const Cashfree = vi.fn(() => ({ checkout }));
      return { win: fakeWindow({ Cashfree } as Partial<CheckoutWindow>) };
    })();
    const outcome = await launchCheckout(cashfree, {
      newTab: false,
      win,
      loadScript: loaded(),
      abandoned: () => false,
    });
    expect(outcome).toEqual({ kind: "completed" });
  });
});
