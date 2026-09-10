import { IDENTITY_FIELDS, normalizeE164, type IdentityField } from "@repo/form-schema";

/**
 * What this device has told forms before, offered back the next time.
 *
 * A respondent who has typed their name, their email and their college into one
 * form should not type them again into the next. This keeps those values — and
 * only those values, the closed list in `identity-fields.ts` — so the composer
 * can open with them already filled in.
 *
 * It lives in the browser and nowhere else. Nothing is sent to us, there is no
 * row to breach and no notice to write, and the person can empty it in one
 * press. That is the same trade `respondent-hint.ts` makes next door, and for
 * the same reason: this is a convenience, so it must never be something a
 * respondent has to think about.
 *
 * Inside an embed the browser partitions this per top-level site, so what
 * somebody typed on one customer's site is not offered on another's. That is
 * the behaviour we want and would have had to build ourselves otherwise.
 *
 * What it is not: an identity. Nothing here proves anyone is anyone, and the
 * sign-in gate is unmoved — it still clears only on a fresh Google token or a
 * fresh SMS code, checked server-side.
 */

export interface StoredValue {
  value: string;
  /** Last used, so the most recent leads and the stalest is evicted first. */
  at: number;
}

interface Profile {
  v: 1;
  fields: Partial<Record<IdentityField, StoredValue[]>>;
}

const KEY = "chatform:profile";
const VERSION = 1;

/**
 * Five, per field.
 *
 * Someone plausibly has two emails and two numbers; nobody is choosing between
 * nine. Past a handful the list stops being a shortcut and becomes another
 * thing to read, which is the opposite of the point.
 */
const MAX_PER_FIELD = 5;

/** Longer than this is not a reusable detail, whatever it is. */
const MAX_VALUE_LEN = 200;

const KNOWN = new Set<string>(IDENTITY_FIELDS);

/** Fields whose values are web addresses, folded case-insensitively to dedupe. */
const LINK_FIELDS = new Set<IdentityField>([
  "url",
  "linkedin",
  "github",
  "twitter",
  "instagram",
  "youtube",
  "reddit",
  "discord",
]);

/**
 * The value as it will be shown back, or null if it is not worth keeping.
 *
 * Normalised on the way in rather than on the way out, so the suggestion reads
 * the way a person would write it rather than however it was typed the once —
 * and so two spellings of one number cannot occupy two of the five slots.
 *
 * This is also where a value earns its place. We keep an answer when it is
 * sent, not when the server accepts it, because the composer is the only place
 * that has the text — so the shape check here stands in for that acceptance. A
 * mistyped address suggested back for months is worse than one that never gets
 * offered, and the cost of refusing is nothing: they type it, correctly, and
 * that is what gets kept.
 */
function clean(field: IdentityField, raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed || trimmed.length > MAX_VALUE_LEN) return null;
  if (field === "email") {
    const lowered = trimmed.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lowered) ? lowered : null;
  }
  if (field === "tel") return normalizeE164(trimmed);
  if (field === "graduation-year") return /^\d{4}$/.test(trimmed) ? trimmed : null;
  if (LINK_FIELDS.has(field)) {
    // A bare word is somebody answering "LinkedIn?" with "yes". A host with a
    // dot in it is the least we can ask of something we will offer as a URL.
    return /^(https?:\/\/)?[^\s.]+\.[^\s]+$/.test(trimmed) ? trimmed : null;
  }
  return trimmed;
}

/**
 * The form two values are compared on.
 *
 * Separate from `clean` because case matters for display and not for identity:
 * a URL path can be case-sensitive and is stored as written, but nobody wants
 * `github.com/Alice` and `github.com/alice` taking two slots.
 */
function foldKey(field: IdentityField, value: string): string {
  return field === "email" || LINK_FIELDS.has(field) ? value.toLowerCase() : value;
}

function read(): Profile {
  const empty: Profile = { v: VERSION, fields: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (parsed?.v !== VERSION || !parsed.fields || typeof parsed.fields !== "object") return empty;
    const fields: Profile["fields"] = {};
    for (const [key, list] of Object.entries(parsed.fields)) {
      // A key we do not know is either an older build's or somebody else's
      // script; either way it is not ours to hand to a form.
      if (!KNOWN.has(key) || !Array.isArray(list)) continue;
      const kept = list
        .filter(
          (e): e is StoredValue =>
            !!e &&
            typeof (e as StoredValue).value === "string" &&
            (e as StoredValue).value.length > 0 &&
            (e as StoredValue).value.length <= MAX_VALUE_LEN &&
            typeof (e as StoredValue).at === "number",
        )
        .slice(0, MAX_PER_FIELD);
      if (kept.length) fields[key as IdentityField] = kept;
    }
    return { v: VERSION, fields };
  } catch {
    // Private mode, blocked storage, a half-written value — an autofill that
    // does not happen is the same as the behaviour before this existed.
    return empty;
  }
}

function write(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* quota, private mode — not fatal, and not worth telling anyone about */
  }
}

/**
 * What to offer for this question, most recently used first.
 *
 * Returns nothing at all for a question the schema declined to classify, which
 * is how the refusals in `identity-fields.ts` reach the browser: an unremembered
 * question simply arrives with no field, so there is nothing to look up.
 */
export function suggestionsFor(field: IdentityField | undefined | null): string[] {
  if (!field || !KNOWN.has(field)) return [];
  return read().fields[field]?.map((e) => e.value) ?? [];
}

/**
 * Keep an answer the respondent has just given.
 *
 * A repeat moves to the front rather than landing twice — the list is "what you
 * use", so using something again is the strongest signal it belongs at the top.
 */
export function rememberValue(field: IdentityField | undefined | null, raw: unknown): void {
  if (!field || !KNOWN.has(field) || typeof raw !== "string") return;
  const value = clean(field, raw);
  if (!value) return;

  const profile = read();
  const key = foldKey(field, value);
  const rest = (profile.fields[field] ?? []).filter((e) => foldKey(field, e.value) !== key);
  profile.fields[field] = [{ value, at: Date.now() }, ...rest].slice(0, MAX_PER_FIELD);
  write(profile);
}

/** Whether there is anything to clear, so the control can stay hidden until there is. */
export function hasStoredProfile(): boolean {
  return Object.keys(read().fields).length > 0;
}

/**
 * Drop one remembered value.
 *
 * What the small dismiss on each suggestion calls. Browsers let you delete a
 * saved entry from the autofill list itself rather than sending you to a
 * settings page, and a respondent who sees an address they no longer use should
 * be able to remove exactly that one without losing the others.
 */
export function forgetValue(field: IdentityField | undefined | null, value: string): void {
  if (!field || !KNOWN.has(field)) return;
  const profile = read();
  const list = profile.fields[field];
  if (!list) return;
  const key = foldKey(field, value);
  const kept = list.filter((e) => foldKey(field, e.value) !== key);
  if (kept.length) profile.fields[field] = kept;
  else delete profile.fields[field];
  write(profile);
}

/**
 * Drop everything kept for one field.
 *
 * Scoped to the field rather than the whole profile because the control that
 * calls it sits beside one question's suggestions: a button there that also
 * erased an address and a phone number would be doing more than it said. The
 * respondent sees their old answers and can remove exactly those.
 */
export function forgetField(field: IdentityField | undefined | null): void {
  if (!field || !KNOWN.has(field)) return;
  const profile = read();
  if (!profile.fields[field]) return;
  delete profile.fields[field];
  write(profile);
}

export function clearRespondentProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* not fatal */
  }
}
