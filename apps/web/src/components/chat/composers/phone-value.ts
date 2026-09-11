import metadata from "libphonenumber-js/min/metadata";
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isPossiblePhoneNumber,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
  type CountryCode,
} from "libphonenumber-js";

/**
 * The value layer under the phone composer.
 *
 * A phone question used to be answered into the same plain box as everything
 * else, which meant the respondent had to supply the country code themselves —
 * the validator refuses a bare national number unless the author happened to
 * set a country hint, so "9876543210" came back as "Please enter a valid phone
 * number with country code." That is a rejection for not knowing a convention,
 * and it arrives *after* they have already answered.
 *
 * So the box splits in two: the country (and therefore the dialling code) is
 * picked, and the number is typed. Which means something has to own the
 * conversion between what is on screen — a country plus a national number, in
 * national formatting — and the one string the rest of the runtime deals in:
 * E.164, `+<country><number>`, exactly what `validateAnswer` accepts and what
 * `normalizeE164` keeps in the respondent's saved answers.
 *
 * All of it is kept here, as pure functions over strings, because the component
 * next door is where carets and keyboards live and this is where being wrong
 * about a country's numbering plan would be invisible. `libphonenumber-js`
 * carries the plans (the `min` metadata — lengths and formats, no number types),
 * so none of the below hardcodes a dialling code or a digit count.
 */

export type { CountryCode };

export interface PhoneCountry {
  code: CountryCode;
  /** Dialling code, no `+`. */
  dial: string;
  /** English name, for the list and for type-to-search in a native select. */
  name: string;
  /** Regional-indicator pair. Renders as letters where flags are unsupported. */
  flag: string;
}

/** A two-letter code libphonenumber actually knows, or null. */
export function asPhoneCountry(raw: string | null | undefined): CountryCode | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return (getCountries() as string[]).includes(code) ? (code as CountryCode) : null;
}

export function dialOf(country: CountryCode): string {
  try {
    return getCountryCallingCode(country);
  } catch {
    return "";
  }
}

/**
 * 🇮🇳 from "IN".
 *
 * A platform with no flag font draws the two letters instead, which is a
 * perfectly good fallback — and the dialling code sits beside it either way, so
 * nothing here is load-bearing.
 */
export function flagOf(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .replace(/./g, (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65));
}

let cached: PhoneCountry[] | null = null;

/**
 * Every country, by name.
 *
 * Built on first use rather than at module scope: this is ~245 `Intl` lookups,
 * and a module that does them on import does them during server rendering of
 * any page that happens to pull the composer in.
 */
