import { readFormDoc, type FormDoc } from "@repo/form-schema";
import { can } from "@repo/entitlements";
import type { Bindings } from "../env.js";
import { getEntitlements } from "./entitlements.js";
import { resolveRespondentAddress, type AddressSource } from "./respondent-address.js";
import { bindChunks, holesFor } from "./d1-bindings.js";
import { QUIET_MIN_SPACING_MS, resolveZone, shiftIntoWindow } from "./quiet-hours.js";

/**
 * Scheduling and cancelling the nudges sent to someone who walked away.
 *
 * The sending half lives in `sweeps.ts` (which decides *when*) and
 * `mail-jobs.ts` (which decides *what*). This file only decides *whether*, and
 * it is deliberately the pessimistic half: every early return here is a message
 * we chose not to send to somebody who never asked to hear from us.
 */

export function newFollowUpId(): string {
  return `flw_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

/** Where a resume link stays valid. Long, because a nudge is read whenever the inbox is. */
export const RESUME_TTL_DAYS = 30;
/** Unsubscribe outlives every sequence, because an opt-out that expires is not an opt-out. */
export const UNSUB_TTL_DAYS = 365;

export interface ScheduleInput {
  env: Bindings;
  submissionId: string;
  formId: string;
  organizationId: string;
  /**
   * When the respondent last answered, not when we noticed they had gone.
   *
   * The two are half an hour apart on the chat path — that is the Durable
   * Object's idle alarm — and every delay in the sequence is measured from
   * here, so using the later of the two silently lengthened each one.
   */
  abandonedAt: number;
  isTest?: boolean;
  /**
   * Start the sequence from now rather than from `abandonedAt`, where
   * `abandonedAt` has already gone by.
   *
   * Set only by `backfillFollowUps`. See the scheduling loop in `scheduleOne`
   * for what it does to the step times, and why they are not simply all made
   * due at once.
   */
  catchUp?: boolean;
}

interface FormRow {
  schema_json: string;
  close_at: number | null;
}

/** Answer rows to `ref -> value`, shared by the one-response and batch paths. */
function readAnswers(rows: { block_ref: string; value_json: string }[]): Map<string, unknown> {
  const byRef = new Map<string, unknown>();
  for (const a of rows) {
    try {
      byRef.set(a.block_ref, JSON.parse(a.value_json));
    } catch {
      // One unparseable answer must not stop the rest from being read.
    }
  }
  return byRef;
}

interface SubRow {
  respondent_email: string | null;
  /** The respondent's IANA zone, when their browser named one. See `quiet-hours.ts`. */
  timezone: string | null;
  hidden_fields: string | null;
  opted_out: number;
}

/**
 * Is this address on a suppression list that covers this organization?
 *
 * Two rows can suppress: one scoped to the org, and one global. The global rows
 * are bounces and complaints, which are facts about the address rather than
 * preferences about a customer, so they apply everywhere.
 */
export async function isSuppressed(env: Bindings, orgId: string, address: string): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT 1 AS hit FROM email_suppressions
      WHERE address = ?1 AND (organization_id IS NULL OR organization_id = ?2)
      LIMIT 1`,
  )
    .bind(address.toLowerCase(), orgId)
    .first<{ hit: number }>();
  return !!row;
}

/**
 * The same question for a whole batch, in one query.
 *
 * Returns the `orgId|address` pairs that are suppressed, so a caller sweeping a
 * hundred follow-ups asks once instead of a hundred times. A global suppression
 * — `organization_id IS NULL` — matches every organization that asked about the
 * address, exactly as the single-row version reads it.
 */
export async function isSuppressedIn(
  env: Bindings,
  pairs: { orgId: string; address: string }[],
): Promise<Set<string>> {
  const hits = new Set<string>();
  if (pairs.length === 0) return hits;
  const addresses = [...new Set(pairs.map((p) => p.address.toLowerCase()))];
  /**
   * Addresses only, chunked, and the organization matched below rather than in
   * SQL.
   *
   * Two variable-length `IN (…)` lists in one statement cannot both be bounded
   * against D1's hundred-parameter ceiling — a sweep of a hundred follow-ups
   * spanning a hundred organizations would have bound two hundred. Filtering
   * the organization in memory costs at most a few extra rows for an address
   * some other tenant also suppressed, and the pair matching below is what
   * decides the answer either way.
   *
   * Those extra rows are the one thing to be careful about: a suppression that
   * belongs to another organization can be read here. It is discarded on the
   * next line — the lookup key is built from the *caller's* `orgId`, so another
   * tenant's row cannot match one of the pairs asked about — and nothing read
   * here leaves this function. Only a global suppression, which is deliberately
   * org-independent, ever answers for someone else's row.
   */
  const pages = (await env.DB.batch(
    bindChunks(addresses).map((chunk) =>
      env.DB
        .prepare(
          `SELECT address, organization_id FROM email_suppressions WHERE address IN (${holesFor(chunk)})`,
        )
        .bind(...chunk),
    ),
  )) as D1Result<{ address: string; organization_id: string | null }>[];
  const global = new Set<string>();
  const scoped = new Set<string>();
  for (const r of pages.flatMap((p) => p.results ?? [])) {
    if (r.organization_id === null) global.add(r.address.toLowerCase());
    else scoped.add(`${r.organization_id}|${r.address.toLowerCase()}`);
  }
  for (const p of pairs) {
    const address = p.address.toLowerCase();
    if (global.has(address) || scoped.has(`${p.orgId}|${address}`)) hits.add(`${p.orgId}|${address}`);
  }
  return hits;
}

