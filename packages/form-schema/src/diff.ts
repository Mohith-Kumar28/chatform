import type { FormDoc } from "./form-doc";
import type { Block } from "./blocks";
import type { Ending, LogicRule, Variable, HiddenField } from "./logic";

/**
 * What changed between two versions of a form document.
 *
 * The builder autosaves, so the honest record of "what happened to this form" is a
 * stream of whole documents. Storing those is storage no one reads; storing "doc
 * updated" is a row no one learns anything from. What a person actually wants is the
 * sentence in between — *added the phone question, made company optional* — which is
 * derivable from two adjacent documents and from nothing else.
 *
 * So the diff lives here, next to the schema it understands, rather than in the API:
 * it is schema knowledge (what a block's identity is, which fields are cosmetic), it
 * is pure, and it is the part most worth testing.
 */

export type DocChangeOp =
  | "question.added"
  | "question.removed"
  | "question.renamed"
  | "question.retyped"
  | "question.moved"
  | "question.required"
  | "question.optional"
  | "question.edited"
  | "ending.added"
  | "ending.removed"
  | "ending.edited"
  | "logic.added"
  | "logic.removed"
  | "logic.edited"
  | "variable.added"
  | "variable.removed"
  | "hiddenField.added"
  | "hiddenField.removed"
  | "settings.changed"
  | "theme.changed"
  | "title.changed"
  | "description.changed";

export interface DocChange {
  op: DocChangeOp;
  /**
   * The thing the change is about, stable across saves: a block id, an ending id, a
   * rule id, a settings path. Merging two edit bursts keys on this, which is why it
   * must be an identity and not a position.
   */
  target: string;
  /** How to name it in a sentence — the question's title, the setting's label. */
  label: string;
  from?: string;
  to?: string;
}

/**
 * A bound on how much one entry may remember.
 *
 * Pasting a 200-question template is one legitimate save that produces 200 changes.
 * Recording all of them costs a wide row to say something "Replaced the form" says
 * better, so the list truncates and the summary keeps counting.
 */
export const MAX_CHANGES_PER_ENTRY = 40;

const TRUNCATE = 80;

function short(s: string | undefined | null): string {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length > TRUNCATE ? `${t.slice(0, TRUNCATE - 1)}…` : t;
}

/** A question's name in prose. Falls back to its ref, then to a generic noun. */
function blockLabel(b: Block): string {
  return short(b.title) || b.ref || "Untitled question";
}

function endingLabel(e: Ending): string {
  return short(e.title) || e.ref || "Ending";
}

/**
 * A rule in prose. Not the full condition — a timeline entry is a headline, and the
 * rule itself is one click away in the flow editor.
 */
function ruleLabel(r: LogicRule): string {
  if (r.action_kind === "goto") return `Jump to ${r.target}`;
  if (r.action_kind === "set_variable") return `Set ${r.variable}`;
  return `Score ${r.variable}`;
}

/**
 * Fields that do not change what the form *is*.
 *
 * `layout` is where the workflow editor stores node coordinates. Dragging a node
 * around is not an edit to the form, and treating it as one meant every pan of the
 * canvas wrote "edited question" against every block on it.
 */
const COSMETIC_BLOCK_KEYS = new Set(["id", "ref", "title", "type", "required"]);

function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

/** Everything about a block except the parts that get their own change op. */
function blockRest(b: Block): string {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (!COSMETIC_BLOCK_KEYS.has(k)) rest[k] = v;
  }
  return stable(rest);
}

/**
 * Human names for the settings a person recognises. Anything absent falls back to a
 * humanised path, which is worse but never wrong — and a new setting appearing in the
 * schema shows up in the timeline the day it ships rather than the day someone
 * remembers to add it here.
 */
