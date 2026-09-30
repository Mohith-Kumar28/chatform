import { GuardError, guardedFetch, readTruncatedText } from "@repo/guard";
import { parseGoogleData, readGoogleForm } from "./google.js";
import { parseTallyData, readTallyForm } from "./tally.js";
import { readTypeform } from "./typeform.js";
import { ImportError, type ImportedForm, type ImportProvider } from "./types.js";

/**
 * A pasted link → the form behind it, or an `ImportError` saying why not.
 *
 * Every failure is decided here, by status codes and markers the sources
 * really send, so the author is told the actual reason: an editor link, a
 * form that needs sign-in, a closed Google Form whose questions Google no
 * longer serves. Checked against live forms; see the table in the plan for
 * what each source returns.
 */

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 8000;
/**
 * Identified, as `research.ts` is, and not dressed up as Chrome: given a
 * desktop Chrome agent, `forms.gle` answers with a script-only interstitial
 * (no redirect, no form id in it) instead of the 302 every other client gets.
 */
const USER_AGENT = "Mozilla/5.0 (compatible; ChatformBot/1.0; +https://chatform.in/bot)";

export interface ResolvedLink {
  provider: ImportProvider | null;
  /** What to fetch. For Typeform, the form id. */
  target: string;
}

/** Which builder a link belongs to, from the link alone. Throws for links that can never work. */
export function resolveImportUrl(raw: string): ResolvedLink {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    throw new ImportError("unsupported_url");
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname;

  if (host === "forms.gle") return { provider: "google_forms", target: url.toString() };
  if (host === "docs.google.com" || host === "forms.google.com") {
    const published = path.match(/\/forms\/(?:u\/\d+\/)?d\/e\/([A-Za-z0-9_-]{20,})/);
    if (published) return { provider: "google_forms", target: `https://docs.google.com/forms/d/e/${published[1]}/viewform` };
    // `/d/{id}/edit` is the owner's editor: private by design.
    if (/\/forms\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]{20,}\/edit/.test(path)) throw new ImportError("edit_link");
    const plain = path.match(/\/forms\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/);
    if (plain) return { provider: "google_forms", target: `https://docs.google.com/forms/d/${plain[1]}/viewform` };
    throw new ImportError("unsupported_url");
  }

  if (host === "typeform.com" || host.endsWith(".typeform.com")) {
    // form.typeform.com/to/ID, acme.typeform.com/to/ID, admin.typeform.com/form/ID/create
    const id = path.match(/\/(?:to|form)\/([A-Za-z0-9]{6,12})(?:\/|$)/)?.[1];
    if (id) return { provider: "typeform", target: id };
    // A vanity link or a template page: the id is somewhere in the page.
    return { provider: null, target: url.toString() };
  }

  if (host === "tally.so" || host.endsWith(".tally.so")) {
    const id = path.match(/\/(?:r|embed|forms|popup)\/([A-Za-z0-9]{4,12})(?:\/|$)/)?.[1];
    if (id) return { provider: "tally", target: `https://tally.so/r/${id}` };
    throw new ImportError("unsupported_url");
  }

  // Anything else may be a form on a custom domain, or a page embedding one.
  return { provider: null, target: url.toString() };
}

export async function readImport(raw: string): Promise<ImportedForm> {
  const link = resolveImportUrl(raw);
  switch (link.provider) {
    case "typeform":
      return fetchTypeform(link.target);
    case "google_forms":
      return fetchGoogle(link.target);
    case "tally":
      return fetchTally(link.target);
    default:
      return sniff(link.target);
  }
}

async function get(url: string, accept = "text/html,application/xhtml+xml"): Promise<{ status: number; body: string; finalUrl: string }> {
  try {
    const { response, url: final } = await guardedFetch(url, {
      timeoutMs: TIMEOUT_MS,
      maxRedirects: 5,
      init: { headers: { "user-agent": USER_AGENT, accept, "accept-language": "en" } },
    });
    const body = response.ok || response.status === 401 || response.status === 403 ? await readTruncatedText(response, MAX_BYTES) : "";
    if (!response.ok) await response.body?.cancel().catch(() => {});
    return { status: response.status, body, finalUrl: final.toString() };
  } catch (err) {
    if (err instanceof GuardError && (err.code === "blocked_host" || err.code === "bad_host" || err.code === "bad_scheme" || err.code === "bad_url" || err.code === "userinfo")) throw new ImportError("unsupported_url");
    console.error("import_fetch_failed", { url, message: err instanceof Error ? err.message : String(err) });
    throw new ImportError("unreachable");
  }
}

