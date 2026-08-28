import type { Block, FormDoc } from "@repo/form-schema";

/**
 * What the question list can honestly say about the flow.
 *
 * This used to derive a tree: a depth per question, so arms could be indented
 * under the question that decides them. It was wrong often enough to be worse
 * than nothing, and the reason is structural rather than a bug that could be
 * patched out.
 *
 * A flow is a graph. A question can be reached from two different branches, or
 * from a branch *and* by falling through — so it has no single parent, and a
 * tree has to invent one. The invented answers were visibly wrong: an RSVP that
 * asked for guest names only when guests were coming drew that question as an
 * arm of itself labelled "1 or more or not yes", and drew the dietary question
 * that follows everyone two levels deep inside a branch nobody was in. The
 * builder trusts the list, so a list that lies is a list that gets forms wrong.
 *
 * So the list is a flat, ordered outline again — which is what it is good at,
 * and what makes it easy to click, drag and delete in — and each row states
 * only what is true of that row on its own:
 *
 *   - it splits the flow, or
 *   - it is not asked of everyone, and (when one route explains that) why.
 *
 * The Flow view draws the graph. There is exactly one drawing of it now.
 */

export interface QuestionFlow {
  /** This question sends different answers different ways. */
  branches: boolean;
  /** Not everyone reaches this question. */
  conditional: boolean;
  /**
   * The test that decides it, as an expression — "if guests ≥ 1".
   *
   * Written as a condition rather than a sentence because it sits under the
   * question's own wording, and prose there reads as more question. It is also
   * kept short on purpose: naming the deciding question in full produced
   * "Only if How many guests are you …", which is a truncated sentence saying
   * nothing.
   *
   * Null when more than one route arrives and no single expression is true of
   * all of them. Saying "sometimes" beats a sentence that is wrong.
   */
  condition: string | null;
}

/** An option's own label reads better than its id ever will. */
function valueWords(block: Block | undefined, value: unknown): string {
  if (block && "options" in block && block.options) {
    const hit = block.options.find((o) => o.id === value);
    if (hit) return hit.label;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value ?? "");
}

/**
 * A short name for the question a condition tests.
 *
 * The ref, humanised: `q_guests` → "guests". Refs are already the short handle
 * an author gives a question — the inspector shows one under every title — and
 * they stay put when questions are reordered, which the position number does
 * not. Refs that carry no meaning of their own fall back to the number, which
 * at least points at a row.
 */
function subjectName(block: Block | undefined, position: number | undefined): string {
  const humanised = (block?.ref ?? "").replace(/^q_/, "").replace(/_/g, " ").trim();
  if (humanised.length > 1 && !/^\d+$/.test(humanised)) return humanised;
  return position === undefined ? "answer" : `Q${position + 1}`;
}

/**
 * One condition, as an expression.
 *
 * Operators are symbols where a symbol is shorter and no less clear — `≥` over
 * "or more" — because this has one line inside a row that already has two lines
 * of question in it.
 *
 * Yes/no questions are special-cased because their complement has a name. The
 * generic path renders `neq true` as "not yes", a double negative describing a
 * button that says "No".
 */
function conditionPhrase(
  source: Block | undefined,
  subject: string,
  op: string,
  value: unknown,
): string {
  if (source?.type === "yes_no" && (op === "eq" || op === "neq")) {
    const yes = op === "eq" ? value === true : value === false;
    return `if ${subject} is ${yes ? (source.yesLabel ?? "Yes") : (source.noLabel ?? "No")}`;
  }
  const v = valueWords(source, value);
  switch (op) {
    case "eq":
      return `if ${subject} is ${v}`;
    case "neq":
      return `if ${subject} is not ${v}`;
    case "gt":
      return `if ${subject} > ${v}`;
    case "gte":
      return `if ${subject} ≥ ${v}`;
    case "lt":
      return `if ${subject} < ${v}`;
    case "lte":
      return `if ${subject} ≤ ${v}`;
    case "contains":
      return `if ${subject} has ${v}`;
    case "not_contains":
      return `if ${subject} has no ${v}`;
    case "is_empty":
      return `if ${subject} is blank`;
    case "is_not_empty":
      return `if ${subject} answered`;
    default:
      return `if ${subject} ${op} ${v}`;
  }
}

interface Goto {
  from: string;
  target: string;
  toEnding: boolean;
  /** The single condition, when there is exactly one to read. */
  op: string | null;
  value: unknown;
  conditional: boolean;
}

