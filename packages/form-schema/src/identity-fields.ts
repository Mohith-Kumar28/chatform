import { z } from "zod";

/**
 * The things a person tells form after form, and the names we file them under.
 *
 * A respondent who has typed their name, their email and their college into one
 * form should not type them again into the next. To offer that back we need to
 * know that "Your email" here and "Best contact address" there are the same
 * question — which the wording alone cannot say. This module is that vocabulary,
 * and it is deliberately a *closed list*: a value only survives a form if it
 * lands on one of these keys, so nothing arrives in storage by accident.
 *
 * The first fifteen keys are WHATWG `autocomplete` tokens, which the composer
 * already speaks in `input-semantics.ts` and which browsers fill on their own.
 * Reusing the spelling means one vocabulary rather than two that drift. The rest
 * are ours, for the things forms ask constantly and the spec never named.
 *
 * Adding a key here is the whole cost of supporting a new field. There is no
 * table and no migration behind it — see `respondent-profile.ts` on the web
 * side, which keeps the values in the respondent's own browser.
 */
export const IDENTITY_FIELDS = [
  // Name
  "given-name",
  "family-name",
  "name",
  "nickname",
  "username",
  // Contact
  "email",
  "tel",
  // Work
  "organization",
  "organization-title",
  "department",
  // Address
  "street-address",
  "address-line2",
  "address-level2",
  "address-level1",
  "postal-code",
  "country-name",
  // Links
  "url",
  "linkedin",
  "github",
  "twitter",
  "instagram",
  "youtube",
  "reddit",
  "discord",
  // Education
  "school",
  "degree",
  "graduation-year",
  "student-id",
  // Personal
  "bday",
  "sex",
  "nationality",
  // Events
  "shirt-size",
  "dietary",
] as const;

export const IdentityField = z.enum(IDENTITY_FIELDS);
export type IdentityField = z.output<typeof IdentityField>;

/**
 * What an author may set on a block, which is not quite the same list.
 *
 * Left unset the question is read automatically, because a feature that needs
 * thirty questions tagged by hand is a feature nobody switches on. So the
 * author's setting is an override in both directions: name the field when the
 * guess is wrong, or `never` when a question should be forgotten no matter how
 * plainly it reads.
 */
export const IdentityFieldSetting = z.union([IdentityField, z.literal("never")]);
export type IdentityFieldSetting = z.output<typeof IdentityFieldSetting>;

/**
 * Block types whose answers are never remembered, whatever they are labelled.
 *
 * A payment, an uploaded file, a drawn signature and a consent tick are each
 * either not a value at all or a value that means nothing outside the form that
 * collected it. Re-offering any of them would be wrong before it was unsafe.
 */
export const UNREMEMBERED_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "payment",
  "file_upload",
  "signature",
  "legal_consent",
  /**
   * A repeating group is a roster, not a detail about the person answering.
   *
   * Its answer is an array of records — four team-mates, six guests — and there
   * is no single value in it that "the respondent's email" could mean. The
   * profile stores one string per field, so this is the one type whose answer
   * has no shape the vocabulary could hold even if a key existed for it.
   */
  "field_group",
]);

/**
 * Questions we refuse to remember however the author maps them.
 *
 * The closed list above already excludes ID and financial keys, so the only way
 * such a value reaches storage is an author pointing, say, an "Aadhaar number"
 * question at `student-id`. This is the backstop for that, and it is written as
 * a title match on purpose.
 *
 * Note the asymmetry with `TEXT_HINTS` in `input-semantics.ts`, which reads
 * wording to pick a keyboard and says a miss there "costs nothing". The same is
 * true here in reverse: a false positive costs one question's autofill, and a
 * false negative leaves a passport number in the localStorage of a phone that
 * gets lent to somebody. Guess toward refusing.
 */
