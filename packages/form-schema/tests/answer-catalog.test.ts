import { describe, it, expect } from "vitest";
import { Block, BLOCK_TYPES, type BlockType } from "../src/blocks";
import { ANSWER_CATALOG } from "../src/answer-catalog";
import { validateAnswer, VALIDATION_CODES } from "../src/engine/validators";

/**
 * The block reference is generated from `ANSWER_CATALOG`, so this is what stops
 * the documentation from describing an engine we do not have.
 *
 * Every documented example is put through the real validator; every documented
 * failure has to fail with exactly the code claimed. A rename in `validators.ts`
 * that the catalogue has not caught up with fails here rather than in a
 * customer's 422.
 */

describe("coverage", () => {
  it("documents every block type and nothing that is not one", () => {
    expect(Object.keys(ANSWER_CATALOG).sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("uses only codes the validators can actually emit", () => {
    for (const type of BLOCK_TYPES) {
      for (const code of ANSWER_CATALOG[type].codes) {
        expect(VALIDATION_CODES, `${type} documents an unknown code: ${code}`).toContain(code);
      }
    }
  });
});

describe.each(BLOCK_TYPES)("%s", (type: BlockType) => {
  const entry = ANSWER_CATALOG[type];

  it("has a representative block that parses", () => {
    const parsed = Block.parse(entry.block);
    expect(parsed.type).toBe(type);
  });

  it("accepts every documented example", () => {
    const block = Block.parse(entry.block);
    for (const example of entry.examples) {
      const result = validateAnswer(block, example.value);
      expect(
        result.ok,
        `${type}: ${JSON.stringify(example.value)} is documented as valid but failed with "${result.code}"`,
      ).toBe(true);
      if ("canonical" in example) {
        // The difference between what you send and what comes back is exactly
        // what an integrator needs and what prose always gets wrong.
        expect(result.value, `${type}: canonical value does not match`).toEqual(example.canonical);
      }
    }
  });

  it("rejects every documented counter-example with the documented code", () => {
    const block = Block.parse(entry.block);
    for (const counter of entry.counterExamples) {
      const result = validateAnswer(block, counter.value);
      expect(
        result.ok,
        `${type}: ${JSON.stringify(counter.value)} is documented as invalid but passed`,
      ).toBe(false);
      expect(result.code, `${type}: ${JSON.stringify(counter.value)}`).toBe(counter.code);
    }
  });

  it("claims every code its counter-examples produce", () => {
    for (const counter of entry.counterExamples) {
      expect(entry.codes, `${type}: ${counter.code} is produced but not listed`).toContain(counter.code);
    }
  });
});
