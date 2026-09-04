import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import {
  BLOCK_TYPES,
  BLOCK_CATALOG,
  ANSWER_CATALOG,
  Block,
  SCHEMA_VERSION,
  toPublicBlock,
  DETERMINISTIC_TYPES,
  OUT_OF_BAND_TYPES,
  type BlockType,
} from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import type { GuardVars } from "../../lib/guards.js";
import type { AuthzVars } from "../../lib/authorize.js";
import { EVENT_ALIASES } from "../../lib/webhooks.js";
import { SCOPES } from "../../lib/scopes.js";
import { getEntitlements } from "../../lib/entitlements.js";

/**
 * What the API knows about itself.
 *
 * A developer integrating against 26 block types should not have to read our
 * source to learn what a matrix answer looks like, and we should not have to
 * hand-maintain a copy of it. These endpoints are derived from the same schemas
 * the validators use, so they cannot describe an engine we do not have.
 */

export const metaRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

/**
 * Per-type JSON Schema, derived from the discriminated union.
 *
 * `io: "input"` because that is what a caller sends — fields with defaults come
 * back optional. `cycles: "ref"` because `visibility` is a recursive condition
 * group and the default would throw on it. Memoised per isolate: the result is
 * immutable for the life of a deploy, and 26 conversions per request is silly.
 */
let schemaCache: Record<string, unknown> | null = null;

function blockConfigSchemas(): Record<string, unknown> {
  if (schemaCache) return schemaCache;
  const out: Record<string, unknown> = {};
  for (const member of (Block as unknown as { options: { shape: { type: { value: BlockType } } }[] }).options) {
    const type = member.shape.type.value;
    out[type] = z.toJSONSchema(member as never, {
      io: "input",
      cycles: "ref",
      unrepresentable: "any",
      target: "draft-2020-12",
    });
  }
  schemaCache = out;
  return out;
}

/** How an answer to this type reaches us — which is what shapes an integration. */
function answeringMode(type: BlockType): string {
  if (DETERMINISTIC_TYPES.has(type)) return "matched exactly — never sent to a model";
  if (OUT_OF_BAND_TYPES.has(type)) return "arrives out of band (upload, payment or booking)";
  return "extracted from free text by the agent, then re-validated";
}

metaRouter.get(
  "/blocks",
  describeRoute({
    tags: ["v1"],
    summary: "Every block type: config schema, what you receive, what you send",
    responses: { 200: { description: "The block catalog" } },
  }),
  (c) => {
    const schemas = blockConfigSchemas();
    return c.json({
      schema_version: SCHEMA_VERSION,
      blocks: BLOCK_TYPES.map((type) => {
        const answer = ANSWER_CATALOG[type];
        const catalog = BLOCK_CATALOG[type];
        return {
          type,
          summary: catalog.summary,
          config_hint: catalog.config ?? null,
          needs_options: catalog.needsOptions === true,
          answered_by: answeringMode(type),
          config_schema: schemas[type],
          // Derived by execution rather than transcribed: toPublicBlock is a
          // long switch, and any prose description of it is wrong within a month.
          public_block: toPublicBlock(Block.parse(answer.block)),
          answer: {
            shape: answer.shape,
            ts_type: answer.tsType,
            examples: answer.examples.map((e) => ({ value: e.value, canonical: e.canonical, note: e.note })),
            error_codes: answer.codes,
          },
        };
      }),
    });
  },
);

metaRouter.get(
  "/blocks/:type",
  describeRoute({
    tags: ["v1"],
    summary: "One block type",
    responses: { 200: { description: "Block type" }, 404: { description: "No such block type" } },
  }),
  (c) => {
    const type = c.req.param("type") as BlockType;
    if (!BLOCK_TYPES.includes(type)) {
      return c.json({ error: { code: "not_found", message: `No block type "${type}"` } }, 404);
    }
    const answer = ANSWER_CATALOG[type];
    const catalog = BLOCK_CATALOG[type];
    return c.json({
      type,
      summary: catalog.summary,
      config_hint: catalog.config ?? null,
      needs_options: catalog.needsOptions === true,
      answered_by: answeringMode(type),
      config_schema: blockConfigSchemas()[type],
      public_block: toPublicBlock(Block.parse(answer.block)),
      answer: {
        shape: answer.shape,
        ts_type: answer.tsType,
        examples: answer.examples,
        counter_examples: answer.counterExamples,
        error_codes: answer.codes,
      },
    });
  },
);

metaRouter.get(
  "/events",
  describeRoute({
    tags: ["v1"],
    summary: "The webhook event catalog",
    responses: { 200: { description: "Events" } },
  }),
  (c) =>
    c.json({
      events: Object.entries(EVENT_ALIASES).map(([name, aliases]) => ({
        name,
        // Both names are listed because a subscription written against the old
        // one keeps working, and an integrator reading this should see why.
        also_matches: aliases.filter((a) => a !== name),
      })),
    }),
);

metaRouter.get(
  "/me",
  describeRoute({
    tags: ["v1"],
    summary: "Who this key is, what it may do, and what is left of the plan",
    responses: { 200: { description: "Key identity" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const ent = await getEntitlements(c.env, orgId);
    return c.json({
      organization_id: orgId,
      key: {
        id: c.get("keyId") ?? null,
        type: c.get("keyType") ?? null,
        mode: c.get("environment") ?? "live",
        scopes: c.get("scopes") ?? {},
      },
      plan: ent.planId,
      limits: ent.limits,
      scope_vocabulary: SCOPES,
    });
  },
);