const NEVER_REMEMBER = [
  /\b(aadhaar|aadhar|pan\b|passport|ssn|social security|national id|voter id)\b/,
  /\b(driv(er|ing)'?s? licen[cs]e|licence number|license number)\b/,
  /\b(card number|cvv|cvc|expiry|iban|ifsc|swift|routing|account number|bank|upi id)\b/,
  /\b(password|passcode|otp|security code|secret)\b/,
  // The stems carry `\w*` because the closing `\b` belongs to the whole group:
  // without it "allerg" demands a word boundary the "ies" in "allergies" does
  // not provide, and the pattern silently matches nothing anyone would write.
  /\b(medical|diagnos\w*|prescription|health|disabilit\w*|allerg\w*|blood group|blood type)\b/,
];

/** Whether this question's wording puts it out of bounds. */
export function isUnrememberedQuestion(title: string): boolean {
  const asked = title.toLowerCase();
  return NEVER_REMEMBER.some((re) => re.test(asked));
}

/** The record-shaped blocks, whose sub-fields say outright what they hold. */
export const CONTACT_FIELD_IDENTITY: Readonly<Record<string, IdentityField>> = {
  first_name: "given-name",
  last_name: "family-name",
  email: "email",
  phone: "tel",
};

export const ADDRESS_FIELD_IDENTITY: Readonly<Record<string, IdentityField>> = {
  street: "street-address",
  city: "address-level2",
  state: "address-level1",
  postal: "postal-code",
  country: "country-name",
};

/**
 * What each question is plainly asking, read from how it is worded.
 *
 * This is the half that makes the feature exist. Tagging is available and
 * almost nobody will do it, so a form has to be readable as authored — and the
 * wording is the only evidence there is, because the block type cannot tell
 * "What's your full name?" from "What's the name of your favourite film?".
 *
 * Each pattern therefore carries its own context: matching `name` alone would
 * claim the film, which is why every entry names what it is a name *of*. The
 * same discipline, and several of the same expressions, as `TEXT_HINTS` in the
 * composer's `input-semantics.ts`, which has been reading question wording to
 * pick a keyboard for a while now.
 *
 * **Order is load-bearing** — first match wins, so the specific sits above the
 * general: "address line 2" before "address", "graduation year" before "year",
 * "first name" before "name".
 *
 * On being wrong: a miss costs a box that stays empty, and a false positive
 * costs one pre-filled value the respondent types over, in a box they were
 * about to type into anyway. Neither is silent and neither is destructive.
 * What a wrong guess must never do is *keep* something private, and it cannot:
 * `isUnrememberedQuestion` runs first and does not consult this table at all.
 */
const IDENTITY_PATTERNS: { field: IdentityField; re: RegExp }[] = [
  // Names. Every one of these says what it is the name of.
  { field: "given-name", re: /\b(first|given)[ -]?name\b/ },
  { field: "family-name", re: /\b(last|family|sur)[ -]?name\b|\bsurname\b/ },
  { field: "nickname", re: /\b(preferred|nick)[ -]?name\b|what (should|shall) (we|i) call you/ },
  { field: "name", re: /\b(full|legal|your)[ -]?name\b|\bname\b.*\bcall you\b/ },
  // Handles before the platforms that own them, so "Twitter handle" is Twitter.
  { field: "linkedin", re: /\blinked ?in\b/ },
  { field: "github", re: /\bgit ?hub\b/ },
  { field: "twitter", re: /\b(twitter|x) (handle|profile|url|link)\b|\btwitter\b/ },
  { field: "instagram", re: /\binsta(gram)?\b/ },
  { field: "youtube", re: /\byou ?tube\b/ },
  { field: "reddit", re: /\breddit\b/ },
  { field: "discord", re: /\bdiscord\b/ },
  { field: "username", re: /\b(user ?name|handle)\b/ },
  // Contact.
  { field: "email", re: /\be-?mail\b/ },
  { field: "tel", re: /\b(phone|mobile|whatsapp|contact number)\b/ },
  // Work.
  { field: "organization-title", re: /\b(job title|designation|your role|position)\b/ },
  { field: "department", re: /\bdepartment\b/ },
  { field: "organization", re: /\b(company|organi[sz]ation|employer|workplace)\b/ },
  // Address. Line 2 and postal code first — both contain words the others match.
  { field: "address-line2", re: /\baddress line ?2\b|\b(apartment|flat|suite|landmark)\b/ },
  { field: "postal-code", re: /\b(post(al)?[ -]?code|zip[ -]?code|pin[ -]?code|pincode)\b/ },
  { field: "address-level2", re: /\b(city|town)\b/ },
  { field: "address-level1", re: /\b(state|province|region)\b/ },
  { field: "country-name", re: /\bcountry\b/ },
  { field: "street-address", re: /\b(street|address)\b/ },
  // Education.
  { field: "graduation-year", re: /\b(graduation|passing|pass ?out) ?year\b|\byear of (graduation|passing)\b/ },
  { field: "student-id", re: /\b(roll (no|number)|student (id|number)|enrol?lment (no|number)|registration number)\b/ },
  { field: "degree", re: /\b(degree|course|branch|major|specciali[sz]ation|stream)\b/ },
  { field: "school", re: /\b(college|university|school|institute|institution)\b/ },
  // Personal.
  { field: "bday", re: /\b(date of birth|birth ?date|dob)\b/ },
  { field: "sex", re: /\bgender\b/ },
  { field: "nationality", re: /\b(nationality|citizenship)\b/ },
  // Events.
  { field: "shirt-size", re: /\b(t-? ?shirt|shirt|tee) ?size\b/ },
  { field: "dietary", re: /\b(diet(ary)?|food preference|vegetarian|veg or non)\b/ },
  // Last, because "link" and "url" appear inside half the entries above.
  { field: "url", re: /\b(website|portfolio|personal site|homepage|profile (url|link))\b/ },
];

/** What the wording says this question holds, or null when nothing does. */
export function inferIdentityField(title: string): IdentityField | null {
  const asked = title.toLowerCase().replace(/[_-]+/g, " ");
  return IDENTITY_PATTERNS.find((p) => p.re.test(asked))?.field ?? null;
}

/** What a block needs to look like to be classified. Structural, to stay off `blocks.ts`. */
export interface IdentifiableBlock {
  type: string;
  title: string;
  identityField?: IdentityFieldSetting | null;
}

/**
 * Which field this question holds, or `null` for the many that hold nothing
 * reusable.
 *
 * Four steps, in order:
 *
 * 1. **Refusals.** A block type whose answer means nothing elsewhere, or a
 *    question whose wording puts it out of bounds. Nothing below can undo this,
 *    including an author who maps it by hand — which is the point of doing it
 *    first.
 * 2. **The author**, when they have said. `never` forgets the question outright;
 *    a named field overrides whatever the wording suggests.
 * 3. **The wording**, read by `inferIdentityField`. This is the path almost
 *    every question actually takes.
 * 4. **The block type**, for the three that say what they hold — and only as a
 *    fallback, so a `url` block titled "Your LinkedIn?" is LinkedIn rather than
 *    a generic website.
 */
export function identityFieldForBlock(block: IdentifiableBlock): IdentityField | null {
  if (UNREMEMBERED_BLOCK_TYPES.has(block.type)) return null;
  if (isUnrememberedQuestion(block.title)) return null;
  if (block.identityField === "never") return null;
  if (block.identityField) return block.identityField;

  const inferred = inferIdentityField(block.title);
  if (inferred) return inferred;

  switch (block.type) {
    case "email":
      return "email";
    case "phone":
      return "tel";
    case "url":
      return "url";
    default:
      return null;
  }
}

/**
 * How each key reads in the builder, where an author picks one.
 *
 * The keys themselves are WHATWG spellings and internal shorthand —
 * `address-level1` is a fine thing to send a browser and a poor thing to put in
 * front of somebody choosing what their question collects.
 */
export const IDENTITY_FIELD_LABELS: Readonly<Record<IdentityField, string>> = {
  "given-name": "First name",
  "family-name": "Last name",
  name: "Full name",
  nickname: "Preferred name",
  username: "Username or handle",
  email: "Email",
  tel: "Phone",
  organization: "Company",
  "organization-title": "Job title",
  department: "Department",
  "street-address": "Street address",
  "address-line2": "Address line 2",
  "address-level2": "City",
  "address-level1": "State or province",
  "postal-code": "Postal code",
  "country-name": "Country",
  url: "Website",
  linkedin: "LinkedIn",
  github: "GitHub",
  twitter: "X / Twitter",
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
  discord: "Discord",
  school: "School or college",
  degree: "Degree or course",
  "graduation-year": "Graduation year",
  "student-id": "Student or roll number",
  bday: "Date of birth",
  sex: "Gender",
  nationality: "Nationality",
  "shirt-size": "T-shirt size",
  dietary: "Dietary preference",
};

/**
 * Whether the author's override is worth offering for this block type.
 *
 * Everything except the four whose answers mean nothing on another form. Note
 * a respondent can answer a choice question by pressing a chip, which never
 * passes through the message box — so a tapped answer is not kept, while the
 * same answer typed is. The pre-fill still helps either way, and the
 * inconsistency is worth revisiting when the affordance and the composer agree
 * on one path.
 */
export function canMapIdentityField(blockType: string): boolean {
  return !UNREMEMBERED_BLOCK_TYPES.has(blockType);
}
