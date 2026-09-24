import { lintFormDoc, type FormDoc } from "@repo/form-schema";

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