/** Record an opt-out. Idempotent: opting out twice is not an error. */
export async function suppress(
  env: Bindings,
  orgId: string | null,
  address: string,
  reason: "unsubscribe" | "bounce" | "complaint" | "manual" | "at_capture",
): Promise<void> {
  const addr = address.toLowerCase();
  if (orgId === null) {
    /**
     * SQLite treats NULLs as distinct in a UNIQUE index, so `ON CONFLICT` does
     * not deduplicate global rows — hence the explicit check. Cheap, and this
     * path only runs on a bounce or a complaint.
     */
    const existing = await env.DB.prepare(
      `SELECT 1 AS hit FROM email_suppressions WHERE organization_id IS NULL AND address = ? LIMIT 1`,
    )
      .bind(addr)
      .first<{ hit: number }>();
    if (existing) return;
    await env.DB.prepare(
      `INSERT INTO email_suppressions (organization_id, address, reason, created_at) VALUES (NULL, ?, ?, ?)`,
    )
      .bind(addr, reason, Date.now())
      .run();
    return;
  }
  await env.DB.prepare(
    `INSERT INTO email_suppressions (organization_id, address, reason, created_at)
     VALUES (?1, ?2, ?3, ?4) ON CONFLICT (organization_id, address) DO NOTHING`,
  )
    .bind(orgId, addr, reason, Date.now())
    .run();
}

/**
 * Decide the follow-up schedule for a response that was just abandoned, and
 * write it down.
 *
 * Never throws. This runs inside `finalizeResponse`, and a response that was
 * correctly recorded must not fail because we could not arrange to nag someone
 * about it later. A dropped schedule is a smaller problem than a 500 on the
 * path that produced it — the same trade `enqueueMail` makes.
 */
export async function scheduleFollowUps(input: ScheduleInput): Promise<number> {
  try {
    return await scheduleInner(input);
  } catch (err) {
    console.error("followup_schedule_failed", input.submissionId, err);
    return 0;
  }
}

/**
 * Why this response is not getting a reminder, written where somebody can read it.
 *
 * Every check below is a reason not to mail a stranger, and each one used to be
 * a bare `return 0`. That was fine while the only question was "should we send
 * this", and useless the moment the question became "why did nothing arrive" —
 * which is the question an author actually asks, with no log access and no row
 * in `followups` to look at, because the whole point is that none was written.
 *
 * On `submissions.meta` rather than a column: it is already JSON, already
 * written with `json_set` by `finalizeResponse`, and this needs no index and no
 * migration. Cleared on the success path so a response that was rescheduled
 * after the author fixed the cause does not still carry the old excuse.
 */
type SkipReason =
  | "unpublished"
  | "unreadable"
  | "disabled"
  | "not_entitled"
  | "no_postal_address"
  | "opted_out"
  | "no_answers"
  | "no_address"
  | "suppressed"
  | "closed";

function skipStatement(env: Bindings, submissionId: string, reason: SkipReason | null) {
  return env.DB
    .prepare(`UPDATE submissions SET meta = json_set(coalesce(meta,'{}'), '$.followUpSkip', ?2) WHERE id = ?1`)
    .bind(submissionId, reason);
}

async function noteSkip(
  env: Bindings,
  submissionId: string,
  reason: SkipReason | null,
): Promise<number> {
  try {
    await skipStatement(env, submissionId, reason).run();
  } catch (err) {
    console.error("followup_skip_note_failed", submissionId, err);
  }
  return 0;
}

/**
 * Everything that is true of the *form* rather than of one response.
 *
 * Split out of `scheduleInner` because a backfill asks these same four
 * questions once for a hundred responses that all share a form. Inline they
 * were four D1 round trips per submission, which stops being a query plan and
 * becomes a subrequest budget the moment more than a handful are scheduled in
 * one go.
 */
interface FormGate {
  doc: FormDoc;
  cfg: NonNullable<FormDoc["settings"]["followUp"]>;
  closeAt: number | null;
}

