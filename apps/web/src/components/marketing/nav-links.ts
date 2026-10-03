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
 *
 * `Templates` sits first: with nearly three hundred of them, each tryable live,
 * the gallery is where most people arriving from a search are headed next.
 */
export const MARKETING_LINKS = [
  { href: "/form-templates", label: "Templates" },
  { href: "/pricing", label: "Pricing" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Behind "Resources", the last item in the bar: the reading, as opposed to the
 * three places somebody goes to do something. The owner's call, to keep the
 * bar to four words.
 */
export const RESOURCE_LINKS = [
  { href: "/why-conversation-works", label: "Why chat?", detail: "The research behind a form that talks" },
  { href: "/compare", label: "Compare", detail: "chatform beside the form builder you use" },
  { href: "/docs", label: "Docs", detail: "The API, embeds, webhooks and the connector" },
] as const;
