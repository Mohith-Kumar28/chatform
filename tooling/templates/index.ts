import { COMMUNITY } from "./community.js";
import { EDUCATION } from "./education.js";
import { EVENTS } from "./events.js";
import { HR } from "./hr.js";
import { MARKETING } from "./marketing.js";
import { PRODUCT } from "./product.js";
import { SALES } from "./sales.js";
import { SERVICES } from "./services.js";
import { SUPPORT } from "./support.js";
import type { TemplateSeed } from "./define.js";

export { CATEGORIES, CATEGORY_ACCENT, defineTemplate } from "./define.js";
export type { Category, TemplateSeed } from "./define.js";

/**
 * The official template catalogue, in the order it is seeded.
 *
 * Grouped by category rather than flattened by hand so a new category is one
 * import and one entry, and so the file that holds thirty-odd forms is nine
 * readable files instead of one unreadable one.
 */
export const TEMPLATES: TemplateSeed[] = [
  ...SALES,
  ...PRODUCT,
  ...MARKETING,
  ...EVENTS,
  ...HR,
  ...SUPPORT,
  ...EDUCATION,
  ...SERVICES,
  ...COMMUNITY,
];
