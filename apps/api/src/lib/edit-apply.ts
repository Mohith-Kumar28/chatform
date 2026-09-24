import { FormDoc, buildFlowRules, lintFormDoc, type Block } from "@repo/form-schema";
import type { EditDraft } from "./ai.js";
import {
  applyBlockConfig,
  applyPriceFrom,
  applyQuantityFrom,
  normalizeDraftEndings,
  normalizeEditBlocks,
  parseBlockConfig,
  resolveBranches,
} from "./draft-normalize.js";

/**
 * Turning a proposed edit into a document.
 *
 * This lived inside `editFormHandler` as a closure, which made it unreachable
 * from a test: 150 lines of document surgery behind a route that needs an
 * OpenRouter key and a D1 row. Lifted out unchanged — every comment here was
 * written against a bug that shipped, so they travel with the code.
 *
 * It is also the seam the tool loop needs. Tools accumulate an `EditDraft` and
 * this stays the single place a proposal becomes a `FormDoc`, so there is one
 * writer no matter which way the draft was produced.
 */

export interface EditApplication {
  doc: FormDoc;
  added: Block[];
  removed: string[];
  updated: string[];
  /**
   * `buildFlowRules`' own output shape, not `FormDoc["logic"]`: these are rules
   * on their way INTO the document, and `FormDoc.parse` below is what fills in
   * the defaults that make them the stricter parsed type.
   */
  newRules: ReturnType<typeof buildFlowRules>;
  /** How many existing routes this edit superseded. */
  rewired: number;
  endingChanges: string[];
}

/**
 * One draft applied to a fresh copy of the form.
 *
 * A function rather than straight-line code so the same surgery can run a
 * second time on a corrected draft — see the retry in `editFormHandler` —
 * without the first attempt's changes already in the document.
 */
