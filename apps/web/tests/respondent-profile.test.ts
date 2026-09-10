import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRespondentProfile,
  forgetField,
  hasStoredProfile,
  rememberValue,
  suggestionsFor,
} from "@/components/chat/respondent-profile";
import { identityFieldForBlock, inferIdentityField } from "@repo/form-schema";

/**
 * What this device offers back, asserted at the boundary: what goes in, and
 * what comes out.
 *
 * Two kinds of rule live here and they fail in opposite directions. The
 * ordering and dedupe rules are about a list staying useful — getting one wrong
 * costs a wasted suggestion slot. The refusals are about a value never being
 * kept at all, and getting one of those wrong leaves somebody's passport number
 * in the storage of a phone they lend out. The second kind is why the block
 * list is tested through `identityFieldForBlock` rather than trusted.
 */

const KEY = "chatform:profile";

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    raw: map,
  };
}

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal("localStorage", store);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("what is kept", () => {
  it("offers back what was typed, on a later question", () => {
    rememberValue("email", "alice@acme.com");
    expect(suggestionsFor("email")).toEqual(["alice@acme.com"]);
  });

  it("appends a second value rather than replacing the first", () => {
    rememberValue("email", "alice@acme.com");
    rememberValue("email", "alice@gmail.com");
    // Newest first: the one they just used is the one to open on.
    expect(suggestionsFor("email")).toEqual(["alice@gmail.com", "alice@acme.com"]);
  });

  it("moves a repeat to the front instead of storing it twice", () => {
    rememberValue("email", "alice@acme.com");
    rememberValue("email", "alice@gmail.com");
    rememberValue("email", "alice@acme.com");
    expect(suggestionsFor("email")).toEqual(["alice@acme.com", "alice@gmail.com"]);
  });

  it("treats one address written two ways as one address", () => {
    rememberValue("email", "Alice@Acme.com");
    rememberValue("email", "alice@acme.com");
    expect(suggestionsFor("email")).toEqual(["alice@acme.com"]);
  });

  it("folds a link case-insensitively but shows it as written", () => {
    rememberValue("github", "github.com/Alice");
    rememberValue("github", "github.com/alice");
    expect(suggestionsFor("github")).toEqual(["github.com/alice"]);
  });

  it("normalises a number so two spellings do not take two slots", () => {
    rememberValue("tel", "+91 98765 43210");
    rememberValue("tel", "+919876543210");
    expect(suggestionsFor("tel")).toEqual(["+919876543210"]);
  });

  it("keeps five and evicts the oldest", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) rememberValue("nickname", `name${n}`);
    const got = suggestionsFor("nickname");
    expect(got).toHaveLength(5);
    expect(got[0]).toBe("name6");
    expect(got).not.toContain("name1");
  });
});

describe("what is refused", () => {
  it("keeps nothing for a question with no field", () => {
    rememberValue(undefined, "whatever they said");
    rememberValue(null, "whatever they said");
    expect(hasStoredProfile()).toBe(false);
  });

  it("refuses a mistyped address rather than suggesting it for months", () => {
    rememberValue("email", "alice at acme dot com");
    expect(suggestionsFor("email")).toEqual([]);
  });

  it("refuses a number that is not a number", () => {
    rememberValue("tel", "call me on the office line");
    expect(suggestionsFor("tel")).toEqual([]);
  });

  it("refuses a bare word offered as a link", () => {
    rememberValue("linkedin", "yes");
    expect(suggestionsFor("linkedin")).toEqual([]);
  });

  it("refuses something too long to be a reusable detail", () => {
    rememberValue("name", "a".repeat(201));
    expect(suggestionsFor("name")).toEqual([]);
  });

  it("refuses a value that is not a string", () => {
    rememberValue("name", { first: "Alice" });
    rememberValue("name", 42);
    expect(hasStoredProfile()).toBe(false);
  });
});

/**
 * The schema decides what may be remembered; the browser only stores what it is
 * handed. These assert the decision, because it is the half that has to be
 * right on a borrowed phone.
 */
