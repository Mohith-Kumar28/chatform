/**
 * How long a finished form waits before it opens the redirect, in seconds.
 *
 * Nine places used to spell this number out: the two schema defaults, the
 * respondent runtime's fallback and its countdown, the two builder surfaces
 * that create an ending, the AI draft normaliser, the inspector's reset and a
 * brand new form. Nine copies of a number is eight chances to change it and
 * miss one, which is what happened: the value is authorable per ending, so a
 * drifted default shows up as one form counting differently from the next
 * rather than as anything that fails.
 *
 * Four seconds, with the countdown on screen the whole time and the target
 * opening in a new tab, so the ending stays where it is and nobody is moved
 * off something they were still reading.
 */
export const DEFAULT_REDIRECT_DELAY_SEC = 4;
