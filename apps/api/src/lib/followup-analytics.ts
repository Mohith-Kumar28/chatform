import type { Bindings } from "../env.js";

/**
 * Did the nudges work?
 *
 * The honest version of that question is harder than it looks, and most of this
 * file is about not answering the easy one by accident. "How many people we
 * mailed came back" flatters the feature enormously, because a good share of
 * abandoners return on their own and a message that happened to be in their
 * inbox takes the credit. The holdout arm — which `scheduleFollowUps` has been
 * writing since the beginning and nothing has ever read — is the only thing
 * here that can tell those two apart, so it gets reported next to the headline
 * rather than buried behind an "advanced" disclosure.
 */

export interface FollowUpStep {
  step: number;
  /** How many messages at this position have actually gone out. */
  sent: number;
  /** Of those, how many had their resume link opened. */
  clicked: number;
  /** Of those, how many led to a completed response. */
  recovered: number;
}

export interface FollowUpStats {
  /** No rows at all — the caller draws an explanation rather than a chart of zeros. */
  everScheduled: boolean;
  sent: number;
  /** Queued and not yet due. Reassures an author who turned it on an hour ago. */
  pending: number;
  clicked: number;
  recovered: number;
  /** 0–100, of messages sent. */
  clickRate: number;
  /** 0–100, of messages sent. */
  recoveryRate: number;
  byStep: FollowUpStep[];
  /** Recovered responses per day, oldest first, gaps filled. */
  daily: { date: string; sent: number; recovered: number }[];
  /**
   * The control arm, when the author asked for one.
   *
   * `people` is how many abandoners were deliberately left alone; `recovered`
   * is how many of them came back anyway. That second number is the baseline —
   * without it, every return gets credited to the mail.
   */
  holdout: { people: number; recovered: number; rate: number } | null;
  /**
   * Percentage points of completion added over the holdout baseline, or null
   * when there is no holdout or too little of one to say anything.
   *
   * Null rather than zero, and null rather than a number computed from four
   * people. A lift figure with no sample behind it is worse than no lift
   * figure, because it will be quoted.
   */
  liftPoints: number | null;
}

const DAY_MS = 86_400_000;

/**
 * The smallest holdout that gets a lift number.
 *
 * Twenty is not a power calculation — it is the point below which the figure
 * moves by tens of points when one person changes their mind, and an author
 * reading "follow-ups lifted completion by 40 points" off a sample of six will
 * repeat it in a pitch deck. Under this we still show the raw control counts,
 * which are true, and withhold the ratio, which is not yet meaningful.
 */
