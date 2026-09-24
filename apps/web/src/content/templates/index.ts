import type { FormDoc } from "@repo/form-schema";
import type { TemplateDetailPayload, TemplateSummary } from "@/lib/templates";
import { USE_CASES, type UseCase } from "@/content/use-cases";
import catalogue from "./catalogue.generated.json";

/**
 * The official template catalogue, for the public pages at `/form-templates`.
 *
 * Read from `catalogue.generated.json`, which `pnpm gen:templates` writes from
 * `tooling/templates/` in the same run as the seed SQL — so the page a visitor
 * reads is the template the app creates, question for question. Server-only in
 * practice: the gallery passes summaries to the client, and a detail page
 * passes exactly one document.
 */

export interface PublicTemplate extends TemplateDetailPayload {
  doc: FormDoc;
  /** The phrase somebody types into a search box, e.g. "Client intake form". */
  searchName: string;
  /** `/form-templates/<slug>`. */
  path: string;
}

/**
 * What each template is called by the person searching for it.
 *
 * The catalogue's titles are written for someone already inside the product
 * ("New client intake", "Launch waitlist"). Nobody searches for those. They
 * search for "client intake form template" — so the public h1, title tag and
 * card name use the search phrase, and the catalogue keeps its own names for
 * the app. A slug missing from this map falls back to the catalogue title, so
 * a new template is never unpublishable, only less well named.
 */
export const SEARCH_NAMES: Record<string, string> = {
  waitlist: "Waitlist form",
  "newsletter-signup": "Newsletter signup form",
  "webinar-registration": "Webinar registration form",
  "content-download": "Content download form",
  "event-rsvp": "Event RSVP form",
  "event-feedback": "Event feedback form",
  "speaker-submission": "Call for speakers form",
  "workshop-registration": "Workshop registration form",
  "lead-capture": "Lead capture form",
  "demo-request": "Demo request form",
  "quote-request": "Quote request form",
  "partnership-inquiry": "Partnership inquiry form",
  "nps-survey": "NPS survey",
  "csat-survey": "Customer satisfaction survey",
  "product-market-fit": "Product-market fit survey",
  "feature-request": "Feature request form",
  "beta-signup": "Beta signup form",
  "cancellation-survey": "Cancellation survey",
  "course-enrollment": "Course enrollment form",
  "student-feedback": "Student feedback form",
  quiz: "Online quiz",
  "client-intake": "Client intake form",
  "appointment-booking": "Appointment booking form",
  "job-application": "Job application form",
  "employee-onboarding": "Employee onboarding form",
  "exit-interview": "Exit interview form",
  "engagement-pulse": "Employee pulse survey",
  "referral-submission": "Employee referral form",
  "bug-report": "Bug report form",
  "support-ticket": "Support ticket form",
  "contact-us": "Contact form",
  "refund-request": "Refund request form",
  "volunteer-signup": "Volunteer signup form",
  "membership-application": "Membership application form",
  "testimonial-request": "Testimonial request form",
};

export const TEMPLATES: readonly PublicTemplate[] = (
  catalogue as unknown as (TemplateDetailPayload & { doc: FormDoc })[]
).map((row) => ({
  ...row,
  searchName: SEARCH_NAMES[row.slug] ?? row.title,
  path: `/form-templates/${row.slug}`,
}));

export function getTemplate(slug: string): PublicTemplate | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

/** The card's data, without the document — what the gallery hands the client. */
export function summaryOf(template: PublicTemplate): TemplateSummary {
  return {
    slug: template.slug,
    title: template.searchName,
    category: template.category,
    description: template.description,
    blurb: template.blurb,
    tags: template.tags,
    icon: template.icon,
    accent: template.accent,
    blockCount: template.blockCount,
    estMinutes: template.estMinutes,
  };
}

/** Categories in catalogue order, each with its templates. */
export function templatesByCategory(): { category: string; items: PublicTemplate[] }[] {
  const groups = new Map<string, PublicTemplate[]>();
  for (const t of TEMPLATES) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
  return [...groups.entries()].map(([category, items]) => ({ category, items }));
}

/** The use-case guides that start from this template — the long-form version of the page. */
export function guidesFor(slug: string): UseCase[] {
  return USE_CASES.filter((entry) => entry.template?.slug === slug);
}
