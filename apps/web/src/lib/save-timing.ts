/**
 * When the next autosave should fire.
 *
 * Pulled out of the hook because it is the one part of the timing with a
 * decision in it, and because a debounce is exactly the sort of thing that looks
 * obviously right and is off by a factor of ten.
 */

/**
 * How long the editor stays quiet after an edit before saving.
 *
 * Was 800ms, which is shorter than a pause for thought: that is how typing an
 * address into a box marked "Notification emails" produced "Invalid email
 * address" after two letters.
 */
export const IDLE_MS = 3_000;

/**
 * The longest an edit may sit unsent, however much editing continues.
 *
 * A debounce alone waits for silence, which is precisely wrong if the tab closes
 * during the silence — the old timer, restarted on every keystroke, meant two
 * minutes of uninterrupted work produced no save at all.
 */
export const CEILING_MS = 10_000;

/**
 * Idle normally; whatever is left of the ceiling once an edit has been waiting.
 *
 * Returning a single number for both is what lets one timer do the work of the
 * two a `maxWait` implementation needs — the debouncer asks again on every edit,
 * so the answer shrinks as the oldest unsent edit ages and reaches zero at the
 * ceiling.
 *
 * @param dirtySince when the oldest unsent edit was made, or null when settled
 * @param now        current time; a parameter so this is testable without fake timers
 */
export function saveDelay(dirtySince: number | null, now: number): number {
  if (dirtySince === null) return IDLE_MS;
  return Math.max(0, Math.min(IDLE_MS, CEILING_MS - (now - dirtySince)));
}
