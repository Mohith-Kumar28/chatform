/**
 * One place for "something on this page does not want you to leave yet".
 *
 * DOM navigations can be caught with a capture-phase click listener, but a
 * `router.push` from the command palette produces no click and no `beforeunload`
 * — there is no browser hook for it at all. So the guard registers itself here
 * and programmatic navigations ask before they go.
 *
 * A module singleton rather than a context: the palette is mounted in two
 * different shells, only one of which ever has a guard, and threading a
 * provider through both to say "usually nothing" is more wiring than the
 * problem deserves.
 */

/** Returns true if it took responsibility for the navigation. */
type Guard = (href: string, proceed: () => void) => boolean;

let current: Guard | null = null;

export function setLeaveGuard(guard: Guard | null): void {
  current = guard;
}

/**
 * Ask before navigating. Returns true when the guard intercepted, in which case
 * the caller must NOT navigate — the guard owns `proceed` from here.
 */
export function requestLeave(href: string, proceed: () => void): boolean {
  return current ? current(href, proceed) : false;
}
