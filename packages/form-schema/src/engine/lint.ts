import type { FormDoc } from "../form-doc";
import type { Block } from "../blocks";
import { opsRequiringValue, type Condition, type ConditionGroup } from "../conditions";
import type { LogicRule } from "../logic";

export interface LintIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
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
      issues.push({ level: "error", code: "dangling_target", message: `Logic target "${ref}" (${kind}) does not exist`, path });
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

  // Reachability: BFS from first block over goto edges + implicit fall-through edges.
  // Conservative model: every block falls through to the next; all conditional goto
  // targets add extra edges (never removes reachability).
  const conditionalTargets = new Set<string>();
  for (const r of doc.logic) {
    if (r.action_kind !== "goto" || (r.targetKind ?? "block") !== "block") continue;
    const isConditional = !!r.when && r.when.conditions.length + r.when.groups.length > 0;
    if (isConditional) {
      conditionalTargets.add(r.target);
    } else if (r.when === null) {
      // Unconditional goto — attribute to the block preceding it in rule order is ambiguous;
      // treat as a global redirect target set (conservative: adds reachability, never removes).
      conditionalTargets.add(r.target);
    }
  }
  const adj = new Map<string, Set<string>>();
  doc.blocks.forEach((b, i) => {
    const set = new Set<string>();
    const next = doc.blocks[i + 1];
    if (next) set.add(next.ref);
    for (const t of conditionalTargets) set.add(t);
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
    const pct = 1 - unreachable.length / doc.blocks.length;
    issues.push({
      level: pct < 0.95 ? "warning" : "warning",
      code: "unreachable_blocks",
      message: `Possibly unreachable blocks: ${unreachable.map((b) => b.ref).join(", ")}`,
    });
  }

  // Required blocks must not be permanently hidden (always-false visibility is hard to detect;
  // flag empty OR groups which evaluate true, and empty AND groups which also evaluate true — fine).
  // Payment blocks: warn if form has no notification email configured.
  const hasPayment = doc.blocks.some((b) => b.type === "payment");
  if (hasPayment && doc.settings.onComplete.notificationEmails.length === 0) {
    issues.push({ level: "warning", code: "payment_no_notification", message: "Payment form has no notification email configured" });
  }

  return issues;
}

export function hasErrors(issues: LintIssue[]): boolean {
  return issues.some((i) => i.level === "error");
}

export function findBlock(doc: FormDoc, ref: string): Block | undefined {
  return doc.blocks.find((b) => b.ref === ref);
}
