import {
  FormDoc,
  conditionIsAlwaysFalse,
  conditionIsAlwaysTrue,
  lintFormDoc,
  type Block,
  type Condition,
  type ConditionGroup,
} from "@repo/form-schema";
import type { GenerationDraft } from "../ai.js";
import { draftToDoc, pruneOrphanEndings } from "../draft-normalize.js";
import { uniqueRef } from "../form-import.js";
import type { ImportedConditionGroup, ImportedForm, ImportedItem, ImportReport } from "./types.js";

/**
 * An imported form as a FormDoc, by code alone.
 *
 * The blocks go through `draftToDoc`, the same normalizer every generated form
 * does, so an imported question is indistinguishable from one the AI wrote:
 * same ids, same option ids, same defaults. What that normalizer cannot carry
 * (a scale's end labels, an "Other" box, a button label) is put back after.
 *
 * The flow does NOT go through the generator's branch inference. That code is
 * a net under a model that forgets to rejoin its arms, and it infers jumps a
 * source form never had. A source form states its jumps exactly, and its
 * semantics are ours (fire after the question, carry on from where you land),
 * so each jump is written as one goto rule, in the source's order.
 *
 * Titles are copied as written. The chat interviewer already puts every
 * question in its own words; rephrasing "Your first name" here as well would
 * only move the result away from the form the author recognises.
 */
export function importedToDoc(form: ImportedForm): { doc: FormDoc; report: ImportReport } {
  const taken = new Set<string>(["welcome"]);
  const refOf = new Map<string, string>();
  const notCopied = new Set(form.notCopied);

  const blocks: GenerationDraft["blocks"] = [
    {
      ref: "welcome",
      type: "welcome",
      title: clip(form.welcome?.title || form.title || "Welcome", 2000),
      description: clip(form.welcome?.description ?? form.description, 5000),
      required: false,
      options: [],
      scale: 0,
      config: "",
    },
  ];
  for (const item of form.items) {
    const ref = uniqueRef(item.title || item.type, taken);
    refOf.set(item.key, ref);
    blocks.push({
      ref,
      type: item.type,
      title: clip(item.title || "Untitled question", 2000),
      description: clip(item.description, 5000),
      required: item.required,
      options: item.options.map((o) => clip(o, 500)).filter(Boolean),
      scale: Math.max(0, Math.min(20, item.scale)),
      config: item.config,
    });
  }
  if (blocks.length < 2) throw new Error("no questions");

  const sourceEndings = form.endings.length > 0 ? form.endings : [{ key: "", title: "Thank you!", body: "" }];
  const draft: GenerationDraft = {
    title: clip(form.title || "Imported form", 200),
    description: clip(form.description, 2000),
    blocks,
    endings: sourceEndings.map((e, i) => ({
      ref: `end_${i + 1}`,
      title: clip(e.title || "Thank you!", 2000),
      body: clip(e.body, 10000),
      kind: "success" as const,
      requirements: "",
      redirectUrl: e.redirectUrl ?? "",
    })),
    branches: [],
  };

  const normalized = draftToDoc(draft).doc;
  const endingRef = new Map<string, string>();
  sourceEndings.forEach((e, i) => {
    const ref = normalized.endings[i]?.ref;
    if (ref) endingRef.set(e.key, ref);
  });
  const defaultEnding = normalized.endings[0]!.ref;

  // Exact values the draft had nowhere to put.
  const itemByRef = new Map(form.items.map((it) => [refOf.get(it.key)!, it]));
  const docBlocks = normalized.blocks.map((block) => {
    if (block.type === "welcome") {
      return form.welcome?.buttonLabel ? ({ ...block, buttonLabel: clip(form.welcome.buttonLabel, 40) } as Block) : block;
    }
    const item = itemByRef.get(block.ref);
    return item ? exactly(block, item) : block;
  });

  const endings = normalized.endings.map((ending, i) => {
    const src = sourceEndings[i];
    if (!src || !src.ctaLabel || !src.ctaUrl) return ending;
    return { ...ending, ctaLabel: clip(src.ctaLabel, 60), ctaUrl: src.ctaUrl };
  });

  // The flow, one source jump to one rule.
  const index = new Map(docBlocks.map((b, i) => [b.ref, i]));
  const byRef = new Map(docBlocks.map((b) => [b.ref, b]));
  const logic: FormDoc["logic"] = [];
  let lost = 0;
  for (const jump of form.jumps) {
    const from = refOf.get(jump.fromKey);
    const source = from ? byRef.get(from) : undefined;
    if (!from || !source) {
      lost++;
      continue;
    }
    let target: string | undefined;
    let targetKind: "block" | "ending";
    if (jump.to.kind === "ending") {
      target = endingRef.get(jump.to.key) ?? defaultEnding;
      targetKind = "ending";
    } else {
      target = refOf.get(jump.to.key);
      targetKind = "block";
      // A jump backwards loops a respondent forever; one into nowhere strands them.
      if (!target || !index.has(target) || index.get(target)! <= index.get(from)!) {
        lost++;
        continue;
      }
    }
    const converted = jump.when ? group(jump.when, form, refOf, byRef) : emptyGroup();
    if (!converted) {
      lost++;
      continue;
    }
    // "Rating is 6+ or empty" on a required rating: the empty half can never
    // happen here, and left in it draws a route the form never takes.
    const when = simplify(converted, byRef);
    if (when === "never") continue;
    const always = when.conditions.length === 0 && when.groups.length === 0;
    // "Always go to the next question" is what happens anyway.
    if (always && targetKind === "block" && index.get(target!) === index.get(from)! + 1) continue;
    logic.push({ id: ruleId(), action_kind: "goto", from, when, target: target!, targetKind });
  }
  if (lost > 0) {
    notCopied.add(`${lost} ${lost === 1 ? "jump" : "jumps"} that pointed backwards or at something not copied`);
  }

  const hiddenFields = [...new Set(form.hiddenFields)]
    .filter((name) => /^[a-zA-Z_][a-zA-Z0-9_.-]{0,60}$/.test(name))
    .slice(0, 50)
    .map((name) => ({ name }));

  let parsed = FormDoc.parse({ ...normalized, blocks: docBlocks, endings, logic, hiddenFields });
  /*
   * Steps nobody can reach any more. In the source they were reached through a
   * rule we could not copy (typically "if an earlier answer was X, go to this
   * booking screen"), so here they sit behind jumps that skip them, and the
   * linter refuses to publish a form with dead steps. Removed, and said.
   */
  const before = parsed.blocks.length;
  for (let pass = 0; pass < 3; pass++) {
    const dead = new Set(
      lintFormDoc(parsed)
        .filter((i) => i.code === "unreachable_blocks")
        .flatMap((i) => i.refs ?? []),
    );
    if (dead.size === 0) break;
    parsed = FormDoc.parse({
      ...parsed,
      blocks: parsed.blocks.filter((b) => !dead.has(b.ref)),
      logic: parsed.logic.filter((r) => r.action_kind !== "goto" || (!dead.has(r.from ?? "") && !dead.has(r.target))),
    });
  }
  const unreachable = before - parsed.blocks.length;
  if (unreachable > 0) {
    notCopied.add(`${unreachable} ${unreachable === 1 ? "step" : "steps"} only reachable through rules that weren't copied`);
  }
  const doc = pruneOrphanEndings(parsed);
  // Parsed once more so a pruned document is still a valid one.
  const final = FormDoc.parse(doc);
  const report: ImportReport = {
    provider: form.provider,
    sourceUrl: form.url,
    questions: final.blocks.filter((b) => b.type !== "welcome" && b.type !== "statement").length,
    branches: final.logic.filter((r) => r.action_kind === "goto" && (r.when?.conditions.length ?? 0) + (r.when?.groups.length ?? 0) > 0).length,
    endings: final.endings.length,
    notCopied: [...notCopied],
    closed: form.closed,
  };
  return { doc: final, report };
}

