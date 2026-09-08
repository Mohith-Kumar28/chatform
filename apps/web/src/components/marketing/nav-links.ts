/**
 * The marketing nav, shared with the docs shell.
 *
 * Extracted rather than duplicated so `/docs` carries the same links in the same
 * order as the rest of the site — a docs section that navigates differently from
 * the page you arrived from reads as a different product.
 *
 * Two of the four used to be anchors into the landing page (`/#the-moment`,
 * `/#product`). Anchors are a nav for a site with one page, and there are now
 * eleven: a comparison hub, a research page, a blog. `Compare` and `Why chat?`
 * take those slots because they are the two questions somebody arriving from a
 * search actually has — "is this better than the thing I already use", and "why
 * would a chat be better than a form" — and neither had a destination before.
 */
export const MARKETING_LINKS = [
  { href: "/why-conversation-works", label: "Why chat?" },
  { href: "/compare", label: "Compare" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
] as const;