export function computeQuestionFlow(doc: FormDoc): Map<string, QuestionFlow> {
  const byRef = new Map(doc.blocks.map((b) => [b.ref, b]));
  const index = new Map(doc.blocks.map((b, i) => [b.ref, i]));

  const gotos: Goto[] = [];
  for (const rule of doc.logic) {
    if (rule.action_kind !== "goto" || !rule.from) continue;
    const conditions = (rule.when?.conditions ?? []) as {
      left?: { kind?: string; ref?: string };
      op?: string;
      value?: unknown;
    }[];
    const only = conditions.length === 1 ? conditions[0] : undefined;
    gotos.push({
      from: rule.from,
      target: rule.target,
      toEnding: (rule.targetKind ?? "block") === "ending",
      op: only?.op ?? null,
      value: only && "value" in only ? only.value : undefined,
      conditional: conditions.length > 0,
    });
  }

  /**
   * A question splits the flow when some answer to it goes somewhere a
   * different answer does not. That is exactly "it carries a conditional
   * rule" — an unconditional jump moves everybody alike, which is a detour,
   * not a decision.
   */
  const splits = new Set(gotos.filter((g) => g.conditional).map((g) => g.from));

  const out = new Map<string, QuestionFlow>();

  doc.blocks.forEach((block, i) => {
    /**
     * Is there a way past this question?
     *
     * Anything that jumps from above it to below it — or straight to an
     * ending — leaves somebody never having seen it. This is a property of the
     * rules and the order alone, so it stays true however the branches are
     * shaped, which is what the old depth calculation could not manage.
     */
    const conditional = gotos.some((g) => {
      const from = index.get(g.from);
      if (from === undefined || from >= i) return false;
      if (g.toEnding) return true;
      const to = index.get(g.target);
      return to !== undefined && to > i;
    });

    if (!conditional) {
      out.set(block.ref, {
        branches: splits.has(block.ref),
        conditional: false,
        condition: null,
      });
      return;
    }

    /**
     * Conditional routes that land here AND explain being here.
     *
     * Not every conditional arrival is a branch someone authored. `repairFlow`
     * derives a complement for each conditional insert — "guests < 1, skip the
     * guest-names question" — and that complement is a conditional goto like
     * any other, so reading it as a route *into* its target said the operating
     * system question was asked "if guests ≤ 0". It is asked of everyone; the
     * rule was about skipping the question before it.
     *
     * The distinction is whether the fall-through path also arrives here. It
     * does not when the arrival sits directly below its decider (the same
     * answer decides both), nor when the row above jumps away unconditionally
     * (which is how an arm is closed off). Anything else is a rejoin: reached
     * both by this jump and by simply carrying on, so no one condition
     * describes it.
     */
    const arrivals = gotos.filter((g) => {
      if (!g.conditional || g.toEnding || g.target !== block.ref) return false;
      const from = index.get(g.from);
      if (from === undefined || from >= i) return false;
      if (from === i - 1) return true;
      const above = doc.blocks[i - 1];
      return above ? gotos.some((o) => o.from === above.ref && !o.conditional) : true;
    });

    /** Something skips past the row above to get here, so both paths meet. */
    const isRejoin = gotos.some((g) => {
      if (g.toEnding || g.target !== block.ref) return false;
      const from = index.get(g.from);
      return from !== undefined && from < i - 1;
    });

    const phrases = new Set(
      arrivals.map((g) => {
        const source = byRef.get(g.from);
        return conditionPhrase(
          source,
          subjectName(source, index.get(g.from)),
          g.op ?? "eq",
          g.value,
        );
      }),
    );

    let condition: string | null = null;

    if (phrases.size === 1) {
      condition = [...phrases][0]!;
    } else if (arrivals.length === 0) {
      /**
       * Nothing routes here, yet something can skip it — so this question is
       * reached only by falling through from the one above. It is therefore
       * asked exactly when that one is, and can borrow its answer.
       *
       * Only when nothing routes away from that question, or falling through is
       * not the only way to arrive and the borrowed phrase would be a guess.
       * This is what keeps the second and third questions of an arm labelled
       * instead of shrugging at everything after the first.
       */
      const previous = doc.blocks[i - 1];
      const inherited = previous ? out.get(previous.ref) : undefined;
      if (!isRejoin && previous && inherited?.conditional && !gotos.some((g) => g.from === previous.ref)) {
        condition = inherited.condition;
      }
    }

    out.set(block.ref, {
      branches: splits.has(block.ref),
      conditional: true,
      condition,
    });
  });

  return out;
}