const SETTING_LABELS: Record<string, string> = {
  language: "Language",
  rtl: "Right-to-left layout",
  progressBar: "Progress bar",
  "navigation.allowBack": "Going back",
  "navigation.allowSkip": "Skipping questions",
  "closeRules.closeAt": "Scheduled close",
  "closeRules.maxResponses": "Response cap",
  "closeRules.closedMessage": "Closed message",
  "requireAuth.enabled": "Sign-in requirement",
  "requireAuth.methods": "Sign-in methods",
  "requireAuth.message": "Sign-in message",
  "password.enabled": "Password protection",
  "password.value": "Form password",
  "captcha.enabled": "CAPTCHA",
  allowResubmissions: "Resubmissions",
  "onComplete.redirectUrl": "Completion redirect",
  "onComplete.delaySec": "Redirect delay",
  "onComplete.requireSubmit": "Explicit submit",
  "followUp.enabled": "Follow-up emails",
  "followUp.steps": "Follow-up schedule",
  "followUp.addressField": "Follow-up address field",
  "followUp.showProgress": "Follow-up progress line",
  "followUp.holdoutPercent": "Follow-up holdout",
  "followUp.replyTo": "Follow-up reply-to",
  "meta.ogTitle": "Share title",
  "meta.ogDescription": "Share description",
  "meta.ogImageKey": "Share image",
  "meta.faviconKey": "Favicon",
  "meta.noIndex": "Search engine indexing",
  "branding.brandName": "Brand name",
  "branding.logoKey": "Logo",
  "branding.hideBadge": "Chatform badge",
  "embed.allowedOrigins": "Embed origins",
  "agent.mode": "Agent mode",
  "agent.displayName": "Agent name",
  "agent.persona": "Agent persona",
  "agent.goal": "Agent goal",
  "agent.guardrails": "Agent guardrails",
  "agent.knowledge": "Agent knowledge",
  "agent.model": "Agent model",
};

function humanisePath(path: string): string {
  const leaf = path.split(".").pop() ?? path;
  const spaced = leaf.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function settingLabel(path: string): string {
  return SETTING_LABELS[path] ?? humanisePath(path);
}

/**
 * Values a person can read. Booleans become on/off because "true" is not what the
 * switch said, and secrets never appear at all.
 */
function settingValue(path: string, v: unknown): string {
  if (path === "password.value") return v ? "set" : "cleared";
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) return v.length === 0 ? "none" : short(v.join(", "));
  if (typeof v === "object") return "updated";
  return short(String(v));
}

/**
 * Flatten to leaf paths so a change reads as one setting rather than "settings
 * changed". Arrays are leaves: a reordered list of embed origins is one edit to one
 * setting, not N.
 */
function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  if (prefix) out[prefix] = value;
  return out;
}

function byId<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((i) => [i.id, i]));
}

/**
 * The changes that turn `before` into `after`.
 *
 * Order is the order a person would narrate them: structure first, then wording,
 * then logic, then settings.
 */