export function applyEditDraft(base: FormDoc, draft: EditDraft): EditApplication {
  const doc = structuredClone(base);

  // ─── removals first, so a ref freed here can be reused below ───
  const removable = new Set(
    doc.blocks
      .filter((b) => b.type !== "welcome")
      .map((b) => b.ref),
  );
  const removed = draft.removeRefs.filter((ref) => removable.has(ref));
  if (removed.length > 0) {
    const gone = new Set(removed);
    doc.blocks = doc.blocks.filter((b) => !gone.has(b.ref));
    // A rule pointing at, or hanging off, a question that no longer exists is
    // a dead end rather than a route.
    doc.logic = doc.logic.filter(
      (r) => !(r.action_kind === "goto" && ((r.from && gone.has(r.from)) || ((r.targetKind ?? "block") === "block" && gone.has(r.target)))),
    );
  }

  /**
   * ─── settings changed on questions that are already here ───
   *
   * Before removals would be wrong (a question on its way out has no
   * settings worth changing) and after additions would be ambiguous, since
   * a new block's ref may collide with one of these. Between the two, every
   * ref in `updateBlocks` names a question that was in the form when the
   * model read it, which is the only thing it can honestly be talking about.
   */
  const updated: string[] = [];
  for (const u of draft.updateBlocks ?? []) {
    const at = doc.blocks.findIndex((b) => b.ref === u.ref);
    if (at < 0) continue;
    const current = doc.blocks[at]!;
    const configured = applyBlockConfig(current, u.config);
    const description = u.description?.trim().slice(0, 5000);
    const next =
      description && description !== current.description
        ? { ...(configured ?? current), description }
        : configured;
    // Null means the config named nothing this type reads, or asked for what
    // is already true. Either way it is not a change, and counting it as one
    // would let an edit that does nothing pass the "must change something"
    // check in the route.
    if (!next) continue;
    doc.blocks[at] = next;
    updated.push(u.ref);
  }

  // ─── additions, each where the model asked for it ───
  // Resolving against the list as it grows lets one new block follow another.
  // Appending everything to the end — which is all this route used to do —
  // puts the arms of a condition below the questions they should skip.
  const existingRefs = new Set(doc.blocks.map((b) => b.ref));
  const { blocks: proposed, optionIdsByRef, renamed } = normalizeEditBlocks(draft, existingRefs);

  const added: Block[] = [];
  for (const { block, insertAfter } of proposed) {
    const anchor = renamed.get(insertAfter) ?? insertAfter;
    const at = anchor ? doc.blocks.findIndex((x) => x.ref === anchor) : -1;
    if (at >= 0) doc.blocks.splice(at + 1, 0, block);
    else doc.blocks.push(block);
    added.push(block);
  }

  // Option ids for questions that were already here come from the form
  // itself; only the new ones come from this draft.
  for (const b of doc.blocks) {
    if (optionIdsByRef.has(b.ref)) continue;
    if ("options" in b && Array.isArray(b.options)) {
      optionIdsByRef.set(
        b.ref,
        new Map((b.options as { id: string; label: string }[]).map((o) => [o.label.toLowerCase(), o.id])),
      );
    }
  }

  /*
   * ─── prices that depend on an earlier answer ───
   *
   * After additions, so `price_from` can name a choice question this same edit
   * adds ("add a plan question and charge by it"). A payment that gains a price
   * list counts as changed even when nothing else about it moved.
   */
  const priceConfigs: [string, string | undefined][] = [
    ...(draft.updateBlocks ?? []).map((u): [string, string | undefined] => [u.ref, u.config]),
    ...draft.addBlocks.map((b): [string, string | undefined] => [renamed.get(b.ref) ?? b.ref, b.config]),
  ];
  for (const [ref, raw] of priceConfigs) {
    const at = doc.blocks.findIndex((b) => b.ref === ref);
    if (at < 0 || doc.blocks[at]!.type !== "payment") continue;
    const before = doc.blocks[at]!;
    const config = parseBlockConfig(raw);
    const next = applyQuantityFrom(applyPriceFrom(before, config, doc.blocks, renamed), config, doc.blocks, renamed);
    if (next === before) continue;
    doc.blocks[at] = next;
    const addedAt = added.indexOf(before);
    if (addedAt >= 0) added[addedAt] = next;
    else if (!updated.includes(ref)) updated.push(ref);
  }

  /**
   * ─── outcomes, before the wiring that points at them ───
   *
   * Order is the whole reason this sits here: a branch in the same edit
   * routinely names the ending the same edit is adding ("if they don't meet
   * the requirements, tell them they can't submit"), and `buildFlowRules`
   * only accepts an ending ref it is given. Added after, the branch would
   * be dropped as dangling and the edit would land as questions with no
   * route to the outcome it just created.
   */
  const endingEdits = normalizeDraftEndings(draft.endings ?? [], doc.endings);
  const endingChanges: string[] = [];
  for (const e of endingEdits) {
    const at = doc.endings.findIndex((x) => x.ref === e.ref);
    if (at >= 0) {
      // Only count it when something actually differs, for the same reason
      // `applyBlockConfig` returns null: an edit has to change something.
      if (JSON.stringify(doc.endings[at]) !== JSON.stringify(e)) {
        doc.endings[at] = e;
        endingChanges.push(e.ref);
      }
    } else if (doc.endings.length < 20) {
      doc.endings.push(e);
      endingChanges.push(e.ref);
    }
  }

  const branches = resolveBranches(
    draft.branches.map((br) => ({
      ...br,
      whenRef: renamed.get(br.whenRef) ?? br.whenRef,
      then: renamed.get(br.then) ?? br.then,
    })),
    doc.blocks,
    optionIdsByRef,
  );
  const priorGotos = doc.logic.filter((r) => r.action_kind === "goto");
  const newRules = buildFlowRules(branches, doc.blocks, doc.endings.map((e) => e.ref), priorGotos);

  /**
   * Replacement is per ANSWER, not per question.
   *
   * The first version of this dropped every existing branch from any question
   * the model listed in `rewireRefs`, on the reasoning that its new branches
   * were then the whole truth. They are not reliably the whole truth: asked
   * to send Chrome users straight to the ending, the model rewired
   * `q_platform` and restated two of its three options — so the Android route
   * was deleted and iOS was quietly pointed at the wrong question. A model
   * that forgets one arm should cost that arm nothing.
   *
   * So an old rule is dropped only when a new rule speaks about exactly the
   * same question and the same condition. Anything the edit did not mention
   * keeps working.
   */
  const conditionKey = (from: string | null | undefined, when: unknown): string => {
    const conditions = (when as { conditions?: unknown[] } | undefined)?.conditions ?? [];
    return `${from ?? ""} ${JSON.stringify(conditions)}`;
  };
  const replaced = new Set(newRules.map((r) => conditionKey(r.action_kind === "goto" ? r.from : null, r.when)));
  const supersededCount = doc.logic.filter(
    (r) => r.action_kind === "goto" && replaced.has(conditionKey(r.from, r.when)),
  ).length;
  if (newRules.length > 0) {
    const kept = doc.logic.filter(
      (r) => !(r.action_kind === "goto" && replaced.has(conditionKey(r.from, r.when))),
    );
    doc.logic = FormDoc.parse({ ...doc, logic: [...kept, ...newRules] }).logic;
  }
  const rewired = supersededCount;
  return { doc, added, removed, updated, newRules, rewired, endingChanges };
}

