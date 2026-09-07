import {
  limitMeta,
  type EnforcementMode,
  type LimitKey,
  type LimitKind,
  type LimitMeta,
  type MetricKey,
} from "@repo/entitlements";
import type { EntitlementsPayload } from "@/hooks/use-entitlements";

/**
 * The usage page's numbers, worked out once, away from the markup.
 *
 * The old page decided everything inline: which tone a bar wore, whether a metric was
 * worth showing, what a limit meant. That put four different judgements inside one JSX
 * expression each, which is why the page could ship a full bar for "unlimited" and an
 * alarm colour for a plan working exactly as sold — nobody could see the rules, because
 * there were no rules, only expressions.
 *
 * So: every row is derived here, as data, and the components render what they are given.
 */

/**
 * How close a limit is, in the bands the page actually reacts to.
 *
 * Five, not two. `watch` exists so the headline can name the closest meter before
 * anything is coloured — the guidance everywhere is to warn in stages, and a page that
 * only knows "fine" and "amber" has to pick one of them wrongly. Colour still starts at
 * `near`: painting half a screen amber is how amber stops meaning anything.
 */
export type MeterState = "ok" | "watch" | "near" | "critical" | "at" | "over";

export interface MeterRowData {
  id: string;
  limitKey: LimitKey;
  metric?: MetricKey;
  label: string;
  used: number;
  /** What the bar measures against. `null` draws no bar at all. */
  limit: number | null;
  mode: EnforcementMode;
  kind: LimitKind;
  unit: LimitMeta["unit"];
  /** 0 when there is nothing to be a fraction of. */
  ratio: number;
  state: MeterState;
  /** Red. Reserved for something being refused right now — see `isDanger`. */
  danger: boolean;
  /** The plan does not sell this at all: shown, locked, never hidden. */
  locked: boolean;
  /** A `meter` metric whose fair-use ceiling is not yet worth drawing. */
  latent: boolean;
  /**
   * The allowance is unlimited and this number is only a fair-use ceiling behind it.
   *
   * Stays true after `latent` flips, which is the point: once the bar appears, the row
   * has to keep saying that the plan is still unlimited, or a count that grew a
   * denominator halfway through the month reads as a downgrade nobody announced.
   */
  ceilingBacked: boolean;
  /** Last month's figure for the same metric, when there is a last month. */
  previous: number | null;
  /** Where this is actually managed, when it is managed somewhere else. */
  href?: string;
  hint?: string;
}

/**
 * The month's rows, in reading order.
 *
 * Editorial rather than derived: the order of `LIMITS` is a schema, and a schema is not a
 * priority. Responses first because it is the product's subject; API requests last
 * because on the plan most people are reading this on, it is the locked one, and a
 * padlock belongs at the bottom of a list rather than in the middle of it.
 */
const MONTHLY: { limit: LimitKey; metric: MetricKey; label?: string; hint?: string }[] = [
  {
    limit: "responses_ceiling_per_month",
    metric: "responses",
    /* The limit is called "Monthly response ceiling" because that is what it is to the
       server. To a reader, this row is the count of their responses — the ceiling is the
       thing behind it, which the note and the hint explain when it starts to matter. */
    label: "Responses",
    hint: "Responses are unlimited on every plan. The ceiling is a fair-use cap on any single month, and it only starts showing as a bar once you are near it.",
  },
  {
    limit: "ai_conversations_per_month",
    metric: "ai_conversations",
    hint: "Past this, forms keep collecting. They ask their questions directly instead of conversationally, so nothing breaks and no answers are lost.",
  },
  { limit: "ai_generations_per_month", metric: "ai_generations" },
  { limit: "emails_per_month", metric: "emails_sent" },
  { limit: "api_requests_per_month", metric: "api_requests" },
];

/** Standing counts. These do not reset — they are what the workspace currently holds. */
const GAUGES: { limit: LimitKey; gauge: string; href?: string; hint?: string }[] = [
  { limit: "forms_count", gauge: "forms_count" },
  {
    limit: "seats",
    gauge: "seats",
    href: "/settings/people",
    hint: "A pending invitation holds a seat until it is accepted or expires.",
  },
  { limit: "workspaces_count", gauge: "workspaces_count" },
  { limit: "file_storage_mb", gauge: "file_storage_mb" },
];