export function diffFormDoc(before: FormDoc | null, after: FormDoc): DocChange[] {
  const changes: DocChange[] = [];
  if (!before) {
    return [{ op: "title.changed", target: "doc.title", label: "Form created", to: short(after.title) }];
  }

  // ── questions ──
  const wasBlocks = byId(before.blocks);
  const nowBlocks = byId(after.blocks);
  const wasOrder = before.blocks.map((b) => b.id);
  const nowOrder = after.blocks.map((b) => b.id);

  for (const b of after.blocks) {
    if (!wasBlocks.has(b.id)) changes.push({ op: "question.added", target: b.id, label: blockLabel(b) });
  }
  for (const b of before.blocks) {
    if (!nowBlocks.has(b.id)) changes.push({ op: "question.removed", target: b.id, label: blockLabel(b) });
  }

  for (const now of after.blocks) {
    const was = wasBlocks.get(now.id);
    if (!was) continue;
    if (was.type !== now.type) {
      changes.push({ op: "question.retyped", target: now.id, label: blockLabel(now), from: was.type, to: now.type });
    }
    if (was.title !== now.title) {
      changes.push({ op: "question.renamed", target: now.id, label: blockLabel(now), from: short(was.title), to: short(now.title) });
    }
    if (was.required !== now.required) {
      changes.push({ op: now.required ? "question.required" : "question.optional", target: now.id, label: blockLabel(now) });
    }
    if (blockRest(was) !== blockRest(now)) {
      changes.push({ op: "question.edited", target: now.id, label: blockLabel(now) });
    }
  }

  /**
   * Reordering is reported once, against the questions that actually moved.
   *
   * Comparing positions in the full arrays would blame every question below an
   * insertion for moving, which is true of its index and false of anything a person
   * did. Only the ids present in both, compared in their relative order, count.
   */
  const survivors = new Set([...wasBlocks.keys()].filter((id) => nowBlocks.has(id)));
  const wasSeq = wasOrder.filter((id) => survivors.has(id));
  const nowSeq = nowOrder.filter((id) => survivors.has(id));
  for (let i = 0; i < nowSeq.length; i++) {
    const id = nowSeq[i]!;
    if (wasSeq[i] !== id) {
      const b = nowBlocks.get(id)!;
      changes.push({ op: "question.moved", target: id, label: blockLabel(b), from: String(wasSeq.indexOf(id) + 1), to: String(i + 1) });
    }
  }

  // ── endings ──
  const wasEndings = byId(before.endings);
  const nowEndings = byId(after.endings);
  for (const e of after.endings) {
    if (!wasEndings.has(e.id)) changes.push({ op: "ending.added", target: e.id, label: endingLabel(e) });
    else if (stable(wasEndings.get(e.id)) !== stable(e)) changes.push({ op: "ending.edited", target: e.id, label: endingLabel(e) });
  }
  for (const e of before.endings) {
    if (!nowEndings.has(e.id)) changes.push({ op: "ending.removed", target: e.id, label: endingLabel(e) });
  }

  // ── logic (branching rules and ending rules share one vocabulary) ──
  const wasRules = byId([...before.logic, ...before.endingRules]);
  const nowRules = byId([...after.logic, ...after.endingRules]);
  for (const [id, r] of nowRules) {
    const was = wasRules.get(id);
    if (!was) changes.push({ op: "logic.added", target: id, label: ruleLabel(r) });
    else if (stable(was) !== stable(r)) changes.push({ op: "logic.edited", target: id, label: ruleLabel(r) });
  }
  for (const [id, r] of wasRules) {
    if (!nowRules.has(id)) changes.push({ op: "logic.removed", target: id, label: ruleLabel(r) });
  }

  // ── variables and hidden fields, keyed by name (they have no id) ──
  const named = <T extends { name: string }>(xs: readonly T[]) => new Map(xs.map((x) => [x.name, x]));
  const diffNamed = (was: Map<string, Variable | HiddenField>, now: Map<string, Variable | HiddenField>, kind: "variable" | "hiddenField") => {
    for (const name of now.keys()) {
      if (!was.has(name)) changes.push({ op: `${kind}.added` as DocChangeOp, target: `${kind}:${name}`, label: name });
    }
    for (const name of was.keys()) {
      if (!now.has(name)) changes.push({ op: `${kind}.removed` as DocChangeOp, target: `${kind}:${name}`, label: name });
    }
  };
  diffNamed(named(before.variables), named(after.variables), "variable");
  diffNamed(named(before.hiddenFields), named(after.hiddenFields), "hiddenField");

  // ── title, description, settings, theme ──
  if (before.title !== after.title) {
    changes.push({ op: "title.changed", target: "doc.title", label: "Form name", from: short(before.title), to: short(after.title) });
  }
  if ((before.description ?? "") !== (after.description ?? "")) {
    changes.push({ op: "description.changed", target: "doc.description", label: "Form description" });
  }

  const wasSettings = flatten(before.settings);
  const nowSettings = flatten(after.settings);
  for (const path of new Set([...Object.keys(wasSettings), ...Object.keys(nowSettings)])) {
    const a = wasSettings[path];
    const b = nowSettings[path];
    if (stable(a) === stable(b)) continue;
    changes.push({
      op: "settings.changed",
      target: `settings.${path}`,
      label: settingLabel(path),
      from: settingValue(path, a),
      to: settingValue(path, b),
    });
  }

  /**
   * The theme is one change however many swatches moved. Nobody wants eleven rows
   * because they picked a different accent and it recomputed the derived colours.
   */
  if (stable(before.theme) !== stable(after.theme)) {
    changes.push({ op: "theme.changed", target: "doc.theme", label: "Design" });
  }

  return changes;
}

/**
 * Fold a new burst of changes into an entry that is still open.
 *
 * Autosave means a single minute of work arrives as a dozen diffs. Appending them
 * gives a timeline that is technically complete and unreadable; merging on target
 * gives the one a person would have written themselves. Two rules earn their keep:
 *
 *   add-then-remove cancels — a question built and deleted in the same sitting never
 *   existed as far as the history is concerned;
 *
 *   add-then-anything stays an add — renaming a question you just created is not a
 *   rename, it is you finishing the sentence, so the entry keeps "Added" and adopts
 *   the final wording.
 */
