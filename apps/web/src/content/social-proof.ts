/**
 * Everything the home page says other people said about us.
 *
 * Empty on purpose. Every slot that reads from here renders nothing while its
 * list is empty, so the page never shows a made-up quote, logo or number. Add
 * an entry only when it is real and you can point at where it came from: a
 * review link, an email, a dashboard. `source` is required for that reason.
 *
 * Avatars and logos go in `public/social-proof/`.
 */

export interface Testimonial {
  quote: string;
  /** A few words inside `quote` to highlight, copied exactly. */
  highlight?: string;
  name: string;
  role: string;
  avatar?: string;
  /** Where the quote came from: a review URL, or a note like "email, 2026-10-01". */
  source: string;
}

export interface Review extends Testimonial {
  title: string;
  /** 1 to 5. */
  stars: number;
}

export interface CustomerLogo {
  name: string;
  /** Path under `public/`. Drawn in one ink, so any colour works. */
  src: string;
  source: string;
}

export interface Stat {
  value: string;
  label: string;
  source: string;
}

/**
 * Four placements, in page order: under the switch band, under the builder
 * recording, the big single quote after templates, and the carousel before the
 * FAQ. A placement with no entry is skipped.
 */
export const TESTIMONIALS: {
  switch?: Testimonial;
  builder?: Testimonial;
  big?: Testimonial;
} = {};

export const REVIEWS: readonly Review[] = [];

export const CUSTOMER_LOGOS: readonly CustomerLogo[] = [];

export const STATS: readonly Stat[] = [];