function stateFor(ratio: number, used: number, limit: number | null): MeterState {
  if (limit === null) return "ok";
  if (used > limit) return "over";
  if (used >= limit) return "at";
  if (ratio >= 0.95) return "critical";
  if (ratio >= 0.8) return "near";
  if (ratio >= 0.5) return "watch";
  return "ok";
}

/**
 * Red means something is being refused *right now*. Nothing else earns it.
 *
 * The three cases this separates were one case before, and that was the bug:
 *
 * - A `hard` monthly limit at its cap is refusing requests this second. Red.
 * - A `hard` gauge at its cap is a plan working as sold. A one-seat plan sits at 1/1 for
 *   its entire life, and a brand-new free account opened on two full alarm-coloured bars
 *   was being told it was broken on the first screen it ever saw. Amber, and only red if
 *   it somehow went *over*.
 * - A `degrade` limit at its cap has stopped nothing. Amber, never red.
 */
function isDanger(mode: EnforcementMode, kind: LimitKind, state: MeterState): boolean {
  // A gauge is never red, not even over its ceiling.
  //
  // Being over is not an incident for a standing count — it is usually history.
  // `workspaces_count` went unenforced for a long time, so accounts legitimately
  // hold more than their plan sells, and enforcement is deliberately not
  // retroactive: they keep everything they have. Painting that red tells a
  // long-standing customer they have done something wrong by existing. What is
  // actually true — that they cannot add another — is a sentence, and the row
  // says it.
  if (kind === "gauge") return false;
  if (state === "over") return true;
  if (mode !== "hard") return false;
  return kind === "monthly" && state === "at";
}

/**
 * A gauge never colours for sitting at its ceiling.
 *
 * This is the same category error as the red one, one shade along. A monthly meter
 * approaching its cap is an *event* — it is moving, and it will bite on a date. A gauge is
 * a standing count against a plan's shape: `seats: 1` and `workspaces: 1` mean a free
 * account is born at 1/1 and stays there for its entire life. Painting that amber opened
 * every new account on two full alarm-coloured bars, which is the page inventing an
 * incident out of the plan working exactly as sold.
 *
 * The fact still has to reach the reader, so it does — as a "Full" chip and a line of
 * text on the row, which say it once instead of shouting it continuously. Only `over`,
 * which the server clamps and should be impossible, is worth a colour.
 */
export function meterTone(row: MeterRowData): "quiet" | "neutral" | "warning" | "danger" {
  if (row.danger) return "danger";
  if (row.kind === "gauge") return row.state === "at" || row.state === "over" ? "quiet" : "neutral";
  if (row.state === "near" || row.state === "critical" || row.state === "at") return "warning";
  return "neutral";
}

/**
 * The fair-use ceiling only becomes a bar once it is nearly true.
 *
 * `responses_per_month` is `meter` — genuinely unlimited — while
 * `responses_ceiling_per_month` is a `hard` 5,000 on the same metric. Both are true, and
 * which one to show is a question of when. Drawing a bar against 5,000 from the first
 * response turns "unlimited responses", the plan's headline promise, into "you have
 * 5,000". So below half the ceiling this reads as a plain count, and above it the
 * denominator and the bar appear and it behaves like any other hard monthly limit.
 */
const LATENT_BELOW = 0.5;

