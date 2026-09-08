import type { UseCase, UseCaseGroup } from "./define";
import admissionEnquiry from "./admission-enquiry";
import appointmentBooking from "./appointment-booking";
import clientIntake from "./client-intake";
import contactForm from "./contact-form";
import customerFeedback from "./customer-feedback";
import exitInterview from "./exit-interview";
import jobApplication from "./job-application";
import photographyInquiry from "./photography-inquiry";
import quoteRequest from "./quote-request";
import testimonialRequest from "./testimonial-request";
import volunteerSignup from "./volunteer-signup";
import waitlist from "./waitlist";
import webinarRegistration from "./webinar-registration";

/**
 * Every guide, in the order the hub and the nav menu list them.
 *
 * Ordered by how winnable the search is rather than alphabetically or by how
 * much we like the page: the contact-form and admission-enquiry pages sit at
 * the top because those are the two searches where a site with no authority
 * has a real chance, and a menu is also a statement about what we think we are
 * for.
 */
export const USE_CASES: readonly UseCase[] = [
  contactForm,
  admissionEnquiry,
  appointmentBooking,
  quoteRequest,
  photographyInquiry,
  clientIntake,
  testimonialRequest,
  customerFeedback,
  waitlist,
  webinarRegistration,
  volunteerSignup,
  exitInterview,
  jobApplication,
];

/** The order the groups appear in, which the menu columns follow. */
const GROUP_ORDER: readonly UseCaseGroup[] = [
  "Win more work",
  "Fill your calendar",
  "Hear from customers",
  "Grow an audience",
  "Run a community",
  "Hire and onboard",
];

export const USE_CASE_GROUPS: readonly { title: UseCaseGroup; items: readonly UseCase[] }[] =
  GROUP_ORDER.map((title) => ({
    title,
    items: USE_CASES.filter((entry) => entry.group === title),
  })).filter((group) => group.items.length > 0);

export function getUseCase(slug: string): UseCase | undefined {
  return USE_CASES.find((entry) => entry.slug === slug);
}

export type { UseCase, UseCaseGroup } from "./define";
