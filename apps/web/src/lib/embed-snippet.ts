/**
 * The embed snippets, in one place.
 *
 * There were two generators — one in the Share view and a hardcoded one in
 * Integrate — and they disagreed: the second pointed at a hostname that has not
 * existed since the domain changed, so anyone who copied it got a form that
 * never loaded.
 */

export type EmbedMode = "inline" | "popup" | "side-tab" | "fullpage";

export const EMBED_MODES: { mode: EmbedMode; label: string; blurb: string }[] = [
  { mode: "inline", label: "Inline", blurb: "In the flow of the page, growing to fit." },
  { mode: "popup", label: "Popup", blurb: "A launcher in the corner that opens a panel." },
  { mode: "side-tab", label: "Side tab", blurb: "Slides in from the edge, full height." },
  { mode: "fullpage", label: "Full page", blurb: "Takes over the whole window." },
];

export interface SnippetOptions {
  slug: string;
  mode: EmbedMode;
  /** Where the form is hosted. Derived from the browser, never hardcoded. */
  origin: string;
  hidden?: Record<string, string>;
  height?: number;
}

function hiddenAttrs(hidden: Record<string, string> | undefined, indent: string): string {
  if (!hidden) return "";
  return Object.entries(hidden)
    .map(([key, value]) => `\n${indent}data-hidden-${key}="${value}"`)
    .join("");
}

export function embedSnippet({ slug, mode, origin, hidden, height = 640 }: SnippetOptions): string {
  if (mode === "inline") {
    const params = new URLSearchParams({ embed: "1", ...(hidden ?? {}) });
    return `<iframe
  src="${origin}/f/${slug}?${params}"
  width="100%"
  height="${height}"
  style="border:0"
  title="Form"
></iframe>`;
  }

  return `<script
  src="${origin}/embed.js"
  data-form="${slug}"
  data-mode="${mode}"${hiddenAttrs(hidden, "  ")}
  defer
></script>`;
}

/** Email clients block iframes and scripts, so email gets a link. */
export function emailSnippet(slug: string, origin: string, label = "Answer a few questions"): string {
  return `<a href="${origin}/f/${slug}" style="display:inline-block;padding:12px 20px;background:#f97316;color:#fff;border-radius:999px;font-family:system-ui,sans-serif;text-decoration:none">${label}</a>`;
}
