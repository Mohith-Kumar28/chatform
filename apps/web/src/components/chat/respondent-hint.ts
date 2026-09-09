/**
 * Who this device signed in as last time, remembered across forms.
 *
 * This is a *hint*, never a credential. Nothing stored here can verify anyone:
 * the gate still clears only on a fresh Google ID token or a fresh SMS code,
 * checked server-side exactly as before. All this changes is what the card
 * opens on — "Continue as mohith@example.com" instead of a blank sign-in for
 * someone whose browser is, at that moment, already signed in to Google.
 *
 * That distinction is what makes it safe to keep, and it is why the shape below
 * holds a label and a picture and no token, no `sub`, and no attestation. The
 * neighbouring `firebase-phone.ts` refuses to persist a Firebase session for
 * the same reason — a respondent is not a user, and a form on a shared or
 * borrowed device must not leave one signed in behind them. A name on a button
 * that still has to pass a real verification is a different thing from that,
 * and "Use a different account" erases it in one press.
 *
 * Device-wide rather than per-form: the whole point is the *second* form.
 */

export interface RespondentHint {
  provider: "google" | "phone";
  /** Email for Google, E.164 for phone — what the card shows. */
  label: string;
  name: string | null;
  pictureUrl: string | null;
  /** When it was written, for the expiry below. */
  at: number;
}

const KEY = "chatform:respondent";

/**
 * Long enough to span the gap between two forms someone was sent weeks apart,
 * short enough that a device passed on to someone else stops offering a
 * stranger's name. Google's own session is the real authority either way: an
 * expired hint costs one extra tap, a stale one cannot sign anybody in.
 */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function loadRespondentHint(): RespondentHint | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<RespondentHint>;
    if (p.provider !== "google" && p.provider !== "phone") return null;
    if (typeof p.label !== "string" || !p.label) return null;
    if (typeof p.at !== "number" || Date.now() - p.at > TTL_MS) return null;
    return {
      provider: p.provider,
      label: p.label,
      name: typeof p.name === "string" ? p.name : null,
      pictureUrl: typeof p.pictureUrl === "string" ? p.pictureUrl : null,
      at: p.at,
    };
  } catch {
    // Private mode, blocked storage, a value someone else's script wrote —
    // the shortcut is a convenience, never a requirement.
    return null;
  }
}

export function saveRespondentHint(hint: Omit<RespondentHint, "at">): void {
  try {
    // "Verified" is the server's fallback label for an identity that carried
    // neither an email nor a number. There is nothing to greet someone by, so
    // remembering it would only produce a card that says "Continue as
    // Verified".
    if (hint.label === "Verified") return;
    localStorage.setItem(KEY, JSON.stringify({ ...hint, at: Date.now() }));
  } catch {
    /* not fatal */
  }
}

export function clearRespondentHint(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* not fatal */
  }
}

/** Whether a label is usable as Google's `login_hint`, which wants an email. */
export function asEmail(label: string): string | undefined {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(label) ? label : undefined;
}
