/**
 * Stable JSON, so that re-serialising an unchanged document produces an
 * unchanged hash.
 *
 * `JSON.stringify` preserves insertion order, and the builder rebuilds block
 * objects as people drag and edit them. Without this, opening a form and saving
 * it untouched could report an unpublished change.
 *
 * This lives here, rather than beside its one caller in the API, because the
 * hash it feeds is written in two places that must agree: `publishFingerprint`
 * computes it when someone publishes from the builder, and `tooling/` computes
 * it when a form is published by generated SQL instead. A private copy in each
 * would be two implementations of "the same document", and the failure when
 * they drifted would be silent — a form permanently showing an amber
 * "unpublished changes" dot, or offering a republish nobody asked for.
 */
export function canonicalJson(json: string): string {
  try {
    return stringify(JSON.parse(json) as unknown);
  } catch {
    // Unparseable working schema is a different problem, and publish rejects it anyway.
    return json;
  }
}

function stringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // Undefined members vanish under JSON.stringify; drop them here too so the two agree.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stringify(v)}`).join(",")}}`;
}
