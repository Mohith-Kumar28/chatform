import { describe, expect, it } from "vitest";
import { normalizeE164 } from "@repo/form-schema";
import {
  absorbInternational,
  composePhone,
  countryForCallingCode,
  defaultPhoneCountry,
  digitsAfterEdit,
  FALLBACK_COUNTRY,
  flagOf,
  isSendablePhone,
  phoneCountries,
  phoneProblem,
  splitPhone,
} from "@/components/chat/composers/phone-value";

/**
 * The conversion under the phone composer.
 *
 * What is on screen is a country and a national number; what the runtime sends
 * is E.164. Everything below is about that boundary, because the failure it
 * replaces was exactly a boundary failure — a respondent typing the number they
 * know and being told it is invalid for want of a prefix.
 *
 * The cases that matter are the ones where a national number is *not* just
 * digits appended to a dialling code: a trunk prefix, a paste that arrives
 * already international, a backspace against formatting nobody typed.
 */

describe("composing what is typed", () => {
  it("turns a national number into E.164 and formats it as typed", () => {
    const composed = composePhone("IN", "9876543210");
    expect(composed.value).toBe("+919876543210");
    expect(composed.display).toBe("98765 43210");
    expect(composed.possible).toBe(true);
  });

  it("drops a trunk prefix rather than burying it in the number", () => {
    // The bug a bare concatenation produces: +44 0 7911…, which is not anyone.
    expect(composePhone("GB", "07911123456").value).toBe("+447911123456");
    expect(composePhone("IN", "09876543210").value).toBe("+919876543210");
  });

  it("keeps a part-typed number to hand without calling it sendable", () => {
    const composed = composePhone("IN", "98765");
    expect(composed.value).toBe("+9198765");
    expect(composed.possible).toBe(false);
  });

  it("holds nothing when nothing has been typed", () => {
    expect(composePhone("IN", "").value).toBe("");
  });

  it("hands the rest of the runtime a value it already accepts", () => {
    // `normalizeE164` is what keeps this device's saved answers, and the
    // validator's phone branch is the same shape. A value that survives both
    // unchanged is a value neither of them has to guess at.
    const value = composePhone("US", "2133734253").value;
    expect(normalizeE164(value)).toBe(value);
  });
});

describe("an international number arriving in the national box", () => {
  it("absorbs a paste into the picker and the box", () => {
    expect(absorbInternational("+91 98765 43210", "US")).toEqual({
      country: "IN",
      typed: "98765 43210",
    });
  });

  it("reads a number dialled out with 00 the same way", () => {
    expect(absorbInternational("0091 98765 43210", "US")?.country).toBe("IN");
  });

  it("waits while the dialling code is all there is", () => {
    // Taking the box over for "+91" would eat the digits typed next.
    expect(absorbInternational("+91", "US")).toBeNull();
    expect(absorbInternational("+", "US")).toBeNull();
  });

  it("leaves a national number alone", () => {
    expect(absorbInternational("9876543210", "IN")).toBeNull();
  });

  it("stays on the country already picked when it shares the code", () => {
    // A Canadian typing +1 has not moved to America.
    expect(absorbInternational("+1 416 555 0132", "CA")?.country).toBe("CA");
  });
});

describe("which country a dialling code names", () => {
  it("names the main one, not the first alphabetically", () => {
    // getCountries() would answer Antigua and Kazakhstan.
    expect(countryForCallingCode("1")).toBe("US");
    expect(countryForCallingCode("7")).toBe("RU");
    expect(countryForCallingCode("44")).toBe("GB");
  });

  it("keeps a country that already matches", () => {
    expect(countryForCallingCode("44", "JE")).toBe("JE");
    expect(countryForCallingCode("44", "IN")).toBe("GB");
  });

  it("says nothing about a code it does not know", () => {
    expect(countryForCallingCode("999")).toBeNull();
  });
});

