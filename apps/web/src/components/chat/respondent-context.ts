/**
 * Where this respondent is filling the form from, as the session request's
 * `client` field. The server adds geo and device from the edge and stores the
 * lot on the response; see `apps/api/src/lib/respondent-context.ts`.
 *
 * Read from the address bar the form was opened at:
 *   - a direct link: the link itself (UTMs included) and `document.referrer`.
 *   - `embed.js`: `cf_mode`, `cf_page` and `cf_ref` describe the host page,
 *     because inside the frame `document.referrer` is only its origin.
 *   - the plain iframe snippet: `embed=1` and nothing else, so the best it
 *     has is that origin.
 *
 * Every read is wrapped: none of this is worth a form failing to open.
 */
type Channel = "link" | "inline" | "popup" | "side_tab" | "fullpage" | "embed";

const MODES: Record<string, Channel> = {
  inline: "inline",
  popup: "popup",
  "side-tab": "side_tab",
  fullpage: "fullpage",
};

export interface ClientContext {
  channel?: Channel;
  pageUrl?: string;
  referrer?: string;
  utm?: Record<string, string>;
  language?: string;
  screen?: string;
}

/**
 * The form link as opened, keeping only its UTMs. The rest of our own query is
 * ours (a signed `resume` token, payment return ids, prefills) and has no
 * business in a record the author exports or posts to a webhook.
 */
function ownLink(params: URLSearchParams): string {
  const url = new URL(window.location.origin + window.location.pathname);
  for (const [key, value] of params) if (key.startsWith("utm_")) url.searchParams.set(key, value);
  return url.toString();
}

export function respondentContext(): { client?: ClientContext } {
  if (typeof window === "undefined") return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const embedded = params.get("embed") === "1";
    const client: ClientContext = {};

    client.channel = embedded ? (MODES[params.get("cf_mode") ?? ""] ?? "embed") : "link";

    const page = embedded ? params.get("cf_page") : ownLink(params);
    if (page) client.pageUrl = page.slice(0, 2000);

    const ref = embedded ? params.get("cf_ref") || document.referrer : document.referrer;
    // A referrer that is the form's own host is a reload, not a source.
    if (ref && !ref.startsWith(window.location.origin)) client.referrer = ref.slice(0, 2000);

    const utm: Record<string, string> = {};
    for (const key of ["source", "medium", "campaign", "term", "content"]) {
      const value = params.get(`utm_${key}`);
      if (value) utm[key] = value.slice(0, 300);
    }
    if (Object.keys(utm).length > 0) client.utm = utm;

    if (navigator.language) client.language = navigator.language.slice(0, 35);
    if (window.screen?.width) client.screen = `${window.screen.width}x${window.screen.height}`;

    return { client };
  } catch {
    return {};
  }
}
