import type { MeterRowData } from "@/lib/usage/meters";
import { formatValue } from "@/lib/usage/meters";

/**
 * What happens at the edge, in words, derived from how the limit is enforced.
 *
 * The page used to say this with a colour and keep the meaning in a popover — which put
 * the single most useful sentence on the screen ("past the cap your forms stop being
 * conversational") one click away from every person it was written for. A bar going
 * amber cannot distinguish "your API calls are being refused" from "your forms are still
 * collecting, just less well", and those are not the same news.
 *
 * `LIMITS[key].mode` already draws that distinction for the server. Everything here is
 * that field, read out loud:
 *
 * - `hard`    the action is refused. Something has stopped.
 * - `degrade` the action still happens, at reduced quality. Nothing has stopped.
 * - `meter`   counted, never enforced. There is no edge.
 * - `clamp`   a document-scoped ceiling, not a monthly allowance — never surfaced here.
 *
 * Because it is derived, a new limit added to the table gets correct copy for free, and
 * this page and `AiCapBanner` cannot describe the same cap two different ways.
 */

/**
 * A limit's label as it reads *inside* a sentence.
 *
 * Lower case, except when the label opens with an acronym — "170 of 200 ai conversations
 * used" is what naive lowercasing produces, and it makes the product look like it does
 * not know its own vocabulary.
 */
export function inlineLabel(label: string): string {
  return /^[A-Z]{2,}/.test(label) ? label : label.toLowerCase();
}

function remaining(row: MeterRowData): string {
  if (row.limit === null) return "";
  return formatValue(Math.max(0, row.limit - row.used), row.unit);
}

/** The clause under a row. `null` at rest — a note on every row is furniture. */
export function rowNote(row: MeterRowData, resets: string, planName: string): string | null {
  if (row.locked) return `Not included on ${planName}`;
  // Latent and genuinely-unlimited read identically on purpose: from the reader's side
  // they are the same fact, and the ceiling behind the latent one is in its InfoHint.
  if (row.latent || row.limit === null) return "Unlimited on your plan";

  const left = remaining(row);
  const monthly = row.kind === "monthly";

  /*
    The crossover has to keep saying "unlimited".

    A count that reads as unlimited all month and then quietly grows a denominator and a
    bar is, from the reader's side, a plan that shrank while they were using it. It did
    not: the allowance is still unlimited and this is the fair-use line behind it. So
    until the ceiling actually refuses something, the note says both — what the number is
    and that it is not a quota.
  */
  if (row.ceilingBacked && row.state !== "at" && row.state !== "over") {
    return `Still unlimited — ${formatValue(row.limit, row.unit)} is a fair-use ceiling for one month`;
  }

  switch (row.state) {
    case "over":
      return `${formatValue(row.used - row.limit, row.unit)} over the limit`;
    case "at":
      if (row.mode === "degrade") return `Still running, at reduced quality until ${resets}`;
      return monthly ? `New ones are refused until ${resets}` : "Full — a bigger plan adds more";
    case "critical":
      return `Almost gone — ${left} left`;
    case "near":
      if (row.mode === "degrade") return `${left} left before quality drops`;
      return monthly ? `${left} left this month` : `${left} left`;
    default:
      return null;
  }
}

/**
 * One word carrying the hard/degrade distinction, and only once it is true.
 *
 * "Stopped" and "Reduced" are the whole point: they are the difference between a form
 * that has closed and a form that is still collecting answers less charmingly, which a
 * shared amber bar flattened into one thing.
 */
export function rowBadge(row: MeterRowData): { text: string; tone: "danger" | "warning" } | null {
  if (row.locked || row.latent || row.limit === null) return null;
  if (row.state !== "at" && row.state !== "over") return null;
  if (row.mode === "degrade") return { text: "Reduced", tone: "warning" };
  if (row.mode === "hard") {
    return row.kind === "monthly"
      ? { text: "Stopped", tone: "danger" }
      : { text: "Full", tone: "warning" };
  }
  return null;
}

/**
 * The sentence at the top — the answer to "am I okay?" before a single number is read.
 *
 * The one place on the page a full sentence is affordable, so it is the one place that
 * names both the consequence and the remedy. Everything below it is a list.
 */
export function statusSentence(row: MeterRowData | null, resets: string): string {
  if (!row || row.state === "ok") {
    return `Nothing is close to a limit. This month's counters reset ${resets}.`;
  }

  const label = row.label;
  const lower = inlineLabel(label);
  const used = formatValue(row.used, row.unit);
  const limit = row.limit === null ? "" : formatValue(row.limit, row.unit);
  const spent = row.state === "at" || row.state === "over";

  /* Same correction as the row note: until the ceiling actually refuses something, the
     headline must not describe an unlimited allowance as a limit being approached. */
  if (row.ceilingBacked && !spent) {
    return `${label} are unlimited — this month is ${used} against a ${limit} fair-use ceiling.`;
  }

  if (row.state === "watch") {
    return `${label} is the closest to a limit — ${used} of ${limit} used.`;
  }

  if (row.mode === "degrade") {
    return spent
      ? `${label} is used up. Nothing has stopped — it's running at reduced quality until ${resets}.`
      : `${used} of ${limit} ${lower} used. Past the cap it keeps running at reduced quality.`;
  }

  if (row.kind === "gauge") {
    return spent
      ? `All ${limit} ${lower} are in use. Adding another needs a bigger plan.`
      : `${used} of your ${limit} ${lower} are in use.`;
  }

  return spent
    ? `${label} is used up. New ones are being refused until ${resets}.`
    : `${used} of ${limit} ${lower} used. At ${limit} they're refused until ${resets}.`;
}

/** The tone the headline strip wears, which is the worst row's tone. */
export function statusTone(row: MeterRowData | null): "ok" | "warning" | "danger" {
  if (!row) return "ok";
  if (row.danger) return "danger";
  if (row.state === "near" || row.state === "critical" || row.state === "at") return "warning";
  return "ok";
}
