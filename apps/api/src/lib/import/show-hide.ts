import type { ImportedConditionGroup, ImportedItem, ImportedJump } from "./types.js";

/**
 * Show/hide rules, as jumps where they mean one. Shared by the builders that
 * work this way (Tally, Jotform): a field is hidden or shown by a condition on
 * another field, instead of the form jumping.
 *
 * - "Hide R when C", with R starting right after the question C reads: after
 *   that question, when C, go past R.
 * - "Show R when C" on the same shape: when C, go to R; otherwise go past it.
 *   Several shown runs off one question (Yes shows A, No shows B) each get
 *   their own jump in, and every run but the last jumps past the rest when it
 *   ends, so a respondent who took A never falls into B.
 *
 * Two rules showing the same run are one rule with their conditions OR'd,
 * which is what the builder does when both are true. Anything else (a rule
 * reading two questions, a target far from its question) is counted and
 * reported, not approximated.
 */
export interface VisibilityRule {
  /** The one question every condition reads, or null when they read several. */
  fromKey: string | null;
  when: ImportedConditionGroup | null;
  kind: "show" | "hide";
  /** Item keys, in any order; duplicates are fine. */
  targets: string[];
}

export function visibilityToJumps(rules: VisibilityRule[], items: ImportedItem[]): { jumps: ImportedJump[]; skipped: number } {
  const index = new Map(items.map((it, i) => [it.key, i]));
  const jumps: ImportedJump[] = [];
  let skipped = 0;
  /** Question → shown runs off it, keyed by the run's first item. */
  const shows = new Map<string, Map<string, { run: string[]; when: ImportedConditionGroup[] }>>();

  for (const rule of rules) {
    const from = rule.fromKey;
    const run = [...new Set(rule.targets.filter((k) => index.has(k)))].sort((x, y) => index.get(x)! - index.get(y)!);
    const contiguous = run.every((k, n) => n === 0 || index.get(k)! === index.get(run[n - 1]!)! + 1);
    if (!from || !index.has(from) || !rule.when || run.length === 0 || !contiguous || index.get(run[0]!)! <= index.get(from)!) {
      skipped++;
      continue;
    }
    if (rule.kind === "hide") {
      if (index.get(run[0]!)! !== index.get(from)! + 1) {
        skipped++;
        continue;
      }
      jumps.push({ fromKey: from, when: rule.when, to: past(run.at(-1)!) });
      continue;
    }
    const runs = shows.get(from) ?? new Map();
    const existing = runs.get(run[0]!);
    if (existing) existing.when.push(rule.when);
    else runs.set(run[0]!, { run, when: [rule.when] });
    shows.set(from, runs);
  }

  for (const [from, runs] of shows) {
    const ordered = [...runs.values()].sort((a, b) => index.get(a.run[0]!)! - index.get(b.run[0]!)!);
    // The runs must fill the space right after the question, one after another.
    let at = index.get(from)! + 1;
    const fits = ordered.every((r) => {
      const ok = index.get(r.run[0]!) === at;
      at = index.get(r.run.at(-1)!)! + 1;
      return ok;
    });
    if (!fits) {
      skipped += ordered.length;
      continue;
    }
    const end = past(ordered.at(-1)!.run.at(-1)!);
    for (const r of ordered) {
      const when = r.when.length === 1 ? r.when[0]! : { op: "or" as const, conditions: [], groups: r.when };
      jumps.push({ fromKey: from, when, to: { kind: "item", key: r.run[0]! } });
    }
    jumps.push({ fromKey: from, when: null, to: end });
    for (const r of ordered.slice(0, -1)) jumps.push({ fromKey: r.run.at(-1)!, when: null, to: end });
  }

  return { jumps, skipped };

  function past(lastKey: string): ImportedJump["to"] {
    const next = items[index.get(lastKey)! + 1];
    return next ? { kind: "item", key: next.key } : { kind: "ending", key: "" };
  }
}

export function skippedNote(skipped: number): string {
  return `${skipped} show/hide ${skipped === 1 ? "rule" : "rules"} (rebuild ${skipped === 1 ? "it" : "them"} in the Flow tab)`;
}
