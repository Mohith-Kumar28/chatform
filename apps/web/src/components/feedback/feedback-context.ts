import type { BuilderFeedbackArea } from "@repo/form-schema";

/**
 * What a report says about where it came from, gathered in the browser.
 *
 * The API adds who they are, their plan and role from the database; this is the
 * half only the page knows: which screen, how big, which errors just happened.
 * Everything here is shown to the person under "Included with your report"
 * before it is sent.
 */

/** The area a page belongs to, so the dropdown opens on the right one. */
export function areaFromPath(pathname: string): BuilderFeedbackArea {
  const builder = pathname.match(/^\/forms\/[^/]+\/([^/?#]+)/);
  if (builder) {
    const segment = builder[1];
    switch (segment) {
      case "build":
        return "questions";
      case "workflow":
        return "flow";
      case "design":
        return "design";
      case "agent":
        return "agent";
      case "results":
        return "results";
      case "share":
        return "share";
      case "integrate":
        return "integrate";
      case "settings":
        return "form_settings";
      default:
        return "questions";
    }
  }
  if (pathname.startsWith("/templates")) return "templates";
  if (/^\/(settings\/)?(billing|usage)/.test(pathname)) return "billing";
  if (/^\/(settings\/)?(team|people|organizations?|workspaces|general)/.test(pathname)) return "team";
  if (/^\/(settings\/)?api-keys/.test(pathname)) return "api";
  if (/^\/(settings\/)?(account|profile|security)/.test(pathname)) return "account";
  if (pathname.startsWith("/settings")) return "team";
  return "forms";
}

/** The form a builder page is about, when it is about one. */
export function formIdFromPath(pathname: string): string | undefined {
  return pathname.match(/^\/forms\/([^/?#]+)/)?.[1];
}

// ───────────────────────────── recent errors ─────────────────────────────

const MAX_ERRORS = 20;
const errors: { at: number; message: string }[] = [];
let installed = false;

function remember(message: string): void {
  errors.push({ at: Date.now(), message: message.slice(0, 500) });
  if (errors.length > MAX_ERRORS) errors.shift();
}

function describe(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Keep the last twenty errors the page threw or logged.
 *
 * Installed once, when the launcher first mounts, and never removed: an error
 * that happened before somebody opened the panel is the one they are reporting.
 * `console.error` is wrapped rather than replaced, so DevTools still shows it.
 */
export function installErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => remember(e.message || describe(e.error)));
  window.addEventListener("unhandledrejection", (e) => remember(`Unhandled rejection: ${describe(e.reason)}`));
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    remember(args.map(describe).join(" "));
    original(...args);
  };
}

export interface FeedbackContext {
  page: string;
  viewport: string;
  screen: string;
  pixelRatio: number;
  locale: string;
  timezone: string;
  theme: string;
  online: boolean;
  errors: { at: number; message: string }[];
}

export function collectContext(): FeedbackContext {
  return {
    page: `${window.location.pathname}${window.location.search}`,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    screen: `${window.screen.width}×${window.screen.height}`,
    pixelRatio: Math.round(window.devicePixelRatio * 100) / 100,
    locale: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
    online: navigator.onLine,
    errors: [...errors],
  };
}

/** A browser name a person recognises, for the disclosure list. The full string is sent as the header. */
export function browserLabel(): string {
  const ua = navigator.userAgent;
  const pick = (re: RegExp, name: string) => {
    const m = ua.match(re);
    return m ? `${name} ${m[1]}` : null;
  };
  const browser =
    pick(/Edg\/(\d+)/, "Edge") ??
    pick(/Chrome\/(\d+)/, "Chrome") ??
    pick(/Firefox\/(\d+)/, "Firefox") ??
    pick(/Version\/(\d+).*Safari/, "Safari") ??
    "Browser";
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return [browser, os].filter(Boolean).join(" on ");
}
