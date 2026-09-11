import type { FormDoc } from "../form-doc";
import type { Block } from "../blocks";
import { opsRequiringValue, type Condition, type ConditionGroup } from "../conditions";
import type { LogicRule } from "../logic";
import { isValidUpiId, UPI_CURRENCY } from "../payment-link";

type GotoRule = Extract<LogicRule, { action_kind: "goto" }>;

export interface LintIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
  /**
   * The blocks or endings this issue is about.
   *
   * The messages already named them, but only inside prose — so the only way to
   * show a problem where it lives was to parse an English sentence. The Flow
   * canvas marks the nodes in here, which is the difference between "publishing
   * is blocked, somewhere" and a red node you can click.
   */
  refs?: string[];
}

const REF_RE = /^[a-z][a-z0-9_]{1,40}$/;

/** Full lint pass — run before publish and after AI generation/import. Errors block publishing. */
export function lintFormDoc(doc: FormDoc): LintIssue[] {
  const issues: LintIssue[] = [];
  const blockRefs = new Set<string>();
  const blockIds = new Set<string>();
  const endingRefs = new Set<string>(doc.endings.map((e) => e.ref));
  const variableNames = new Set(doc.variables.map((v) => v.name));
  const hiddenNames = new Set(doc.hiddenFields.map((h) => h.name));
  const optionIdsByRef = new Map<string, Set<string>>();
  const itemIdsByRef = new Map<string, Set<string>>();

  const targetExists = (ref: string, kind: string, path: string) => {
    if (kind === "ending" ? !endingRefs.has(ref) : !blockRefs.has(ref)) {
      issues.push({ level: "error", code: "dangling_target", message: `Logic target "${ref}" (${kind}) does not exist`, path, refs: [ref] });
    }
  };

  const checkOperand = (operand: Condition["left"], path: string) => {
    if (operand.kind === "ref" && !blockRefs.has(operand.ref)) {
      issues.push({ level: "error", code: "dangling_operand", message: `Condition references unknown block "${operand.ref}"`, path });
    }
    if (operand.kind === "variable" && !variableNames.has(operand.name)) {
      issues.push({ level: "error", code: "dangling_operand", message: `Condition references unknown variable "${operand.name}"`, path });
    }
    if (operand.kind === "hidden" && !hiddenNames.has(operand.name)) {
      issues.push({ level: "error", code: "dangling_operand", message: `Condition references unknown hidden field "${operand.name}"`, path });
    }
  };

  const checkCondition = (c: Condition, path: string) => {
    checkOperand(c.left, path);
    if (opsRequiringValue.has(c.op) && c.value === undefined) {
      issues.push({ level: "error", code: "missing_value", message: `Operator "${c.op}" requires a value`, path });
    }
    if (c.op === "matches_regex" && typeof c.value === "string") {
      try {
        new RegExp(c.value);
      } catch {
        issues.push({ level: "error", code: "bad_regex", message: `Invalid regex "${c.value}"`, path });
      }
    }
    if ((c.op === "ranked_above" || c.op === "ranked_below") && (!Array.isArray(c.value) || c.value.length !== 2)) {
      issues.push({ level: "error", code: "bad_ranking_condition", message: "Ranking conditions need a two-item value [a, b]", path });
    }
  };

  const checkGroup = (g: ConditionGroup, path: string) => {
    g.conditions.forEach((c, i) => checkCondition(c, `${path}.conditions[${i}]`));
    g.groups.forEach((sub, i) => checkGroup(sub, `${path}.groups[${i}]`));
  };

  const checkRule = (r: LogicRule, path: string) => {
    if (r.when) checkGroup(r.when, `${path}.when`);
    if (r.action_kind === "goto") {
      targetExists(r.target, r.targetKind ?? "block", path);
      if (r.from && !blockRefs.has(r.from)) {
        issues.push({ level: "error", code: "dangling_operand", message: `Goto rule "from" references unknown block "${r.from}"`, path });
      }
    }
    if (r.action_kind === "set_variable" && !variableNames.has(r.variable)) {
      issues.push({ level: "error", code: "dangling_variable", message: `Rule targets unknown variable "${r.variable}"`, path });
    }
    if (r.action_kind === "add_score") {
      const v = doc.variables.find((x) => x.name === r.variable);
      if (!v) {
        issues.push({ level: "error", code: "dangling_variable", message: `Score rule targets unknown variable "${r.variable}"`, path });
      } else if (v.type !== "number") {
        issues.push({ level: "error", code: "score_var_not_number", message: `Score variable "${r.variable}" must be numeric`, path });
      }
    }
  };

  for (const b of doc.blocks) {
    if (blockRefs.has(b.ref)) {
      issues.push({ level: "error", code: "duplicate_ref", message: `Duplicate block ref "${b.ref}"`, path: `blocks.${b.id}` });
    }
    blockRefs.add(b.ref);
    if (blockIds.has(b.id)) {
      issues.push({ level: "error", code: "duplicate_id", message: `Duplicate block id "${b.id}"`, path: `blocks.${b.id}` });
    }
    blockIds.add(b.id);
    if (!REF_RE.test(b.ref)) {
      issues.push({ level: "error", code: "bad_ref", message: `Ref "${b.ref}" must match ${REF_RE}`, path: `blocks.${b.id}` });
    }
    if (b.type === "welcome" && doc.blocks.indexOf(b) !== 0) {
      issues.push({ level: "warning", code: "welcome_not_first", message: "Welcome block should be the first block", path: `blocks.${b.id}` });
    }
    const opts = "options" in b && Array.isArray(b.options) ? b.options : null;
    if (opts) optionIdsByRef.set(b.ref, new Set(opts.map((o) => o.id)));
    if ("items" in b && Array.isArray(b.items)) itemIdsByRef.set(b.ref, new Set(b.items.map((i) => i.id)));
    if ("visibility" in b && b.visibility) checkGroup(b.visibility, `blocks.${b.id}.visibility`);
  }

  doc.logic.forEach((r, i) => checkRule(r, `logic[${i}]`));
  doc.endingRules.forEach((r, i) => checkRule(r, `endingRules[${i}]`));

  if (doc.endings.length === 0) {
    issues.push({ level: "error", code: "no_ending", message: "Form needs at least one ending" });
  }

  /**
   * A screen-out has to be the exception, and it has to say why.
   *
   * Both of these are the mistake the feature invites. A form whose every
   * ending refuses is a form nobody can finish, which is never what was meant
   * and is invisible on the canvas — the nodes look identical to a working
   * form's. And a screen-out with no requirements and no message is the
   * "Registration Submitted Successfully" problem with the words changed: the
   * respondent is stopped and told nothing, so they retry, or they email.
   */
  const screenOuts = doc.endings.filter((e) => e.kind === "screen_out");
  if (screenOuts.length > 0 && screenOuts.length === doc.endings.length) {
    issues.push({
      level: "error",
      code: "no_success_ending",
      message:
        "Every ending on this form turns the respondent away, so there is no way to finish it. Add an ending that accepts the response.",
      refs: doc.endings.map((e) => e.ref),
    });
  }
  for (const e of screenOuts) {
    if (e.requirements.length === 0 && e.bodyMd.trim() === "") {
      issues.push({
        level: "warning",
        code: "screen_out_unexplained",
        message: `"${e.title}" turns the respondent away without saying why. List what they did not meet, or write a message.`,
        path: `endings.${e.id}`,
        refs: [e.ref],
      });
    }
    e.requirements.forEach((r, i) => {
      if (r.when) checkGroup(r.when, `endings.${e.id}.requirements[${i}].when`);
    });
  }

  // Reachability: BFS from the first block over each block's own outgoing edges.
  //
  // This used to pool every conditional goto target in the document into every
  // block's successor set, which made almost nothing detectable — a block was
  // "reachable" if it merely followed some other block in the list. An AI-built
  // survey that branched on a rating to two different follow-ups, with a
  // question sitting between them that no path could ever arrive at, linted
  // clean. Edges now come from the rules that actually leave a given block.
  const gotoFrom = new Map<string, GotoRule[]>();
  for (const r of doc.logic) {
    if (r.action_kind !== "goto") continue;
    if (!r.from) continue;
    const list = gotoFrom.get(r.from);
    if (list) list.push(r);
    else gotoFrom.set(r.from, [r]);
  }
  // A goto with no `from` can fire after any answer, so it stays global.
  const globalTargets = doc.logic
    .filter((r): r is GotoRule => r.action_kind === "goto" && !r.from)
    .filter((r) => (r.targetKind ?? "block") === "block")
    .map((r) => r.target);

  const adj = new Map<string, Set<string>>();
  doc.blocks.forEach((b, i) => {
    const set = new Set<string>(globalTargets);
    const rules = gotoFrom.get(b.ref) ?? [];
    for (const r of rules) {
      if ((r.targetKind ?? "block") === "block") set.add(r.target);
    }
    // Falling through to the next block is only possible when some answer
    // escapes every rule on this one.
    const next = doc.blocks[i + 1];
    if (next && !rulesAreExhaustive(b, rules)) set.add(next.ref);
    adj.set(b.ref, set);
  });
  const visited = new Set<string>();
  const queue: string[] = [];
  const first = doc.blocks[0];
  if (first) queue.push(first.ref);
  while (queue.length > 0) {
    const ref = queue.shift()!;
    if (visited.has(ref)) continue;
    visited.add(ref);
    for (const t of adj.get(ref) ?? []) if (!visited.has(t)) queue.push(t);
  }
  const unreachable = doc.blocks.filter((b) => !visited.has(b.ref));
  if (unreachable.length > 0) {
    issues.push({
      level: "error",
      code: "unreachable_blocks",
      message: `No path reaches these questions, so nobody will ever be asked them: ${unreachable
        .map((b) => b.ref)
        .join(", ")}. Move them above the branch, or add a branch that reaches them.`,
      refs: unreachable.map((b) => b.ref),
    });
  }

  /**
   * Can every question still get someone to an ending?
   *
   * Reachability alone says nobody is stranded before a question; it says
   * nothing about being stranded after one. A branch aimed back up the list is
   * dropped elsewhere, but a question whose every route leads into a pocket
   * with no ending in it leaves the respondent with no way to finish — the form
   * simply stops. That is invisible in the builder and terminal for whoever is
   * filling it in, so it is an error, not a warning.
   *
   * Walked backwards from the ends: a block terminates if it can jump to an
   * ending, if it is last in the list (falling off the end finishes the form),
   * or if anything it reaches terminates.
   */
  const endsSomewhere = new Set<string>();
  for (const b of doc.blocks) {
    const rules = gotoFrom.get(b.ref) ?? [];
    if (rules.some((r) => (r.targetKind ?? "block") === "ending")) endsSomewhere.add(b.ref);
  }
  const last = doc.blocks[doc.blocks.length - 1];
  // Falling off the end of the list completes the form, but only if some answer
  // actually escapes the rules on that last question.
  if (last && !rulesAreExhaustive(last, gotoFrom.get(last.ref) ?? [])) endsSomewhere.add(last.ref);
  // Fixed point: cheap at these sizes, and it needs no cycle handling.
  for (let pass = 0; pass < doc.blocks.length; pass++) {
    let grew = false;
    for (const b of doc.blocks) {
      if (endsSomewhere.has(b.ref)) continue;
      for (const t of adj.get(b.ref) ?? []) {
        if (endsSomewhere.has(t)) {
          endsSomewhere.add(b.ref);
          grew = true;
          break;
        }
      }
    }
    if (!grew) break;
  }
  const stranded = doc.blocks.filter((b) => visited.has(b.ref) && !endsSomewhere.has(b.ref));
  if (stranded.length > 0) {
    issues.push({
      level: "error",
      code: "no_route_to_ending",
      message: `From these questions there is no route to an ending, so the conversation stops with no way to finish: ${stranded
        .map((b) => b.ref)
        .join(", ")}. Point the last one at an ending.`,
      refs: stranded.map((b) => b.ref),
    });
  }

  /**
   * A route below a route that already catches everything it does.
   *
   * `applyLogicRules` returns the FIRST matching goto, so the routes on a
   * question are read top to bottom and the rest are never consulted. That is
   * invisible in an editor that draws them as a list of peers, and it cost a
   * real form: an intake for 6-to-25-year-olds routed "≥ 6 → carry on", then
   * "< 6 → referral", then "> 25 → referral". A 40-year-old matched the first
   * rule and was taken through as eligible; the arm written for them sat two
   * rows below and could never fire. Nothing said so — the flow was drawn
   * exactly as the author had built it, and it was wrong.
   *
   * A warning rather than an error: the form works, it just does less than it
   * says, and what to do about it is the author's call — widen the first route
   * into a range, or move this one above it.
   *
   * Only what can be decided from the numbers is reported. A route is read as
   * an interval when every one of its conditions is a comparison on the
   * branch's own question joined by "and"; anything else — a text match, a
   * mixture of questions, an "any of" — is left alone, which errs towards
   * saying nothing rather than towards a warning nobody can act on.
   */
  for (const [from, rules] of gotoFrom) {
    const spans = rules.map((r) => numericSpan(r, from));
    for (let later = 1; later < rules.length; later++) {
      const mine = spans[later];
      if (!mine) continue;
      const shadow = spans.findIndex((s, earlier) => earlier < later && s !== null && covers(s, mine));
      if (shadow === -1) continue;
      const block = doc.blocks.find((b) => b.ref === from);
      issues.push({
        level: "warning",
        code: "unreachable_route",
        message:
          `On "${block?.title || from}", route ${later + 1} can never run: route ${shadow + 1} above it already ` +
          `matches every answer it does. Give route ${shadow + 1} an upper and a lower bound, or move route ` +
          `${later + 1} above it.`,
        refs: [from],
      });
    }
  }

  // Required blocks must not be permanently hidden (always-false visibility is hard to detect;
  // flag empty OR groups which evaluate true, and empty AND groups which also evaluate true — fine).
  // Payment blocks: warn if form has no notification email configured.
  const hasPayment = doc.blocks.some((b) => b.type === "payment");
  if (hasPayment && doc.settings.onComplete.notificationEmails.length === 0) {
    issues.push({ level: "warning", code: "payment_no_notification", message: "Payment form has no notification email configured" });
  }

  // A payment block with nowhere to pay is worse than no payment block: the
  // respondent reaches it, finds a dead end, and abandons the whole form. The
  // schema keeps these fields optional so a half-built block still saves, so
  // the requirement is enforced here, at publish.
  for (const b of doc.blocks) {
    if (b.type !== "payment") continue;
    if (b.method === "upi") {
      if (!b.upiId?.trim()) {
        issues.push({
          level: "error",
          code: "payment_no_upi_id",
          message: `"${b.title || b.ref}" collects payment over UPI but has no UPI ID.`,
        });
      } else if (!isValidUpiId(b.upiId)) {
        issues.push({
          level: "error",
          code: "payment_bad_upi_id",
          message: `"${b.upiId}" is not a valid UPI ID. It should look like name@bank.`,
        });
      }
      if (b.currency.toUpperCase() !== UPI_CURRENCY) {
        issues.push({
          level: "warning",
          code: "payment_upi_currency",
          message: `UPI only settles in ${UPI_CURRENCY}, but "${b.title || b.ref}" is set to ${b.currency}. The payer will be charged in ${UPI_CURRENCY}.`,
        });
      }
    } else if (!b.url?.trim()) {
      issues.push({
        level: "error",
        code: "payment_no_link",
        message: `"${b.title || b.ref}" collects payment but has no payment link.`,
      });
    }
  }

  return issues;
}

