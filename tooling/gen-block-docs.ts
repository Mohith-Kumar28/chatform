/**
 * Generate the block reference from the schema package.
 *
 * Twenty-six pages describing config, projection, answer shape and error codes
 * is exactly the kind of documentation that is wrong within a month of being
 * written by hand — and the reader is an integrator whose POST returns 422 while
 * the docs say it should not.
 *
 * So none of it is written by hand. The config schema is derived from the `Block`
 * discriminated union, the projection is produced by *running* `toPublicBlock`
 * rather than describing it, and every error message is obtained by calling the
 * real validator with the counter-example it documents. If the engine changes and
 * this is not regenerated, `pnpm blocks:verify` fails.
 *
 *   pnpm gen:blocks     # writes the pages
 *   pnpm blocks:verify  # fails when what is committed is stale
 */
import { writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  BLOCK_TYPES,
  BLOCK_CATALOG,
  BLOCK_PRESENTATION,
  BLOCK_GROUPS,
  ANSWER_CATALOG,
  Block,
  toPublicBlock,
  validateAnswer,
  DETERMINISTIC_TYPES,
  OUT_OF_BAND_TYPES,
  type BlockType,
} from "@repo/form-schema";

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, "../apps/web/content/docs/blocks");

const JSON_SCHEMA_OPTS = {
  // What a caller SENDS: fields with defaults come back optional.
  io: "input",
  // `visibility` is a recursive condition group; the default would throw on it.
  cycles: "ref",
  unrepresentable: "any",
  target: "draft-2020-12",
} as const;

const variants = new Map(
  (Block as unknown as { options: { shape: { type: { value: BlockType } } }[] }).options.map((m) => [
    m.shape.type.value,
    m,
  ]),
);

function schemaFor(type: BlockType): Record<string, unknown> {
  return z.toJSONSchema(variants.get(type) as never, JSON_SCHEMA_OPTS) as Record<string, unknown>;
}

/**
 * The properties every block has, documented once.
 *
 * Without this each of twenty-six pages opens with the same dozen base fields
 * and the two or three that actually distinguish the type fall below the fold.
 */
const BASE_KEYS = new Set(
  Object.keys((schemaFor("statement").properties ?? {}) as Record<string, unknown>).filter(
    (k) => k !== "type" && k !== "buttonLabel",
  ),
);

function answeringMode(type: BlockType): string {
  if (DETERMINISTIC_TYPES.has(type)) return "matched exactly — never sent to a model";
  if (OUT_OF_BAND_TYPES.has(type)) return "arrives out of band (an upload, a payment, or a booking)";
  return "extracted from free text by the agent, then re-validated";
}

/**
 * Escape a value for a markdown table cell.
 *
 * Answer types are TypeScript unions — `Record<string, string | string[]>` — and
 * an unescaped pipe ends the cell mid-expression, which leaves the rest of it
 * being parsed as JSX. Newlines would break the row entirely.
 */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function fence(lang: string, body: string, title?: string): string {
  return `\`\`\`${lang}${title ? ` title="${title}"` : ""}\n${body}\n\`\`\``;
}

function errorTable(type: BlockType): string {
  const entry = ANSWER_CATALOG[type];
  if (entry.codes.length === 0) {
    return "This block collects no answer, so it never fails validation.";
  }
  const parsed = Block.parse(entry.block);
  const rows: string[] = ["| Code | When | Message |", "| --- | --- | --- |"];
  for (const code of entry.codes) {
    const example = entry.counterExamples.find((c) => c.code === code);
    /**
     * Every message is obtained by running the validator, never transcribed, so
     * what is documented is byte-identical to what a respondent is told. Where
     * the catalogue has no counter-example — `required`, which every type shares
     * — an empty answer produces one.
     */
    const probe = example ? example.value : code === "required" ? "" : undefined;
    const result = probe === undefined ? null : validateAnswer(parsed, probe);
    const message = result && !result.ok ? (result.hint ?? "") : "";
    const when = example
      ? `\`${cell(JSON.stringify(example.value))}\`${example.note ? ` — ${cell(example.note)}` : ""}`
      : code === "required"
        ? "an empty answer on a required block"
        : "—";
    rows.push(`| \`${code}\` | ${when} | ${cell(message)} |`);
  }
  return rows.join("\n");
}

function canonicalTable(type: BlockType): string {
  const entry = ANSWER_CATALOG[type];
  const withCanonical = entry.examples.filter((e) => "canonical" in e);
  if (withCanonical.length === 0) return "";
  const rows = [
    "",
    "### What gets stored",
    "",
    "The value is normalised before it is saved, so what you read back is not always what you sent.",
    "",
    "| You send | Stored | |",
    "| --- | --- | --- |",
    ...withCanonical.map(
      (e) =>
        `| \`${cell(JSON.stringify(e.value))}\` | \`${cell(JSON.stringify(e.canonical))}\` | ${cell(e.note ?? "")} |`,
    ),
  ];
  return rows.join("\n");
}

