import {
  buildFlowRules,
  FormDoc,
  hasErrors,
  lintFormDoc,
  SettingsDoc,
  ThemeDoc,
  type BlockInput,
  type ConditionOp,
  type DraftBranch,
} from "@repo/form-schema";
import type { z } from "zod";

/**
 * The authoring shape for a form written in TypeScript rather than the builder.
 *
 * Templates are authored here and generated into `tooling/seed-templates.sql`,
 * the same way `@repo/entitlements` is generated into `seed-plans.sql`. The
 * catalogue is the authoring path and the `form_templates` table is the runtime
 * read path; writing the SQL by hand would guarantee they drift.
 *
 * `buildAuthoredDoc` is the part of that which is not about templates at all —
 * ids, option ids, branch resolution, lint — and `tooling/demo-form/` uses it to
 * publish a real form. See `AuthoredForm` for where the two part company.
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

/**
 * One conditional route, written the way a person would say it.
 *
 * Templates had no way to express this at all, which is why every one of the
 * thirty-odd in the catalogue was a straight line — and why a product whose
 * whole pitch is "a form that behaves like a conversation" shipped a gallery of
 * forms that behave like paper. The gap was in the authoring type, not in the
 * schema: `FormDoc.logic` has always supported this, and `buildFlowRules` has
 * always derived the rejoins.
 *
 * `is` is the option's LABEL, exactly as written in `options`, for the same
 * reason the AI draft schema asks for labels: the ids are generated here,
 * afterwards, and an author cannot know them.
 */
export interface TemplateBranch {
  /** The ref of the question that decides. */
  when: string;
  op?: ConditionOp;
  /** For a choice question, the option's label. Omit for the unary operators. */
  is?: string | number | boolean;
  /** Ref of the question or ending to jump to. Must sit below `when`. */
  then: string;
  /**
   * No condition: everyone who reaches `when` goes to `then`.
   *
   * This is how an arm says where it stops. `buildFlowRules` derives most of
   * those on its own — it knows where the next arm starts, so it knows where
   * this one ends — but it can only ever rejoin the trunk, and the interesting
   * arms do not rejoin. A webinar registration that splits the people joining
   * live from the ones who only want the recording has two outcomes, and
   * without this the second ending is drawn on the canvas with nothing pointing
   * at it: an outcome the form can never reach.
   */
  always?: boolean;
}

/**
 * A whole form, written the way a person would describe one.
 *
 * This is the half of `TemplateInput` that is actually a *form* — the greeting,
 * the questions, where the answers route and how it signs off. The catalogue
 * fields a template also carries (category, blurb, tags, icon) describe the card
 * in the gallery, not the document, and live on `TemplateInput` below.
 *
 * The split exists because the gallery is no longer the only thing authored this
 * way. `tooling/demo-form/` publishes a real form from the same authoring shape,
 * and it needs the two fields a template has no use for: `settings` and `theme`.
 * A template deliberately ships neither — a starting point that arrived with
 * somebody else's sign-in gate already switched on would be a trap — so both are
 * optional, and omitting them yields the same document as before.
 */
export interface AuthoredForm {
  slug: string;
  title: string;
  /** One line. On a template it is also the card's subtitle. */
  description: string;
  /** The opening line. Every form has one — a conversation starts by speaking. */
  greeting: string;
  questions: Question[];
  /** The default sign-off, reached when nothing routes elsewhere. Ref `end_thanks`. */
  ending: { title: string; body?: string };
  /**
   * Further sign-offs, for the outcomes that deserve their own.
   *
   * A screening form that turns someone away should not thank them for their
   * order, and a qualification form that hands a lead to sales should say so.
   * Refs must start `end_`.
   */
  endings?: { ref: string; title: string; body?: string }[];
  /** Conditional routing. Every arm of a decision, including the shared ones. */
  branches?: TemplateBranch[];
  /**
   * Anything the defaults do not already say.
   *
   * Passed to `FormDoc.parse` as-is, so it is a partial: every key `SettingsDoc`
   * defaults stays defaulted. Omit it entirely and the document is byte-identical
   * to one built without the field at all, which is what keeps the template
   * catalogue unchanged by this shape existing.
   */
  settings?: z.input<typeof SettingsDoc>;
  theme?: z.input<typeof ThemeDoc>;
}