describe("an answer coming back the other way", () => {
  it("splits a saved E.164 into a flag and a number", () => {
    expect(splitPhone("+919876543210", "US")).toEqual({ country: "IN", typed: "98765 43210" });
  });

  it("shows a British mobile as British", () => {
    // The `min` metadata answers this number with Guernsey; the dialling code
    // is the thing the flag is actually allowed to claim.
    expect(splitPhone("+447911123456", "US").country).toBe("GB");
  });

  it("empties the box for an empty answer", () => {
    expect(splitPhone("", "IN")).toEqual({ country: "IN", typed: "" });
  });

  it("round-trips whatever was composed", () => {
    const value = composePhone("DE", "030123456").value;
    const split = splitPhone(value, "US");
    expect(split.country).toBe("DE");
    expect(composePhone(split.country, split.typed).value).toBe(value);
  });
});

describe("whether an answer may be sent", () => {
  it("takes a whole number", () => {
    expect(isSendablePhone("+919876543210")).toBe(true);
  });

  it("refuses a number too short for its own country", () => {
    // The server's E.164 rule — a plus and seven digits — accepts this one.
    expect(isSendablePhone("+9198765")).toBe(false);
  });

  it("refuses anything with no country on the front", () => {
    expect(isSendablePhone("9876543210")).toBe(false);
    expect(isSendablePhone("")).toBe(false);
  });
});

describe("what the respondent is told", () => {
  it("says a short number is short, and names the country", () => {
    expect(phoneProblem("+9198765", "IN")).toContain("India");
    expect(phoneProblem("+9198765", "IN")).toContain("short");
    // "a India number" is what naming the country the other way round costs.
    expect(phoneProblem("+9198765", "IN")).toBe("That’s a few digits short for a number in India.");
  });

  it("puts the country in the sentence the way English does", () => {
    expect(phoneProblem("+1415", "US")).toContain("in the United States");
    expect(phoneProblem("+9198765", "IN")).toContain("in India");
  });

  it("says a long number is long", () => {
    expect(phoneProblem("+9198765432100000", "IN")).toContain("too many");
  });

  it("says nothing about a good number, or an empty box", () => {
    expect(phoneProblem("+919876543210", "IN")).toBeNull();
    expect(phoneProblem("", "IN")).toBeNull();
  });
});

describe("editing against the formatting", () => {
  it("takes a digit when the deleted character was only a space", () => {
    // Without this, backspace on "98765 43210" re-formats straight back to
    // "98765 43210" and the key appears to do nothing.
    expect(digitsAfterEdit("98765 43210", "98765 4321")).toBe("987654321");
    expect(digitsAfterEdit("98765 43210", "9876543210")).toBe("987654321");
  });

  it("leaves an ordinary edit alone", () => {
    expect(digitsAfterEdit("98765", "987654")).toBe("987654");
    expect(digitsAfterEdit("", "9")).toBe("9");
  });
});

describe("the country list", () => {
  it("covers the world, in alphabetical order, with a dialling code each", () => {
    const all = phoneCountries();
    expect(all.length).toBeGreaterThan(200);
    expect(all.every((c) => c.dial.length > 0)).toBe(true);
    const names = all.map((c) => c.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(names);
  });

  it("names countries rather than repeating their codes", () => {
    expect(phoneCountries().find((c) => c.code === "IN")?.name).toBe("India");
  });

  it("makes a flag out of a country code", () => {
    expect(flagOf("IN")).toBe("🇮🇳");
  });

  it("opens on the author's hint when there is one", () => {
    expect(defaultPhoneCountry("in")).toBe("IN");
    // A hint nobody recognises is no hint, not a reason to give up.
    expect(defaultPhoneCountry("ZZ")).toBe(defaultPhoneCountry(null));
  });

  it("falls back to India rather than to America", () => {
    // Node here has no navigator and a UTC timezone, which is the same
    // position a browser that tells us nothing leaves us in.
    expect(defaultPhoneCountry(null)).toBe(FALLBACK_COUNTRY);
    expect(FALLBACK_COUNTRY).toBe("IN");
  });
});
