/**
 * The templates the nav menu names, as plain strings.
 *
 * Kept apart from `./index.ts` on purpose: that module imports the whole
 * generated catalogue — every document, some 450 KB of JSON — and the menu is a
 * client component mounted on every marketing page. Importing the catalogue
 * there would ship all of it to every visitor to render six links.
 *
 * The ones with the plainest search demand behind them, not the whole
 * catalogue: a menu of thirty-five is a directory, and the directory is one
 * click further on. `templates.test.ts` checks every slug here still exists.
 */
export const FEATURED_TEMPLATES = [
  { slug: "client-intake", name: "Client intake form" },
  { slug: "contact-us", name: "Contact form" },
  { slug: "job-application", name: "Job application form" },
  { slug: "nps-survey", name: "NPS survey" },
  { slug: "event-rsvp", name: "Event RSVP form" },
  { slug: "quote-request", name: "Quote request form" },
] as const;