describe("questions the schema refuses to classify", () => {
  const block = (over: Record<string, unknown>) =>
    identityFieldForBlock({ type: "short_text", title: "Your name", ...over } as never);

  it("classifies the three types that say what they hold", () => {
    expect(identityFieldForBlock({ type: "email", title: "Email" })).toBe("email");
    expect(identityFieldForBlock({ type: "phone", title: "Mobile" })).toBe("tel");
    expect(identityFieldForBlock({ type: "url", title: "Portfolio" })).toBe("url");
  });

  it("takes the author's mapping over what the wording says", () => {
    expect(block({ title: "Your college?", identityField: "nickname" })).toBe("nickname");
  });

  it("forgets a question the author marked never, however it reads", () => {
    expect(block({ title: "Your full name", identityField: "never" })).toBe(null);
  });

  it("remembers nothing from a question that asks for nothing reusable", () => {
    expect(block({ title: "What did you think of the venue?" })).toBe(null);
    expect(block({ title: "Anything else we should know?" })).toBe(null);
  });

  it("prefers the wording over the block type", () => {
    // A `url` block asking for a LinkedIn is a LinkedIn, not a generic website.
    expect(identityFieldForBlock({ type: "url", title: "Your LinkedIn?" })).toBe("linkedin");
  });

  it("refuses a sensitive question however the author maps it", () => {
    expect(block({ title: "Aadhaar number", identityField: "student-id" })).toBe(null);
    expect(block({ title: "Passport number", identityField: "student-id" })).toBe(null);
    expect(block({ title: "Card number", identityField: "name" })).toBe(null);
    expect(block({ title: "Any allergies?", identityField: "dietary" })).toBe(null);
  });

  it("refuses block types whose answers mean nothing elsewhere", () => {
    for (const type of ["payment", "file_upload", "signature", "legal_consent"]) {
      expect(identityFieldForBlock({ type, title: "Your email", identityField: "email" })).toBe(null);
    }
  });
});

describe("clearing", () => {
  it("drops one field and leaves the rest", () => {
    rememberValue("email", "alice@acme.com");
    rememberValue("tel", "+919876543210");
    forgetField("email");
    expect(suggestionsFor("email")).toEqual([]);
    expect(suggestionsFor("tel")).toEqual(["+919876543210"]);
  });

  it("empties everything", () => {
    rememberValue("email", "alice@acme.com");
    clearRespondentProfile();
    expect(hasStoredProfile()).toBe(false);
  });
});

describe("storage that cannot be trusted", () => {
  it("offers nothing rather than throwing on unreadable JSON", () => {
    store.raw.set(KEY, "{not json");
    expect(() => suggestionsFor("email")).not.toThrow();
    expect(suggestionsFor("email")).toEqual([]);
  });

  it("ignores a payload from a future or foreign version", () => {
    store.raw.set(KEY, JSON.stringify({ v: 99, fields: { email: [{ value: "x@y.com", at: 1 }] } }));
    expect(suggestionsFor("email")).toEqual([]);
  });

  it("ignores a key we do not know", () => {
    store.raw.set(KEY, JSON.stringify({ v: 1, fields: { "bank-account": [{ value: "123", at: 1 }] } }));
    expect(hasStoredProfile()).toBe(false);
  });

  it("survives storage that refuses to be read or written", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => rememberValue("email", "alice@acme.com")).not.toThrow();
    expect(suggestionsFor("email")).toEqual([]);
    expect(() => clearRespondentProfile()).not.toThrow();
  });
});

/**
 * Reading the question, which is the path almost every form actually takes —
 * nobody is going to open Advanced and tag thirty questions by hand.
 */
describe("reading a question from its wording", () => {
  const cases: [string, string | null][] = [
    ["What's your first name?", "given-name"],
    ["Last name", "family-name"],
    ["Your full name", "name"],
    ["What should we call you?", "nickname"],
    ["Pick a username", "username"],
    ["Your email address", "email"],
    ["Mobile number", "tel"],
    ["WhatsApp number", "tel"],
    ["Which company do you work for?", "organization"],
    ["Job title", "organization-title"],
    ["City", "address-level2"],
    ["State", "address-level1"],
    ["PIN code", "postal-code"],
    ["Country", "country-name"],
    ["Street address", "street-address"],
    ["LinkedIn profile", "linkedin"],
    ["Your GitHub", "github"],
    ["Twitter handle", "twitter"],
    ["Reddit username", "reddit"],
    ["Discord ID", "discord"],
    ["Portfolio website", "url"],
    ["Which college do you attend?", "school"],
    ["Degree and branch", "degree"],
    ["Graduation year", "graduation-year"],
    ["College roll number", "student-id"],
    ["Date of birth", "bday"],
    ["Gender", "sex"],
    ["Nationality", "nationality"],
    ["T-shirt size", "shirt-size"],
    ["Any dietary preference?", "dietary"],
  ];

  it.each(cases)("reads %s as %s", (title, field) => {
    expect(inferIdentityField(title)).toBe(field);
  });

  it("does not claim a name that is not a person's", () => {
    // The failure this whole table is written around.
    expect(inferIdentityField("What's the name of your favourite film?")).toBe(null);
    expect(inferIdentityField("Name three things you would change")).toBe(null);
  });

  it("reads nothing from an ordinary open question", () => {
    expect(inferIdentityField("How did you hear about us?")).toBe(null);
    expect(inferIdentityField("Rate your experience")).toBe(null);
    expect(inferIdentityField("Any feedback for the team?")).toBe(null);
  });
});