export function phoneCountries(): PhoneCountry[] {
  if (cached) return cached;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    names = null;
  }
  cached = getCountries()
    .map((code) => ({
      code,
      dial: dialOf(code),
      // A few entries are territories `Intl` has no name for; the code reads
      // better in a list than a blank does.
      name: (() => {
        try {
          return names?.of(code) ?? code;
        } catch {
          return code;
        }
      })(),
      flag: flagOf(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return cached;
}

/**
 * Where the timezone says this browser is.
 *
 * The strongest signal available without asking anyone for anything: a laptop
 * bought in California and used in Bengaluru says `en-US` and
 * `Asia/Kolkata`, and only one of those two is about where the person is.
 *
 * Deliberately not exhaustive and deliberately not a lookup service. There is
 * no API that maps a zone to a country, so this is the populous end of the
 * list — enough that most respondents see their own flag, with the language tag
 * and then the fallback underneath it for everyone else. Being wrong costs one
 * tap on a picker that is already open in front of them.
 */
const ZONE_COUNTRY: Record<string, string> = {
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD",
  "Asia/Colombo": "LK", "Asia/Kathmandu": "NP", "Asia/Thimphu": "BT", "Asia/Kabul": "AF",
  "Asia/Shanghai": "CN", "Asia/Urumqi": "CN", "Asia/Chongqing": "CN", "Asia/Hong_Kong": "HK",
  "Asia/Macau": "MO", "Asia/Taipei": "TW", "Asia/Tokyo": "JP", "Asia/Seoul": "KR",
  "Asia/Singapore": "SG", "Asia/Kuala_Lumpur": "MY", "Asia/Jakarta": "ID", "Asia/Makassar": "ID",
  "Asia/Jayapura": "ID", "Asia/Manila": "PH", "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN",
  "Asia/Saigon": "VN", "Asia/Yangon": "MM", "Asia/Phnom_Penh": "KH", "Asia/Vientiane": "LA",
  "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Asia/Kuwait": "KW",
  "Asia/Muscat": "OM", "Asia/Bahrain": "BH", "Asia/Tehran": "IR", "Asia/Baghdad": "IQ",
  "Asia/Jerusalem": "IL", "Asia/Tel_Aviv": "IL", "Asia/Amman": "JO", "Asia/Beirut": "LB",
  "Asia/Damascus": "SY", "Asia/Tashkent": "UZ", "Asia/Almaty": "KZ", "Asia/Baku": "AZ",
  "Asia/Tbilisi": "GE", "Asia/Yerevan": "AM", "Asia/Istanbul": "TR", "Europe/Istanbul": "TR",
  "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL", "Europe/Brussels": "BE",
  "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
  "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ",
  "Europe/Budapest": "HU", "Europe/Bucharest": "RO", "Europe/Athens": "GR", "Europe/Lisbon": "PT",
  "Europe/Moscow": "RU", "Asia/Yekaterinburg": "RU", "Asia/Novosibirsk": "RU", "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA", "Europe/Minsk": "BY", "Europe/Sofia": "BG", "Europe/Belgrade": "RS",
  "Europe/Zagreb": "HR", "Europe/Bratislava": "SK", "Europe/Ljubljana": "SI", "Europe/Vilnius": "LT",
  "Europe/Riga": "LV", "Europe/Tallinn": "EE", "Atlantic/Reykjavik": "IS",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Phoenix": "US",
  "America/Los_Angeles": "US", "America/Anchorage": "US", "America/Detroit": "US", "Pacific/Honolulu": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Edmonton": "CA", "America/Winnipeg": "CA",
  "America/Halifax": "CA", "America/Mexico_City": "MX", "America/Monterrey": "MX", "America/Tijuana": "MX",
  "America/Sao_Paulo": "BR", "America/Bahia": "BR", "America/Fortaleza": "BR", "America/Manaus": "BR",
  "America/Argentina/Buenos_Aires": "AR", "America/Santiago": "CL", "America/Bogota": "CO",
  "America/Lima": "PE", "America/Caracas": "VE", "America/Guayaquil": "EC", "America/La_Paz": "BO",
  "America/Montevideo": "UY", "America/Asuncion": "PY", "America/Panama": "PA", "America/Havana": "CU",
  "America/Santo_Domingo": "DO", "America/Guatemala": "GT", "America/Costa_Rica": "CR",
  "America/Jamaica": "JM", "America/Puerto_Rico": "PR",
  "Africa/Lagos": "NG", "Africa/Cairo": "EG", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA",
  "Africa/Accra": "GH", "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN",
  "Africa/Addis_Ababa": "ET", "Africa/Dar_es_Salaam": "TZ", "Africa/Kampala": "UG",
  "Africa/Khartoum": "SD", "Africa/Dakar": "SN", "Africa/Abidjan": "CI", "Africa/Kinshasa": "CD",
  "Africa/Luanda": "AO", "Africa/Harare": "ZW", "Africa/Lusaka": "ZM", "Africa/Maputo": "MZ",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Australia/Brisbane": "AU",
  "Australia/Perth": "AU", "Australia/Adelaide": "AU", "Australia/Darwin": "AU",
  "Pacific/Auckland": "NZ", "Pacific/Fiji": "FJ",
};

/**
 * Where the picker opens before anybody touches it.
 *
 * Four signals, strongest first. The author's `countryHint` — they know who is
 * filling this in. Then the browser's timezone, which is about where the device
 * is. Then the region in its language tags, which is often about where it was
 * bought. Then India, because that is where most of these forms are answered;
 * a default has to be *some* country, and the honest choice is the likeliest
 * one rather than the one the industry defaults to out of habit.
 *
 * Deliberately not geolocation and not an IP lookup: one puts a permission
 * prompt in front of a respondent mid-question, the other sends their address
 * to a third party. Both are a lot to spend on something one tap can fix.
 */
export const FALLBACK_COUNTRY: CountryCode = "IN";

export function defaultPhoneCountry(hint?: string | null): CountryCode {
  return (
    asPhoneCountry(hint) ??
    asPhoneCountry(countryFromTimezone()) ??
    asPhoneCountry(countryFromLanguage()) ??
    FALLBACK_COUNTRY
  );
}

function countryFromTimezone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone ? (ZONE_COUNTRY[zone] ?? null) : null;
  } catch {
    return null;
  }
}

function countryFromLanguage(): string | null {
  if (typeof navigator === "undefined") return null;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const region = regionOf(tag);
    if (region) return region;
  }
  return null;
}

