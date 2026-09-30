import { FORM_APPLICATION } from "./form/application.js";
import { FORM_BUSINESS_2 } from "./form/business-2.js";
import { FORM_BUSINESS } from "./form/business.js";
import { FORM_CONTACT_2 } from "./form/contact-2.js";
import { FORM_CONTACT } from "./form/contact.js";
import { FORM_CUSTOMER_SUCCESS } from "./form/customer-success.js";
import { FORM_EVALUATION } from "./form/evaluation.js";
import { FORM_EVENT_REGISTRATION } from "./form/event-registration.js";
import { FORM_EVENT } from "./form/event.js";
import { FORM_FEEDBACK_2 } from "./form/feedback-2.js";
import { FORM_FEEDBACK } from "./form/feedback.js";
import { FORM_FILE_UPLOAD } from "./form/file-upload.js";
import { FORM_JOB_APPLICATION } from "./form/job-application.js";
import { FORM_LEAD_GENERATION_2 } from "./form/lead-generation-2.js";
import { FORM_LEAD_GENERATION } from "./form/lead-generation.js";
import { FORM_MARKETING } from "./form/marketing.js";
import { FORM_MEMBERSHIP } from "./form/membership.js";
import { FORM_ORDER } from "./form/order.js";
import { FORM_OTHER } from "./form/other.js";
import { FORM_QUOTE } from "./form/quote.js";
import { FORM_REGISTRATION } from "./form/registration.js";
import { FORM_REPORT } from "./form/report.js";
import { FORM_REQUEST } from "./form/request.js";
import { FORM_SIGNUP } from "./form/signup.js";
import { SURVEY_BUSINESS } from "./survey/business.js";
import { SURVEY_CUSTOMER_SATISFACTION } from "./survey/customer-satisfaction.js";
import { SURVEY_CUSTOMER_SUCCESS } from "./survey/customer-success.js";
import { SURVEY_EMPLOYEE_SATISFACTION } from "./survey/employee-satisfaction.js";
import { SURVEY_EVALUATION } from "./survey/evaluation.js";
import { SURVEY_EVENT } from "./survey/event.js";
import { SURVEY_FEEDBACK_2 } from "./survey/feedback-2.js";
import { SURVEY_FEEDBACK } from "./survey/feedback.js";
import { SURVEY_HEALTHCARE } from "./survey/healthcare.js";
import { SURVEY_MARKET_RESEARCH } from "./survey/market-research.js";
import { SURVEY_MARKETING_2 } from "./survey/marketing-2.js";
import { SURVEY_MARKETING_3 } from "./survey/marketing-3.js";
import { SURVEY_MARKETING_4 } from "./survey/marketing-4.js";
import { SURVEY_MARKETING } from "./survey/marketing.js";
import { SURVEY_OTHER_2 } from "./survey/other-2.js";
import { SURVEY_OTHER } from "./survey/other.js";
import { SURVEY_PRODUCT } from "./survey/product.js";
import { SURVEY_SCHOOL } from "./survey/school.js";
import { QUIZ_LEAD_GENERATION } from "./quiz/lead-generation.js";
import { QUIZ_MARKETING_2 } from "./quiz/marketing-2.js";
import { QUIZ_MARKETING } from "./quiz/marketing.js";
import { QUIZ_POPULAR_2 } from "./quiz/popular-2.js";
import { QUIZ_POPULAR } from "./quiz/popular.js";
import { QUIZ_PRODUCT_RECOMMENDATION } from "./quiz/product-recommendation.js";
import type { TemplateSeed } from "./define.js";

export { defineTemplate } from "./define.js";
export * from "./taxonomy.js";
export type { TemplateSeed, TemplateGuide, TemplateFacts } from "./define.js";

/**
 * The official template catalogue, in the order it is seeded: by type, then by
 * category in the order the gallery lists them. One file per category so the
 * files stay readable at nearly three hundred templates.
 */
export const TEMPLATES: TemplateSeed[] = [
  ...FORM_APPLICATION,
  ...FORM_BUSINESS_2,
  ...FORM_BUSINESS,
  ...FORM_CONTACT_2,
  ...FORM_CONTACT,
  ...FORM_CUSTOMER_SUCCESS,
  ...FORM_EVALUATION,
  ...FORM_EVENT_REGISTRATION,
  ...FORM_EVENT,
  ...FORM_FEEDBACK_2,
  ...FORM_FEEDBACK,
  ...FORM_FILE_UPLOAD,
  ...FORM_JOB_APPLICATION,
  ...FORM_LEAD_GENERATION_2,
  ...FORM_LEAD_GENERATION,
  ...FORM_MARKETING,
  ...FORM_MEMBERSHIP,
  ...FORM_ORDER,
  ...FORM_OTHER,
  ...FORM_QUOTE,
  ...FORM_REGISTRATION,
  ...FORM_REPORT,
  ...FORM_REQUEST,
  ...FORM_SIGNUP,
  ...SURVEY_BUSINESS,
  ...SURVEY_CUSTOMER_SATISFACTION,
  ...SURVEY_CUSTOMER_SUCCESS,
  ...SURVEY_EMPLOYEE_SATISFACTION,
  ...SURVEY_EVALUATION,
  ...SURVEY_EVENT,
  ...SURVEY_FEEDBACK_2,
  ...SURVEY_FEEDBACK,
  ...SURVEY_HEALTHCARE,
  ...SURVEY_MARKET_RESEARCH,
  ...SURVEY_MARKETING_2,
  ...SURVEY_MARKETING_3,
  ...SURVEY_MARKETING_4,
  ...SURVEY_MARKETING,
  ...SURVEY_OTHER_2,
  ...SURVEY_OTHER,
  ...SURVEY_PRODUCT,
  ...SURVEY_SCHOOL,
  ...QUIZ_LEAD_GENERATION,
  ...QUIZ_MARKETING_2,
  ...QUIZ_MARKETING,
  ...QUIZ_POPULAR_2,
  ...QUIZ_POPULAR,
  ...QUIZ_PRODUCT_RECOMMENDATION,
];