async function openFormGate(
  env: Bindings,
  formId: string,
  organizationId: string,
): Promise<FormGate | { skip: SkipReason }> {
  const form = await env.DB.prepare(
    `SELECT fv.schema_json, f.close_at
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.id = ?1 AND f.organization_id = ?2`,
  )
    .bind(formId, organizationId)
    .first<FormRow>();
  // No published version means nobody could have answered it through the
  // hosted form; nothing to schedule.
  if (!form) return { skip: "unpublished" };

  let doc: FormDoc;
  try {
    doc = readFormDoc(JSON.parse(form.schema_json));
  } catch (err) {
    console.error("followup_doc_unreadable", formId, err);
    return { skip: "unreadable" };
  }

  const cfg = doc.settings.followUp;
  if (!cfg?.enabled || cfg.steps.length === 0) return { skip: "disabled" };

  /**
   * The entitlement is checked here as well as at publish.
   * `stripForPublish` already forces `enabled` false for an org without the
   * feature, but a plan can lapse after a document was published, and the
   * published document does not change when it does.
   */
  const ent = await getEntitlements(env, organizationId);
  if (!can(ent, "followup_email")) return { skip: "not_entitled" };

  /**
   * No postal address, no reminders.
   *
   * CAN-SPAM requires the sender's physical address on every commercial
   * message, and this is one. Enforced here rather than only in the builder
   * because the builder can be bypassed — the API publishes documents too — and
   * because the consequence of getting it wrong lands on the customer, not on
   * us. Silent rather than an error: the author is not present at abandonment
   * time, and the settings screen already says the address is required.
   */
  const org = await env.DB.prepare(`SELECT postal_address FROM organizations WHERE id = ?`)
    .bind(organizationId)
    .first<{ postal_address: string | null }>();
  if (!org?.postal_address?.trim()) {
    console.log("followup_skipped_no_postal_address", organizationId);
    return { skip: "no_postal_address" };
  }

  return { doc, cfg, closeAt: closingTime(doc, form.close_at) };
}

async function scheduleInner(input: ScheduleInput): Promise<number> {
  // Test-mode responses are real rows excluded from every count, and mailing a
  // real person about one would be the exception that proves it wrong.
  if (input.isTest) return 0;

  const gate = await openFormGate(input.env, input.formId, input.organizationId);
  if ("skip" in gate) return noteSkip(input.env, input.submissionId, gate.skip);
  return scheduleOne(gate, input);
}

/**
 * What `scheduleOne` reads for itself when it is deciding one response alone,
 * and what a batch reads once for all of them.
 *
 * `suppressed` is a resolved answer rather than an address list because the
 * address is not known until the document has been read against the response —
 * which the caller does in a pass of its own, with no queries in it.
 */
interface Prefetched {
  sub: SubRow;
  byRef: Map<string, unknown>;
  suppressed: boolean;
}

/**
 * The half of the decision that is about one response, given a form whose gates
 * have already been opened.
 *
 * `pre` and `collect` are what let a backfill of a hundred responses cost a
 * handful of round trips instead of five hundred: with `pre` it asks nothing,
 * and with `collect` it writes nothing — it hands its statements back for the
 * caller to send in one batch. Called without either, it reads and writes for
 * itself exactly as it did when one abandoned response was the only caller.
 */