function regionOf(tag: string | undefined): string | null {
  if (!tag) return null;
  try {
    return new Intl.Locale(tag).region ?? null;
  } catch {
    return /-([A-Za-z]{2})(?:-|$)/.exec(tag)?.[1] ?? null;
  }
}

export interface ComposedPhone {
  /** National formatting, for the box. */
  display: string;
  /** E.164, for the answer. Empty while nothing has been typed. */
  value: string;
  /** Whether the digits so far could be a real number in this country. */
  possible: boolean;
}

/**
 * A country and a typed national number, turned into both halves of the field.
 *
 * `AsYouType` does the formatting and the parsing in one pass, which is what
 * makes a trunk prefix work: somebody in London writes `07911 123456` and
 * somebody in Delhi writes `098765 43210`, and both are the same number as the
 * one without the leading zero. Concatenating a dialling code onto raw digits
 * would have produced `+4407911123456`.
 *
 * The concatenation is still the fallback, for the stretch where there are too
 * few digits to parse at all — the value is wrong-shaped then anyway, and
 * `possible` is what guards sending.
 */
export function composePhone(country: CountryCode, typed: string): ComposedPhone {
  const formatter = new AsYouType(country);
  const display = formatter.input(typed);
  const parsed = formatter.getNumber();
  const digits = typed.replace(/\D/g, "");
  const dial = dialOf(country);
  return {
    display,
    value: parsed?.number ?? (digits && dial ? `+${dial}${digits}` : ""),
    possible: Boolean(parsed?.isPossible()),
  };
}

/**
 * The reverse: an E.164 answer, back into a country and something to show.
 *
 * Used for whatever arrives from outside the field — a number this device saved
 * on an earlier form, a prefill, or text typed into the box before the country
 * was set. The national number is re-formatted from its digits rather than with
 * `formatNational`, so the box never shows a trunk prefix the respondent did
 * not type.
 */
export function splitPhone(value: string, fallback: CountryCode): { country: CountryCode; typed: string } {
  const trimmed = value.trim();
  if (!trimmed) return { country: fallback, typed: "" };

  const parsed = parsePhoneNumberFromString(trimmed.startsWith("+") ? trimmed : `+${trimmed}`);
  /*
    The dialling code decides the flag, not `parsed.country`.

    The `min` metadata cannot tell one country sharing a code from another — it
    answers a perfectly ordinary British mobile with Guernsey — and a respondent
    seeing the wrong flag over their own number has no way to know it makes no
    difference to the answer. `countryForCallingCode` keeps whatever is already
    picked when the code matches it, and otherwise names the main country.
  */
  const calling = parsed?.countryCallingCode;
  const country = (calling ? countryForCallingCode(String(calling), fallback) : null) ?? fallback;
  const national = parsed?.nationalNumber ?? stripDial(trimmed, country);
  return { country, typed: national ? new AsYouType(country).input(String(national)) : "" };
}

/** The digits of `raw` with this country's dialling code taken off the front. */
function stripDial(raw: string, country: CountryCode): string {
  const digits = raw.replace(/\D/g, "");
  const dial = dialOf(country);
  return dial && digits.startsWith(dial) ? digits.slice(dial.length) : digits;
}

/**
 * The country a dialling code belongs to, preferring one already chosen.
 *
 * `+1` is the US and twenty Caribbean countries, `+44` is the UK and three
 * crown dependencies, and a partial number cannot say which. Two rules settle
 * it: if the picker is already on a country with this code, leave it alone —
 * someone in Canada typing `+1` has not moved to America — and otherwise take
 * the main country, which is the first entry in the metadata's own list for the
 * code. (Taking the first *alphabetically*, which is what `getCountries()`
 * gives, answers `+1` with Antigua and `+7` with Kazakhstan.)
 */
export function countryForCallingCode(calling: string, prefer?: CountryCode): CountryCode | null {
  if (prefer && dialOf(prefer) === calling) return prefer;
  // The same metadata module the library itself loads, read for the one thing
  // its public API does not expose: which country a shared code belongs to.
  return (metadata.country_calling_codes[calling]?.[0] as CountryCode | undefined) ?? null;
}

