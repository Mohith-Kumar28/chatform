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