export function mergeChanges(existing: readonly DocChange[], incoming: readonly DocChange[]): DocChange[] {
  const out = [...existing];

  for (const next of incoming) {
    const i = out.findIndex((c) => c.target === next.target);
    if (i === -1) {
      out.push(next);
      continue;
    }
    const prev = out[i]!;

    const created = prev.op === "question.added" || prev.op === "ending.added" || prev.op === "logic.added";
    const destroyed = next.op === "question.removed" || next.op === "ending.removed" || next.op === "logic.removed";

    if (created && destroyed) {
      out.splice(i, 1);
      continue;
    }
    if (created) {
      out[i] = { ...prev, label: next.label };
      continue;
    }
    if (destroyed) {
      out[i] = next;
      continue;
    }
    if (prev.op === next.op) {
      // One field walked from its original value to its latest. Keep the endpoints.
      out[i] = { ...next, from: prev.from ?? next.from };
      continue;
    }
    out.push(next);
  }

  /**
   * A setting nudged back to where it started is not a change. Dropping these is what
   * keeps "opened the panel and closed it" out of the record.
   */
  return out.filter((c) => !(c.from !== undefined && c.from === c.to));
}

const PLURAL: Partial<Record<DocChangeOp, [string, string]>> = {
  "question.added": ["question added", "questions added"],
  "question.removed": ["question removed", "questions removed"],
  "question.renamed": ["question reworded", "questions reworded"],
  "question.retyped": ["question retyped", "questions retyped"],
  "question.moved": ["question reordered", "questions reordered"],
  "question.required": ["question made required", "questions made required"],
  "question.optional": ["question made optional", "questions made optional"],
  "question.edited": ["question edited", "questions edited"],
  "ending.added": ["ending added", "endings added"],
  "ending.removed": ["ending removed", "endings removed"],
  "ending.edited": ["ending edited", "endings edited"],
  "logic.added": ["rule added", "rules added"],
  "logic.removed": ["rule removed", "rules removed"],
  "logic.edited": ["rule edited", "rules edited"],
  "variable.added": ["variable added", "variables added"],
  "variable.removed": ["variable removed", "variables removed"],
  "hiddenField.added": ["hidden field added", "hidden fields added"],
  "hiddenField.removed": ["hidden field removed", "hidden fields removed"],
  "settings.changed": ["setting changed", "settings changed"],
  "theme.changed": ["design changed", "design changed"],
  "title.changed": ["form renamed", "form renamed"],
  "description.changed": ["description changed", "description changed"],
};

/**
 * One line for the row, the CSV export and the collapsed timeline.
 *
 * A single change names the thing it touched, because "Added 'What's your budget?'"
 * is the whole story. Several changes count instead — naming three of eleven would
 * be a summary that misleads about the other eight.
 */
export function summarizeChanges(changes: readonly DocChange[]): string {
  if (changes.length === 0) return "No changes";

  if (changes.length === 1) {
    const c = changes[0]!;
    const verb = PLURAL[c.op]?.[0] ?? c.op;
    switch (c.op) {
      case "question.added":
        return `Added “${c.label}”`;
      case "question.removed":
        return `Removed “${c.label}”`;
      case "question.renamed":
        return `Reworded “${c.from}” → “${c.to}”`;
      case "settings.changed":
        return `${c.label}: ${c.from} → ${c.to}`;
      case "theme.changed":
        return "Changed the design";
      case "title.changed":
        return c.from ? `Renamed the form to “${c.to}”` : `Created “${c.to}”`;
      default:
        return `${c.label} — ${verb}`;
    }
  }

  const counts = new Map<DocChangeOp, number>();
  for (const c of changes) counts.set(c.op, (counts.get(c.op) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([op, n]) => {
      const [one, many] = PLURAL[op] ?? [op, op];
      return `${n} ${n === 1 ? one : many}`;
    });
  const rest = counts.size - Math.min(counts.size, 3);
  return rest > 0 ? `${parts.join(", ")} and more` : parts.join(", ");
}
