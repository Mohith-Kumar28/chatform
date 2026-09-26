import { describe, expect, it } from "vitest";
import { findFont, fontStack, themeFontsHref } from "../src/lib/theme-fonts";

describe("fontStack", () => {
  it("points the bundled defaults at their next/font variables", () => {
    expect(fontStack("Inter")).toMatch(/^var\(--font-inter\), "Inter", /);
    expect(fontStack("Bricolage Grotesque", "Inter")).toMatch(
      /^var\(--font-bricolage\), "Bricolage Grotesque", var\(--font-inter\), "Inter", /,
    );
  });

  it("quotes names and falls back by the face's own category", () => {
    expect(fontStack("Source Sans 3")).toBe('"Source Sans 3", ui-sans-serif, system-ui, sans-serif');
    expect(fontStack("Playfair Display")).toContain("serif");
    expect(fontStack("Playfair Display")).not.toContain("sans-serif");
  });

  it("cannot be escaped out of by a stored name", () => {
    expect(fontStack('Evil"; color: red')).toBe('"Evil; color: red", ui-sans-serif, system-ui, sans-serif');
  });
});

describe("themeFontsHref", () => {
  it("loads nothing for the bundled defaults", () => {
    expect(themeFontsHref({ fontHeading: "Bricolage Grotesque", fontBody: "Inter" })).toBeNull();
  });

  it("loads only catalogue families, at the weights each one ships", () => {
    const href = themeFontsHref({ fontHeading: "Bebas Neue", fontBody: "Poppins" })!;
    expect(href).toContain("family=Bebas+Neue&");
    expect(href).toContain("family=Poppins:wght@400;500;600;700");
    expect(href).toMatch(/display=swap$/);
  });

  it("ignores a name that is not in the catalogue", () => {
    expect(themeFontsHref({ fontHeading: "My Local Font", fontBody: "Inter" })).toBeNull();
  });

  it("finds families regardless of case", () => {
    expect(findFont("poppins")?.[0]).toBe("Poppins");
  });
});
