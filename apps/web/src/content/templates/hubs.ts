import type { HubCopy } from "./hub-types";
import { HUBS_FORMS } from "./hubs-forms";
import { HUBS_SURVEYS_QUIZZES } from "./hubs-surveys-quizzes";
import { HUBS_GOALS_ROLES } from "./hubs-goals-roles";

export type { HubCopy } from "./hub-types";

/**
 * Authored copy for every hub page, keyed `gallery`, `type:<type>`,
 * `category:<type>/<category>`, `goal:<slug>` and `role:<slug>`.
 *
 * Written, not assembled: fifty pages that differ only by a swapped noun are
 * thin content. `public-templates.test.ts` checks every hub the taxonomy has
 * a page for has an entry here.
 */
export const HUBS: Record<string, HubCopy> = { ...HUBS_FORMS, ...HUBS_SURVEYS_QUIZZES, ...HUBS_GOALS_ROLES };

export function hubCopy(key: string): HubCopy {
  const copy = HUBS[key];
  if (!copy) throw new Error(`no hub copy for "${key}"`);
  return copy;
}
