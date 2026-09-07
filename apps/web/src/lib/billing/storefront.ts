/**
 * Where "show me the plans" goes.
 *
 * Two possible answers, and which one is live is a deployment decision rather
 * than a code one.
 *
 * `/billing` is ours: three plan cards, a monthly/yearly toggle, and a button
 * on each that mints a Dodo checkout for the plan chosen. It is what ships by
 * default and it always works.
 *
 * Dodo's Storefront is a hosted page listing the products themselves, with its
 * own comparison and its own monthly/yearly split — the pricing page we would
 * otherwise be maintaining a second copy of. It has to be turned on and
 * published from the Dodo dashboard (Business → Store Front), which is where
 * its URL is minted; there is no API that returns one, so it cannot be
 * discovered and has to be configured.
 *
 * Absent the variable this returns `null` and every caller falls back to
 * `/billing`. That is deliberate: a storefront that has not been published is a
 * 404, and sending a customer who is trying to pay to a 404 is worse than
 * sending them to a page that works.
 */
const RAW = process.env.NEXT_PUBLIC_DODO_STOREFRONT_URL?.trim();

/**
 * The storefront URL, or `null` when none is configured.
 *
 * Validated rather than trusted. It is an absolute, off-origin destination read
 * from configuration and handed to a link that opens in a new tab, so anything
 * that is not plain `https` is dropped rather than rendered — a `javascript:`
 * or `data:` value in an environment variable should not become a link the
 * product invites people to click.
 */
export const STOREFRONT_URL: string | null = (() => {
  if (!RAW) return null;
  try {
    return new URL(RAW).protocol === "https:" ? RAW : null;
  } catch {
    return null;
  }
})();

/**
 * Props for a "see the plans" link, pointing at whichever exists.
 *
 * The new tab is only for the storefront, and only because it is somebody
 * else's site: leaving the product to compare prices should not cost you the
 * screen you were on. `/billing` is ours and stays in the tab, because a second
 * tab for a page in the same app is just clutter.
 *
 * Spread onto an anchor. `noopener` is not optional on a `_blank` link — the
 * opened page gets `window.opener` and can navigate this one otherwise.
 */
export function plansLinkProps(): {
  href: string;
  target?: "_blank";
  rel?: string;
} {
  return STOREFRONT_URL
    ? { href: STOREFRONT_URL, target: "_blank", rel: "noopener noreferrer" }
    : { href: "/billing" };
}
