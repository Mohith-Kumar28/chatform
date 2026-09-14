import { describe, it, expect } from "vitest";
import { Block, validateAnswer, parseEmailDomains, safePattern } from "../src/index";

const email = (over: Record<string, unknown> = {}) =>
  Block.parse({ id: "blk_0001", ref: "q_email", type: "email", title: "Email", required: true, ...over });

describe("email domain rules", () => {
  it("accepts only the domains an author named", () => {
    const b = email({ allowedDomains: ["msrit.edu"] });
    expect(validateAnswer(b, "maya@msrit.edu").ok).toBe(true);
    const bad = validateAnswer(b, "maya@gmail.com");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("wrong_domain");
  });

  it("normalises what the author typed, so @Acme.com and acme.com are one thing", () => {
    expect(email({ allowedDomains: ["@Acme.COM "] }).allowedDomains).toEqual(["acme.com"]);
  });

  it("names the domain in the message, because 'use your work email' would not help", () => {
    const r = validateAnswer(email({ allowedDomains: ["msrit.edu"] }), "maya@gmail.com");
    if (!r.ok) expect(r.hint).toContain("@msrit.edu");
  });

  it("still refuses freemail on its own", () => {
    const r = validateAnswer(email({ businessOnly: true }), "maya@gmail.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("freemail");
  });

  it("leaves an unrestricted question exactly as it was", () => {
    expect(validateAnswer(email(), "maya@gmail.com").ok).toBe(true);
  });
});

describe("contact_info holds its email to the same rules", () => {
  const contact = Block.parse({
    id: "blk_0002", ref: "q_contact", type: "contact_info", title: "You", required: true,
    fields: ["first_name", "email", "phone"],
    fieldOptions: { email: { allowedDomains: ["msrit.edu"] }, phone: { countryHint: "IN" } },
  });

  it("refuses inside a contact block what it refuses standalone", () => {
    const r = validateAnswer(contact, { first_name: "Maya", email: "maya@gmail.com", phone: "+919876543210" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("wrong_domain");
  });

  it("canonicalises the phone, which it never used to validate at all", () => {
    const r = validateAnswer(contact, { first_name: "Maya", email: "maya@msrit.edu", phone: "9876543210" });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as Record<string, string>).phone).toBe("+919876543210");
  });
});

describe("field_group email columns", () => {
  it("applies the group's domain rule per cell", () => {
    const group = Block.parse({
      id: "blk_0003", ref: "q_team", type: "field_group", title: "Team", required: true,
      itemLabel: "Member", minEntries: 1, maxEntries: 4,
      fields: [{ id: "gfld_001", key: "email", label: "Email", kind: "email", allowedDomains: ["msrit.edu"] }],
    });
    expect(validateAnswer(group, [{ email: "a@msrit.edu" }]).ok).toBe(true);
    expect(validateAnswer(group, [{ email: "a@gmail.com" }]).ok).toBe(false);
  });
});

describe("parseEmailDomains", () => {
  it("takes what a person actually types", () => {
    expect(parseEmailDomains("@acme.com, careers@acme.edu  bogus")).toEqual(["acme.com", "acme.edu"]);
  });
  it("drops duplicates rather than storing the same rule twice", () => {
    expect(parseEmailDomains("acme.com, ACME.com")).toEqual(["acme.com"]);
  });
});

describe("safePattern", () => {
  it("keeps a real pattern", () => {
    expect(safePattern("^1MS\\d{2}[A-Z]{2}\\d{3}$")).toBe("^1MS\\d{2}[A-Z]{2}\\d{3}$");
  });
  it("drops one that will not compile, which would silently stop validating", () => {
    expect(safePattern("^(unclosed")).toBeUndefined();
  });
  it("drops the nested quantifier shape that hangs on a bad answer", () => {
    expect(safePattern("^(a+)+$")).toBeUndefined();
  });
});

/**
 * A card refused for one field is not a card refused for all of them.
 *
 * This is the behaviour behind the bug a respondent hit in production: they
 * typed a name, an email and a bare national phone number in one message, the
 * phone was refused for having no country code, and the client redrew all four
 * boxes empty because the answer had been thrown away whole.
 */
describe("a contact card keeps what it got right", () => {
  const contact = Block.parse({
    id: "blk_0004", ref: "q_contact", type: "contact_info", title: "You", required: true,
    fields: ["first_name", "last_name", "email", "phone"],
  });

  const bad = () =>
    validateAnswer(contact, {
      first_name: "Randhir",
      last_name: "Kumar",
      email: "randhir@example.com",
      phone: "9835126411",
    });

  it("refuses the bare number, because nothing here knows which country it is", () => {
    expect(bad().ok).toBe(false);
    expect(bad().code).toBe("invalid_phone");
  });

  it("hands back the three fields that were fine", () => {
    expect(bad().partial).toEqual({
      first_name: "Randhir",
      last_name: "Kumar",
      email: "randhir@example.com",
    });
  });

  it("never hands back the value it just refused", () => {
    expect(bad().partial).not.toHaveProperty("phone");
  });

  it("names the field, so the retry can ask for that one and not the card", () => {
    expect(bad().field).toBe("phone");
  });

  it("gives an example instead of naming the convention", () => {
    expect(bad().hint).toContain("+91");
  });

  it("lists every missing field at once rather than one per round trip", () => {
    const r = validateAnswer(contact, { first_name: "Randhir", email: "randhir@example.com" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("incomplete");
    expect(r.hint).toBe("I still need your last name and phone number.");
    expect(r.partial).toEqual({ first_name: "Randhir", email: "randhir@example.com" });
  });

  it("says both when a field is wrong and another is missing", () => {
    const r = validateAnswer(contact, { first_name: "Randhir", phone: "9835126411" });
    expect(r.hint).toContain("+91");
    expect(r.hint).toContain("last name and email address");
  });

  it("is unchanged when the card is complete and correct", () => {
    const r = validateAnswer(contact, {
      first_name: "Randhir", last_name: "Kumar",
      email: "Randhir@Example.com", phone: "+91 98351 26411",
    });
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({
      first_name: "Randhir", last_name: "Kumar",
      email: "randhir@example.com", phone: "+919835126411",
    });
  });

  it("keeps a half-filled address too, where there is no sub-validator at all", () => {
    const address = Block.parse({
      id: "blk_0005", ref: "q_addr", type: "address", title: "Where", required: true,
      fields: ["street", "city", "postal"],
    });
    const r = validateAnswer(address, { street: "12 MG Road", city: "Bengaluru" });
    expect(r.ok).toBe(false);
    expect(r.partial).toEqual({ street: "12 MG Road", city: "Bengaluru" });
    expect(r.hint).toBe("I still need your postal code.");
  });
});