async function fetchTypeform(id: string): Promise<ImportedForm> {
  const shareUrl = `https://form.typeform.com/to/${id}`;
  const api = await get(`https://api.typeform.com/forms/${id}`, "application/json");
  if (api.status === 200) {
    try {
      return withQuestions(readTypeform(JSON.parse(api.body), shareUrl));
    } catch (err) {
      if (err instanceof ImportError) throw err;
    }
  }
  // The API turned us away; the respond page embeds the same definition.
  const page = await get(shareUrl);
  if (page.status === 404 || /typeform\.com\/explore/.test(page.finalUrl)) throw new ImportError("not_found");
  const data = rendererForm(page.body);
  if (!data) throw new ImportError(api.status === 404 || api.status === 403 ? "not_found" : "unreachable");
  return withQuestions(readTypeform(data, shareUrl));
}

/** `window.rendererData = { …, form: {…} }` on a Typeform respond page. */
function rendererForm(html: string): unknown {
  const at = html.indexOf("rendererData");
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  if (start < 0) return null;
  // Balanced-brace scan, string-aware: the object is followed by more script.
  let depth = 0;
  let inString = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        const data = JSON.parse(html.slice(start, i + 1)) as { form?: unknown };
        return data.form ?? null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchGoogle(url: string): Promise<ImportedForm> {
  const page = await get(url);
  if (/accounts\.google\.com/.test(page.finalUrl) || page.status === 401 || page.status === 403) throw new ImportError("sign_in_required");
  if (page.status === 404) throw new ImportError("not_found");
  if (/\/closedform/.test(page.finalUrl)) throw new ImportError("closed_hidden");
  if (page.status !== 200) throw new ImportError("unreachable");
  const data = parseGoogleData(page.body);
  if (!data) {
    if (/ServiceLogin|You must sign in|need permission/i.test(page.body)) throw new ImportError("sign_in_required");
    if (/no longer accepting responses/i.test(page.body)) throw new ImportError("closed_hidden");
    throw new ImportError("not_found");
  }
  return withQuestions(readGoogleForm(data, page.finalUrl.replace(/\?.*$/, "")));
}

async function fetchTally(url: string): Promise<ImportedForm> {
  const page = await get(url);
  if (page.status === 404) throw new ImportError("not_found");
  if (page.status !== 200) throw new ImportError("unreachable");
  const data = parseTallyData(page.body);
  if (!data || (data.blocks === undefined && !data.settings)) throw new ImportError("not_found");
  const settings = (data.settings ?? {}) as { isPasswordProtected?: boolean };
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  if (settings.isPasswordProtected && blocks.length === 0) throw new ImportError("password_protected");
  return withQuestions(readTallyForm(data, url));
}

/**
 * A page that is not a builder's own domain: a custom domain, or a website
 * with a form embedded in it. Read once, and handed to whichever reader
 * recognises what is inside.
 */
async function sniff(url: string): Promise<ImportedForm> {
  const page = await get(url);
  if (page.status === 404) throw new ImportError("not_found");
  if (page.status !== 200) throw new ImportError("unreachable");
  const html = page.body;
  const google = parseGoogleData(html);
  if (google) return withQuestions(readGoogleForm(google, page.finalUrl));
  const tally = parseTallyData(html);
  if (tally && Array.isArray(tally.blocks)) return withQuestions(readTallyForm(tally, page.finalUrl));
  const typeformForm = rendererForm(html);
  if (typeformForm) return withQuestions(readTypeform(typeformForm, page.finalUrl));
  // Embedded: an iframe or embed snippet pointing at one of the builders.
  const typeformId =
    html.match(/typeform\.com\/to\/([A-Za-z0-9]{6,12})/)?.[1] ?? html.match(/data-tf-(?:widget|popup|slider|popover|sidetab|live)="([A-Za-z0-9]{6,12})"/)?.[1];
  if (typeformId) return fetchTypeform(typeformId);
  const tallyId = html.match(/tally\.so\/(?:r|embed)\/([A-Za-z0-9]{4,12})/)?.[1] ?? html.match(/data-tally-(?:src|open)="(?:https:\/\/tally\.so\/(?:r|embed)\/)?([A-Za-z0-9]{4,12})/)?.[1];
  if (tallyId) return fetchTally(`https://tally.so/r/${tallyId}`);
  const googleId = html.match(/docs\.google\.com\/forms\/d\/e\/([A-Za-z0-9_-]{20,})/)?.[1];
  if (googleId) return fetchGoogle(`https://docs.google.com/forms/d/e/${googleId}/viewform`);
  throw new ImportError("unsupported_url");
}

function withQuestions(form: ImportedForm): ImportedForm {
  if (!form.items.some((i) => i.type !== "statement")) throw new ImportError("no_questions");
  return form;
}