/** Problems worth refusing to publish over, for callers that publish at once. */
export function importIssues(doc: FormDoc) {
  return lintFormDoc(doc).filter((i) => i.level === "error");
}

function exactly(block: Block, item: ImportedItem): Block {
  let next = { ...block } as Record<string, unknown>;
  if (item.description) next.description = clip(item.description, 5000);
  if (item.placeholder && (block.type === "short_text" || block.type === "long_text")) next.placeholder = clip(item.placeholder, 200);
  if ("allowOther" in block && item.allowOther) next.allowOther = true;
  const e = item.exact;
  if (e) {
    if (block.type === "opinion_scale") {
      // The normalizer caps steps for a model's guess; a source's own count stands where the schema allows it.
      next = {
        ...next,
        steps: Math.max(2, Math.min(11, item.scale || block.steps)),
        ...(e.startAt !== undefined ? { startAt: e.startAt } : {}),
        ...(e.labelLow ? { labelLow: clip(e.labelLow, 100) } : {}),
        ...(e.labelHigh ? { labelHigh: clip(e.labelHigh, 100) } : {}),
      };
    }
    if (block.type === "nps") {
      next = { ...next, ...(e.labelLow ? { labelLow: clip(e.labelLow, 100) } : {}), ...(e.labelHigh ? { labelHigh: clip(e.labelHigh, 100) } : {}) };
    }
    if (block.type === "rating" && e.shape) next.shape = e.shape;
    if (block.type === "picture_choice" && e.multiSelect !== undefined) next.multiSelect = e.multiSelect;
    if (block.type === "statement" && e.buttonLabel) next.buttonLabel = clip(e.buttonLabel, 40);
  }
  return next as Block;
}

