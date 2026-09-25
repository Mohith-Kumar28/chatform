import { escapeAttr } from "@repo/guard";

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
  { mode: "popup", label: "Popup", blurb: "A button in the corner that opens the form." },
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
  /** The corner button. Off means the form opens from the page's own element. */
  launcher: boolean;
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
  // The mark's orange. Must stay in step with the same default in
  // `public/embed.js`. Unlike the rest, `data-button-color` is always spelled
  // out, so the snippet shows where to change it.
  color: "#FD6F29",
  // "Questions?" is a support-widget default, and this is a form: the bubble
  // read as a help desk nobody was staffing. Must stay in step with the same
  // default in `public/embed.js`, for the reason given on `color` above.
  label: "Fill this form",
  icon: true,
  launcher: true,
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
  /**
   * Escaped, because this is markup we hand somebody else to paste.
   *
   * The values are the author's own — a button label, a colour, arbitrary
   * hidden-field pairs from the studio — so the snippet is not an injection
   * into our page. It is a string that gets pasted into an unknown page, and a
   * label containing a quote closed its own attribute there and silently
   * changed the tag. That is our bug rather than theirs.
   */
  const add = (name: string, value: string | number) =>
    out.push(`${name}="${escapeAttr(String(value))}"`);

  /**
   * Nothing about how the form looks or behaves is written here any more.
   *
   * Those choices are on the form and published with it: `embed.js` fetches
   * the live version, so a change made in the studio reaches every site
   * carrying the script on Publish. An attribute written here would pin that
   * setting on this one site forever, which is exactly what used to make every
   * studio change need a re-paste. Only what differs per page stays: the
   * hidden values.
   */
  void config;
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
    // `cf_mode` names the channel on the response; a static tag cannot know its own page.
    const params = new URLSearchParams({ embed: "1", cf_mode: "inline", ...(hidden ?? {}) });
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
  /**
   * Inline gets a placeholder that holds its space from the first paint. The
   * loader runs after the page has parsed, so without one the form arrives
   * 620px tall and shoves everything below it down.
   */
  const placeholder =
    config.mode === "inline"
      ? [`<div id="chatform-${slug}" style="min-height:620px"></div>`]
      : [];
  if (placeholder.length) attrs.push(`data-target="#chatform-${slug}"`);
  const tag = [`<script`, `  src="${origin}/embed.js"`, ...attrs.map((a) => `  ${a}`), `  defer`, `></script>`];
  return [...placeholder, ...tag, ...ownButton(config, "html")].join("\n");
}

/**
 * With the corner button off, the page has to supply its own, so the snippet
 * shows one. Any element works; the attribute is what matters.
 */
function ownButton(config: EmbedConfig, target: "html" | "react"): string[] {
  if (!isOverlay(config.mode) || config.launcher) return [];
  const label = escapeAttr(config.label || EMBED_DEFAULTS.label);
  if (target === "react") {
    return [``, `// Any element with data-chatform-open opens the form.`, `<button type="button" data-chatform-open>${label}</button>`];
  }
  return [
    ``,
    `<!-- Any element with data-chatform-open opens the form. -->`,
    `<button type="button" data-chatform-open>${label}</button>`,
  ];
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
    ...ownButton(config, "react"),
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

const MODE_WORDS: Record<EmbedMode, string> = {
  popup: "popup",
  "side-tab": "side tab",
  inline: "inline",
  fullpage: "full page",
};

const OPEN_WORDS: Record<EmbedConfig["openOn"], string> = {
  click: "when a button is clicked",
  load: "as soon as the page loads",
  "exit-intent": "when the visitor is about to leave",
  "scroll:50": "after scrolling halfway down the page",
};

/**
 * A prompt for an AI coding tool that adds the embed to someone's site.
 *
 * The look and behaviour are published with the form, so the agent only has
 * to place the tag; it is told not to pin settings with attributes, and to
 * ask about placement before it builds. Written without em
 * dashes on purpose: the agent copies the prompt's voice into the site.
 */
export function aiPrompt(options: SnippetOptions): string {
  const config = resolve(options);
  const { slug, origin } = config;
  const overlay = isOverlay(config.mode);
  const suggested = (text: string) => `(suggested: ${text})`;

  return `I want to add a Chatform form to my website. Chatform is a form that feels like a chat. It goes on a page with one script tag. There is no package to install and no API key.

Form slug: ${slug}
Script: ${origin}/embed.js

## Step 1: ask me first

How the form looks and when it opens (popup or inline, corner, button text, auto open, size, colours) is set in Chatform and loaded by the script, so do not ask about those or add attributes for them. Currently: ${MODE_WORDS[config.mode]}${overlay ? `, ${config.launcher ? `corner button "${config.label || "icon only"}" at ${config.position}` : "no corner button, opened from my own button"}, opens ${OPEN_WORDS[config.openOn]}` : ""}.

Before you write any code, ask me these questions one at a time and wait for my reply:

1. Which page or pages should it be on?${config.mode === "inline" ? " Which section of the page should it go in?" : ""}
2. ${overlay ? `Should it also open from a button that is already on my site? If so, which one? ${suggested(config.launcher ? "no, the corner button is enough" : "yes, my own button")}` : "Anything that should sit above or below it?"}
3. Should any hidden values be passed in, like the plan a visitor is on or where they came from? These are saved with each response.

## Step 2: add it

Use the approach that fits my project. Look at the code to work out the stack; ask if it is unclear.
- Plain HTML: put the script tag just before </body>.
- Next.js: use next/script with strategy="lazyOnload", in the layout for every page or in one page for just that page. Put each data attribute on the Script component as it is.
- React without Next.js, Vue, Svelte and others: add the script tag to index.html, or create the script element once in code. Guard against adding it twice (React StrictMode runs effects twice in development).
- Webflow, WordPress, Framer, Shopify and other site builders: tell me where to paste the script tag (usually a custom code or embed block).

Do not install any npm package for this. The script is all it needs.

## Settings

The form's look and behaviour come from Chatform and update when I press Publish there, with no code change. Do not add data-mode, data-position, data-label, data-open-on or similar attributes: an attribute on the tag overrides the Chatform setting on this site for good.

The only attributes to use:

| Attribute | What it does |
| --- | --- |
| data-form | Which form to show. Required. |
| data-target | Inline only: CSS selector of the element to put the form in |
| data-hidden-<name> | A hidden value saved with each response, e.g. data-hidden-plan="pro" |

On screens narrower than 520px the popup and side tab fill the whole screen, and an automatic open only draws attention to the corner button instead of covering the page.

## Opening it from my own button

Add the attribute data-chatform-open to any button or link. Clicking it opens the form. It works for buttons added to the page later too.

<button type="button" data-chatform-open>Join the waitlist</button>

Whether the round corner button shows is set in Chatform. If one page has two forms, name the form: data-chatform-open="${slug}".

## Controlling it from JavaScript

window.Chatform.open()
window.Chatform.close()
window.Chatform.toggle()
window.Chatform.prefill({ plan: "pro" })   // hidden values, set at runtime
window.Chatform.on("complete", (event) => { /* the visitor finished the form */ })

Other events: open, close, ready, question, answer. Calls made before the script has loaded are queued if you push them to window.ChatformQueue, for example window.ChatformQueue = [["open"]].

## The snippet

Start from this:

${embedSnippet(options)}

## Before you finish

- Only one script tag per form per page.
- If the site sets a Content Security Policy, add: frame-src ${origin}; script-src ${origin};
- Tell me how to check it works: which page to open and what I should see.`;
}
