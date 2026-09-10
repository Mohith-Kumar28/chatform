import type { PublicBlock } from "@repo/form-schema";

/**
 * What the message box is, as far as the browser is concerned.
 *
 * The composer is one input reused by every question, and it was declared as
 * plain text for all of them. So a browser that knows the respondent's address,
 * number and name — and offers them, unprompted, on any ordinary form — had
 * nothing to go on here and offered nothing: the one thing a chat form asks for
 * most, contact details, was the one thing you had to type out by hand. On a
 * phone it also meant the wrong keyboard: letters where digits were wanted, an
 * autocapitalised first letter on an email address, a red spell-check underline
 * under a URL.
 *
 * None of this is guesswork about the person. It is the question saying what it
 * is asking for, in the vocabulary the platform already has: `type` picks the
 * keyboard, `inputMode` refines it, and `autocomplete` is what actually reaches
 * the browser's saved values (WHATWG's token list — an invented token is worth
 * exactly as much as no token at all).
 */
export type InputSemantics = {
  type: "text" | "email" | "tel" | "url";
  inputMode: "text" | "email" | "tel" | "url" | "numeric" | "decimal";
  autoComplete: string;
  autoCapitalize: "none" | "sentences" | "words";
  autoCorrect: "on" | "off";
  spellCheck: boolean;
  /**
   * Chrome's autofill reads the field name as well as the token, and a name
   * that changes per question is what stops one question's saved value being
   * offered on the next.
   */
  name: string;
};

const FREE_TEXT: InputSemantics = {
  type: "text",
  inputMode: "text",
  // The composer is also the "or just tell me" box on a question made of
  // chips, and a saved value has no business being suggested there.
  autoComplete: "off",
  autoCapitalize: "sentences",
  autoCorrect: "on",
  spellCheck: true,
  name: "answer",
};

/**
 * A `short_text` question, read for what it is plainly asking.
 *
 * The block type cannot say — "What's your full name?" and "What did you think
 * of the venue?" are the same type — so the wording is the only evidence there
 * is. Kept to phrases that are unambiguous in a form: matching "name" alone
 * would claim "What's the name of your favourite film?", which is why each
 * pattern carries its context with it.
 *
 * A miss costs nothing: the field falls back to plain text and behaves exactly
 * as it does today.
 */
const TEXT_HINTS: { re: RegExp; semantics: Partial<InputSemantics> }[] = [
  { re: /\b(first|given)[ -]?name\b/, semantics: { autoComplete: "given-name", autoCapitalize: "words" } },
  { re: /\b(last|family|sur)[ -]?name\b|\bsurname\b/, semantics: { autoComplete: "family-name", autoCapitalize: "words" } },
  { re: /\b(full|your|legal)[ -]?name\b|\bname\b.*\bcall you\b/, semantics: { autoComplete: "name", autoCapitalize: "words" } },
  { re: /\b(company|organi[sz]ation|employer|business)\b/, semantics: { autoComplete: "organization", autoCapitalize: "words" } },
  { re: /\b(job title|role|position|designation)\b/, semantics: { autoComplete: "organization-title", autoCapitalize: "words" } },
  { re: /\b(post(al)?[ -]?code|zip[ -]?code|pin[ -]?code|pincode)\b/, semantics: { autoComplete: "postal-code", autoCapitalize: "none", autoCorrect: "off", spellCheck: false } },
  { re: /\b(city|town)\b/, semantics: { autoComplete: "address-level2", autoCapitalize: "words" } },
  { re: /\b(state|province|region)\b/, semantics: { autoComplete: "address-level1", autoCapitalize: "words" } },
  { re: /\bcountry\b/, semantics: { autoComplete: "country-name", autoCapitalize: "words" } },
  { re: /\b(street|address)\b/, semantics: { autoComplete: "street-address", autoCapitalize: "words" } },
];

export function inputSemanticsFor(block: PublicBlock): InputSemantics {
  switch (block.type) {
    case "email":
      return {
        type: "email",
        inputMode: "email",
        autoComplete: "email",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
        name: "email",
      };
    case "phone":
      return {
        type: "tel",
        inputMode: "tel",
        autoComplete: "tel",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
        name: "tel",
      };
    case "url":
      return {
        type: "url",
        inputMode: "url",
        autoComplete: "url",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
        name: "url",
      };
    case "number":
      return {
        // Not `type="number"`: its spinner, its scroll-to-change and its
        // refusal to hold a half-typed value are all wrong for a message box,
        // and `inputMode` gets the same keypad without any of them.
        type: "text",
        inputMode: block.integerOnly ? "numeric" : "decimal",
        autoComplete: "off",
        autoCapitalize: "none",
        autoCorrect: "off",
        spellCheck: false,
        name: "number",
      };
    case "date":
      return { ...FREE_TEXT, autoCapitalize: "none", spellCheck: false, name: "date" };
    case "long_text":
      return { ...FREE_TEXT, name: "long-answer" };
    case "short_text": {
      const asked = `${block.title} ${block.ref}`.toLowerCase().replace(/[_-]+/g, " ");
      const hit = TEXT_HINTS.find((h) => h.re.test(asked));
      return { ...FREE_TEXT, name: "short-answer", ...hit?.semantics };
    }
    default:
      return FREE_TEXT;
  }
}

/**
 * The same job for the record-shaped blocks, where each field says outright
 * what it holds — so these are exact rather than inferred, and are the fields
 * a browser fills as a set.
 */
export const FIELD_SEMANTICS: Record<
  string,
  { autoComplete: string; type?: "text" | "email" | "tel"; inputMode?: InputSemantics["inputMode"]; autoCapitalize?: InputSemantics["autoCapitalize"] }
> = {
  first_name: { autoComplete: "given-name", autoCapitalize: "words" },
  last_name: { autoComplete: "family-name", autoCapitalize: "words" },
  email: { autoComplete: "email", type: "email", inputMode: "email", autoCapitalize: "none" },
  phone: { autoComplete: "tel", type: "tel", inputMode: "tel", autoCapitalize: "none" },
  street: { autoComplete: "street-address", autoCapitalize: "words" },
  city: { autoComplete: "address-level2", autoCapitalize: "words" },
  state: { autoComplete: "address-level1", autoCapitalize: "words" },
  postal: { autoComplete: "postal-code", autoCapitalize: "none" },
  country: { autoComplete: "country-name", autoCapitalize: "words" },
};
