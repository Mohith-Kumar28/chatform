/**
 * The one HTML escaper. There were two identical copies — one in the email
 * templates, one in the printable-form builder — and a third would have been
 * written the next time someone assembled markup from data.
 *
 * Both quote characters are escaped, so the same function is correct in text
 * content and inside a quoted attribute value.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * An attribute value for markup we hand to someone else to paste — the embed
 * snippet the studio generates.
 *
 * Same escaping, plus backtick and equals, because the snippet is copied into
 * an unknown editor and pasted into an unknown page, and a value that closes
 * its own attribute there is our bug rather than theirs.
 */
export function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;").replace(/=/g, "&#61;");
}
