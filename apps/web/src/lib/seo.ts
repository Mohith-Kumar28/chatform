import type { Metadata } from "next";

/**
 * The one place the site's own address is written down.
 *
 * It used to be written four times — `sitemap.ts`, `robots.ts`, `layout.tsx`
 * and `f/[slug]/page.tsx` each carried their own
 * `process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.in"`, and the two
 * llms routes carried a hardcoded `https://chatform.in` with no env read at
 * all. Six copies of a value that has to agree with itself or canonical tags
 * start pointing at a host that is not the one being served.
 *
 * The trailing slash is stripped on the way in so `absoluteUrl("/pricing")`
 * cannot produce `https://chatform.in//pricing`. A double slash is a different
 * URL to a crawler, and a canonical tag that names a different URL to the one
 * it sits on is worse than no canonical tag.
 */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://chatform.in"
).replace(/\/+$/, "");

/** `/pricing` → `https://chatform.in/pricing`. Root stays `https://chatform.in/`. */
export function absoluteUrl(path: string): string {
  if (path === "/" || path === "") return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * The canonical fragment, to spread into a route's `metadata`.
 *
 * Next emits no `<link rel="canonical">` unless `alternates.canonical` is set —
 * there is no inference from the route. Nothing on this site had one, which
 * left every page's canonical identity up to whichever host served it: the
 * apex, or the `workers.dev` fallback that `wrangler.jsonc` still publishes.
 *
 * `metadataBase` is already set in the root layout, so a root-relative string
 * would resolve correctly — but it is written absolute here anyway, because a
 * canonical tag is the one piece of metadata whose whole job is to be
 * unambiguous about which origin it names.
 */
export function canonical(path: string): Pick<Metadata, "alternates"> {
  return { alternates: { canonical: absoluteUrl(path) } };
}

/**
 * The OpenGraph fields that are the same on every marketing page.
 *
 * `url`, `siteName` and `locale` were missing everywhere. None of them changes
 * how a card looks in the common case, and all three change what a scraper
 * that cannot execute JavaScript decides the page *is*.
 */
export function openGraphBase(path: string) {
  return {
    url: absoluteUrl(path),
    siteName: "chatform",
    locale: "en_US",
    type: "website" as const,
  };
}

/* ------------------------------------------------------------------ */
/* JSON-LD                                                             */
/* ------------------------------------------------------------------ */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** A schema.org node. Loose on purpose — see the note on `JsonLd` below. */
export type LdNode = { "@type": string } & Record<string, JsonValue | undefined>;

/**
 * Stable `@id`s, so nodes can reference each other instead of repeating
 * themselves. A `FAQPage` on the pricing route and an `Article` on the blog
 * both want to name the same publisher; with an `@id` they name it once and
 * point at it, which is what stops Google reading them as two organisations
 * that happen to share a name.
 */
export const LD_ID = {
  organization: `${SITE_ORIGIN}/#organization`,
  website: `${SITE_ORIGIN}/#website`,
} as const;

export function organizationLd(): LdNode {
  return {
    "@type": "Organization",
    "@id": LD_ID.organization,
    name: "chatform",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icon.svg"),
    description:
      "chatform turns forms into conversations that read what people write, ask again when an answer is too thin to use, and answer questions back — so more people finish.",
  };
}

export function webSiteLd(): LdNode {
  return {
    "@type": "WebSite",
    "@id": LD_ID.website,
    name: "chatform",
    url: absoluteUrl("/"),
    publisher: { "@id": LD_ID.organization },
  };
}

export interface LdOffer {
  name: string;
  /** Dollars, as a decimal string — "0", "24", "84". */
  price: string;
  /** Monthly or annual, expressed the way schema.org wants it. */
  billingDuration?: "P1M" | "P1Y";
  url?: string;
}

export function softwareApplicationLd(offers: readonly LdOffer[]): LdNode {
  return {
    "@type": "SoftwareApplication",
    name: "chatform",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: absoluteUrl("/"),
    publisher: { "@id": LD_ID.organization },
    offers: offers.map((offer) => ({
      "@type": "Offer",
      name: offer.name,
      price: offer.price,
      priceCurrency: "USD",
      ...(offer.url ? { url: absoluteUrl(offer.url) } : {}),
      ...(offer.billingDuration
        ? {
            priceSpecification: {
              "@type": "UnitPriceSpecification",
              price: offer.price,
              priceCurrency: "USD",
              billingDuration: offer.billingDuration,
            },
          }
        : {}),
    })),
  };
}

export interface LdFaqItem {
  question: string;
  /** Plain text. Markdown and JSX both have to be flattened before they get here. */
  answer: string;
}

export function faqPageLd(items: readonly LdFaqItem[]): LdNode {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/**
 * The trail, root first, INCLUDING the current page.
 *
 * Google wants the page itself as the last crumb; omitting it produces a trail
 * that stops one short of where the reader is.
 */
export function breadcrumbLd(trail: readonly { name: string; path: string }[]): LdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export interface LdArticle {
  headline: string;
  description: string;
  path: string;
  /** ISO date. */
  datePublished: string;
  dateModified?: string;
  author?: string;
  image?: string;
}

export function articleLd(article: LdArticle): LdNode {
  return {
    "@type": "Article",
    headline: article.headline,
    description: article.description,
    mainEntityOfPage: absoluteUrl(article.path),
    datePublished: article.datePublished,
    dateModified: article.dateModified ?? article.datePublished,
    author: { "@type": "Organization", "@id": LD_ID.organization, name: article.author ?? "chatform" },
    publisher: { "@id": LD_ID.organization },
    ...(article.image ? { image: article.image } : {}),
  };
}

export interface LdHowToStep {
  name: string;
  text: string;
}

/**
 * `HowTo`, for the use-case guides.
 *
 * These pages are literally instructions — "here is how to set up a booking
 * form" — and `HowTo` is the one schema type that says so. It is also the type
 * most likely to be quoted back by an assistant answering "how do I take
 * bookings without a website", which is exactly the question those pages are
 * written to win.
 */
export function howToLd({
  name,
  description,
  steps,
}: {
  name: string;
  description: string;
  steps: readonly LdHowToStep[];
}): LdNode {
  return {
    "@type": "HowTo",
    name,
    description,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

export function itemListLd(items: readonly { name: string; path: string }[]): LdNode {
  return {
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}