export function hasErrors(issues: LintIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function findBlock(doc: FormDoc, ref: string): Block | undefined {
  return doc.blocks.find((b) => b.ref === ref);
}

/**
 * Do this block's rules cover every possible answer?
 *
 * Exported because the flow canvas needs the same answer: when every answer is
 * spoken for there is no "otherwise" path, and drawing one is a wire to
 * somewhere nobody ever goes.
 *
 * When they do, nobody ever falls through to the next block in the list, and
 * anything sitting there is dead. Only the two shapes that actually occur are
 * detected — every option of a choice question spoken for, and a pair of
 * numeric comparisons that between them leave no gap. Anything subtler is
 * treated as non-exhaustive, which errs toward calling a block reachable and
 * so never invents a problem that is not there.
 */
export function rulesAreExhaustive(block: Block, rules: GotoRule[]): boolean {
  const conds: { op: string; value: unknown }[] = [];
  for (const r of rules) {
    const w = r.when;
    // Anything compound is beyond what this is willing to reason about.
    if (!w || w.groups.length > 0 || w.conditions.length !== 1) {
      // An unconditional rule leaving this block takes everyone with it.
      if (w && w.groups.length === 0 && w.conditions.length === 0) return true;
      return false;
    }
    const c = w.conditions[0]!;
    if (c.left.kind !== "ref" || c.left.ref !== block.ref) return false;
    conds.push({ op: c.op, value: c.value });
  }
  if (conds.length === 0) return false;

  const options = "options" in block ? block.options : undefined;
  if (options && options.length > 0 && conds.every((c) => c.op === "eq")) {
    const covered = new Set(conds.map((c) => String(c.value)));
    return options.every((o) => covered.has(o.id));
  }

  /**
   * A yes/no or a consent answers a boolean, so `eq true` beside `eq false`
   * leaves nothing over.
   *
   * This is the shape a two-armed branch actually takes and it was the one
   * shape not detected: neither type has an `options` array, so the check above
   * skipped them, and a Yes/No with BOTH answers explicitly routed was reported
   * as having a fall-through. The canvas then drew an "otherwise" row under the
   * two arms — a wire to somewhere no respondent can ever go, on the most
   * common branch in the product.
   */
  if ((block.type === "yes_no" || block.type === "legal_consent") && conds.every((c) => c.op === "eq")) {
    const covered = new Set(conds.map((c) => String(c.value)));
    if (covered.has("true") && covered.has("false")) return true;
  }

  const has = (op: string) => conds.find((c) => c.op === op);
  if (has("is_empty") && has("is_not_empty")) return true;
  // Complements by definition: `left === true` against `left !== true`.
  if (has("is_checked") && has("is_not_checked")) return true;
  const eq = has("eq");
  const neq = has("neq");
  if (eq && neq && String(eq.value) === String(neq.value)) return true;

  // Numeric halves: `<= n` together with `>= m` leave nothing out when m <= n + 1.
  const lower = conds.find((c) => c.op === "lte" || c.op === "lt");
  const upper = conds.find((c) => c.op === "gte" || c.op === "gt");
  if (lower && upper && typeof lower.value === "number" && typeof upper.value === "number") {
    const highestCoveredBelow = lower.op === "lte" ? lower.value : lower.value - 1;
    const lowestCoveredAbove = upper.op === "gte" ? upper.value : upper.value + 1;
    if (lowestCoveredAbove <= highestCoveredBelow + 1) return true;
  }
  return false;
}

/** One end of a comparison: the number, and whether the number itself counts. */
interface Bound {
  value: number;
  inclusive: boolean;
}

/** The stretch of the number line a route matches, when it is expressible as one. */
interface Span {
  low: Bound | null;
  high: Bound | null;
}

/**
 * A route as a stretch of the number line, or null when it is not one.
 *
 * Null for everything this is not willing to reason about: a text or option
 * test, a condition on some other question, an "any of" group, a route with no
 * conditions at all (which is the "otherwise" rule and catches the leftovers by
 * design).
 */
function numericSpan(rule: GotoRule, from: string): Span | null {
  const when = rule.when;
  if (!when || when.op !== "and" || when.groups.length > 0 || when.conditions.length === 0) return null;
  const span: Span = { low: null, high: null };
  for (const c of when.conditions) {
    if (c.left.kind !== "ref" || c.left.ref !== from) return null;
    if (typeof c.value !== "number") return null;
    const at = { value: c.value, inclusive: c.op === "gte" || c.op === "lte" || c.op === "eq" };
    if (c.op === "gt" || c.op === "gte") span.low = widest(span.low, at, "low");
    else if (c.op === "lt" || c.op === "lte") span.high = widest(span.high, at, "high");
    else if (c.op === "eq") {
      span.low = widest(span.low, at, "low");
      span.high = widest(span.high, at, "high");
    } else return null;
  }
  return span.low || span.high ? span : null;
}

/** Two bounds of the same end, ANDed: the tighter one wins. */
function widest(current: Bound | null, next: Bound, end: "low" | "high"): Bound {
  if (!current) return next;
  const tighter = end === "low" ? next.value > current.value : next.value < current.value;
  if (tighter) return next;
  if (next.value !== current.value) return current;
  return { value: current.value, inclusive: current.inclusive && next.inclusive };
}

/** Does `outer` match every number `inner` matches? */
function covers(outer: Span, inner: Span): boolean {
  const lowOk =
    !outer.low ||
    (inner.low !== null &&
      (outer.low.value < inner.low.value ||
        (outer.low.value === inner.low.value && (outer.low.inclusive || !inner.low.inclusive))));
  const highOk =
    !outer.high ||
    (inner.high !== null &&
      (outer.high.value > inner.high.value ||
        (outer.high.value === inner.high.value && (outer.high.inclusive || !inner.high.inclusive))));
  return lowOk && highOk;
}
