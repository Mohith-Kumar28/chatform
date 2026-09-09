import { describe, it, expect } from "vitest";
import { chunkMarkdown, CHUNK_CHARS } from "../src/lib/knowledge/chunk.js";

const para = (n: number, word = "policy") => `${word} `.repeat(n).trim();

describe("chunkMarkdown", () => {
  it("returns nothing for empty input", () => {
    expect(chunkMarkdown("")).toEqual([]);
    expect(chunkMarkdown("   \n\n  ")).toEqual([]);
  });

  it("keeps a short document as one chunk", () => {
    const chunks = chunkMarkdown("# Refunds\n\nWe refund within 30 days of purchase, no questions asked.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain("30 days");
    expect(chunks[0]!.ordinal).toBe(0);
  });

  it("numbers chunks in reading order", () => {
    const doc = Array.from({ length: 6 }, (_, i) => `## Section ${i}\n\n${para(200)}`).join("\n\n");
    const chunks = chunkMarkdown(doc);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it("splits on headings so a section stays with its heading", () => {
    const doc = `# Pricing\n\n${para(300)}\n\n# Refunds\n\n${para(300)}`;
    const chunks = chunkMarkdown(doc);
    // Each heading should open a chunk rather than appear mid-passage.
    const pricing = chunks.find((c) => c.text.includes("# Pricing"));
    expect(pricing).toBeDefined();
  });

  it("packs several short sections together rather than making a vector per heading", () => {
    const doc = Array.from({ length: 8 }, (_, i) => `## Q${i}\n\nShort answer number ${i} about the product.`).join(
      "\n\n",
    );
    const chunks = chunkMarkdown(doc);
    expect(chunks.length).toBeLessThan(8);
  });

  it("splits a section longer than the target", () => {
    const chunks = chunkMarkdown(`# Long\n\n${para(3000)}`);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps chunks near the target size", () => {
    const doc = Array.from({ length: 12 }, () => para(400)).join("\n\n");
    const chunks = chunkMarkdown(doc);
    // Overlap is prepended after splitting, so allow for it plus a sentence
    // that could not be cut mid-word.
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_CHARS * 1.5);
    }
  });

  it("overlaps consecutive chunks so a straddling sentence survives", () => {
    const doc = Array.from({ length: 10 }, (_, i) => `Sentence ${i} ${para(80)}.`).join("\n\n");
    const chunks = chunkMarkdown(doc);
    expect(chunks.length).toBeGreaterThan(1);
    // The second chunk should begin with text that also appears in the first.
    const openingWords = chunks[1]!.text.slice(0, 40);
    expect(chunks[0]!.text).toContain(openingWords.split("\n")[0]!.trim().slice(0, 20));
  });

  it("does not overlap the first chunk with anything", () => {
    const doc = `# A\n\n${para(500)}\n\n# B\n\n${para(500)}`;
    const chunks = chunkMarkdown(doc);
    expect(chunks[0]!.text.startsWith("# A")).toBe(true);
  });

  it("splits a single enormous unpunctuated run rather than emitting one huge chunk", () => {
    const chunks = chunkMarkdown("x".repeat(CHUNK_CHARS * 3));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(CHUNK_CHARS * 1.5);
  });

  it("normalises CRLF so Windows uploads chunk the same as Unix ones", () => {
    const unix = chunkMarkdown("# T\n\nsome body text that is long enough to keep around");
    const win = chunkMarkdown("# T\r\n\r\nsome body text that is long enough to keep around");
    expect(win.map((c) => c.text)).toEqual(unix.map((c) => c.text));
  });

  it("drops a heading with nothing under it", () => {
    // A lone heading among real sections is noise; it must not become a vector
    // that retrieves an empty passage.
    const chunks = chunkMarkdown(`# Real\n\n${para(400)}\n\n# Orphan`);
    expect(chunks.some((c) => c.text.trim() === "# Orphan")).toBe(false);
  });
});
