/**
 * Reading the web before drafting a form.
 *
 * Authors paste a URL and expect the questions to know something about the
 * product — "a waitlist form for https://memorie.in" should not produce the
 * same generic six questions as "a waitlist form". So any URL in the prompt is
 * fetched, reduced to text, and handed to the generator as context.
 *
 * Everything here is best-effort by construction. A site that is down, slow,
 * bot-walled, or entirely client-rendered must cost the author a second or two
 * and nothing else — never the generation itself.
 */

/** How long a single page fetch may take before it is abandoned. */
const FETCH_TIMEOUT_MS = 6000;
/** Bytes read off the wire before the rest of the body is dropped. */
const MAX_BYTES = 512 * 1024;
/** Characters of page text passed on to the model. */
const MAX_TEXT_CHARS = 6000;
/** Pages read per generation. Two is enough for "the site and its pricing page". */
const MAX_URLS = 2;

export interface SiteReading {
  url: string;
  /** The `<title>`, when the page had one worth keeping. */
  title: string | null;
  /** Tags stripped, whitespace collapsed, truncated. */
  text: string;
}

/**
 * URLs an author might paste, including bare hostnames.
 *
 * Bare hostnames are matched conservatively — a known-looking TLD and no
 * spaces — because the prompt is prose, and "e.g. 3.5" or "9.99/mo" must not
 * be mistaken for a site. Anything matched is still fetched with the guards
 * below, so a false positive costs one failed request.
 */
const EXPLICIT_URL = /https?:\/\/[^\s<>"'()]+/gi;
const BARE_HOST =
  /(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|org|net|io|ai|app|dev|co|in|so|xyz|me|sh|to|is|gg|cloud|site|store|tech|design|studio|page|link|space|online|live|fyi|inc|team|works|new|blog|wiki|info|biz|us|uk|ca|de|fr|nl|eu|au|jp|br|es|it|se|no|fi|dk|pl|ch|at|be|ie|nz|sg|hk|kr|cn|ru|tr|mx|ar|cl|za|ng|ke|id|my|ph|th|vn|pk|bd|lk|np)(?:\/[^\s<>"'()]*)?)/gi;

/**
 * Hostnames that must never be fetched.
 *
 * The URL comes from user input and the fetch runs inside the Worker, so
 * without this an author could aim it at loopback or a cloud metadata endpoint.
 * Cloudflare Workers cannot reach a private network from `fetch` in the first
 * place, but the intent should be readable here rather than inferred from the
 * platform.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "169.254.169.254") return true;
  // Literal IPs in private and link-local ranges, plus IPv6 loopback/ULA.
  if (/^(10|127)\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (h === "::1" || h === "[::1]" || h.startsWith("fd") || h.startsWith("fc")) return true;
  return false;
}

/** Every fetchable URL mentioned in the prompt, deduped by origin+path, capped. */
export function extractUrls(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const consider = (raw: string) => {
    // Trailing sentence punctuation is part of the prose, not the URL.
    const trimmed = raw.replace(/[.,;:!?)\]}'"]+$/, "");
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    } catch {
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
    if (isBlockedHost(parsed.hostname)) return;
    if (!parsed.hostname.includes(".")) return;
    const key = `${parsed.hostname}${parsed.pathname.replace(/\/$/, "")}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(parsed.toString());
  };

  for (const m of text.matchAll(EXPLICIT_URL)) consider(m[0]);
  // Only look for bare hostnames in what is left, so "https://x.com/a" does not
  // also register as "x.com/a".
  const withoutExplicit = text.replace(EXPLICIT_URL, " ");
  for (const m of withoutExplicit.matchAll(BARE_HOST)) consider(m[1]!);

  return found.slice(0, MAX_URLS);
}

/** The `<title>`, cleaned of the site-name suffix sites append to it. */
function extractTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]{1,300}?)<\/title>/i.exec(html);
  if (!m) return null;
  const title = decodeEntities(m[1]!).replace(/\s+/g, " ").trim();
  return title || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, ent: string) => {
      if (ent.startsWith("#x") || ent.startsWith("#X")) {
        return String.fromCodePoint(parseInt(ent.slice(2), 16));
      }
      if (ent.startsWith("#")) return String.fromCodePoint(parseInt(ent.slice(1), 10));
      const named: Record<string, string> = {
        amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
        mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
        rdquo: "”", ldquo: "“", trade: "™", copy: "©", reg: "®",
      };
      return named[ent.toLowerCase()] ?? whole;
    });
}

/**
 * Markup → the words a reader would see.
 *
 * `script` and `style` go first, contents and all: a modern landing page
 * carries more JSON in its `__NEXT_DATA__` than prose in its body, and leaving
 * it in means spending the model's context on a serialized component tree.
 */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|br)>/gi, " · ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/\s*·\s*(·\s*)+/g, " · ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

/**
 * Read one page. Resolves to null on anything that is not usable text —
 * a timeout, a non-2xx, a PDF, an empty client-rendered shell.
 */
export async function fetchSiteText(url: string): Promise<SiteReading | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // Identified, and asking for markup rather than whatever the default is.
        "user-agent": "Mozilla/5.0 (compatible; ChatformBot/1.0; +https://chatform.in/bot)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
      },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml|text\/plain/i.test(ctype)) return null;

    // Read with a ceiling rather than calling res.text(): the body length is
    // attacker-controlled, and one 40MB page should not decide how much memory
    // this request uses.
    const html = await readCapped(res, MAX_BYTES);
    const text = htmlToText(html);
    // A client-rendered shell yields a nav bar and nothing else. Below this it
    // is noise that would only mislead the generator.
    if (text.length < 200) return null;
    return { url, title: extractTitle(html), text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let out = "";
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (read >= maxBytes) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out;
}

/** Read every URL in the prompt, in parallel, dropping the ones that fail. */
export async function readSites(urls: string[]): Promise<SiteReading[]> {
  const results = await Promise.all(urls.map((u) => fetchSiteText(u)));
  return results.filter((r): r is SiteReading => r !== null);
}