function buildRow(args: {
  limitKey: LimitKey;
  used: number;
  limit: number | null;
  metric?: MetricKey;
  previous: number | null;
  label?: string;
  href?: string;
  hint?: string;
}): MeterRowData {
  const meta = limitMeta(args.limitKey);
  const locked = args.limit === 0;
  const rawRatio = args.limit && args.limit > 0 ? args.used / args.limit : 0;

  // `meter` limits are reported and never enforced, so their ceiling stays out of the
  // way until it is close enough to matter.
  const latent = meta.mode === "meter" || (args.limit !== null && rawRatio < LATENT_BELOW && isCeiling(args.limitKey));
  const limit = locked || latent ? null : args.limit;
  const ratio = limit && limit > 0 ? args.used / limit : 0;
  const state = stateFor(ratio, args.used, limit);

  return {
    id: args.limitKey,
    limitKey: args.limitKey,
    metric: args.metric,
    label: args.label ?? meta.label,
    used: args.used,
    limit,
    mode: meta.mode,
    kind: meta.kind,
    unit: meta.unit,
    ratio,
    state,
    danger: isDanger(meta.mode, meta.kind, state),
    locked,
    latent,
    ceilingBacked: isCeiling(args.limitKey),
    previous: args.previous,
    href: args.href,
    hint: args.hint,
  };
}

/** The ceilings that stand behind an otherwise-unlimited metric. */
function isCeiling(key: LimitKey): boolean {
  return key === "responses_ceiling_per_month";
}

export function monthlyRows(d: EntitlementsPayload): MeterRowData[] {
  return MONTHLY.map((m) =>
    buildRow({
      limitKey: m.limit,
      metric: m.metric,
      used: d.usage[m.metric] ?? 0,
      limit: d.limits[m.limit],
      previous: d.previousUsage ? (d.previousUsage[m.metric] ?? 0) : null,
      label: m.label,
      hint: m.hint,
    }),
  );
}

export function gaugeRows(d: EntitlementsPayload): MeterRowData[] {
  return GAUGES.map((g) =>
    buildRow({
      limitKey: g.limit,
      used: d.gauges[g.gauge] ?? 0,
      limit: d.limits[g.limit],
      // A standing count has no "last month" — it is the number right now.
      previous: null,
      href: g.href,
      hint: g.hint,
    }),
  );
}

/**
 * The row the headline should talk about, or nothing.
 *
 * Only rows that can actually bite are candidates: a locked row is not pressure (it was
 * never available), and a latent ceiling is not pressure (it is unlimited until it is not).
 *
 * Gauges are excluded unless they have genuinely been exceeded, and that exclusion is the
 * whole reason the headline is trustworthy. Ranking by raw ratio put `seats 1/1` — a free
 * plan's permanent, correct, day-one state — at the top of every list, so a brand-new
 * account with nothing used at all was greeted with "All 1 team members are in use" in
 * alarm colours. A standing count at its ceiling is not news; it is the plan. It says so
 * on its own row, next to the link to the page where seats are actually managed.
 */
export function mostPressured(rows: MeterRowData[]): MeterRowData | null {
  return (
    rows
      .filter((r) => !r.locked && !r.latent && r.limit !== null && r.mode !== "clamp")
      // Gauges never lead. Not at their ceiling, and not over it: neither is an
      // event, and an account that has quietly been over an unenforced limit for
      // months does not want that as the first sentence on the screen.
      .filter((r) => r.kind !== "gauge")
      .sort((a, b) => b.ratio - a.ratio)[0] ?? null
  );
}

const K = 1000;

export function formatValue(n: number, unit: LimitMeta["unit"]): string {
  if (unit === "megabytes") {
    return n >= 1024 ? `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)} GB` : `${Math.round(n)} MB`;
  }
  // Six million tokens written out is a number nobody reads; it is a magnitude, not a
  // figure, and the page only ever asks "roughly how much of it is gone".
  if (unit === "tokens") {
    if (n >= K * K) return `${(n / (K * K)).toFixed(n % (K * K) === 0 ? 0 : 1)}M`;
    if (n >= K) return `${Math.round(n / K)}k`;
  }
  return n.toLocaleString();
}

/**
 * Month over month, as a whole percentage, or `null` when the comparison is meaningless.
 *
 * Suppressed in the two cases that produce a true but useless number: an organization
 * with no previous month at all (every account in its first calendar month), and a
 * previous month of zero, where any usage at all is "up ∞%".
 */
export function deltaPercent(row: MeterRowData): number | null {
  if (row.previous === null || row.previous === 0) return null;
  const change = Math.round(((row.used - row.previous) / row.previous) * 100);
  // Under a percentage point either way is noise dressed as a signal.
  return change === 0 ? null : change;
}
