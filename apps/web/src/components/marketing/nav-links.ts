/**
 * The marketing nav, shared with the docs shell.
 *
 * Extracted rather than duplicated so `/docs` carries the same links in the same
 * order as the rest of the site — a docs section that navigates differently from
 * the page you arrived from reads as a different product.
 */
export const MARKETING_LINKS = [
  { href: "/#the-moment", label: "How it answers" },
  { href: "/#product", label: "How it works" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
] as const;
