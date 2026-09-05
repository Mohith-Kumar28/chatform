/**
 * The embed snippets, in one place.
 *
 * There were two generators — one in the Share view and a hardcoded one in
 * Integrate — and they disagreed: the second pointed at a hostname that has not
 * existed since the domain changed, so anyone who copied it got a form that
 * never loaded. This module is the only thing that writes a snippet now, and
 * `embed.js` is the only thing that reads one.
 *
 * None of these carry a key, and none of them install anything. A published
 * form is public; the loader points a frame at its URL and the frame talks to
 * the API itself. The npm packages exist for the headless case — driving a
 * conversation from your own UI — not for putting a form on a page.
 */

export type EmbedMode = "inline" | "popup" | "side-tab" | "fullpage";
export type EmbedPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

export const EMBED_MODES: { mode: EmbedMode; label: string; blurb: string }[] = [
  { mode: "popup", label: "Popup", blurb: "A launcher in the corner that opens a panel." },
  { mode: "inline", label: "Inline", blurb: "In the flow of the page, growing to fit." },
  { mode: "side-tab", label: "Side tab", blurb: "Slides in from the edge, full height." },
  { mode: "fullpage", label: "Full page", blurb: "Takes over the whole window." },
];

export const EMBED_POSITIONS: { position: EmbedPosition; label: string }[] = [
  { position: "bottom-right", label: "Bottom right" },
  { position: "bottom-left", label: "Bottom left" },
  { position: "top-right", label: "Top right" },
  { position: "top-left", label: "Top left" },
];

/** Whether this mode is a floating overlay, and so has a corner and a launcher. */
export function isOverlay(mode: EmbedMode): boolean {
  return mode === "popup" || mode === "side-tab";
}

export interface EmbedConfig {
  mode: EmbedMode;
  position: EmbedPosition;
  /** px between the launcher and the edges of the window. */
  offset: number;
  /** Launcher colour. */
  color: string;
  /** Launcher text. Empty means an icon-only bubble. */
  label: string;
  icon: boolean;
  theme: "auto" | "light" | "dark";
  openOn: "click" | "load" | "exit-intent" | "scroll:50";
  /** Panel width for overlays. */
  width: number;
  /** Panel height for overlays; inline grows to fit unless this is set. */
  height: number;
  /** `true` lets an inline embed size itself to the conversation. */
  autoHeight: boolean;
  hidden?: Record<string, string>;
}

/**
 * The shape the loader assumes when an attribute is absent.
 *
 * Every generator below diffs against this, because a snippet that spells out
 * eleven attributes to describe the default configuration is a snippet nobody
 * reads before pasting — and one nobody can scan later to see what was actually
 * customised.
 */
export const EMBED_DEFAULTS: EmbedConfig = {
  mode: "popup",
  position: "bottom-right",
  offset: 20,
  color: "#f97316",
  label: "Questions?",
  icon: true,
  theme: "auto",
  openOn: "click",
  width: 400,
  height: 600,
  autoHeight: true,
};

export interface SnippetOptions extends Partial<EmbedConfig> {
  slug: string;
  /** Where the form is hosted. Derived from the browser, never hardcoded. */
  origin: string;
}

function resolve(options: SnippetOptions): EmbedConfig & { slug: string; origin: string } {
  return { ...EMBED_DEFAULTS, ...options };
}

function attributes(config: EmbedConfig, hidden: Record<string, string> | undefined): string[] {
  const out: string[] = [];
  const add = (name: string, value: string | number) => out.push(`${name}="${value}"`);

  if (config.mode !== EMBED_DEFAULTS.mode) add("data-mode", config.mode);
  if (isOverlay(config.mode)) {
    if (config.position !== EMBED_DEFAULTS.position) add("data-position", config.position);
    if (config.offset !== EMBED_DEFAULTS.offset) add("data-offset", config.offset);
    if (config.width !== EMBED_DEFAULTS.width) add("data-width", config.width);
    if (config.mode === "popup" && config.height !== EMBED_DEFAULTS.height) {
      add("data-height", config.height);
    }
    if (config.color !== EMBED_DEFAULTS.color) add("data-color", config.color);
    if (config.label !== EMBED_DEFAULTS.label) add("data-label", config.label);
    if (!config.icon) add("data-icon", "none");
    if (config.openOn !== EMBED_DEFAULTS.openOn) add("data-open-on", config.openOn);
  }
  if (config.mode === "inline" && !config.autoHeight) add("data-height", config.height);
  if (config.theme !== EMBED_DEFAULTS.theme) add("data-theme", config.theme);

  for (const [key, value] of Object.entries(hidden ?? {})) {
    if (key) add(`data-hidden-${key}`, value);
  }
  return out;
}

/** The script tag, or — for a plain inline embed — the iframe that needs no script at all. */
export function embedSnippet(options: SnippetOptions): string {
  const config = resolve(options);
  const { slug, origin, hidden } = config;

  /**
   * An inline embed that is not asking for anything the loader provides is
   * better served by an iframe: it is one tag, it runs no JavaScript, and it
   * survives a Content Security Policy that forbids third-party scripts.
   */
  if (config.mode === "inline" && config.autoHeight === false) {
    const params = new URLSearchParams({ embed: "1", ...(hidden ?? {}) });
    if (config.theme !== "auto") params.set("theme", config.theme);
    return [
      `<iframe`,
      `  src="${origin}/f/${slug}?${params}"`,
      `  width="100%"`,
      `  height="${config.height}"`,
      `  style="border:0;border-radius:16px"`,
      `  title="Form"`,
      `></iframe>`,
    ].join("\n");
  }

  const attrs = [`data-form="${slug}"`, ...attributes(config, hidden)];
  return [`<script`, `  src="${origin}/embed.js"`, ...attrs.map((a) => `  ${a}`), `  defer`, `></script>`].join(
    "\n",
  );
}

/**
 * The same embed for a React or Next.js app.
 *
 * Still the loader, not a package: `npm i` for a public form buys you a
 * dependency to keep up to date and nothing else. `@chatform/react` is for the
 * headless case — driving the conversation from your own components.
 */
export function reactSnippet(options: SnippetOptions): string {
  const config = resolve(options);
  const props = attributes(config, config.hidden).map((attr) => {
    // Split on the first `=` only; a hidden field's value may contain more.
    const at = attr.indexOf("=");
    return `      ${attr.slice(0, at)}=${attr.slice(at + 1)}`;
  });

  return [
    `import Script from "next/script";`,
    ``,
    `export function FormWidget() {`,
    `  return (`,
    `    <Script`,
    `      src="${config.origin}/embed.js"`,
    `      data-form="${config.slug}"`,
    ...props,
    `      strategy="lazyOnload"`,
    `    />`,
    `  );`,
    `}`,
  ].join("\n");
}

/** Email clients block iframes and scripts, so email gets a link. */
export function emailSnippet(
  slug: string,
  origin: string,
  label = "Answer a few questions",
  color = EMBED_DEFAULTS.color,
): string {
  return [
    `<a href="${origin}/f/${slug}"`,
    `   style="display:inline-block;padding:12px 24px;background:${color};color:#fff;`,
    `          border-radius:9999px;font-family:system-ui,sans-serif;text-decoration:none">`,
    `  ${label} →`,
    `</a>`,
  ].join("\n");
}

/**
 * The Content Security Policy an embedding site needs.
 *
 * Worth handing over rather than making people discover it from a blank
 * rectangle and a console error.
 */
export function cspSnippet(origin: string): string {
  return `frame-src ${origin};\nscript-src ${origin};`;
}
