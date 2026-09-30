import { decodeEntities } from "../research.js";

/**
 * A builder's rich text (HTML) as the markdown our descriptions render.
 *
 * Kept: links (as `[words](url)`), bold, italics, line breaks and list items.
 * A link is the part people most often lose in a copy, and a description that
 * says "read our policy" with the link gone is worse than no description.
 * Only http(s) and mailto links survive; anything else keeps its words.
 */
export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  const md = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, inner: string) => {
      const words = inlineText(inner);
      const url = decodeEntities(href).trim();
      if (!/^(https?:|mailto:)/i.test(url)) return words;
      return words && words !== url ? `[${words}](${url})` : url;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, inner: string) => wrap(inlineText(inner), "**"))
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, inner: string) => wrap(inlineText(inner), "_"))
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    // A paragraph ends in a blank line, or markdown runs the next one into it.
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/(li|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(md)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function inlineText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function wrap(words: string, mark: string): string {
  return words ? `${mark}${words}${mark}` : "";
}

/** Plain words, for titles: every tag gone, entities decoded, one line. */
export function htmlToPlain(html: string): string {
  return inlineText(html.replace(/<br\s*\/?>/gi, " ").replace(/<\/p>/gi, " "));
}

/** An absolute https image URL, or undefined. */
export function imageUrlOf(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const url = raw.trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : undefined;
}

/**
 * The answer a plain text box is really asking for, from what the page says
 * about it: its name, autocomplete hint, placeholder and label. Null when
 * nothing points anywhere, and the generator decides.
 */
export function inferTextType(hints: { name?: string | null; autocomplete?: string | null; placeholder?: string | null; label?: string | null }): string | null {
  const name = `${hints.name ?? ""} ${hints.autocomplete ?? ""}`.toLowerCase();
  const placeholder = (hints.placeholder ?? "").toLowerCase();
  const label = (hints.label ?? "").toLowerCase();
  const all = `${name} ${label}`;
  if (/e-?mail/.test(all) || /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(placeholder.trim())) return "email";
  if (/\b(phone|mobile|tel|whatsapp|contact number)\b/.test(all) || /^\+?[\d\s()-]{7,}$/.test(placeholder.trim())) return "phone";
  if (/(website|\burl\b|homepage|linkedin|site\b|link\b)/.test(all) || /^(https?:\/\/|www\.)/.test(placeholder.trim())) return "url";
  if (/\b(date of birth|dob|birthday|date)\b/.test(all) || /^(dd|mm|yyyy)[/-]/.test(placeholder.trim())) return "date";
  return null;
}
