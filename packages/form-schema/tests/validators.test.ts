import { describe, it, expect } from "vitest";
import { Block, validateAnswer } from "../src/index";


/**
 * An answer is cleaned before any type's rules look at it.
 *
 * This one was found by posting a real answer through a running worker, not by
 * reading the code: `ada<U+200B>@example.com` passed the email regex and was
 * stored with the zero-width space still in it. The address on file was then
 * not the address the person typed — mail to it bounces, the duplicate check
 * sees two different answers where a human sees one, and a domain allowlist is
 * comparing against a string with an invisible character in it.
 *
 * Every existing test on this function used clean input, which is the blind
 * spot worth naming.
 */
describe("invisible characters in an answer", () => {
  const block = (extra: Record<string, unknown> = {}) =>
    Block.parse({ id: "blk_inv0001", ref: "q_x", type: "email", title: "Email?", ...extra });

  it("are stripped before the email rules run", () => {
    const result = validateAnswer(block(), "ada\u200B@example.com");
    expect(result.ok).toBe(true);
    expect(result.value).toBe("ada@example.com");
  });

  it("makes the domain check and the stored value agree", () => {
    const gated = block({ allowedDomains: ["example.com"] });

    // The point is not that an invisible character is refused — it is that the
    // check and the stored value see the same string. Cleaned, this *is* the
    // allowed domain, so it is allowed and stored as what it is.
    const allowed = validateAnswer(gated, "ada@exa\u200Bmple.com");
    expect(allowed.ok).toBe(true);
    expect(allowed.value).toBe("ada@example.com");

    // And a domain not on the list cannot be dressed up as one that is:
    // without cleaning, `evil.example` and `evil\u200B.example` are two
    // different strings and only one of them is ever compared.
    expect(validateAnswer(gated, "ada@evil\u200B.example").ok).toBe(false);
  });

  it("are stripped from a short text answer", () => {
    const text = Block.parse({
      id: "blk_inv0002",
      ref: "q_name",
      type: "short_text",
      title: "Name?",
    });
    expect(validateAnswer(text, "Ada\u200B Lovelace").value).toBe("Ada Lovelace");
    // A bidi override that would reverse how a filename renders.
    expect(validateAnswer(text, "\u202Egnp.exe").value).toBe("gnp.exe");
  });

  it("do not count towards a length limit", () => {
    const text = Block.parse({
      id: "blk_inv0003",
      ref: "q_short",
      type: "short_text",
      title: "Name?",
      maxLength: 5,
    });
    expect(validateAnswer(text, "\u200B".repeat(50) + "Ada").ok).toBe(true);
  });
});

/**
 * "Other", where the author allowed it.
 *
 * The builder offered the toggle long before anything honoured it: an answer
 * outside the list failed as `invalid_option`, so a form promising "Other"
 * told someone who plays the violin that the violin was not allowed.
 */
describe("an Other answer", () => {
  const options = [
    { id: "opt_guitar01", label: "Guitar" },
    { id: "opt_piano001", label: "Piano" },
  ];
  const single = (allowOther: boolean) =>
    Block.parse({ id: "blk_oth0001", ref: "q_i", type: "single_select", title: "Instrument?", options, allowOther });
  const multi = (allowOther: boolean) =>
    Block.parse({ id: "blk_oth0002", ref: "q_m", type: "multi_select", title: "Instruments?", options, allowOther, maxSelections: 3 });

  it("is stored as the respondent's own words", () => {
    expect(validateAnswer(single(true), "  violin ")).toMatchObject({ ok: true, value: "violin" });
  });

  it("still resolves a listed option to its id first", () => {
    expect(validateAnswer(single(true), "piano")).toMatchObject({ ok: true, value: "opt_piano001" });
  });

  it("is refused where the author did not allow it", () => {
    expect(validateAnswer(single(false), "violin")).toMatchObject({ ok: false, code: "invalid_option" });
  });

  it("is refused past its length, and when it is not text", () => {
    expect(validateAnswer(single(true), "x".repeat(201)).ok).toBe(false);
    expect(validateAnswer(single(true), 42).ok).toBe(false);
  });

  it("sits beside listed picks on a multi-select, once", () => {
    expect(validateAnswer(multi(true), ["opt_guitar01", "violin"])).toMatchObject({ ok: true, value: ["opt_guitar01", "violin"] });
    expect(validateAnswer(multi(true), ["violin", "cello"])).toMatchObject({ ok: false, code: "invalid_option" });
    expect(validateAnswer(multi(false), ["opt_guitar01", "violin"])).toMatchObject({ ok: false, code: "invalid_option" });
  });
});
