import { describe, it, expect } from "vitest";
import {
  boundedLine,
  boundedString,
  cleanLine,
  cleanText,
  hasSuspiciousCharacters,
  stripInvisible,
} from "../src/text.js";

const ZWSP = "\u200B";
const RLO = "\u202E";
const BOM = "\uFEFF";

describe("cleanText", () => {
  it("strips zero-width and bidi controls", () => {
    expect(cleanText(`in${ZWSP}visible`)).toBe("invisible");
    expect(cleanText(`${RLO}gnp.exe`)).toBe("gnp.exe");
    expect(cleanText(`${BOM}hello`)).toBe("hello");
    expect(cleanText("a\u2066b\u2069c")).toBe("abc");
  });

  it("strips control characters but keeps newline and tab", () => {
    expect(cleanText("a\u0000b")).toBe("ab");
    expect(cleanText("a\u001Bb")).toBe("ab");
    expect(cleanText("a\tb\nc")).toBe("a\tb\nc");
  });

  it("normalises line endings", () => {
    expect(cleanText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("does not reformat: a hard break and a code fence survive intact", () => {
    expect(cleanText("line  \nnext")).toBe("line  \nnext");
    expect(cleanText("```\ncode\n\n\n\nmore\n```")).toBe("```\ncode\n\n\n\nmore\n```");
  });

  it("is idempotent, so a stored-document hash cannot oscillate", () => {
    for (const input of [
      `  ${ZWSP}Trailing  `,
      "éclair",
      "a\r\n\r\nb",
      "```\nx\n\n\n```",
      `${RLO}report.pdf`,
    ]) {
      const once = cleanText(input);
      expect(cleanText(once)).toBe(once);
    }
  });

  it("normalises to NFC so length means what it looks like", () => {
    const decomposed = "éclair"; // e + combining acute
    expect(decomposed).toHaveLength(7);
    expect(cleanText(decomposed)).toBe("éclair");
    expect(cleanText(decomposed)).toHaveLength(6);
  });

  it("trims", () => {
    expect(cleanText("  padded \n")).toBe("padded");
  });
});

describe("cleanLine", () => {
  it("flattens newlines a table cell would hide the rest of the value behind", () => {
    expect(cleanLine("Name\n\nInjected")).toBe("Name Injected");
    expect(cleanLine("spread   out")).toBe("spread out");
  });
});

describe("stripInvisible", () => {
  it("leaves whitespace exactly as it was", () => {
    expect(stripInvisible(`  a${ZWSP}b  \n\n\n`)).toBe("  ab  \n\n\n");
  });
});

describe("hasSuspiciousCharacters", () => {
  it("does not depend on how many times it has been called", () => {
    const payload = `a${ZWSP}b`;
    expect(hasSuspiciousCharacters(payload)).toBe(true);
    expect(hasSuspiciousCharacters(payload)).toBe(true);
    expect(hasSuspiciousCharacters("plain")).toBe(false);
  });
});

describe("boundedString", () => {
  it("cleans before measuring, so padding cannot smuggle length", () => {
    const schema = boundedString(5);
    expect(schema.parse(`  ab${ZWSP}c  `)).toBe("abc");
    expect(schema.safeParse(`${ZWSP.repeat(50)}abc`).success).toBe(true);
    expect(schema.safeParse("abcdef").success).toBe(false);
  });

  it("stays a plain string schema, so generated JSON Schema is unchanged", () => {
    const schema = boundedString(80);
    expect(schema.def.type).toBe("string");
    const json = JSON.parse(JSON.stringify(schema.toJSONSchema()));
    expect(json.type).toBe("string");
    expect(json.maxLength).toBe(80);
  });

  it("composes with the modifiers a field needs", () => {
    const schema = boundedString(10).min(1).nullable().default(null);
    expect(schema.parse(undefined)).toBe(null);
    expect(schema.parse(" hi ")).toBe("hi");
    expect(schema.safeParse("   ").success).toBe(false);
  });

  it("boundedLine refuses to keep a newline", () => {
    expect(boundedLine(40).parse("Title\nsecond line")).toBe("Title second line");
  });
});
