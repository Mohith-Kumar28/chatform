import { describe, it, expect } from "vitest";
import { z } from "zod";
import { APICallError } from "ai";
import { GenerationDraft, EditDraft, DRAFT_LIMITS, isSchemaRejection } from "../src/lib/ai.js";

/**
 * Google's structured-output validator budgets `maxItems` against the whole
 * schema — a list capped at 20 with 8 properties spends 160, not 8 — and it
 * tightened that budget under a schema that had been tuned to fit it. Every
 * generation then failed with "Request contains an invalid argument" before
 * the model was reached, with no deploy to blame.
 *
 * So the caps live in `DRAFT_LIMITS` and are applied to the draft that comes
 * back. This test is the thing that notices if one is put back in the schema,
 * where it would be sent to the provider and spend that budget again.
 */
function arrayCaps(schema: z.ZodTypeAny): string[] {
  const json = z.toJSONSchema(schema, { io: "output" }) as Record<string, unknown>;
  const found: string[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if ("maxItems" in obj) found.push(`${path} (maxItems: ${String(obj.maxItems)})`);
    for (const [key, value] of Object.entries(obj)) {
      if (key === "properties" || key === "$defs") {
        for (const [name, child] of Object.entries(value as Record<string, unknown>)) walk(child, `${path}.${name}`);
      } else if (key === "items") {
        walk(value, `${path}[]`);
      }
    }
  };
  walk(json, "");
  return found;
}

describe("draft schemas", () => {
  it("sends no array caps to the provider", () => {
    expect(arrayCaps(GenerationDraft)).toEqual([]);
    expect(arrayCaps(EditDraft)).toEqual([]);
  });

  it("still refuses a draft with nothing in it", () => {
    const empty = { title: "t", description: "", blocks: [], endings: [], branches: [] };
    expect(GenerationDraft.safeParse(empty).success).toBe(false);
  });

  it("keeps a cap for every list the drafts can return", () => {
    for (const key of Object.keys((GenerationDraft as unknown as { shape: Record<string, z.ZodTypeAny> }).shape)) {
      const isList = key === "blocks" || key === "endings" || key === "branches";
      if (isList) expect(DRAFT_LIMITS[key as keyof typeof DRAFT_LIMITS]).toBeGreaterThan(0);
    }
    for (const key of ["addBlocks", "updateBlocks", "endings", "removeRefs", "rewireRefs", "branches"] as const) {
      expect(DRAFT_LIMITS[key as keyof typeof DRAFT_LIMITS]).toBeGreaterThan(0);
    }
  });
});

/**
 * The real body Google returned during the outage, kept verbatim. The whole
 * fallback hangs off recognising this, so it is worth asserting against the
 * actual bytes rather than a paraphrase of them.
 */
const GOOGLE_REFUSAL = JSON.stringify({
  error: {
    code: 400,
    message: "Provider returned error",
    metadata: {
      raw: '{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}',
      provider_name: "Google AI Studio",
    },
  },
});

const apiError = (statusCode: number, message: string, responseBody?: string) =>
  new APICallError({ message, url: "https://openrouter.ai/api/v1/chat/completions", requestBodyValues: {}, statusCode, responseBody });

describe("isSchemaRejection", () => {
  it("recognises the refusal that took generation down", () => {
    expect(isSchemaRejection(apiError(400, "[Google AI Studio] Request contains an invalid argument.", GOOGLE_REFUSAL))).toBe(true);
  });

  it("treats 422 as a refusal too — providers disagree about which code a bad schema earns", () => {
    expect(isSchemaRejection(apiError(422, "Unprocessable schema"))).toBe(true);
  });

  it("leaves the retryable failures alone", () => {
    // Falling back on these would double our spend on a second vendor every
    // time the first one has a bad minute.
    expect(isSchemaRejection(apiError(429, "Too many requests"))).toBe(false);
    expect(isSchemaRejection(apiError(502, "Bad gateway"))).toBe(false);
    expect(isSchemaRejection(apiError(504, "Timed out"))).toBe(false);
    expect(isSchemaRejection(new Error("fetch failed"))).toBe(false);
    expect(isSchemaRejection(undefined)).toBe(false);
  });

  it("does not mistake a rate limit reported as a 400 for a schema problem", () => {
    expect(isSchemaRejection(apiError(400, "Rate limit exceeded for this model"))).toBe(false);
    expect(isSchemaRejection(apiError(400, "Provider error", '{"error":"quota exceeded"}'))).toBe(false);
  });
});
