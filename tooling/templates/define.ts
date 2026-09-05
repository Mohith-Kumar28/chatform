import { FormDoc, type BlockInput } from "@repo/form-schema";

/**
 * The authoring shape for a template.
 *
 * Templates are authored here in TypeScript and generated into
 * `tooling/seed-templates.sql`, the same way `@repo/entitlements` is generated
 * into `seed-plans.sql`. The catalogue is the authoring path and the
 * `form_templates` table is the runtime read path; writing the SQL by hand
 * would guarantee they drift.
 *
 * What this buys over the array of docs that used to live inside the route:
 * every template is parsed by `FormDoc` at generation time, so a malformed one
 * fails the build rather than 500ing the gallery, and the counts the cards
 * show are computed rather than typed.
 */

export const CATEGORIES = [
  "Sales",
  "Product",
  "Marketing",
  "Events",
  "HR",
  "Support",
  "Education",
  "Services",
  "Community",
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Accent per category. Mirrors `CATEGORY_ACCENT` in the web app's
 * `lib/category-accent.ts`; stored on the row so the database stays the
 * authority and the frontend map is only a fallback for a row without one.
 */
export const CATEGORY_ACCENT: Record<Category, string> = {
  Sales: "choice",
  Product: "scale",
  Marketing: "content",
  Events: "number",
  HR: "contact",
  Support: "advanced",
  Education: "text",
  Services: "text",
  Community: "content",
};

/**
 * A question, minus the identifiers the generator assigns.
 *
 * Distributive, because `BlockInput` is a discriminated union and a plain
 * `Omit` over a union collapses it to the keys every variant shares — which
 * would leave `scale`, `steps`, `accept` and the rest unassignable at exactly
 * the moment an author reaches for them.
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type Question = DistributiveOmit<
  BlockInput,
  "id" | "ref" | "options" | "items" | "rows" | "columns"
> & {
  /**
   * The field name this question's answer is stored and exported under.
   *
   * Authored rather than derived: a ref generated from the question text
   * gives `q_what_s_your` for "What's your name?", and that string is what
   * ends up as a CSV column header, a webhook payload key and the left-hand
   * side of every logic rule someone later writes.
   */
  ref: string;
  options?: { label: string; description?: string; score?: number }[];
  /** Ranking items, as plain labels. */
  items?: string[];
  rows?: string[];
  columns?: string[];
};

export interface TemplateInput {
  slug: string;
  title: string;
  category: Category;
  /** One line, on the card. */
  description: string;
  /** Two or three sentences, in the preview panel. */
  blurb: string;
  tags: string[];
  /** A key into the web app's icon registry. */
  icon: string;
  /** The opening line. Every template has one — a conversation starts by speaking. */
  greeting: string;
  questions: Question[];
  ending: { title: string; body?: string };
}

export interface TemplateSeed {
  slug: string;
  title: string;
  category: Category;
  description: string;
  blurb: string;
  tags: string[];
  icon: string;
  accent: string;
  blockCount: number;
  estMinutes: number;
  doc: FormDoc;
}

function slugify(text: string, words = 3): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .slice(0, words)
      .join("_")
      .slice(0, 30) || "field"
  );
}

/** Refs are unique per document, so a repeated question title gets a suffix. */
function uniqueRef(base: string, taken: Set<string>): string {
  let ref = /^[a-z]/.test(base) ? base : `q_${base}`;
  if (ref.length < 2) ref = `${ref}_1`;
  let candidate = ref;
  let n = 2;
  while (taken.has(candidate)) candidate = `${ref}_${n++}`;
  taken.add(candidate);
  return candidate;
}

/** Option ids are NanoIds — six characters minimum, which `opt_a` is not. */
function optionId(label: string, index: number, taken: Set<string>): string {
  const base = `opt_${slugify(label, 3)}`;
  let candidate = base.length >= 6 ? base.slice(0, 30) : `${base}_${index + 1}`;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base}_${n++}`.slice(0, 32);
  taken.add(candidate);
  return candidate;
}

function labelled(labels: string[], prefix: string, taken: Set<string>) {
  return labels.map((label, i) => ({
    id: optionId(`${prefix}_${label}`, i, taken),
    label,
  }));
}

/**
 * Fifteen seconds a question plus a moment to read the greeting, rounded up.
 *
 * Deliberately rough and deliberately computed: an author guessing "about two
 * minutes" for their own template is guessing, and the guess would then be a
 * number in a database that nothing recomputes when the template changes.
 */
function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.ceil((questionCount * 15 + 20) / 60));
}

export function defineTemplate(input: TemplateInput): TemplateSeed {
  const refs = new Set<string>(["welcome", "end_thanks"]);
  const code = slugify(input.slug, 2).replace(/_/g, "").slice(0, 8);

  const blocks: BlockInput[] = [
    {
      id: `blk_${code}00`,
      ref: "welcome",
      type: "welcome",
      title: input.greeting,
      required: false,
    },
    ...input.questions.map((q, i) => {
      const { options, items, rows, columns, ref, ...rest } = q;
      const optionIds = new Set<string>();
      return {
        ...rest,
        id: `blk_${code}${String(i + 1).padStart(2, "0")}`,
        ref: uniqueRef(ref, refs),
        ...(options
          ? {
              options: options.map((o, oi) => ({
                id: optionId(o.label, oi, optionIds),
                label: o.label,
                ...(o.description ? { description: o.description } : {}),
                ...(o.score !== undefined ? { score: o.score } : {}),
              })),
            }
          : {}),
        ...(items ? { items: labelled(items, "item", optionIds) } : {}),
        ...(rows ? { rows: labelled(rows, "row", optionIds) } : {}),
        ...(columns ? { columns: labelled(columns, "col", optionIds) } : {}),
      } as BlockInput;
    }),
  ];

  const doc = FormDoc.parse({
    title: input.title,
    description: input.description,
    blocks,
    endings: [
      {
        id: `end_${code}01`,
        ref: "end_thanks",
        title: input.ending.title,
        bodyMd: input.ending.body ?? "",
      },
    ],
  });

  const blockCount = input.questions.length;
  return {
    slug: input.slug,
    title: input.title,
    category: input.category,
    description: input.description,
    blurb: input.blurb,
    tags: input.tags,
    icon: input.icon,
    accent: CATEGORY_ACCENT[input.category],
    blockCount,
    estMinutes: estimateMinutes(blockCount),
    doc,
  };
}
