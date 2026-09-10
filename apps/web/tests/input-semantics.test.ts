import { describe, expect, it } from "vitest";
import type { PublicBlock } from "@repo/form-schema";
import { FIELD_SEMANTICS, inputSemanticsFor } from "@/components/chat/composers/input-semantics";

/**
 * What the composer tells the browser it is holding.
 *
 * The stakes are asymmetric, and the tests are shaped around that. Getting a
 * token *right* saves a respondent some typing; getting one wrong offers
 * somebody's saved home address on a question that never asked for it, or puts
 * a number pad under a question wanting words. So the interesting cases below
 * are the refusals: a question with "name" in it that is not asking for a name
 * has to fall back to plain text rather than guess.
 */

const block = (type: string, title = "", ref = ""): PublicBlock =>
  ({ id: "b1", ref, type, title, required: true }) as PublicBlock;

describe("the typed block types", () => {
  it("declares an email so a browser can fill one", () => {
    const s = inputSemanticsFor(block("email", "What's your email?", "email"));
    expect(s.type).toBe("email");
    expect(s.autoComplete).toBe("email");
    // An address is not a sentence: capitalising the first letter is a typo
    // the respondent has to go back and fix.
    expect(s.autoCapitalize).toBe("none");
    expect(s.spellCheck).toBe(false);
  });

  it("declares a number without becoming a number input", () => {
    // `type="number"` brings a spinner, scroll-to-change and a refusal to hold
    // a half-typed value — all wrong for a box that also takes sentences.
    expect(inputSemanticsFor(block("number", "How many?", "n")).type).toBe("text");
    expect(inputSemanticsFor(block("number", "How many?", "n")).inputMode).toBe("decimal");
  });

  it("gives a whole-number question a keypad with no decimal point", () => {
    const b = { ...block("number", "How many seats?", "seats"), integerOnly: true };
    expect(inputSemanticsFor(b).inputMode).toBe("numeric");
  });

  it("leaves a question made of chips with nothing to autofill", () => {
    // The box is the "or just tell me" escape hatch here, and a saved address
    // has no business being suggested in it.
    expect(inputSemanticsFor(block("single_select", "Pick one", "p")).autoComplete).toBe("off");
  });
});

describe("a short_text question, read for what it asks", () => {
  const token = (title: string, ref = "") => inputSemanticsFor(block("short_text", title, ref)).autoComplete;

  it("recognises the contact details people retype most", () => {
    expect(token("What's your full name?")).toBe("name");
    expect(token("First name")).toBe("given-name");
    expect(token("Surname")).toBe("family-name");
    expect(token("Which company do you work for?")).toBe("organization");
    expect(token("What's your job title?")).toBe("organization-title");
    expect(token("Which city are you in?")).toBe("address-level2");
    expect(token("Your PIN code?")).toBe("postal-code");
    expect(token("Street address")).toBe("street-address");
  });

  it("reads the ref when the wording gives nothing away", () => {
    expect(token("And you are?", "first_name")).toBe("given-name");
  });

  it("refuses a question that only sounds like one", () => {
    // "Name" here belongs to a film, not a person — and a browser filling the
    // respondent's own name into it is worse than filling nothing.
    expect(token("Name of your favourite film?")).toBe("off");
    expect(token("What did you think of the venue?")).toBe("off");
  });

  it("capitalises a name and leaves prose alone", () => {
    expect(inputSemanticsFor(block("short_text", "Your full name")).autoCapitalize).toBe("words");
    expect(inputSemanticsFor(block("short_text", "Anything else?")).autoCapitalize).toBe("sentences");
  });
});

describe("the record-shaped blocks", () => {
  it("names every part of an address, which is what fills them in one tap", () => {
    // A browser fills an address as a set or not at all, so a single missing
    // token costs the whole autofill, not just its own field.
    for (const f of ["street", "city", "state", "postal", "country"]) {
      expect(FIELD_SEMANTICS[f]?.autoComplete).toBeTruthy();
    }
    expect(FIELD_SEMANTICS.first_name?.autoComplete).toBe("given-name");
    expect(FIELD_SEMANTICS.phone?.type).toBe("tel");
  });
});
