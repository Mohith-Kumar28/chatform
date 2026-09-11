/**
 * The small rich-text dialect a question description is written in.
 *
 * Plain Markdown, deliberately a handful of it: `**bold**`, `*italic*`,
 * `[text](https://…)` and `- ` lists. Media is not a syntax of its own — a line
 * that holds nothing but a link is an embed, the way it is in a chat app or a
 * notes app. That keeps the stored string readable in an export, trivial for the
 * AI builder to write ("put the link on its own line"), and valid for every form
 * saved before the editor existed.
 *
 * - YouTube link alone on a line → a player.
 * - `![alt](url)` alone on a line → an image.
 * - An uploaded video's asset URL with a `#video` fragment → a `<video>`.
 * - `{{ref}}` → the respondent's answer to that question (see `interpolate`).
 */

export type Embed =
  | { kind: "youtube"; id: string; url: string }
  | { kind: "image"; url: string }
  | { kind: "video"; url: string };

const YOUTUBE_ID = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "music.youtube.com", "youtube-nocookie.com"]);

/** The video id in any of the shapes people paste: watch, youtu.be, shorts, embed, live. */
export function youtubeId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/^(www|m)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (/^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null);
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

const IMAGE_PATH = /\.(png|jpe?g|gif|webp|avif)$/i;
const VIDEO_PATH = /\.(mp4|webm)$/i;

/**
 * What a bare link turns into, or null when it is just a link.
 *
 * Uploaded assets are served as `/p/assets/<id>` with no extension, so an
 * uploaded video carries a `#video` fragment — invisible to the server, and the
 * one bit the renderer needs.
 */
export function embedFromUrl(raw: string): Embed | null {
  const url = raw.trim();
  const id = youtubeId(url);
  if (id) return { kind: "youtube", id, url };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.hash === "#video" || VIDEO_PATH.test(parsed.pathname)) return { kind: "video", url };
  if (IMAGE_PATH.test(parsed.pathname)) return { kind: "image", url };
  return null;
}

/** Characters that would change the meaning of the Markdown an answer is spliced into. */
const MARKDOWN_SPECIAL = /([\\`*_[\]()!#<>|])/g;

/**
 * Replace `{{ref}}` with what `vars` holds for it.
 *
 * An unknown reference becomes an empty string rather than literal braces: a
 * respondent should never read `{{q_name}}`, and an author who mistypes a ref is
 * better served by a gap than by the template leaking. Whitespace inside the
 * braces is tolerated because people type it. With `escapeMarkdown`, spliced
 * values are escaped so an answer cannot restyle — or link from — the text
 * around it.
 */
export function interpolate(
  input: string,
  vars: Map<string, string>,
  opts: { escapeMarkdown?: boolean } = {},
): string {
  return input.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const value = vars.get(key) ?? "";
    return opts.escapeMarkdown ? value.replace(MARKDOWN_SPECIAL, "\\$1") : value;
  });
}

/**
 * The description as a sentence, for places that cannot render it — a printout,
 * a screen reader's live region, a plain-text export.
 */
export function stripRichText(md: string): string {
  return md
    .split("\n")
    .filter((line) => !embedFromUrl(line))
    .join("\n")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*\\])\*([^*]+)\*/g, "$1$2")
    .replace(/\{\{\s*[\w.]+\s*\}\}/g, "…")
    .replace(/\\([\\`*_[\]()!#<>|])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
