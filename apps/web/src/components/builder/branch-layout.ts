import type { Block, FormDoc } from "@repo/form-schema";

/**
 * Reading the flow out of the logic rules, for the question list.
 *
 * The list was a flat numbered column, which is a fair picture of a form that
 * runs straight through and a misleading one of a form that branches. A
 * question only iPhone users are asked looked exactly like a question everyone
 * is asked, so the AI bar could wire up a perfectly good condition and leave
 * no trace of it anywhere the builder looks.
 *
 * This derives, per block: whether it is only reached under a condition, in
 * plain words, and how deep it sits — so an arm can be indented under the
 * question that decides it.
 */

export interface BranchInfo {
  /** Plain-language condition, e.g. "iPhone" or "3 or below". Null on the trunk. */
  condition: string | null;
  /** The question that decides it. */
  sourceRef: string | null;
  sourceTitle: string | null;
  /** 0 for the trunk; 1 for an arm; deeper for an arm of an arm. */
  depth: number;
  /** This question splits the flow. */
  branches: boolean;
}

const OP_WORDS: Record<string, (v: string) => string> = {
  eq: (v) => v,
  neq: (v) => `not ${v}`,
  gt: (v) => `more than ${v}`,
  gte: (v) => `${v} or more`,
  lt: (v) => `less than ${v}`,
  lte: (v) => `${v} or below`,
  contains: (v) => v,
  not_contains: (v) => `not ${v}`,
  is_empty: () => "left blank",
  is_not_empty: () => "answered",
};

/** An option's own label reads better than its id ever will. */
function valueWords(block: Block | undefined, value: unknown): string {
  if (block && "options" in block && block.options) {
    const hit = block.options.find((o) => o.id === value);
    if (hit) return hit.label;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value ?? "");
}

export function computeBranchLayout(doc: FormDoc): Map<string, BranchInfo> {
  const byRef = new Map(doc.blocks.map((b) => [b.ref, b]));
  const out = new Map<string, BranchInfo>();

  /** target ref → the conditions that lead to it, grouped by source. */
  const arrivals = new Map<string, { sourceRef: string; words: string }[]>();
  const splits = new Set<string>();

  // A question that sends every answer to the same place is closing an arm
  // off, not opening one — the rule that carries an arm back to the trunk
  // looks identical otherwise, and reading it as a route labelled the shared
  // next question "or answered" alongside the real conditions.
  const targetsPerSource = new Map<string, Set<string>>();
  for (const rule of doc.logic) {
    if (rule.action_kind !== "goto" || !rule.from) continue;
    if ((rule.targetKind ?? "block") !== "block") continue;
    if ((rule.when?.conditions ?? []).length === 0) continue;
    const set = targetsPerSource.get(rule.from);
    if (set) set.add(rule.target);
    else targetsPerSource.set(rule.from, new Set([rule.target]));
  }

  for (const rule of doc.logic) {
    if (rule.action_kind !== "goto") continue;
    if (!rule.from || (rule.targetKind ?? "block") !== "block") continue;
    const conditions = rule.when?.conditions ?? [];
    // An unconditional jump closes an arm off; it does not create one, and
    // labelling its target "always" would be noise.
    if (conditions.length === 0) continue;
    if ((targetsPerSource.get(rule.from)?.size ?? 0) < 2) continue;
    splits.add(rule.from);

    const words = conditions
      .map((c) => {
        const ref = c.left.kind === "ref" ? c.left.ref : undefined;
        const source = ref ? byRef.get(ref) : undefined;
        const render = OP_WORDS[c.op] ?? ((v: string) => `${c.op} ${v}`);
        return render(valueWords(source, "value" in c ? c.value : undefined));
      })
      .join(" and ");

    const list = arrivals.get(rule.target);
    if (list) list.push({ sourceRef: rule.from, words });
    else arrivals.set(rule.target, [{ sourceRef: rule.from, words }]);
  }

  doc.blocks.forEach((block, i) => {
    const hits = arrivals.get(block.ref);
    if (!hits || hits.length === 0) {
      out.set(block.ref, { condition: null, sourceRef: null, sourceTitle: null, depth: 0, branches: splits.has(block.ref) });
      return;
    }
    // Several conditions can lead to the same question — "Chrome extension or
    // Several" — and they read as one route, not several.
    const sourceRef = hits[0]!.sourceRef;
    const source = byRef.get(sourceRef);
    const condition = [...new Set(hits.map((h) => h.words))].join(" or ");
    const parentDepth = out.get(sourceRef)?.depth ?? 0;
    // Naming the question is only worth the line when it is not the one
    // directly above. "Which device do you use most? — iPhone" over the row
    // immediately under that very question is a long way to say "iPhone".
    const previous = doc.blocks[i - 1];
    const obvious = previous?.ref === sourceRef || out.get(previous?.ref ?? "")?.sourceRef === sourceRef;
    out.set(block.ref, {
      condition,
      sourceRef,
      sourceTitle: obvious ? null : (source?.title ?? null),
      // Blocks are walked in order, so a source earlier in the list already
      // has its depth — which is what makes an arm of an arm nest properly.
      depth: parentDepth + 1,
      branches: splits.has(block.ref),
    });
  });

  return out;
}
