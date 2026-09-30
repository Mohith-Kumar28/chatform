/**
 * A Cloudflare Turnstile token for opening a session, or undefined.
 *
 * Managed mode with `interaction-only`: nearly everyone sees nothing at all,
 * and the widget appears (one checkbox) only for a visitor Cloudflare is not
 * sure about. Undefined is a normal answer — no site key configured, the
 * script blocked by an extension, Cloudflare slow — and the server lets that
 * visitor in labelled `unverified` rather than refusing them. So this never
 * throws, and never holds the conversation for longer than `waitMs` unless
 * Cloudflare has actually asked the person to click.
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
/** How long a background check may hold the first question. */
const WAIT_MS = 3_000;
/** Cloudflare's is 300s; a little less, so a token is never spent as it expires. */
export const TURNSTILE_TOKEN_TTL_MS = 270_000;
/** How long someone who has been shown the checkbox gets to click it. */
const INTERACTIVE_WAIT_MS = 180_000;

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      appearance?: "always" | "execute" | "interaction-only";
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "before-interactive-callback"?: () => void;
      "timeout-callback"?: () => void;
    },
  ): string | undefined;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<TurnstileApi | null> | null = null;

function loadScript(): Promise<TurnstileApi | null> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoad ??= new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => resolve(window.turnstile ?? null);
    s.onerror = () => {
      // Let a later session try again rather than remembering the failure.
      scriptLoad = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

export function turnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined;
}

/**
 * `interactive` is the second try, after the server refused the first token:
 * the widget is shown outright, centred on the page, and waits for the person
 * rather than for `WAIT_MS`. Nearly everyone never sees it.
 */
export function getTurnstileToken(
  siteKey: string | undefined = turnstileSiteKey(),
  { interactive = false }: { interactive?: boolean } = {},
): Promise<string | undefined> {
  if (!siteKey || typeof window === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let settled = false;
    let widgetId: string | undefined;
    const host = document.createElement("div");
    // Bottom centre, above the composer, and empty (so invisible) unless
    // Cloudflare decides to show the checkbox. The interactive retry sits in
    // the middle of the screen, where it cannot be missed.
    host.style.cssText = interactive
      ? "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483000;"
      : "position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:2147483000;";
    const finish = (token: string | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (widgetId) window.turnstile?.remove(widgetId);
      } catch {
        /* already gone */
      }
      host.remove();
      resolve(token);
    };
    let timer = setTimeout(() => finish(undefined), interactive ? INTERACTIVE_WAIT_MS : WAIT_MS);

    void loadScript().then((api) => {
      if (settled) return;
      if (!api) return finish(undefined);
      document.body.appendChild(host);
      try {
        widgetId = api.render(host, {
          sitekey: siteKey,
          appearance: interactive ? "always" : "interaction-only",
          // It hangs off <body>, outside the form, so it is told the form's
          // side (see `colorScheme` in `chatThemeVars`) rather than guessing.
          theme: formScheme(),
          callback: (token) => finish(token),
          "error-callback": () => finish(undefined),
          "timeout-callback": () => finish(undefined),
          // A person is now being asked to click; give them the time to.
          "before-interactive-callback": () => {
            clearTimeout(timer);
            timer = setTimeout(() => finish(undefined), INTERACTIVE_WAIT_MS);
          },
        });
      } catch {
        finish(undefined);
      }
    });
  });
}

/** Light or dark, as the form on the page renders. */
function formScheme(): "light" | "dark" {
  const surface = document.querySelector<HTMLElement>(".chat-surface");
  return surface && getComputedStyle(surface).colorScheme === "dark" ? "dark" : "light";
}