export interface TemplateInput extends AuthoredForm {
  category: Category;
  /** Two or three sentences, in the preview panel. */
  blurb: string;
  tags: string[];
  /** A key into the web app's icon registry. */
  icon: string;
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
 *
 * Counted over the LONGEST PATH rather than over every question, now that a
 * template can branch. Nobody answers a branched form end to end — an
 * eighteen-question intake where each respondent sees ten is a five-minute
 * form, and calling it nine is the kind of overstatement that makes someone
 * close the tab before starting.
 */
function estimateMinutes(questionCount: number): number {
  return Math.max(1, Math.ceil((questionCount * 15 + 20) / 60));
}

/**
 * The most questions anyone can be asked on one run through this form.
 *
 * The flow is a DAG — `buildFlowRules` drops any jump that would run backwards
 * — so this is a plain longest-path walk, computed from the back. Each block
 * leads to its conditional targets, to its unconditional jump if it has one,
 * and otherwise to whatever sits directly below it.
 */
function longestPath(doc: FormDoc): number {
  const index = new Map(doc.blocks.map((b, i) => [b.ref, i]));
  const endings = new Set(doc.endings.map((e) => e.ref));
  const gotos = doc.logic.filter((r) => r.action_kind === "goto");

  /** Where each block can lead, as positions; an ending is the end of the walk. */
  const next = doc.blocks.map((b, i): number[] => {
    const from = gotos.filter((r) => r.from === b.ref);
    const conditional = from.filter((r) => (r.when?.conditions.length ?? 0) > 0);
    const always = from.find((r) => (r.when?.conditions.length ?? 0) === 0);
    const targets = [...conditional, ...(always ? [always] : [])]
      .map((r) => (endings.has(r.target) ? -1 : (index.get(r.target) ?? -1)))
      .filter((at) => at > i);
    // Without an unconditional jump, an unmatched answer falls through.
    if (!always) targets.push(i + 1 < doc.blocks.length ? i + 1 : -1);
    return targets;
  });

  const asked = doc.blocks.map((b) => (b.type === "welcome" || b.type === "statement" ? 0 : 1));
  const best = new Array<number>(doc.blocks.length).fill(0);
  for (let i = doc.blocks.length - 1; i >= 0; i--) {
    const onward = next[i]!.filter((at) => at >= 0).map((at) => best[at]!);
    best[i] = asked[i]! + (onward.length > 0 ? Math.max(...onward) : 0);
  }
  return best[0] ?? 0;
}

/** What `buildAuthoredDoc` works out that a caller would otherwise have to recount. */
export interface AuthoredDoc {
  doc: FormDoc;
  blockCount: number;
  estMinutes: number;
}

export function buildAuthoredDoc(input: AuthoredForm): AuthoredDoc {
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

  const endings = [
    {
      id: `end_${code}01`,
      ref: "end_thanks",
      title: input.ending.title,
      bodyMd: input.ending.body ?? "",
    },
    ...(input.endings ?? []).map((e, i) => ({
      id: `end_${code}${String(i + 2).padStart(2, "0")}`,
      ref: e.ref,
      title: e.title,
      bodyMd: e.body ?? "",
    })),
  ];

  /**
   * Labels back to the ids they were given a moment ago.
   *
   * The same resolution the AI path does in `resolveBranches`, and here for the
   * same reason: an author writes "Android" because that is the word on the
   * button, and `opt_android` is ours.
   */
  const optionIdOf = (ref: string, label: string | number | boolean): string | number | boolean => {
    const block = blocks.find((b) => b.ref === ref) as { options?: { id: string; label: string }[] } | undefined;
    const hit = block?.options?.find((o) => o.label === String(label));
    return hit ? hit.id : label;
  };

  const endingRefs = new Set(endings.map((e) => e.ref));
  const authored = input.branches ?? [];

  /** Arms that state their own destination; see `TemplateBranch.always`. */
  const jumps = authored
    .filter((br) => br.always)
    .map((br, i) => ({
      id: `rl_${code}${String(i + 1).padStart(2, "0")}`,
      action_kind: "goto" as const,
      from: br.when,
      when: { op: "and" as const, conditions: [], groups: [] },
      target: br.then,
      targetKind: endingRefs.has(br.then) ? ("ending" as const) : ("block" as const),
    }));

  const branches: DraftBranch[] = authored
    .filter((br) => !br.always)
    .map((br) => ({
      when: {
        ref: br.when,
        op: (br.op ?? "eq") as DraftBranch["when"]["op"],
        value: br.is === undefined ? null : optionIdOf(br.when, br.is),
      },
      then: br.then,
    }));

  const doc = FormDoc.parse({
    title: input.title,
    description: input.description,
    blocks,
    endings,
    // The authored jumps are passed as `existing` as well as kept: derivation
    // reads them so it does not close an arm that has already said where it
    // goes, which would put two rules on one question and leave which of them
    // wins to evaluation order.
    //
    // Ids are reassigned from the template's own code because `buildFlowRules`
    // mints them with `crypto.randomUUID()` — correct at runtime, and fatal
    // here: the generated SQL is committed and `pnpm templates:verify`
    // regenerates it and diffs, so a random id makes every run report drift in
    // a file nobody changed. Nothing inside a generated template refers to a
    // rule by id, so renaming them costs nothing.
    logic: [...jumps, ...buildFlowRules(branches, blocks as never, [...endingRefs], jumps)].map(
      (rule, i) => ({ ...rule, id: `rl_${code}${String(i + 1).padStart(2, "0")}` }),
    ),
    // Spread only when present. `SettingsDoc`/`ThemeDoc` are `.prefault({})`, so
    // an explicit `undefined` and an absent key parse to the same defaults — but
    // writing the keys unconditionally would still be a change to this object,
    // and `templates:verify` is the thing that proves this refactor changed
    // nothing. Keep the parsed input identical for a caller that passes neither.
    ...(input.settings ? { settings: input.settings } : {}),
    ...(input.theme ? { theme: input.theme } : {}),
  });

  /**
   * A template that does not lint is a template that cannot be published.
   *
   * The gallery is the first thing an author touches, so a broken flow here is
   * a broken flow in their form before they have typed anything — and the
   * branching added to these is exactly the kind of thing that strands a
   * question nothing routes to. Generation is the right place to catch it:
   * `pnpm gen:templates` fails, rather than someone finding out at publish.
   */
  /**
   * An ending nothing routes to is an outcome the form can never reach.
   *
   * The linter does not check this — an unused ending breaks nothing at
   * runtime — but in a template it is always a mistake, and a silent one: the
   * author who wrote "we'll miss you" for the guests who decline sees it drawn
   * on the canvas with no wire into it, and every guest who declines gets
   * thanked for coming instead.
   */
  const aimedAt = new Set(
    doc.logic.filter((r) => r.action_kind === "goto" && (r.targetKind ?? "block") === "ending").map((r) => r.target),
  );
  const orphaned = endings.slice(1).filter((e) => !aimedAt.has(e.ref));
  if (orphaned.length > 0) {
    throw new Error(
      `form "${input.slug}" declares endings nothing routes to: ${orphaned.map((e) => e.ref).join(", ")}`,
    );
  }

  const issues = lintFormDoc(doc);
  if (hasErrors(issues)) {
    const said = issues
      .filter((i) => i.level === "error")
      .map((i) => `  ${i.code}: ${i.message}`)
      .join("\n");
    throw new Error(`form "${input.slug}" has a broken flow:\n${said}`);
  }

  return {
    doc,
    blockCount: input.questions.filter((q) => q.type !== "statement").length,
    estMinutes: estimateMinutes(longestPath(doc)),
  };
}

export function defineTemplate(input: TemplateInput): TemplateSeed {
  const { doc, blockCount, estMinutes } = buildAuthoredDoc(input);
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
    estMinutes,
    doc,
  };
}
