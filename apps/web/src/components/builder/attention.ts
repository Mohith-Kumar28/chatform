import { lintFormDoc, type FormDoc, type LintIssue } from "@repo/form-schema";

/**
 * Lint codes about the flow's wiring. The canvas already draws those as routes
 * that are broken or pointless; everything else with a ref is a question
 * missing something it needs, which is what "needs attention" is for.
 */
const FLOW_CODES = new Set([
  "unreachable_blocks",
  "no_route_to_ending",
  "dangling_target",
  "unreachable_route",
  "always_true_route",
  "never_true_route",
  "value_not_an_option",
  "exact_match_on_free_text",
  "ending_unreachable",
]);

export interface Attention {
  messages: string[];
  codes: string[];
}

/**
 * Questions that cannot publish as they stand, keyed by ref: the same errors
 * the publish button refuses on, so the marks and the button agree. Only the
 * first ref of an issue gets it: that is the question the setting belongs to
 * ("no price for Team" is the payment's to fix, not the plan question's).
 */
export function setupAttention(doc: FormDoc): Map<string, Attention> {
  const out = new Map<string, Attention>();
  for (const issue of lintFormDoc(doc)) {
    if (issue.level !== "error" || !issue.refs?.length || FLOW_CODES.has(issue.code)) continue;
    const ref = issue.refs[0]!;
    const entry = out.get(ref) ?? { messages: [], codes: [] };
    entry.messages.push(issue.message);
    entry.codes.push(issue.code);
    out.set(ref, entry);
  }
  return out;
}

/**
 * Which inspector field each code points at, by `data-attention` on the field.
 * The inspector shakes the ones named when the question is opened, so the
 * author sees what to fill rather than reading which it is.
 */
export const ATTENTION_FIELD: Record<string, string> = {
  payment_gateway_no_account: "payment-account",
  payment_bad_amount: "payment-amount",
  payment_no_price_source: "payment-amount",
  payment_no_quantity_source: "payment-quantity",
  payment_no_amount_variable: "payment-amount",
  payment_branch_condition: "payment-account",
};

/** What is wrong with one question or ending, as the canvas and the banner draw it. */
export type NodeProblem = { level: "error" | "warning"; messages: string[]; attention?: boolean };

/**
 * Where the flow is broken, per node.
 *
 * From `lintFormDoc`, which is the same pass that decides whether the form
 * can be published, so the canvas and the banner cannot disagree with the
 * publish button. Only issues that name refs land on a node.
 */
export function publishProblems(doc: FormDoc): Map<string, NodeProblem> {
  const out = new Map<string, NodeProblem>();
  for (const issue of lintFormDoc(doc)) {
    if (!issue.refs?.length) continue;
    if (
      issue.code !== "unreachable_blocks" &&
      issue.code !== "no_route_to_ending" &&
      issue.code !== "dangling_target" &&
      // A route that can never run is a problem about this question's own
      // list of routes, so it belongs on this question's node and nowhere
      // else — it is the one warning the canvas can point at precisely.
      issue.code !== "unreachable_route" &&
      /*
       * And the four that are the same kind of thing: a route drawn on this
       * node whose condition cannot do what it says. A condition that is
       * always true, one that can never be true, one comparing a choice
       * question against something that is not one of its options, and an
       * exact match on a box the respondent types into freely. None of them
       * breaks the form, so none is an error — but each is an arm the author
       * believes in and the flow never takes, and the node is the only place
       * that can say so.
       */
      issue.code !== "always_true_route" &&
      issue.code !== "never_true_route" &&
      issue.code !== "value_not_an_option" &&
      issue.code !== "exact_match_on_free_text" &&
      // An ending nobody is sent to. The one thing worth saying about an
      // ending, and it belongs on the ending.
      issue.code !== "ending_unreachable"
    ) {
      continue;
    }
    for (const ref of issue.refs) {
      const existing = out.get(ref);
      if (existing) {
        existing.messages.push(issue.message);
        if (issue.level === "error") existing.level = "error";
      } else {
        out.set(ref, { level: issue.level, messages: [issue.message] });
      }
    }
  }
  // A question missing a setting it needs, drawn yellow ("needs attention")
  // unless its routes are already broken, which is the louder of the two.
  for (const [ref, a] of setupAttention(doc)) {
    if (!out.has(ref)) out.set(ref, { level: "warning", messages: a.messages, attention: true });
  }
  return out;
}

export type ProblemSummary = { level: "error" | "attention" | "warning"; count: number; ref: string };

/**
 * What the banner says, and which question or ending it goes to.
 *
 * Errors first: a form that cannot be published is a different message from
 * one that merely does less than it looks like it does. Within a level the
 * first in document order wins.
 */
export function summarizeProblems(doc: FormDoc, problems: Map<string, NodeProblem>): ProblemSummary | null {
  const order = [...doc.blocks.map((b) => b.ref), ...doc.endings.map((e) => e.ref)];
  const entries = [...problems.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  const errors = entries.filter(([, p]) => p.level === "error");
  // A question missing a setting blocks publishing too; it is not a route that merely does less.
  const attention = entries.filter(([, p]) => p.attention);
  const pick = errors.length > 0 ? errors : attention.length > 0 ? attention : entries;
  if (pick.length === 0) return null;
  const level = errors.length > 0 ? "error" : attention.length > 0 ? "attention" : "warning";
  return { level, count: pick.length, ref: pick[0]![0] };
}

/** Lint messages are written to explain; a toast has room for what to do. */
const SHORT_FIX: Record<string, string> = {
  payment_gateway_no_account: "connect a payment account",
  payment_bad_amount: "set a price",
  payment_no_price_source: "pick the question that sets the price",
  payment_no_quantity_source: "pick the question that counts people",
  payment_no_amount_variable: "pick the variable that holds the amount",
  payment_branch_condition: "remove the branch condition on this payment",
  payment_no_upi_id: "add a UPI ID",
  payment_bad_upi_id: "fix the UPI ID",
  payment_no_link: "add a payment link",
  unreachable_blocks: "nothing leads to this question",
  no_route_to_ending: "there's no way to finish from here",
  dangling_target: "a route points somewhere that no longer exists",
  missing_value: "a condition is missing its value",
  ending_unreachable: "nobody is sent to this ending",
};

/**
 * The first thing stopping a publish, in the order the form is read, with a
 * one-line reason. Null when the form can publish.
 */
export function firstBlockingIssue(doc: FormDoc): { ref: string | null; title: string; fix: string } | null {
  const errors = lintFormDoc(doc).filter((i) => i.level === "error");
  if (errors.length === 0) return null;
  const order = [...doc.blocks.map((b) => b.ref), ...doc.endings.map((e) => e.ref)];
  const rank = (i: LintIssue) => {
    const at = (i.refs ?? []).map((r) => order.indexOf(r)).filter((n) => n >= 0);
    return at.length ? Math.min(...at) : Number.MAX_SAFE_INTEGER;
  };
  const issue = [...errors].sort((a, b) => rank(a) - rank(b))[0]!;
  const ref = rank(issue) === Number.MAX_SAFE_INTEGER ? null : order[rank(issue)]!;
  const named =
    doc.blocks.find((b) => b.ref === ref)?.title || doc.endings.find((e) => e.ref === ref)?.title || ref;
  const fix = SHORT_FIX[issue.code] ?? issue.message.split(/(?<=\.)\s/)[0]!;
  return { ref, title: named ? `"${named}"` : "This form", fix: fix.charAt(0).toUpperCase() + fix.slice(1) };
}
