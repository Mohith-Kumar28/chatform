import { describe, it, expect } from "vitest";
import { Block, fillText, validateAnswer, type Translate } from "../src/index";

/**
 * The validator's sentences go through a translator when one is passed, and
 * are the English they always were when one is not.
 */
describe("validator messages through a translator", () => {
  // Upper-cases the template and leaves the values alone, so a message that
  // skipped the translator is easy to tell from one that went through it.
  const shout: Translate = (text, vars) => fillText(text.toUpperCase().replace(/\{[A-Z]+\}/g, (m) => m.toLowerCase()), vars);

  const select = Block.parse({
    id: "blk_tr00001",
    ref: "q_colour",
    type: "single_select",
    title: "Colour?",
    options: [
      { id: "opt_red", label: "Red" },
      { id: "opt_blue", label: "Blue" },
    ],
  });
  const date = Block.parse({ id: "blk_tr00002", ref: "q_when", type: "date", title: "When?", min: "2026-01-01" });
  const email = Block.parse({
    id: "blk_tr00003",
    ref: "q_mail",
    type: "email",
    title: "Email?",
    allowedDomains: ["a.example", "b.example", "c.example"],
  });

  it("sends a plain message through the translator", () => {
    const result = validateAnswer(select, "green", { t: shout });
    expect(result.code).toBe("invalid_option");
    expect(result.hint).toBe("PLEASE PICK ONE OF THE AVAILABLE OPTIONS.");
  });

  it("keeps the value in a message that carries one", () => {
    const result = validateAnswer(date, "2025-06-01", { t: shout });
    expect(result.code).toBe("too_early");
    expect(result.hint).toBe("DATE MUST BE ON OR AFTER 2026-01-01.");
  });

  it("translates the joining word of a list and keeps its items", () => {
    const result = validateAnswer(email, "ada@d.example", { t: shout });
    expect(result.code).toBe("wrong_domain");
    expect(result.hint).toBe("PLEASE USE AN EMAIL ADDRESS FROM @a.example, @b.example OR @c.example.");
  });

  it("is the same English as before when no translator is passed", () => {
    expect(validateAnswer(select, "green").hint).toBe("Please pick one of the available options.");
    expect(validateAnswer(date, "2025-06-01").hint).toBe("Date must be on or after 2026-01-01.");
    expect(validateAnswer(email, "ada@d.example").hint).toBe(
      "Please use an email address from @a.example, @b.example or @c.example.",
    );
  });
});