/**
 * Whether what is in the box is a whole international number rather than a
 * national one — a pasted `+1 415 555 0132`, a browser autofilling the number
 * it has saved, or somebody typing the `+` out of habit because that is what
 * every other form has always demanded.
 *
 * Returns the country as well as the rest, because the point is that the picker
 * moves: a `+91` pasted under a flag saying `+1` should leave the field showing
 * India and the national digits, not two countries' worth of prefix.
 *
 * Null while the dialling code is still ambiguous or the national part is
 * empty — `+1` on its own is a prefix, and taking the box over for it would
 * swallow the digits that follow.
 */
export function absorbInternational(
  typed: string,
  prefer?: CountryCode,
): { country: CountryCode; typed: string } | null {
  const t = typed.trim().replace(/\s+/g, " ");
  const international = t.startsWith("+") ? t : /^00\d/.test(t) ? `+${t.slice(2)}` : null;
  if (!international) return null;

  const formatter = new AsYouType();
  formatter.input(international);
  const calling = formatter.getCallingCode();
  const national = formatter.getNumber()?.nationalNumber;
  if (!calling || !national) return null;

  const country = countryForCallingCode(calling, prefer);
  if (!country) return null;
  return { country, typed: new AsYouType(country).input(String(national)) };
}

/** Whether the box is being used to write an international number. */
export function looksInternational(typed: string): boolean {
  return /^\s*(\+|00)/.test(typed);
}

/**
 * Why a number that cannot be real is not real, in one short sentence.
 *
 * Only ever shown once somebody has left the box — every number is "too short"
 * while it is being typed, so saying so as they type would be wrong for all but
 * the last keystroke. Returns null when there is nothing to say, including for
 * the empty box: Send is already unavailable, and a form that scolds you for
 * not having answered yet is worse than one that waits.
 */
export function phoneProblem(value: string, country: CountryCode): string | null {
  if (!value.trim()) return null;
  if (isSendablePhone(value)) return null;
  const where = countryName(country);
  try {
    switch (validatePhoneNumberLength(value)) {
      case "TOO_SHORT":
        return `That’s a few digits short for a number in ${where}.`;
      case "TOO_LONG":
        return `That’s a few digits too many for a number in ${where}.`;
      default:
        return `That doesn’t look like a number in ${where}.`;
    }
  } catch {
    return `That doesn’t look like a number in ${where}.`;
  }
}

/**
 * The country, as it goes in the middle of a sentence.
 *
 * "a number in United States" is the kind of wrong that makes a product sound
 * machine-written, and `Intl` gives names, not noun phrases. The rule is the
 * ordinary English one — plurals and unions take "the" — and a name it guesses
 * wrong on costs one article in one hint.
 */
function countryName(country: CountryCode): string {
  const name = phoneCountries().find((c) => c.code === country)?.name ?? country;
  const takesThe =
    /^(United|Netherlands|Philippines|Bahamas|Gambia|Comoros|Maldives|Seychelles|Congo|Isle of|Dominican Republic|Central African Republic)/.test(
      name,
    ) || /\bIslands$/.test(name);
  return takesThe ? `the ${name}` : name;
}

/**
 * Whether this is an answer worth sending.
 *
 * The server's rule is E.164 — a `+` and 7 to 15 digits — which `+9198765`
 * satisfies while being five digits short of any Indian number. So the gate
 * here is the stricter one: the country's own numbering plan says whether the
 * number could exist, before it is sent rather than after it comes back.
 */
export function isSendablePhone(value: string): boolean {
  const v = value.trim();
  if (!v.startsWith("+")) return false;
  try {
    return isPossiblePhoneNumber(v);
  } catch {
    return false;
  }
}

/**
 * What a backspace at the end of a formatted number should leave behind.
 *
 * Formatting as you type puts characters in the box that nobody typed — the
 * space in `98765 43210`, the brackets in `(213) 373-4253` — and deleting one
 * of those is a no-op, because the formatter puts it straight back. The box
 * then appears to ignore the key. Detecting that case (the text got shorter but
 * the digits did not) and dropping a digit instead is what makes every
 * backspace do something.
 */
export function digitsAfterEdit(previous: string, next: string): string {
  const before = previous.replace(/\D/g, "");
  const after = next.replace(/\D/g, "");
  if (next.length < previous.length && after === before) return before.slice(0, -1);
  return after;
}