const MIN_HOLDOUT = 20;

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export async function computeFollowUpStats(
  env: Bindings,
  formId: string,
  days = 30,
): Promise<FollowUpStats> {
  /**
   * One pass per shape rather than one row per follow-up.
   *
   * A busy form has tens of thousands of these, and the page needs four numbers
   * and a short series. Everything below aggregates in SQLite.
   */
  const [totals, steps, daily, holdout] = await Promise.all([
    env.DB.prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         -- A queued row is handed to the mail queue but not yet delivered. It
         -- is still pending from an author's point of view, and counting only
         -- scheduled ones would make an in-flight reminder vanish from both
         -- this number and sent.
         SUM(CASE WHEN status IN ('scheduled','queued') THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked,
         SUM(CASE WHEN recovered_at IS NOT NULL THEN 1 ELSE 0 END) AS recovered
       FROM followups WHERE form_id = ?`,
    )
      .bind(formId)
      .first<{ total: number; sent: number | null; pending: number | null; clicked: number | null; recovered: number | null }>(),

    env.DB.prepare(
      `SELECT step,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked,
              SUM(CASE WHEN recovered_at IS NOT NULL THEN 1 ELSE 0 END) AS recovered
         FROM followups WHERE form_id = ? GROUP BY step ORDER BY step`,
    )
      .bind(formId)
      .all<{ step: number; sent: number | null; clicked: number | null; recovered: number | null }>(),

    /**
     * Two dates in one row would be wrong: a message sent on Monday and acted
     * on Thursday belongs to Monday's send bar and Thursday's recovery line.
     * Grouping on `sent_at` alone would draw the recovery on the day the mail
     * left, which is not when the person came back.
     */
    env.DB.prepare(
      `SELECT day, SUM(sent) AS sent, SUM(recovered) AS recovered FROM (
         SELECT date(sent_at / 1000, 'unixepoch') AS day, 1 AS sent, 0 AS recovered
           FROM followups WHERE form_id = ?1 AND sent_at IS NOT NULL AND sent_at >= ?2
         UNION ALL
         SELECT date(recovered_at / 1000, 'unixepoch') AS day, 0 AS sent, 1 AS recovered
           FROM followups WHERE form_id = ?1 AND recovered_at IS NOT NULL AND recovered_at >= ?2
       ) GROUP BY day ORDER BY day`,
    )
      .bind(formId, Date.now() - days * DAY_MS)
      .all<{ day: string; sent: number; recovered: number }>(),

    /**
     * The control arm.
     *
     * `holdout` rows are written one per step, exactly like sent ones, so the
     * count of rows is not the count of people — hence `DISTINCT submission_id`.
     * Getting this wrong would divide by three and treble the baseline.
     */
    env.DB.prepare(
      `SELECT COUNT(DISTINCT fu.submission_id) AS people,
              COUNT(DISTINCT CASE WHEN s.status = 'completed' THEN fu.submission_id END) AS recovered
         FROM followups fu
         JOIN submissions s ON s.id = fu.submission_id
        WHERE fu.form_id = ? AND fu.status = 'holdout'`,
    )
      .bind(formId)
      .first<{ people: number; recovered: number }>(),
  ]);

  const sent = totals?.sent ?? 0;
  const clicked = totals?.clicked ?? 0;
  const recovered = totals?.recovered ?? 0;

  const holdoutPeople = holdout?.people ?? 0;
  const holdoutStats =
    holdoutPeople > 0
      ? {
          people: holdoutPeople,
          recovered: holdout?.recovered ?? 0,
          rate: pct(holdout?.recovered ?? 0, holdoutPeople),
        }
      : null;

  /**
   * Lift, measured per *person* on both sides.
   *
   * The treated arm's denominator is the number of people who were mailed at
   * all, not the number of messages: someone who got three reminders is one
   * person, and dividing recoveries by messages would deflate the treated rate
   * by roughly the length of the sequence while the control side counted people
   * — comparing two different units and calling the difference an effect.
   */
  const treatedPeople = await env.DB.prepare(
    `SELECT COUNT(DISTINCT submission_id) AS people FROM followups
      WHERE form_id = ? AND status = 'sent'`,
  )
    .bind(formId)
    .first<{ people: number }>();
  const treatedRate = pct(recovered, treatedPeople?.people ?? 0);

  const liftPoints =
    holdoutStats && holdoutStats.people >= MIN_HOLDOUT
      ? Math.round((treatedRate - holdoutStats.rate) * 10) / 10
      : null;

  return {
    everScheduled: (totals?.total ?? 0) > 0,
    sent,
    pending: totals?.pending ?? 0,
    clicked,
    recovered,
    clickRate: pct(clicked, sent),
    recoveryRate: pct(recovered, sent),
    byStep: (steps.results ?? []).map((r) => ({
      step: r.step,
      sent: r.sent ?? 0,
      clicked: r.clicked ?? 0,
      recovered: r.recovered ?? 0,
    })),
    daily: fillDays(daily.results ?? [], days),
    holdout: holdoutStats,
    liftPoints,
  };
}

/**
 * Every day in the window, whether anything happened on it or not.
 *
 * A series with holes draws a line that skips from Monday to Friday as though
 * the days between did not exist, which reads as a steady rate rather than a
 * gap. The same reason `computeAnalytics` fills its own daily series.
 */
function fillDays(
  rows: { day: string; sent: number; recovered: number }[],
  days: number,
): { date: string; sent: number; recovered: number }[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: { date: string; sent: number; recovered: number }[] = [];
  const start = Date.now() - (days - 1) * DAY_MS;
  for (let i = 0; i < days; i++) {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10);
    const hit = byDay.get(date);
    out.push({ date, sent: hit?.sent ?? 0, recovered: hit?.recovered ?? 0 });
  }
  return out;
}