async function scheduleOne(
  gate: FormGate,
  input: ScheduleInput,
  pre?: Prefetched,
  collect?: D1PreparedStatement[],
): Promise<number> {
  const { env, submissionId, formId, organizationId, abandonedAt } = input;
  const { doc, cfg, closeAt } = gate;

  /**
   * The opt-out the respondent was offered beside the address question.
   *
   * Joined from the session rather than read off the response because that is
   * where it is recorded — the offer is made while the question is on screen,
   * which can be before the response row exists.
   */
  /** Every early return goes through here, so `collect` is honoured on all of them. */
  const note = async (reason: SkipReason | null): Promise<number> => {
    if (!collect) return noteSkip(env, submissionId, reason);
    collect.push(skipStatement(env, submissionId, reason));
    return 0;
  };

  const sub =
    pre?.sub ??
    (await env.DB.prepare(
      `SELECT s.respondent_email, s.hidden_fields, cs.timezone,
              COALESCE(cs.followup_opt_out, 0) AS opted_out
         FROM submissions s
         LEFT JOIN chat_sessions cs ON cs.id = s.session_id
        WHERE s.id = ?`,
    )
      .bind(submissionId)
      .first<SubRow>());
  // Nothing to annotate if the row itself has gone.
  if (!sub) return 0;
  if (sub.opted_out) return note("opted_out");

  let byRef = pre?.byRef;
  if (!byRef) {
    const answers = await env.DB.prepare(
      `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
    )
      .bind(submissionId)
      .all<{ block_ref: string; value_json: string }>();
    byRef = readAnswers(answers.results ?? []);
  }
  const hidden = parseHidden(sub.hidden_fields);
  const resolved = resolveRespondentAddress(doc, {
    respondentEmail: sub.respondent_email,
    byRef,
    hiddenFields: hidden,
    ...(cfg.addressField ? { addressField: cfg.addressField } : {}),
  });
  if (!resolved) return note("no_address");

  /**
   * Nothing answered — which is only a reason to stay quiet if we do not know
   * who they are.
   *
   * This used to run before the address was resolved, so a respondent who
   * signed in with Google and then left without answering a question was
   * skipped as `no_answers`, even though the sign-in had just handed us a
   * verified address. That is the one abandonment we are best placed to
   * recover: they got through the gate, which is the step people drop at, and
   * then stopped at question one. On a live form it accounted for seven of the
   * twenty responses that never got a reminder.
   *
   * A verified identity only. An address from an answer cannot be here — there
   * are no answers — and one from a hidden field is a parameter on a URL
   * somebody clicked, which is not a person telling us their address. Mailing
   * that on the strength of an opened link is how a nudge becomes spam.
   */
  if (byRef.size === 0 && resolved.source !== "identity") {
    return note("no_answers");
  }

  const suppressed = pre ? pre.suppressed : await isSuppressed(env, organizationId, resolved.address);
  if (suppressed) return note("suppressed");

  /**
   * The holdout.
   *
   * Deterministic in the submission id rather than random, so a retry cannot
   * move a response between arms and the split stays reproducible when someone
   * later asks how the number was computed.
   */
  const held = cfg.holdoutPercent > 0 && bucketOf(submissionId) < cfg.holdoutPercent;

  const now = Date.now();
  const rows: { step: number; at: number }[] = [];
  /**
   * Where the sequence starts.
   *
   * Normally at the moment they walked away, which is the instant the author's
   * delays are written against. `catchUp` is the case where that instant is
   * already behind us — the sequence was switched on today for somebody who
   * left yesterday — and there every step is overdue at once, so the whole
   * thing would arrive in a single tick of the sweep. Two messages landing
   * together reads as a bug to the person receiving them, and as spam to their
   * provider.
   *
   * So each step is pulled forward only as far as it must be, and never closer
   * to the step before it than the gap the author put between them. A reminder
   * pair written four hours and twenty-four hours out still arrives twenty
   * hours apart, however late the sequence starts.
   */
  let earliest = now;
  /**
   * Whose night to keep out of, or null when the author has not asked us to.
   *
   * Resolved once for the whole sequence rather than per step: it cannot change
   * between steps, and `resolveZone` is three string checks and a formatter
   * construction that would otherwise repeat for every rung.
   *
   * Null when the setting is off, and that is what makes this whole block inert
   * for every form that predates it — with no zone, each step keeps exactly the
   * instant it had before quiet hours existed.
   */
  const zone = cfg.quietHours ? resolveZone(sub.timezone, cfg.timezone) : null;
  /** The previous step's final time, for the spacing rule below. */
  let previous: number | null = null;

  cfg.steps.forEach((step, i) => {
    const configured = abandonedAt + step.delayHours * 3_600_000;
    let at = input.catchUp ? Math.max(configured, earliest) : configured;

    if (zone) {
      /**
       * Quiet hours applies to the moment the message will actually go, not to
       * the moment it was nominally due.
       *
       * Those are the same thing while `at` is in the future, which is the
       * ordinary case. They come apart when a response is abandoned long after
       * the respondent actually stopped — an expired response the sweep only
       * notices days later — and there the stored time is already a statement
       * about the past while the sweep will send within five minutes of now.
       * Shifting the past instant would compute a quiet window that has been
       * and gone, and the message would go out at three in the morning anyway:
       * exactly the bug this feature exists to prevent, wearing an
       * honest-looking timestamp.
       */
      at = shiftIntoWindow(Math.max(at, now), zone);
      /**
       * And not on top of the step before it.
       *
       * A night swallows every step that fell inside it, so a reminder due at
       * ten in the evening and one due at two in the morning both resolve to
       * nine and arrive together — which reads as a bug to the recipient and as
       * a burst to their provider. Pushed apart, then shifted again in case the
       * push crossed an evening; that second shift settles, because the window
       * is twelve hours wide and the push is two.
       */
      if (previous !== null && at < previous + QUIET_MIN_SPACING_MS) {
        at = shiftIntoWindow(previous + QUIET_MIN_SPACING_MS, zone);
      }
      previous = at;
    }

    if (input.catchUp) {
      const next = cfg.steps[i + 1];
      /*
       * Measured from where this step actually landed, not from where it was
       * nominally due. Seeding the next step's floor with the pre-shift time
       * would let it compute a target back inside the night this one was just
       * pulled out of, and the pair would collapse onto the same morning again.
       */
      // Clamped non-negative: nothing in the schema stops an author putting
      // step two sooner than step one, and a negative gap would walk backwards.
      earliest = at + (next ? Math.max(0, (next.delayHours - step.delayHours) * 3_600_000) : 0);
    }
    /*
     * The close check last, and deliberately after the shift.
     *
     * Holding a nudge until morning can carry it past the moment the form stops
     * accepting answers — a ten o'clock reminder on a form that closes at six
     * becomes a nine o'clock invitation to a door we locked in the night.
     * Checking the time it was due rather than the time it will go would pass
     * exactly that message, which is the one thing this check exists to stop.
     */
    // A nudge that lands after the form stops accepting answers is worse than
    // no nudge: it invites somebody to a door we already locked.
    if (closeAt !== null && at >= closeAt) return;
    /**
     * Outside a catch-up the intended time is stored as-is, even when it is
     * already in the past — which happens whenever a response is abandoned by a
     * sweep that ran long after the respondent actually left. Clamping it
     * forward to `now` would both misreport when the nudge was meant to go and,
     * because the sweep selects on `scheduled_at < now`, hold an already-overdue
     * message back for another tick.
     */
    rows.push({ step: i + 1, at });
  });
  // Every step would land after the form stops accepting answers.
  if (rows.length === 0) return note("closed");

  const stmts = rows.map((r) =>
    env.DB.prepare(
      `INSERT INTO followups
         (id, submission_id, form_id, organization_id, channel, address, address_source,
          step, status, reason, scheduled_at, created_at)
       VALUES (?1, ?2, ?3, ?4, 'email', ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT (submission_id, step) DO NOTHING`,
    ).bind(
      newFollowUpId(),
      submissionId,
      formId,
      organizationId,
      resolved.address.toLowerCase(),
      resolved.source satisfies AddressSource,
      r.step,
      held ? "holdout" : "scheduled",
      held ? "holdout" : null,
      r.at,
      now,
    ),
  );
  // Something was written, so whatever excuse this response was carrying from
  // an earlier attempt no longer applies.
  if (collect) collect.push(...stmts, skipStatement(env, submissionId, null));
  else {
    await env.DB.batch(stmts);
    await noteSkip(env, submissionId, null);
  }
  return held ? 0 : rows.length;
}

/**
 * How far back a catch-up reaches.
 *
 * Seven days, bounded by two different things. The resume link in a nudge is
 * only good for `RESUME_TTL_DAYS`, so anything older than a month links to a
 * dead page — that is the hard ceiling. The real limit is lower and is about
 * the recipient: "you started this last week" is a true sentence somebody
 * recognises, and "you started this last month" is a cold mail from a stranger.
 * The complaints that follow the second one land on a sending domain shared
 * with every other tenant.
 */
export const CATCHUP_LOOKBACK_DAYS = 7;

/**
 * The most responses one call will schedule.
 *
 * Each one costs about five D1 round trips, and this runs inside the publish
 * request's `waitUntil` — against a Worker subrequest budget of a thousand.
 * A form with more than this many recent abandonments catches the rest on the
 * next publish, which is the right failure: it under-sends rather than
 * over-sends, and it never blows the budget out from under the audit and
 * activity writes sharing the same request.
 *
 * Worth saying plainly what "the next publish" now costs, because the candidate
 * rule below widened from "never scheduled" to "missing the last step": the
 * moment an author adds a reminder, every recent response on the form is a
 * candidate rather than a handful. At a hundred a publish that converges fine
 * for a form taking tens or hundreds of responses a week, and does not converge
 * for one taking thousands — publishes are rare, and nothing else runs this.
 * The fix when a form gets there is a bounded sweep on the five-minute cron,
 * not a larger number here: the all-or-nothing write batch below is the real
 * ceiling, and raising this only makes a failure more expensive.
 */
const CATCHUP_LIMIT = 100;

/**
 * How many of them are read, decided and written at a time.
 *
 * D1 allows a hundred bound parameters per query, and the prefetch below binds
 * one per response — so a page read in a single `IN (...)` would sit exactly on
 * that limit, and raising `CATCHUP_LIMIT` by one would break it at runtime with
 * no local test able to notice, because the local D1 does not enforce the cap
 * the HTTP API does.
 *
 * It also bounds what one failed write costs. A batch is all-or-nothing, so a
 * chunk that fails schedules nobody in that chunk — twenty people rather than a
 * hundred, with the rest of the page unaffected. Five batches of reads and five
 * of writes for a full page is still two orders of magnitude fewer round trips
 * than asking per response.
 *
 * Deliberately below `BIND_CHUNK`: here the chunk is also the blast radius of a
 * failed write batch, which is a stricter thing to size for than the bind limit.
 *
 * Twenty rather than the twenty-five it was, because the sequence is three
 * steps now and the write batch is what actually bounds this: three inserts and
 * a skip-note per response, plus the resume guard below, put a chunk of
 * twenty-five at over a hundred statements in one all-or-nothing batch.
 */
const CATCHUP_CHUNK = 20;

/**
 * Schedule the reminders for people who walked away *before* the sequence
 * covered them.
 *
 * Scheduling is otherwise decided once, at the instant a response is abandoned,
 * against the settings live at that instant — so an author who collects twenty
 * partials and only then turns follow-ups on used to get nothing for those
 * twenty. Which is backwards: turning the feature on is exactly the moment they
 * are asking us to chase the people they can already see sitting unfinished.
 *
 * Runs on every publish rather than only on the off→on transition. It is
 * idempotent — `NOT EXISTS` skips anything already scheduled, so the second
 * publish finds nothing — and running it unconditionally means it also repairs
 * the other ways a response ends up with no schedule: a plan that lapsed and
 * was renewed, a postal address filled in late, a bug fixed in this file.
 *
 * Never throws. A publish that failed because we could not arrange to nag
 * somebody later would be a much worse trade than a missing nudge.
 */
export async function backfillFollowUps(
  env: Bindings,
  formId: string,
  organizationId: string,
): Promise<number> {
  try {
    const gate = await openFormGate(env, formId, organizationId);
    // Not an error and not worth a log line: most publishes are of forms with
    // no follow-up sequence at all.
    if ("skip" in gate) return 0;

    const since = Date.now() - CATCHUP_LOOKBACK_DAYS * 86_400_000;
    const candidates = await env.DB.prepare(
      /*
        `updated_at` is the last touch, which on an abandoned response is the
        moment it was marked abandoned. Backed by `idx_submissions_form_updated`,
        so this seeks the recent tail of one form rather than scanning the table.

        Only `abandoned`: an `in_progress` response is somebody who may still be
        typing, and its session object's idle alarm owns the decision about when
        that stops being true.

        Missing the *last* step, rather than missing every step.

        "Has no rows at all" only ever caught a response that had never been
        scheduled, which meant an author who added a third reminder to a
        sequence got it for nobody already waiting: their rows existed, so they
        were not candidates, and the step nobody had was never written. The
        ladder in the results table then said "2 of 2" for them and "0 of 3" for
        everyone who arrived after the edit — both honest reports of a database
        that had quietly forked.

        One correlated subquery rather than two, because both terms seek the
        same `uq_followups_submission_step` prefix: SQLite seeks to this
        submission and reads its at-most-three rows once, deciding both. It
        costs what the old single probe cost, and it subsumes it — a response
        with no rows has no last step either.

        The status terms are the sequences that must stay stopped. `cancelled`
        is a respondent who finished, resumed or unsubscribed. `failed` is a
        delivery that exhausted the queue's retries, where the next step would
        most likely burn five more against a shared sending domain. `holdout` is
        the control arm, and it is the one that would do real damage: `held` is
        recomputed from the *current* `holdoutPercent`, so an author lowering it
        would top up the people who were deliberately sent nothing, mail them,
        and destroy the only number that makes the recovery figure mean
        anything.

        `skipped` is deliberately not here. Its reasons include `email_quota`
        and `not_entitled`, and repairing exactly those is what this function
        promises above.
      */
      `SELECT s.id, s.updated_at
         FROM submissions s
        WHERE s.form_id = ?1
          AND s.status = 'abandoned'
          AND s.is_test = 0
          AND s.updated_at > ?2
          AND NOT EXISTS (
            SELECT 1 FROM followups fu
             WHERE fu.submission_id = s.id
               AND (fu.step = ?4 OR fu.status IN ('cancelled', 'failed', 'holdout'))
          )
        ORDER BY s.updated_at DESC
        LIMIT ?3`,
    )
      .bind(formId, since, CATCHUP_LIMIT, gate.cfg.steps.length)
      .all<{ id: string; updated_at: number }>();

    const rows = candidates.results ?? [];
    if (rows.length === 0) return 0;

    /**
     * A chunk that fails does not take the rest of the page with it.
     *
     * The point of chunking is that one bad batch costs twenty-five people
     * rather than a hundred, and letting the throw escape to the outer catch
     * would have given that back: the chunks after it would never run, and the
     * ones already written would still be reported as nothing scheduled.
     */
    let scheduled = 0;
    for (let i = 0; i < rows.length; i += CATCHUP_CHUNK) {
      const chunk = rows.slice(i, i + CATCHUP_CHUNK);
      try {
        scheduled += await scheduleChunk(env, gate, formId, organizationId, chunk);
      } catch (err) {
        console.error("followup_backfill_chunk_failed", formId, chunk.length, err);
      }
    }
    if (scheduled > 0) console.log("followup_backfill_scheduled", formId, scheduled);
    return scheduled;
  } catch (err) {
    console.error("followup_backfill_failed", formId, err);
    return 0;
  }
}

/**
 * One chunk of a catch-up: read together, decided in memory, written together.
 *
 * `scheduleOne` reads a response and its answers for itself when it is deciding
 * one abandonment as it happens. That is the right shape for one response and
 * the wrong shape for twenty-five — at five round trips apiece it was a
 * subrequest budget rather than a query plan, inside a publish. So the reads
 * happen once for the chunk and are handed down, and the writes come back up to
 * be sent in one batch.
 */
async function scheduleChunk(
  env: Bindings,
  gate: FormGate,
  formId: string,
  organizationId: string,
  rows: { id: string; updated_at: number }[],
): Promise<number> {
  const ids = rows.map((r) => r.id);
  // `CATCHUP_CHUNK` is already under `BIND_CHUNK`, so this is one slice — the
  // helper is here to say where the number comes from, not to split anything.
  const holes = holesFor(ids);

  const [subsRes, answersRes] = (await env.DB.batch([
    env.DB.prepare(
      `SELECT s.id, s.respondent_email, s.hidden_fields, cs.timezone,
              COALESCE(cs.followup_opt_out, 0) AS opted_out
         FROM submissions s
         LEFT JOIN chat_sessions cs ON cs.id = s.session_id
        WHERE s.id IN (${holes})`,
    ).bind(...ids),
    env.DB.prepare(
      `SELECT submission_id, block_ref, value_json FROM submission_answers
        WHERE submission_id IN (${holes})`,
    ).bind(...ids),
  ])) as [
    D1Result<SubRow & { id: string }>,
    D1Result<{ submission_id: string; block_ref: string; value_json: string }>,
  ];
  const subById = new Map((subsRes.results ?? []).map((r) => [r.id, r]));
  const answerRows = new Map<string, { block_ref: string; value_json: string }[]>();
  for (const a of answersRes.results ?? []) {
    const list = answerRows.get(a.submission_id);
    if (list) list.push(a);
    else answerRows.set(a.submission_id, [a]);
  }

  /**
   * Who these responses belong to, worked out before anything is asked of the
   * database again.
   *
   * Resolving an address is pure — the document, the response's own columns and
   * its answers — so every address in the chunk can be known without a query,
   * which is what makes one bulk suppression lookup possible where
   * `scheduleOne` on its own has to ask per response. Kept rather than
   * recomputed: `scheduleOne` resolves it again for the row it writes, and
   * doing it a third time here to build the lookup key would be three passes
   * over the same document for one answer.
   */
  const decided = new Map<string, { byRef: Map<string, unknown>; address: string | null }>();
  const addresses: { orgId: string; address: string }[] = [];
  for (const row of rows) {
    const sub = subById.get(row.id);
    if (!sub) continue;
    const byRef = readAnswers(answerRows.get(row.id) ?? []);
    const resolved = resolveRespondentAddress(gate.doc, {
      respondentEmail: sub.respondent_email,
      byRef,
      hiddenFields: parseHidden(sub.hidden_fields),
      ...(gate.cfg.addressField ? { addressField: gate.cfg.addressField } : {}),
    });
    decided.set(row.id, { byRef, address: resolved?.address ?? null });
    if (resolved) addresses.push({ orgId: organizationId, address: resolved.address });
  }
  const suppressed = await isSuppressedIn(env, addresses);

  /**
   * Every write the chunk produces, in one batch.
   *
   * All-or-nothing rather than per response, which is a change of failure shape
   * worth stating: a batch that fails schedules nobody in this chunk, where a
   * per-response loop would have left the ones it had already reached
   * scheduled. Safe because the insert is `ON CONFLICT DO NOTHING` and the
   * whole thing runs again on the next publish, and bounded because a chunk is
   * twenty responses rather than the entire page.
   */
  const writes: D1PreparedStatement[] = [];
  let scheduled = 0;
  for (const row of rows) {
    const sub = subById.get(row.id);
    const d = decided.get(row.id);
    if (!sub || !d) continue;
    scheduled += await scheduleOne(
      gate,
      {
        env,
        submissionId: row.id,
        formId,
        organizationId,
        abandonedAt: row.updated_at,
        catchUp: true,
      },
      {
        sub,
        byRef: d.byRef,
        suppressed: d.address ? suppressed.has(`${organizationId}|${d.address.toLowerCase()}`) : false,
      },
      writes,
    );
  }
  /**
   * Undo anything this batch just wrote for somebody who came back while it ran.
   *
   * The candidate read and this write are separate round trips, and in between
   * a respondent can click a resume link: `reopenAbandonedResponse` flips the
   * response to `in_progress` and `cancelFollowUps` cancels its scheduled rows
   * — neither of which has anything to say about the rows we are inserting
   * here, because they did not exist yet. The sweep accepts `in_progress` as
   * well as `abandoned`, so the next tick would mail somebody who is at that
   * moment answering the form.
   *
   * Never reachable while a candidate was by definition a response that had
   * never been scheduled at all. It is reachable now: a top-up candidate is a
   * response with a live sequence and a live resume link in somebody's inbox,
   * which is precisely the kind that gets resumed.
   *
   * Last in the batch, so it sees this chunk's inserts rather than racing them.
   */
  if (writes.length > 0) {
    writes.push(
      env.DB.prepare(
        `UPDATE followups SET status = 'cancelled', reason = 'resumed'
          WHERE submission_id IN (${holes})
            AND status = 'scheduled'
            AND EXISTS (SELECT 1 FROM submissions s
                         WHERE s.id = followups.submission_id AND s.status <> 'abandoned')`,
      ).bind(...ids),
    );
    await env.DB.batch(writes);
  }
  return scheduled;
}

/**
 * Stop the rest of a sequence.
 *
 * Called when the respondent finishes, and when they come back through a resume
 * link — continuing to nag somebody who is currently answering the form is the
 * fastest way to earn a spam complaint.
 */
export async function cancelFollowUps(
  env: Bindings,
  submissionId: string,
  reason: string,
): Promise<number> {
  try {
    const res = await env.DB.prepare(
      `UPDATE followups SET status = 'cancelled', reason = ?2
        WHERE submission_id = ?1 AND status = 'scheduled'`,
    )
      .bind(submissionId, reason)
      .run();
    return res.meta?.changes ?? 0;
  } catch (err) {
    console.error("followup_cancel_failed", submissionId, err);
    return 0;
  }
}

/**
 * Somebody opened the resume link in one of our messages.
 *
 * The `fu` parameter that carries the id is public and guessable in principle,
 * so the `submission_id` in the WHERE clause is the check that matters: a
 * follow-up can only be credited by the resume token minted for the very
 * response it was scheduled against, and that token is what proved the caller
 * had the message in the first place.
 *
 * `clicked_at IS NULL` makes this write-once. Somebody who opens the same mail
 * three times over a week is one person coming back, and letting the last visit
 * win would quietly move the click forward in the daily series every time.
 *
 * Never throws: this is bookkeeping hanging off a respondent's first request,
 * and a form that will not open because a stat could not be written is a much
 * worse outcome than a stat that is missing.
 */
export async function recordFollowUpClick(
  env: Bindings,
  followUpId: string,
  submissionId: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE followups SET clicked_at = ?3
        WHERE id = ?1 AND submission_id = ?2 AND clicked_at IS NULL`,
    )
      .bind(followUpId, submissionId, Date.now())
      .run();
  } catch (err) {
    console.error("followup_click_failed", followUpId, err);
  }
}

/**
 * A response that a nudge brought back has been completed. Credit it.
 *
 * Exactly one row is credited — the latest step they actually clicked — because
 * the question this answers is "how many responses did follow-ups recover",
 * and a sequence of three messages to one person recovered one response, not
 * three. Which step gets the credit is the last one they acted on, which is the
 * one that did the work.
 *
 * Silent when nothing was clicked. Somebody who was going to finish anyway,
 * and happened to have a scheduled nudge that never landed, is not a recovery,
 * and counting them as one is precisely the self-flattering measurement the
 * holdout exists to protect against.
 */
export async function creditFollowUpRecovery(
  env: Bindings,
  submissionId: string,
): Promise<void> {
  try {
    await env.DB.prepare(
      `UPDATE followups SET recovered_at = ?2
        WHERE id = (
          SELECT id FROM followups
           WHERE submission_id = ?1 AND clicked_at IS NOT NULL AND recovered_at IS NULL
           ORDER BY clicked_at DESC LIMIT 1
        )
          /*
            And only if this response has not already been credited.
            \`finalizeResponse\` runs this once per completion behind its own
            \`changed\` guard, so a second call should be impossible — but the
            subquery alone would happily credit the *next* unrecovered clicked
            step if one ever arrived here twice, turning one person into two
            recoveries in the number this feature is judged by. Cheap insurance
            on a figure that gets quoted.
          */
          AND NOT EXISTS (
            SELECT 1 FROM followups WHERE submission_id = ?1 AND recovered_at IS NOT NULL
          )`,
    )
      .bind(submissionId, Date.now())
      .run();
  } catch (err) {
    console.error("followup_recovery_credit_failed", submissionId, err);
  }
}

/** Cancel every pending nudge queued for one address, across forms. For unsubscribe. */
export async function cancelFollowUpsForAddress(
  env: Bindings,
  orgId: string,
  address: string,
): Promise<number> {
  const res = await env.DB.prepare(
    `UPDATE followups SET status = 'cancelled', reason = 'unsubscribed'
      WHERE organization_id = ?1 AND address = ?2 AND status = 'scheduled'`,
  )
    .bind(orgId, address.toLowerCase())
    .run();
  return res.meta?.changes ?? 0;
}

function parseHidden(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : null;
  } catch {
    return null;
  }
}

/**
 * When the form stops accepting answers, document first.
 *
 * `forms.close_at` is a denormalised copy the builder does not always write —
 * the same reason `open-session.ts` and `public.ts` both read the doc first.
 */
function closingTime(doc: FormDoc, closeAtColumn: number | null): number | null {
  const scheduled = doc.settings.closeRules.closeAt;
  const fromDoc = scheduled ? Date.parse(scheduled) : NaN;
  const candidates = [Number.isFinite(fromDoc) ? fromDoc : null, closeAtColumn].filter(
    (v): v is number => v !== null,
  );
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

/** A stable 0–99 bucket for one submission id. */
function bucketOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}