const emptyGroup = (): ConditionGroup => ({ op: "and", conditions: [], groups: [] });

/**
 * Drop the halves of a condition that can never, or always, hold (an
 * emptiness test on a required question), the way `buildFlowRules` does for a
 * model's branches. "never" when the whole group can never be true.
 */
function simplify(g: ConditionGroup, byRef: Map<string, Block>): ConditionGroup | "never" {
  const conditions: Condition[] = [];
  const groups: ConditionGroup[] = [];
  let always = false;
  for (const c of g.conditions) {
    const block = c.left.kind === "ref" ? byRef.get(c.left.ref) : undefined;
    const isFalse = conditionIsAlwaysFalse(c, block);
    const isTrue = conditionIsAlwaysTrue(c, block);
    if (g.op === "and") {
      if (isFalse) return "never";
      if (!isTrue) conditions.push(c);
    } else {
      if (isTrue) always = true;
      else if (!isFalse) conditions.push(c);
    }
  }
  for (const sub of g.groups) {
    const s = simplify(sub, byRef);
    const empty = s !== "never" && s.conditions.length === 0 && s.groups.length === 0;
    if (g.op === "and") {
      if (s === "never") return "never";
      if (!empty) groups.push(s);
    } else if (s !== "never") {
      if (empty) always = true;
      else groups.push(s);
    }
  }
  if (g.op === "or") {
    if (always) return emptyGroup();
    if (conditions.length === 0 && groups.length === 0) return "never";
  }
  return { op: g.op, conditions, groups };
}

/** A source condition group as ours, or null when a value cannot be matched to an answer. */
function group(
  g: ImportedConditionGroup,
  form: ImportedForm,
  refOf: Map<string, string>,
  byRef: Map<string, Block>,
): ConditionGroup | null {
  const conditions: Condition[] = [];
  for (const c of g.conditions) {
    const ref = refOf.get(c.itemKey);
    const block = ref ? byRef.get(ref) : undefined;
    if (!ref || !block) return null;
    const item = form.items.find((it) => it.key === c.itemKey);
    const condition = conditionFor(block, item, c.op, c.value);
    if (!condition) return null;
    conditions.push({ left: { kind: "ref", ref }, ...condition });
  }
  const groups: ConditionGroup[] = [];
  for (const sub of g.groups) {
    const converted = group(sub, form, refOf, byRef);
    if (!converted) return null;
    groups.push(converted);
  }
  return { op: g.op, conditions, groups };
}

function conditionFor(
  block: Block,
  item: ImportedItem | undefined,
  op: ImportedConditionGroup["conditions"][number]["op"],
  raw: ImportedConditionGroup["conditions"][number]["value"],
): Pick<Condition, "op" | "value"> | null {
  if (op === "is_empty" || op === "is_not_empty") return { op };
  if (raw === undefined) return null;

  const options = "options" in block && Array.isArray(block.options) ? (block.options as { id: string; label: string }[]) : null;
  if (typeof raw === "object") {
    // An answer named by the source's option id: its label, then our id for that label.
    const at = item?.optionKeys?.indexOf(raw.optionKey) ?? -1;
    const label = at >= 0 ? item!.options[at]!.trim().toLowerCase() : "";
    const hit = options?.find((o) => o.label.trim().toLowerCase() === label);
    if (!hit) return null;
    if (block.type === "multi_select") return { op: op === "neq" ? "not_includes" : "includes", value: hit.id };
    if (op !== "eq" && op !== "neq") return null;
    return { op, value: hit.id };
  }
  if (block.type === "yes_no" || block.type === "legal_consent") {
    const truthy = raw === true || (typeof raw === "string" && /^(true|yes)$/i.test(raw));
    const falsy = raw === false || (typeof raw === "string" && /^(false|no)$/i.test(raw));
    if (!truthy && !falsy) return null;
    return { op, value: truthy };
  }
  if (block.type === "number" || block.type === "rating" || block.type === "nps" || block.type === "opinion_scale") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return null;
    return { op, value: n };
  }
  // A choice compared by its label (Google, and Tally text values).
  if (options && typeof raw === "string") {
    const hit = options.find((o) => o.label.trim().toLowerCase() === raw.trim().toLowerCase());
    if (!hit) return null;
    if (block.type === "multi_select") return { op: op === "neq" ? "not_includes" : "includes", value: hit.id };
    return { op, value: hit.id };
  }
  return { op, value: typeof raw === "boolean" ? String(raw) : raw };
}

const ruleId = () => `rl_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

function clip(s: string, max: number): string {
  return (s ?? "").slice(0, max);
}
