/**
 * The `location` an address block collects, in the one shape every consumer
 * can use: a maps URL.
 *
 * Coordinates from the browser and a link pasted by hand end up as the same
 * kind of value, so a spreadsheet cell, a webhook and the results table all
 * get something a person can click. The coordinates are still in the URL for
 * anyone who wants them back.
 */

const COORDS_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** A Google Maps link that drops a pin on the point. */
export function mapsUrlFor(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/**
 * What a respondent gave, as a maps URL, or null when it is neither a link nor
 * a pair of coordinates.
 *
 * "12.9716, 77.5946" is accepted too: it is what a maps app copies when you
 * long-press a point, and refusing it would send people hunting for a share
 * button.
 */
export function normalizeLocation(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const coords = COORDS_RE.exec(v);
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return mapsUrlFor(lat, lng);
    return null;
  }
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

/** The pinned point in a URL this module wrote, for a map preview. */
export function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  try {
    const q = new URL(url).searchParams.get("q");
    const m = q ? COORDS_RE.exec(q) : null;
    return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
  } catch {
    return null;
  }
}
