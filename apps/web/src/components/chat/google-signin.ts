/**
 * Google sign-in for respondents, and the head start that makes it feel
 * immediate.
 *
 * This used to live inside `auth-card.tsx`, which meant none of it began until
 * the card mounted — and the card mounts on `auth_required`, an event that
 * arrives only after the session has opened and the greeting has streamed. So
 * a returning respondent paid for two round trips end to end: ours, and then
 * Google's, strictly one after the other. The visible result was a chat that
 * appeared, sat still, produced a sign-in card, and only then reached for the
 * browser.
 *
 * Everything Google needs before it can answer "who is this" is knowable at
 * first paint: the form's public config already says the form is gated, and
 * the remembered hint is a synchronous read from local storage. Hoisting the
 * plumbing here lets `warmGoogleSignIn` start the script fetch and the
 * `initialize` handshake while the boot screen is still up, so by the time the
 * card appears only the prompt itself is left to do.
 *
 * What deliberately does *not* move earlier is `prompt()`. That is the one
 * step with a user-visible surface, and firing it during boot would put a
 * Google account chooser on top of a page that has not yet said a word about
 * why it wants one. The gate's message is posted before the card for exactly
 * that reason; the consent surface stays behind it.
 *
 * Nothing about the trust model moves either. Warming produces no credential
 * and asserts nothing — the token still arrives from a real prompt, and the
 * server still checks its signature, issuer, audience and expiry before anyone
 * is verified. This changes when the script is fetched, not what is trusted.
 */

export const GOOGLE_RESPONDENT_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_RESPONDENT_CLIENT_ID ?? "";

const GSI_SRC = "https://accounts.google.com/gsi/client";

export interface GsiId {
  initialize: (o: {
    client_id: string;
    callback: (r: { credential: string }) => void;
    /**
     * Return a credential with no further interaction when the browser holds
     * exactly one Google session that has already consented to this client —
     * which is precisely the returning respondent the card is trying not to
     * make sign in twice.
     */
    auto_select?: boolean;
    /** The account to offer first, as an email address. */
    login_hint?: string;
    /**
     * One Tap is browser-mediated now; the older page-drawn prompt is on its
     * way out, and asking for it explicitly is what keeps `prompt()` from
     * being a no-op in browsers that have already made the switch.
     */
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
  prompt: () => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } };
  }
}

/** Load the Google script once per page, however many callers ask for it. */
let gsiPromise: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.google?.accounts?.id) return Promise.resolve();
  gsiPromise ??= new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gsiPromise = null; // let a later attempt retry rather than fail forever
      reject(new Error("gsi_load_failed"));
    };
    if (!existing) document.head.appendChild(script);
  });
  return gsiPromise;
}

/**
 * Where a credential goes.
 *
 * GSI fixes its callback at `initialize` time, but the thing that wants the
 * token is a component that mounts long afterwards and can unmount again. So
 * `initialize` is given this dispatcher once, and the component swaps itself
 * in underneath it — the same indirection the card already used for its own
 * `onToken`, moved out one level so that initializing early does not commit us
 * to a consumer that does not exist yet.
 *
 * A credential with nobody attached is dropped rather than kept. Nothing
 * prompts before a consumer attaches, so in practice this is unreachable; it
 * matters only that the unreachable case discards the token instead of holding
 * one for whoever mounts next.
 */
let sink: ((credential: string) => void) | null = null;

export function setCredentialSink(fn: (credential: string) => void): () => void {
  sink = fn;
  return () => {
    if (sink === fn) sink = null;
  };
}

/**
 * The `login_hint` GSI is currently configured for — `""` for none, `null`
 * before the first `initialize`.
 *
 * Re-initializing tears down and re-mounts Google's iframe, which is worth
 * avoiding under a live button, so the handshake is skipped when the warm-up
 * has already run it for the same account. It is *not* skipped when the hint
 * changes: "Use a different account" has to reach Google as `auto_select:
 * false`, or the shortcut it just dismissed would silently return.
 */
let initializedFor: string | null = null;

/**
 * Get GSI loaded and configured, without asking it for anything.
 *
 * Resolves to `null` when there is no client id to configure — a deployment
 * without Google respondent sign-in, which the card reports rather than
 * waiting on. Rejects only when the script itself could not be fetched.
 */
export async function prepareGoogle(loginHint?: string): Promise<GsiId | null> {
  if (!GOOGLE_RESPONDENT_CLIENT_ID) return null;
  await loadGsi();
  const id = window.google?.accounts?.id;
  if (!id) return null;

  const key = loginHint ?? "";
  if (initializedFor !== key) {
    id.initialize({
      client_id: GOOGLE_RESPONDENT_CLIENT_ID,
      callback: (r) => sink?.(r.credential),
      auto_select: Boolean(loginHint),
      login_hint: loginHint,
      use_fedcm_for_prompt: true,
    });
    initializedFor = key;
  }
  return id;
}

/**
 * Start the above while the boot screen is still up.
 *
 * Fire-and-forget on purpose: a warm-up that fails costs nothing, because the
 * card runs `prepareGoogle` again on mount and will surface the failure then,
 * with somewhere to put the message. Callers should hold off unless the form
 * is actually gated on Google — an ungated form has no reason to fetch a
 * sign-in script it will never use.
 */
export function warmGoogleSignIn(loginHint?: string): void {
  void prepareGoogle(loginHint).catch(() => {
    /* the card retries on mount, and reports it there */
  });
}