function samples(type: BlockType): string {
  const entry = ANSWER_CATALOG[type];
  const example = entry.examples[0];
  if (!example || example.value === undefined) return "";
  const value = JSON.stringify(example.value);
  const ref = entry.block.ref;

  const curl = `curl -X POST https://api.chatform.in/v1/responses/{RESPONSE_ID}/answers \\
  -H "x-api-key: $CHATFORM_SECRET_KEY" \\
  -H "content-type: application/json" \\
  -d '{"ref": "${ref}", "value": ${value}}'`;

  const js = `await chatform.responses.answer(responseId, {
  ref: "${ref}",
  value: ${value},
});`;

  const py = `requests.post(
    f"https://api.chatform.in/v1/responses/{response_id}/answers",
    headers={"x-api-key": os.environ["CHATFORM_SECRET_KEY"]},
    json={"ref": "${ref}", "value": ${value}},
)`;

  return [
    "",
    "<Tabs items={['curl', '@chatform/js', 'Python']}>",
    "",
    "<Tab value=\"curl\">",
    "",
    fence("bash", curl),
    "",
    "</Tab>",
    "",
    "<Tab value=\"@chatform/js\">",
    "",
    fence("ts", js),
    "",
    "</Tab>",
    "",
    "<Tab value=\"Python\">",
    "",
    fence("python", py),
    "",
    "</Tab>",
    "",
    "</Tabs>",
  ].join("\n");
}

function page(type: BlockType): string {
  const catalog = BLOCK_CATALOG[type];
  const presentation = BLOCK_PRESENTATION[type];
  const answer = ANSWER_CATALOG[type];

  const schema = schemaFor(type);
  const own = Object.fromEntries(
    Object.entries((schema.properties ?? {}) as Record<string, unknown>).filter(([k]) => !BASE_KEYS.has(k)),
  );
  const publicBlock = toPublicBlock(Block.parse(answer.block));

  return `---
title: ${presentation.label}
description: ${JSON.stringify(catalog.summary)}
generated: true
family: ${presentation.tone}
---

{/* GENERATED by tooling/gen-block-docs.ts from @repo/form-schema. Do not edit.
    Regenerate with \`pnpm gen:blocks\`; \`pnpm blocks:verify\` fails when stale. */}

${catalog.summary}${catalog.needsOptions ? "\n\nRequires `options`." : ""}

**How it gets answered** — ${answeringMode(type)}.

## Configuration

Fields specific to \`${type}\`. The [fields every block has](/docs/blocks/common-fields) — \`id\`, \`ref\`, \`title\`, \`required\`, \`visibility\`, \`media\`, \`agentHints\`, \`prefillParam\` — are documented once.

${fence("json", JSON.stringify({ ...schema, properties: own }, null, 2), `${type} configuration`)}
${catalog.config ? `\nIn a generated draft these arrive as \`config\` pairs: \`${catalog.config}\`.\n` : ""}
## What you receive

\`GET /v1/forms/{id}\` and every "next question" projects blocks through \`toPublicBlock\`. For the example above:

${fence("json", JSON.stringify(publicBlock, null, 2), "PublicBlock")}

## What you send

${answer.shape}

${fence("ts", `type Answer = ${answer.tsType};`)}
${samples(type)}
${canonicalTable(type)}

## Errors

${errorTable(type)}
`;
}

function indexPage(): string {
  const rows = [
    "| Type | Family | How it is answered | Answer |",
    "| --- | --- | --- | --- |",
    ...BLOCK_TYPES.map((type) => {
      const p = BLOCK_PRESENTATION[type];
      return `| [${p.label}](/docs/blocks/${type}) \`${type}\` | ${p.group} | ${answeringMode(type)} | \`${cell(ANSWER_CATALOG[type].tsType)}\` |`;
    }),
  ];

  return `---
title: Blocks
description: Every question type, what it accepts, and what it returns.
generated: true
---

{/* GENERATED by tooling/gen-block-docs.ts. Do not edit. */}

A form is a list of blocks. Each one has a \`type\` that decides what it collects,
how it is validated, and what shape the answer takes on the wire.

Everything on these pages is generated from the same schemas the API validates
against, so if a page says a value is valid, it is.

${rows.join("\n")}

The same information is available as JSON at \`GET /v1/blocks\`, which is the right
source if you are building a UI that renders every type.
`;
}

function commonFieldsPage(): string {
  const schema = schemaFor("statement");
  const base = Object.fromEntries(
    Object.entries((schema.properties ?? {}) as Record<string, unknown>).filter(([k]) => BASE_KEYS.has(k)),
  );
  return `---
title: Common fields
description: The fields every block has, whatever it collects.
generated: true
---

{/* GENERATED by tooling/gen-block-docs.ts. Do not edit. */}

Every block carries these, so each type's own page documents only what is specific to it.

${fence("json", JSON.stringify({ type: "object", properties: base }, null, 2), "Shared block fields")}

\`ref\` is the one to pay attention to: it is how you address a block when
answering, and it is stable across edits in a way \`id\` is not meant to be.
`;
}

function metaJson(): string {
  // Ordered by family, matching the builder — someone who has used it should
  // find a block where they expect it.
  const byGroup = new Map<string, BlockType[]>();
  for (const type of BLOCK_TYPES) {
    const group = BLOCK_PRESENTATION[type].group;
    byGroup.set(group, [...(byGroup.get(group) ?? []), type]);
  }
  const pages = ["index", "common-fields", ...BLOCK_GROUPS.flatMap((g) => byGroup.get(g) ?? [])];
  return `${JSON.stringify({ title: "Blocks", pages }, null, 2)}\n`;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const file of readdirSync(OUT_DIR)) {
  if (file.endsWith(".mdx") || file === "meta.json") unlinkSync(resolve(OUT_DIR, file));
}

writeFileSync(resolve(OUT_DIR, "index.mdx"), indexPage());
writeFileSync(resolve(OUT_DIR, "common-fields.mdx"), commonFieldsPage());
for (const type of BLOCK_TYPES) {
  writeFileSync(resolve(OUT_DIR, `${type}.mdx`), page(type));
}
writeFileSync(resolve(OUT_DIR, "meta.json"), metaJson());

console.log(`wrote ${BLOCK_TYPES.length + 2} block reference pages to ${OUT_DIR}`);
