/**
 * Where and on what a response was filled in, as spreadsheet columns.
 *
 * One list for every table that carries them: the results table on screen, the
 * selection download, and the server's CSV, workbook and sheet feed. Always
 * appended after the answers, so a formula written against an older export's
 * question columns still lines up.
 *
 * The shape is the API's `RespondentContext` (`apps/api/src/lib/respondent-context.ts`),
 * restated structurally so the web app's generated type fits it too.
 */

export interface RespondentMetadata {
  channel: string;
  pageUrl: string | null;
  referrer: string | null;
  utm?: Partial<Record<string, string>> | null;
  language: string | null;
  screen: string | null;
  timezone: string | null;
  device: {
    type: string | null;
    browser: string | null;
    browserVersion: string | null;
    os: string | null;
    osVersion: string | null;
  };
  geo: {
    country: string | null;
    region: string | null;
    city: string | null;
    postalCode: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  };
  network: { organization: string | null };
}

export const CHANNEL_LABELS: Record<string, string> = {
  link: "Direct link",
  inline: "Embedded on a page",
  popup: "Popup on a page",
  side_tab: "Side tab on a page",
  fullpage: "Full-page embed",
  embed: "Embedded on a page",
  api: "API",
};

export const DEVICE_LABELS: Record<string, string> = {
  mobile: "Phone",
  tablet: "Tablet",
  desktop: "Computer",
  bot: "Bot or script",
};

/** "IN" as "India". English everywhere, so an export reads the same whoever downloads it. */
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  if (code.length !== 2) return code;
  try {
    return new Intl.DisplayNames("en", { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function join(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Their IANA zone: the browser's own first, the IP's as the fallback. */
export function respondentTimeZone(m: RespondentMetadata | null | undefined): string | null {
  return m?.timezone ?? m?.geo.timezone ?? null;
}

/**
 * The moment on their wall clock, as "2026-09-26 15:42". Empty when the zone is
 * missing or one this runtime does not know.
 */
export function wallClockIn(at: number, zone: string | null): string {
  if (!zone) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

/** The flag emoji for a two-letter country code, or "" for anything else. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

export interface RespondentColumn {
  key: string;
  title: string;
  /** `at` is when the response was submitted (or started, if it never was). */
  cell: (m: RespondentMetadata, at: number) => string;
}

const utm = (key: string) => (m: RespondentMetadata) => m.utm?.[key] ?? "";

export const RESPONDENT_COLUMNS: RespondentColumn[] = [
  { key: "channel", title: "Channel", cell: (m) => CHANNEL_LABELS[m.channel] ?? m.channel },
  { key: "page", title: "Page", cell: (m) => m.pageUrl ?? "" },
  { key: "referrer", title: "Came from", cell: (m) => m.referrer ?? "" },
  { key: "utm_source", title: "UTM source", cell: utm("source") },
  { key: "utm_medium", title: "UTM medium", cell: utm("medium") },
  { key: "utm_campaign", title: "UTM campaign", cell: utm("campaign") },
  { key: "utm_term", title: "UTM term", cell: utm("term") },
  { key: "utm_content", title: "UTM content", cell: utm("content") },
  { key: "country", title: "Country", cell: (m) => countryName(m.geo.country) ?? "" },
  { key: "region", title: "Region", cell: (m) => m.geo.region ?? "" },
  { key: "city", title: "City", cell: (m) => m.geo.city ?? "" },
  { key: "postal_code", title: "Postal code", cell: (m) => m.geo.postalCode ?? "" },
  { key: "latitude", title: "Latitude", cell: (m) => (m.geo.latitude === null ? "" : String(m.geo.latitude)) },
  { key: "longitude", title: "Longitude", cell: (m) => (m.geo.longitude === null ? "" : String(m.geo.longitude)) },
  { key: "timezone", title: "Time zone", cell: (m) => respondentTimeZone(m) ?? "" },
  {
    key: "local_time",
    title: "Their local time",
    cell: (m, at) => wallClockIn(at, respondentTimeZone(m)),
  },
  {
    key: "device",
    title: "Device",
    cell: (m) => (m.device.type ? (DEVICE_LABELS[m.device.type] ?? m.device.type) : ""),
  },
  { key: "browser", title: "Browser", cell: (m) => join(m.device.browser, m.device.browserVersion) },
  { key: "os", title: "Operating system", cell: (m) => join(m.device.os, m.device.osVersion) },
  { key: "screen", title: "Screen", cell: (m) => m.screen ?? "" },
  { key: "language", title: "Language", cell: (m) => m.language ?? "" },
  { key: "network", title: "Network", cell: (m) => m.network.organization ?? "" },
];

/** One cell per column, in order. A response that recorded nothing gets a row of blanks. */
export function respondentCells(m: RespondentMetadata | null | undefined, at: number): string[] {
  return RESPONDENT_COLUMNS.map((c) => (m ? c.cell(m, at) : ""));
}