/**
 * What an edit changed, in the fewest words that still say it.
 *
 * For the reviewer, which is judging the change rather than the form. A diff
 * beats the document here for the same reason it does in code review: given
 * the whole form, a reviewer starts having opinions about the parts nobody
 * touched.
 */
export function describeEditChanges(before: FormDoc, applied: EditApplication): string {
  const lines: string[] = [];
  const title = (ref: string) =>
    applied.doc.blocks.find((b) => b.ref === ref)?.title ?? before.blocks.find((b) => b.ref === ref)?.title ?? ref;

  for (const b of applied.added) {
    const options = "options" in b && Array.isArray(b.options)
      ? ` [${(b.options as { label: string }[]).map((o) => o.label).join(", ")}]`
      : "";
    lines.push(`ADDED question "${b.title}" (${b.type})${options}`);
  }
  for (const ref of applied.removed) lines.push(`REMOVED question "${title(ref)}"`);
  for (const ref of applied.updated) {
    const now = applied.doc.blocks.find((b) => b.ref === ref);
    const was = before.blocks.find((b) => b.ref === ref);
    // Name the keys that actually differ, so "changed settings" is never the
    // whole report.
    const changed = now && was
      ? Object.keys(now).filter((k) => JSON.stringify((now as Record<string, unknown>)[k]) !== JSON.stringify((was as Record<string, unknown>)[k]))
      : [];
    lines.push(`CHANGED question "${title(ref)}"${changed.length ? ` — ${changed.join(", ")}` : ""}`);
  }
  for (const ref of applied.endingChanges) {
    const e = applied.doc.endings.find((x) => x.ref === ref);
    lines.push(`${before.endings.some((x) => x.ref === ref) ? "CHANGED" : "ADDED"} ending "${e?.title ?? ref}" (${e?.kind ?? "success"})`);
  }
  for (const r of applied.newRules) {
    if (r.action_kind !== "goto") continue;
    const to = applied.doc.endings.some((e) => e.ref === r.target) ? `the "${r.target}" ending` : `"${title(r.target)}"`;
    const conditions = (r.when as { conditions?: unknown[] } | null)?.conditions ?? [];
    lines.push(
      conditions.length === 0
        ? `ROUTED everyone from "${title(r.from ?? "")}" to ${to}`
        : `ROUTED one answer of "${title(r.from ?? "")}" to ${to}`,
    );
  }
  return lines.length > 0 ? lines.join("\n") : "nothing";
}

/**
 * The flow codes worth sending back to the model.
 *
 * Narrow on purpose: these three are the ways an edit leaves the form
 * structurally unfinishable, and they are the ones a model can act on from the
 * message alone. A payment block with no UPI id is also an error, and is not
 * this function's business — it is the author's to fill in.
 */
const FLOW_CODES = new Set(["unreachable_blocks", "no_route_to_ending", "dangling_target"]);

type LintIssue = ReturnType<typeof lintFormDoc>[number];

function flowProblems(doc: FormDoc): LintIssue[] {
  return lintFormDoc(doc).filter((i) => FLOW_CODES.has(i.code));
}

function problemKeys(issues: LintIssue[]): string[] {
  return issues.flatMap((i) => (i.refs?.length ? i.refs.map((r) => `${i.code}:${r}`) : [`${i.code}:${i.message}`]));
}

/**
 * Flow problems this edit INTRODUCED, ignoring any the form already had.
 *
 * A form that was already broken is not the request's fault, and telling the
 * model to fix something it did not cause spends a turn and invites it to
 * "fix" the part that was working.
 */
export function introducedFlowProblems(base: FormDoc, next: FormDoc): LintIssue[] {
  const preexisting = new Set(problemKeys(flowProblems(base)));
  return flowProblems(next).filter((i) => problemKeys([i]).some((k) => !preexisting.has(k)));
}
