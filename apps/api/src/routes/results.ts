import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { displayAnswer, safeReadFormDoc, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, assertPermission, assertFeature, hasFeature, entitlementsFor, type AuthzVars } from "../lib/authorize.js";
import { buildResponseTable, toCsv } from "../lib/response-table.js";
import { resolveRetiredBlocks } from "../lib/retired-columns.js";
import { computeAnalytics } from "../lib/analytics-service.js";
import { computeFollowUpStats } from "../lib/followup-analytics.js";
import { buildXlsx } from "../lib/xlsx.js";
import { bindChunks, holesFor } from "../lib/d1-bindings.js";

export const resultsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

resultsRouter.use("*", requireSession);
resultsRouter.use("*", requireOrg);
// Results are per-form and therefore per-tenant: another org's form id 404s.
resultsRouter.use("/forms/:id/*", requireFormAccess);

/**
 * Reading completed responses and basic analytics is a role question, not a plan one —
 * every plan sees what it collected. The plan gates live inside the handlers, because they
 * depend on *which* slice is being asked for: completed rows are free, the unfinished ones
 * are not.
 */
resultsRouter.use("/forms/:id/submissions", requirePermission("submission", "read"));
resultsRouter.use("/forms/:id/analytics", requirePermission("analytics", "read"));
resultsRouter.use("/forms/:id/followup-analytics", requirePermission("analytics", "read"));

const SubmissionRow = z.object({
  id: z.string(),
  status: z.string(),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  durationMs: z.number().nullable(),
  /**
   * Present only for forms that required sign-in.
   *
   * This and `followUp` below have been returned by the handler for some time
   * without being declared here, so neither reached `openapi.json` and neither
   * survived into the generated client — which is why the results page has to
   * cast the response to a hand-written type. Declared now, with the fields the
   * follow-up column needs.
   */
  respondent: z
    .object({
      provider: z.string(),
      label: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  /**
   * The person behind the response, platform-wide — `respondents.id` from `0026`.
   *
   * Returned whether or not they ever signed in, which is the point of it: the
   * verified identity above is null on every form that does not ask, and this is
   * then the only thing in the row that says two responses came from one human.
   * It is also the key `uq_submissions_one_open_per_respondent` is declared on,
   * so it is what an author is looking at when they ask why two rows are — or
   * are not — the same person.
   *
   * Null for a response opened through the headless API by a caller who
   * volunteered nothing to recognise anybody by.
   */
  respondentId: z.string().nullable(),
  answers: z.array(
    z.object({
      blockRef: z.string(),
      blockType: z.string(),
      value: z.unknown(),
    }),
  ),
  transcript: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      createdAt: z.number(),
    }),
  ),
  /** Null when this response was never in a follow-up sequence at all. */
  followUp: z
    .object({
      sent: z.number(),
      scheduled: z.number(),
      queued: z.number(),
      holdout: z.boolean(),
      recovered: z.boolean(),
      /** Epoch ms of the next step still waiting to go out. */
      nextScheduledAt: z.number().nullable(),
      lastSentAt: z.number().nullable(),
      /** `skipped` | `failed` | `cancelled`, when the sequence ended early. */
      stoppedStatus: z.string().nullable(),
      stoppedReason: z.string().nullable(),
    })
    .nullable(),
  /** Why no sequence was ever scheduled. Null when one was, or when nothing tried. */
  followUpSkip: z.string().nullable(),
});

/**
 * A question the form no longer asks, for responses that answered it before it
 * was deleted.
 *
 * The whole block, not a label: `displayAnswer` resolves option ids against it,
 * so a retired `multiple_choice` sent as `{ref, title, type}` alone would
 * render a column of `opt_founder001`. Declared loosely for the same reason —
 * every field of every block type has to survive the trip.
 */
const RetiredColumn = z
  .object({ ref: z.string(), title: z.string(), type: z.string() })
  .catchall(z.unknown());

/**
 * Rows, and the columns the current form cannot account for.
 *
 * This used to be a bare array. It grew a wrapper when deleting a question
 * stopped meaning losing sight of its answers: the table's column list is now
 * the document's questions *plus* `retiredColumns`, and the two have to arrive
 * together or the page renders answers it has no header for.
 */
const SubmissionList = z.object({
  submissions: z.array(SubmissionRow),
  /** Empty for the overwhelming majority of forms. Ordered oldest-deletion-last. */
  retiredColumns: z.array(RetiredColumn),
  /**
   * One page of a form's responses, and how many there are in total.
   *
   * The endpoint used to return the newest fifty and say nothing about the rest,
   * so a form with three thousand responses had two thousand nine hundred and
   * fifty of them simply missing from the only screen that shows them. `total`
   * counts every row the current `status` filter matches — not the page — which
   * is what lets the table say "51–100 of 3,214" and offer a page after this
   * one.
   */
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  /**
   * Both tabs' counts, so neither badge is counted from a page.
   *
   * `completed` and `partial` do not have to add up to `total`: a `spam` row is
   * in neither.
   */
  counts: z.object({
    total: z.number(),
    completed: z.number(),
    partial: z.number(),
  }),
});

const Summary = z.object({
  views: z.number(),
  starts: z.number(),
  completed: z.number(),
  abandoned: z.number(),
  completionRate: z.number(),
  avgDurationMs: z.number().nullable(),
  medianDurationMs: z.number().nullable(),
  perBlock: z.array(
    z.object({
      blockRef: z.string(),
      blockType: z.string(),
      title: z.string(),
      answered: z.number(),
      answerRate: z.number(),
      dropOff: z.number(),
    }),
  ),
  /** Per-question answer shapes — whichever of these the question's type fills in. */
  distributions: z.array(
    z.object({
      blockRef: z.string(),
      title: z.string(),
      type: z.string(),
      answered: z.number(),
      options: z.array(z.object({ label: z.string(), count: z.number() })),
      multi: z.boolean(),
      values: z.array(z.object({ value: z.number(), count: z.number() })),
      numericSummary: z
        .object({ avg: z.number(), min: z.number(), max: z.number(), median: z.number() })
        .nullable(),
      samples: z.array(z.string()),
      ranking: z.array(z.object({ label: z.string(), avgRank: z.number() })),
      matrix: z
        .object({ rows: z.array(z.string()), cols: z.array(z.string()), counts: z.array(z.array(z.number())) })
        .nullable(),
      timeline: z.array(z.object({ label: z.string(), count: z.number() })),
    }),
  ),
  daily: z.array(
    z.object({ date: z.string(), views: z.number(), starts: z.number(), completed: z.number() }),
  ),
  bySource: z.array(z.object({ source: z.string(), count: z.number() })),
  byCountry: z.array(z.object({ country: z.string(), count: z.number() })),
  byDevice: z.object({ mobile: z.number(), desktop: z.number() }).nullable(),
  durationBuckets: z.array(z.object({ label: z.string(), count: z.number() })),
  /** Field names withheld because the plan or the role does not include them. */
  locked: z.array(z.string()),
  /** What it would take to see them, and enough truth to make that worth doing. */
  lockedContext: z
    .object({
      feature: z.string(),
      requiredPlan: z.string(),
      questionCount: z.number(),
      worstBlockTitle: z.string().nullable(),
      worstBlockIndex: z.number().nullable(),
    })
    .nullable(),
});

// ─── views tracking (public, fire-and-forget) ───
export const viewsRouter = new Hono<{ Bindings: Bindings }>();

viewsRouter.post("/forms/:slug/view", async (c) => {
  const slug = c.req.param("slug");
  const form = await c.env.DB.prepare(`SELECT id FROM forms WHERE slug = ? AND deleted_at IS NULL`).bind(slug).first<{ id: string }>();
  if (!form) return c.json({ ok: false }, 404);
  const date = new Date().toISOString().slice(0, 10);
  await c.env.DB.prepare(
    `INSERT INTO analytics_rollup_daily (id, date, form_id, views) VALUES (?, ?, ?, 1)
     ON CONFLICT (date, form_id) DO UPDATE SET views = views + 1`,
  )
    .bind(`av_${date}_${form.id}`, date, form.id)
    .run();
  return c.json({ ok: true });
});

/** List submissions for a form with answers + chat transcripts. */
resultsRouter.get(
  "/forms/:id/submissions",
  describeRoute({
    tags: ["dashboard"],
    summary: "List submissions (with answers + transcripts)",
    responses: { 200: { description: "Submissions", content: { "application/json": { schema: resolver(SubmissionList) } } } },
  }),
  validator(
    "query",
    z.object({
      /**
       * `partial` is the union the table actually offers: a response that was
       * started and not completed, whether it was abandoned, is still open, or
       * was screened out. The three exact statuses stay addressable for callers
       * that want one of them, and `spam` is in none of these — it is not a
       * response an author is being shown a tab for.
       */
      status: z
        .enum(["all", "completed", "partial", "disqualified", "abandoned", "in_progress"])
        .default("all"),
      /** Rows per page. The table offers 25/50/100; 200 is the ceiling. */
      limit: z.coerce.number().int().min(1).max(200).default(50),
      /**
       * Where the page starts. Offset rather than a cursor, deliberately: this
       * table has numbered pages and a rows-per-page control, which a cursor
       * cannot serve — you cannot jump to page nine of an opaque chain. The
       * public API keeps its cursor (`GET /v1/responses`), where the caller is
       * walking a list rather than looking at one.
       */
      offset: z.coerce.number().int().min(0).default(0),
    }),
  ),
  async (c) => {
    const id = c.get("form")!.id;
    const { status, limit, offset } = c.req.valid("query");

    /**
     * The gate that pays for everything.
     *
     * Free sees completed responses. The unfinished ones — the people who started, told
     * you something, and left — are Pro. The rows themselves never leave the server
     * unentitled: a blurred table in the client is a presentation choice, not a boundary.
     *
     * The count that makes the upsell persuasive is NOT withheld. It rides on
     * `GET /forms/:id/analytics` as `abandoned`, which is basic analytics and free on
     * every plan — so the UI can say "14 people started and didn't finish" truthfully
     * while having none of what they said.
     *
     * `all` is the default the dashboard sends, so it degrades to completed-only rather
     * than refusing; the results page must still render. Asking for the partials
     * explicitly gets a 402 carrying the count.
     */
    /**
     * A screened-out response is gated with the unfinished ones.
     *
     * Not because it is unfinished — it is as terminal as a completion — but
     * because it is not a response the author asked for, and the Free tier's
     * line is "the responses you got are yours; the ones that did not arrive
     * are Pro". Somebody the form turned away did not arrive.
     */
    let effectiveStatus: typeof status = status;
    if (
      status === "abandoned" ||
      status === "in_progress" ||
      status === "disqualified" ||
      status === "partial" ||
      status === "all"
    ) {
      const roleDenied = await assertPermission(c, "submission", "read_partial");
      // A viewer is not trusted with unfinished responses whatever the plan, but `all`
      // still degrades rather than erroring, for the same reason.
      if (roleDenied && status !== "all") return roleDenied;
      const entitled = await hasFeature(c, "partial_responses");
      if (roleDenied || !entitled) {
        if (status === "all") {
          effectiveStatus = "completed";
        } else {
          const partials = await c.env.DB.prepare(
            `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ? AND status IN ('abandoned','in_progress','disqualified')`,
          )
            .bind(id)
            .first<{ n: number }>();
          const denied = await assertFeature(c, "partial_responses", {
            count: partials?.n ?? 0,
            surface: "results.partial",
          });
          if (denied) return denied;
        }
      }
    }
    type SubRow = {
      id: string;
      status: string;
      started_at: number;
      completed_at: number | null;
      duration_ms: number | null;
      session_id: string | null;
      respondent_id: string | null;
      respondent_provider: string | null;
      respondent_email: string | null;
      respondent_phone: string | null;
      respondent_name: string | null;
      followup_skip: string | null;
    };
    type AnswerRow = { submission_id: string; block_ref: string; block_type: string; value_json: string };
    type MessageRow = { submission_id: string; role: string; content: string; created_at: number };
    type FollowUpRow = {
      submission_id: string;
      sent: number;
      scheduled: number;
      queued: number;
      holdout: number;
      next_scheduled_at: number | null;
      last_sent_at: number | null;
      stopped_reason: string | null;
      stopped_status: string | null;
    };

    /**
     * The whole page in one round trip.
     *
     * `DB.batch()` puts every statement into a single request to D1, so this costs
     * one network hop no matter how many responses come back. It used to cost two
     * per row — a query for the answers and a query for the transcript, awaited
     * inside the loop below — which on a form with 26 responses was 56 sequential
     * hops and twelve seconds of pure latency for four milliseconds of SQL.
     *
     * The answers and the transcripts cannot wait to learn the ids the list
     * returns, so each joins the *same* window the list selects: identical
     * predicate, identical ORDER BY, identical LIMIT. A single flat join across
     * all three instead would multiply answers by messages and return a row for
     * every pair.
     *
     * Bound, never interpolated. All placeholders are explicit and positional:
     * SQLite continues auto-numbering `?` from the highest explicit index, so
     * mixing `?` with `?1` silently changes how many bindings a statement wants.
     */
    /**
     * The filter, written once.
     *
     * Every statement below has to select exactly the same rows — the page, its
     * answers, its transcripts and the count that decides whether there is
     * another page. Repeating the predicate four times was four chances for one
     * of them to drift.
     */
    const MATCHES = `(?2 = 'all'
                      OR (?2 = 'partial' AND status IN ('abandoned','in_progress','disqualified'))
                      OR status = ?2)`;
    const WINDOW = `SELECT id, session_id FROM submissions
                     WHERE form_id = ?1 AND ${MATCHES}
                     ORDER BY started_at DESC LIMIT ?3 OFFSET ?4`;
    const [subs, answerRows, transcriptRows, followUps, formRow, totalRow, countsRow] = (await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT s.id, s.status, s.started_at, s.completed_at, s.duration_ms, s.session_id,
                s.respondent_id,
                s.respondent_provider, s.respondent_email, s.respondent_phone, s.respondent_name,
                -- Why no reminder was ever scheduled for this response. Written by
                -- \`scheduleFollowUps\`, which otherwise makes that decision in silence.
                json_extract(s.meta, '$.followUpSkip') AS followup_skip
           FROM submissions s WHERE s.form_id = ?1 AND ${MATCHES}
          ORDER BY s.started_at DESC LIMIT ?3 OFFSET ?4`,
      ).bind(id, effectiveStatus, limit, offset),
      c.env.DB.prepare(
        `SELECT a.submission_id, a.block_ref, a.block_type, a.value_json
           FROM submission_answers a
           JOIN (${WINDOW}) w ON w.id = a.submission_id`,
      ).bind(id, effectiveStatus, limit, offset),
      /**
       * Gathered by response, not by `submissions.session_id`.
       *
       * That column is stamped once, by whichever session created the row, and
       * never re-pointed — but a response outlives its session. Someone who
       * reloads, or comes back later, opens a *new* session which adopts the
       * open row (`ensureSubmissionRow`), and the conversation continues there.
       * Joining on the stale pointer then read the wrong session: the completed
       * response on a live registration form showed "No conversation was
       * recorded" while its seventeen messages sat under the session that
       * actually held them, and split conversations showed only their first half.
       *
       * `chat_sessions.submission_id` is the reverse pointer, written per
       * session as each one finalises, so every session that contributed is
       * found. The `w.session_id` arm keeps the original pointer working for a
       * session that has not finalised yet. A response that never had a chat
       * joins to nothing, which is still the empty transcript it should be.
       *
       * `chat_sessions` is joined LEFT, and the second arm matches on the
       * message's own `session_id` rather than on `cs.id`, because messages
       * outlive their session row: the expiry sweep clears old sessions and
       * leaves the transcript behind, so a form in production already has rows
       * whose session is gone. An inner join dropped exactly those — swapping
       * one silently-missing transcript for another.
       */
      c.env.DB.prepare(
        `SELECT w.id AS submission_id, m.role, m.content, m.created_at
           FROM chat_messages m
           LEFT JOIN chat_sessions cs ON cs.id = m.session_id
           JOIN (${WINDOW}) w ON cs.submission_id = w.id OR m.session_id = w.session_id
          ORDER BY m.created_at`,
      ).bind(id, effectiveStatus, limit, offset),
      /**
       * Follow-up state, for the whole page in one query — and only for the page.
       *
       * Per-row would be one more round trip each on a list that already does two
       * — and this is a summary badge, not a schedule the author edits here.
       * `sent` counts nudges that actually went out; `holdout` marks the ones we
       * deliberately kept quiet so the recovery number means something.
       *
       * Scoped to the same window as the rows: aggregating every follow-up the
       * form ever scheduled to badge fifty of them is work whose size has
       * nothing to do with what is on screen.
       */
      c.env.DB.prepare(
        `SELECT submission_id,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
                SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
                MAX(CASE WHEN status = 'holdout' THEN 1 ELSE 0 END) AS holdout,
                -- When the next one is due. Only the steps still waiting count:
                -- this is the number the results table renders as "Reminder in 1h",
                -- and it has to be a time in the future or nothing at all.
                MIN(CASE WHEN status IN ('scheduled','queued') THEN scheduled_at END) AS next_scheduled_at,
                MAX(sent_at) AS last_sent_at,
                -- Why the sequence stopped, if it did. Newest step wins, because a
                -- later step's verdict supersedes an earlier one's.
                (SELECT reason FROM followups x
                  WHERE x.submission_id = followups.submission_id
                    AND x.status IN ('skipped','failed','cancelled')
                  ORDER BY x.step DESC LIMIT 1) AS stopped_reason,
                (SELECT status FROM followups x
                  WHERE x.submission_id = followups.submission_id
                    AND x.status IN ('skipped','failed','cancelled')
                  ORDER BY x.step DESC LIMIT 1) AS stopped_status
           FROM followups
          WHERE form_id = ?1 AND submission_id IN (SELECT id FROM (${WINDOW}))
          GROUP BY submission_id`,
      ).bind(id, effectiveStatus, limit, offset),
      // Rides along for the retired-column pass at the bottom. One row, and it
      // saves the trip that pass used to make on its own.
      c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?1`).bind(id),
      /**
       * How many responses the filter matches, page aside.
       *
       * Counted here rather than inferred from the page, because "fifty rows
       * came back" cannot tell the table whether there is a page fifty-one. It
       * counts the *effective* status, so a Free plan looking at `all` is told
       * how many completed responses it can page through and never a number it
       * is not allowed to open.
       */
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?1 AND ${MATCHES}`,
      ).bind(id, effectiveStatus),
      /**
       * Both tabs' counts, whichever one is being read.
       *
       * The page cannot be counted from itself — fifty rows says nothing about
       * how many there are — and the other tab's badge cannot be counted from
       * this tab's rows at all. The client used to do both from the array it
       * had, which was only ever right while the array was the whole table.
       *
       * Not withheld when the plan is not entitled to partial rows, for the
       * reason the gate above gives: the count is what makes the upsell
       * truthful, and it is the answers that are being sold.
       */
      c.env.DB.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                SUM(CASE WHEN status IN ('abandoned','in_progress','disqualified') THEN 1 ELSE 0 END) AS partial
           FROM submissions WHERE form_id = ?1`,
      ).bind(id),
      // Typed as a tuple because `batch()` returns a positional array: the names
      // above are the only thing keeping a statement matched to its shape.
    ])) as [
      D1Result<SubRow>,
      D1Result<AnswerRow>,
      D1Result<MessageRow>,
      D1Result<FollowUpRow>,
      D1Result<{ working_schema: string }>,
      D1Result<{ n: number }>,
      D1Result<{ total: number; completed: number | null; partial: number | null }>,
    ];

    /** Regrouped in memory, in the order each statement already returned. */
    const answersBySub = new Map<string, AnswerRow[]>();
    for (const a of answerRows.results ?? []) {
      const list = answersBySub.get(a.submission_id);
      if (list) list.push(a);
      else answersBySub.set(a.submission_id, [a]);
    }
    const transcriptBySub = new Map<string, MessageRow[]>();
    for (const m of transcriptRows.results ?? []) {
      const list = transcriptBySub.get(m.submission_id);
      if (list) list.push(m);
      else transcriptBySub.set(m.submission_id, [m]);
    }
    const byId = new Map((followUps.results ?? []).map((r) => [r.submission_id, r]));

    const out = [];
    /** Every ref these rows answered, and what it was answered as. */
    const seen = new Map<string, string>();
    for (const s of subs.results ?? []) {
      const answers = answersBySub.get(s.id) ?? [];
      const transcript = transcriptBySub.get(s.id) ?? [];
      out.push({
        id: s.id,
        status: s.status,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        durationMs: s.duration_ms,
        respondentId: s.respondent_id,
        // Present only for forms that required sign-in.
        respondent: s.respondent_provider
          ? {
              provider: s.respondent_provider,
              label: s.respondent_email ?? s.respondent_phone ?? s.respondent_name ?? "Verified",
              name: s.respondent_name,
            }
          : null,
        answers: answers.map((a) => {
          seen.set(a.block_ref, a.block_type);
          return {
            blockRef: a.block_ref,
            blockType: a.block_type,
            value: JSON.parse(a.value_json),
          };
        }),
        transcript: transcript.map((t) => ({
          role: t.role,
          content: t.content,
          createdAt: t.created_at,
        })),
        /**
         * Null when this response was never in a sequence at all, which is the
         * common case and reads differently from "nudged nobody yet".
         *
         * `recovered` is the number the feature is sold on: they were nudged,
         * and then they finished.
         */
        followUp: byId.has(s.id)
          ? {
              sent: byId.get(s.id)!.sent,
              scheduled: byId.get(s.id)!.scheduled,
              queued: byId.get(s.id)!.queued,
              holdout: byId.get(s.id)!.holdout === 1,
              recovered: byId.get(s.id)!.sent > 0 && s.status === "completed",
              nextScheduledAt: byId.get(s.id)!.next_scheduled_at,
              lastSentAt: byId.get(s.id)!.last_sent_at,
              /**
               * Set only when the sequence ended for a reason, and only when
               * nothing is still pending — a first step that was skipped while
               * the second is still due is not a stopped sequence.
               */
              stoppedReason:
                byId.get(s.id)!.scheduled + byId.get(s.id)!.queued === 0
                  ? byId.get(s.id)!.stopped_reason
                  : null,
              stoppedStatus:
                byId.get(s.id)!.scheduled + byId.get(s.id)!.queued === 0
                  ? byId.get(s.id)!.stopped_status
                  : null,
            }
          : null,
        /**
         * Why no sequence exists at all. Distinct from `followUp.stoppedReason`,
         * which is about one that did: an author looking at a partial with no
         * reminder needs to know whether the cause is their postal address,
         * their plan, an unpublished change, or the respondent opting out —
         * none of which leaves a row behind to point at.
         */
        followUpSkip: s.followup_skip,
      });
    }

    /**
     * The columns the current document cannot account for.
     *
     * Only resolved when the rows actually answered something, and only ever
     * naming refs present in the rows above, so the table never grows a column
     * with nothing under it. The document itself rode in on the batch; the
     * version scan below is the one query that cannot — it is asked for only
     * when a ref has no live block to explain it, which is rare.
     */
    let retiredColumns: unknown[] = [];
    if (seen.size > 0) {
      const form = (formRow.results ?? [])[0];
      const doc = form ? safeReadFormDoc(JSON.parse(form.working_schema)) : null;
      if (doc) {
        retiredColumns = await resolveRetiredBlocks(c.env, id, seen, new Set(doc.blocks.map((b) => b.ref)));
      }
    }

    const counts = (countsRow.results ?? [])[0];
    return c.json({
      submissions: out,
      retiredColumns,
      total: (totalRow.results ?? [])[0]?.n ?? 0,
      limit,
      offset,
      counts: {
        total: counts?.total ?? 0,
        completed: counts?.completed ?? 0,
        partial: counts?.partial ?? 0,
      },
    });
  },
);

/**
 * Delete responses, by id.
 *
 * The `submission:delete` permission has been in the role table since roles
 * existed and nothing has ever asked for it — the dashboard could show a
 * response and export it, but a test run, a duplicate, or someone's private
 * data submitted by mistake could not be removed by the person responsible for
 * it. Bulk by construction: the table selects with checkboxes, and one
 * statement for a hundred ids beats a hundred round trips to D1.
 *
 * The transcript goes with it. A conversation is the response's content, not a
 * separate artefact, so leaving `chat_messages` behind after deleting the
 * answers would keep exactly the thing the person asked to be rid of; the
 * session row is deleted and its messages cascade.
 */
resultsRouter.delete(
  "/forms/:id/submissions",
  describeRoute({
    tags: ["dashboard"],
    summary: "Delete responses",
    responses: {
      200: { description: "How many were deleted", content: { "application/json": { schema: resolver(z.object({ deleted: z.number() })) } } },
      403: { description: "Role may not delete responses" },
    },
  }),
  validator("json", z.object({ ids: z.array(z.string()).min(1).max(200) })),
  async (c) => {
    const formId = c.get("form")!.id;
    const denied = await assertPermission(c, "submission", "delete");
    if (denied) return denied;

    const { ids } = c.req.valid("json");

    /**
     * Chunked, because the body accepts two hundred ids and D1 binds a hundred
     * parameters per statement — batch or no batch. Naming all two hundred in
     * one `IN (…)` was `too many SQL variables`, and only in production: the
     * local D1 does not enforce the cap, so no test here could have failed.
     * Selecting every row on a page of a hundred and pressing Delete was
     * already enough to reach it.
     *
     * Scoped to this form as well as to the ids: `requireFormAccess` proves the
     * caller owns the form, and this is what stops an id from another form —
     * or another tenant — riding along in the list.
     */
    const ownedPages = (await c.env.DB.batch(
      bindChunks(ids).map((chunk) =>
        c.env.DB
          .prepare(`SELECT id, session_id FROM submissions WHERE form_id = ? AND id IN (${holesFor(chunk)})`)
          .bind(formId, ...chunk),
      ),
    )) as D1Result<{ id: string; session_id: string | null }>[];

    const rows = ownedPages.flatMap((p) => p.results ?? []);
    if (rows.length === 0) return c.json({ deleted: 0 });

    /**
     * Every session that held part of this conversation, not just the one the
     * response row points at.
     *
     * `submissions.session_id` names whichever session *created* the row; a
     * respondent who reloads continues in a new session that adopts it, and
     * that is where the messages end up. Deleting only the named session left
     * the transcript behind — the exact thing the note above says must go with
     * the answers. `chat_sessions.submission_id` is the reverse pointer and
     * catches the rest; the two are unioned because neither is complete alone.
     */
    const claimPages = (await c.env.DB.batch(
      bindChunks(rows.map((r) => r.id)).map((chunk) =>
        c.env.DB
          .prepare(`SELECT id FROM chat_sessions WHERE submission_id IN (${holesFor(chunk)})`)
          .bind(...chunk),
      ),
    )) as D1Result<{ id: string }>[];

    const sessionIds = [
      ...new Set([
        ...rows.map((r) => r.session_id).filter((s): s is string => s !== null),
        ...claimPages.flatMap((p) => (p.results ?? []).map((r) => r.id)),
      ]),
    ];
    const stmts = [
      ...bindChunks(rows.map((r) => r.id)).map((chunk) =>
        c.env.DB
          .prepare(`DELETE FROM submissions WHERE form_id = ? AND id IN (${holesFor(chunk)})`)
          .bind(formId, ...chunk),
      ),
      ...bindChunks(sessionIds).map((chunk) =>
        c.env.DB.prepare(`DELETE FROM chat_sessions WHERE id IN (${holesFor(chunk)})`).bind(...chunk),
      ),
    ];
    await c.env.DB.batch(stmts);
    return c.json({ deleted: rows.length });
  },
);

/**
 * The exports.
 *
 * CSV and XLSX are the same table in two containers, so they are one handler
 * over `buildResponseTable` rather than two transcriptions of the same column
 * logic. The CSV path also stopped issuing one query per submission on the way
 * out — see `lib/response-table.ts`.
 */
type ExportCtx = Context<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>;

async function exportSubmissions(c: ExportCtx, format: "csv" | "xlsx") {
  const id = c.get("form")!.id;
  const roleDenied = await assertPermission(c, "submission", "export");
  if (roleDenied) return roleDenied;

  /**
   * Exporting what you finished collecting is free — taking your own data with you must
   * never be the thing behind the paywall. What is gated is the same slice gated
   * everywhere else: the unfinished responses.
   *
   * `includePartials=false` is not a silent narrowing; the button in the UI says
   * "Export 47 responses" and shows the locked partial count beside it.
   */
  const includePartials = new URL(c.req.url).searchParams.get("includePartials") === "true";
  if (includePartials) {
    const denied = await assertFeature(c, "export_partials", { surface: "results.export" });
    if (denied) return denied;
  }

  const table = await buildResponseTable(c.env, id, { includePartials });
  if (!table) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

  if (format === "xlsx") {
    const bytes = await buildXlsx(table.header, table.rows);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="responses-${id}.xlsx"`,
        "cache-control": "private, no-store",
      },
    });
  }

  return new Response(toCsv(table), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="submissions-${id}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

resultsRouter.get(
  "/forms/:id/submissions/export",
  describeRoute({
    tags: ["dashboard"],
    summary: "Export submissions as CSV",
    responses: {
      200: { description: "CSV file", content: { "text/csv": { schema: resolver(z.string()) } } },
      404: { description: "Form not found" },
    },
  }),
  (c) => exportSubmissions(c, "csv"),
);

/**
 * The same responses as a real workbook.
 *
 * Asked for by name, and not the same thing as a CSV: typed cells, a frozen
 * bold header, filters, and columns wide enough to read. A CSV renamed `.xls`
 * is what a spreadsheet import usually degenerates into, and it is why phone
 * numbers arrive with their leading zeros gone.
 */
resultsRouter.get(
  "/forms/:id/submissions/export.xlsx",
  describeRoute({
    tags: ["dashboard"],
    summary: "Export submissions as an Excel workbook",
    responses: {
      200: { description: "XLSX file" },
      404: { description: "Form not found" },
    },
  }),
  (c) => exportSubmissions(c, "xlsx"),
);

/**
 * The analytics summary the dashboard draws.
 *
 * This used to be a second implementation of `computeAnalytics` — the same
 * counts, the same funnel, the same distributions, written again inline and
 * drifting: it read the *draft* schema while counting answers from published
 * versions, and it cost two statements per question plus a correlated subquery
 * for the total. The numbers the dashboard shows and the numbers `/v1` serves
 * are now the same numbers.
 */
resultsRouter.get(
  "/forms/:id/analytics",
  describeRoute({
    tags: ["dashboard"],
    summary: "Analytics summary (counts, funnel, per-question distributions)",
    responses: { 200: { description: "Summary", content: { "application/json": { schema: resolver(Summary) } } } },
  }),
  async (c) => {
    const id = c.get("form")!.id;
    const agg = await computeAnalytics(c.env, id);

    /**
     * Basic analytics are free; advanced analytics are Pro.
     *
     * The split is deliberate about which half is which. Views, starts, completions,
     * completion rate and the abandoned count stay real and unblurred on every plan —
     * those are the numbers that make someone curious. What is withheld is the *detail*
     * that answers the curiosity: which question people drop off at, how each one
     * performed, what the answers actually were, and where they came from.
     *
     * `locked` names what was withheld and `worstBlock` names where the drop-off is
     * without giving the number, so a free user can be told "most people drop off at
     * question 4" truthfully. That sentence is the entire upsell.
     */
    const advanced = await hasFeature(c, "advanced_analytics");
    const roleAdvanced = !(await assertPermission(c, "analytics", "read_advanced"));
    const showDetail = advanced && roleAdvanced;

    const worst = agg.perBlock.reduce<{ title: string; index: number } | null>((acc, b, i) => {
      if (acc === null) return { title: b.title, index: i + 1 };
      const prev = agg.perBlock[acc.index - 1];
      return prev && b.answerRate < prev.answerRate ? { title: b.title, index: i + 1 } : acc;
    }, null);

    return c.json({
      views: agg.views,
      starts: agg.starts,
      completed: agg.completed,
      abandoned: agg.abandoned,
      completionRate: agg.completionRate,
      avgDurationMs: showDetail ? agg.avgDurationMs : null,
      medianDurationMs: showDetail ? agg.medianDurationMs : null,
      perBlock: showDetail ? agg.perBlock : [],
      distributions: showDetail ? agg.distributions : [],
      daily: showDetail ? agg.daily : [],
      bySource: showDetail ? agg.bySource : [],
      byCountry: showDetail ? agg.byCountry : [],
      byDevice: showDetail ? agg.byDevice : null,
      durationBuckets: showDetail ? agg.durationBuckets : [],
      locked: showDetail
        ? []
        : ["perBlock", "distributions", "avgDurationMs", "medianDurationMs", "daily", "bySource", "byCountry", "byDevice", "durationBuckets"],
      lockedContext: showDetail
        ? null
        : {
            feature: "advanced_analytics",
            requiredPlan: "pro",
            questionCount: agg.perBlock.length,
            worstBlockTitle: worst?.title ?? null,
            worstBlockIndex: worst?.index ?? null,
          },
    });
  },
);

const FollowUpSummary = z.object({
  everScheduled: z.boolean(),
  sent: z.number(),
  pending: z.number(),
  clicked: z.number(),
  recovered: z.number(),
  clickRate: z.number(),
  recoveryRate: z.number(),
  byStep: z.array(
    z.object({ step: z.number(), sent: z.number(), clicked: z.number(), recovered: z.number() }),
  ),
  daily: z.array(z.object({ date: z.string(), sent: z.number(), recovered: z.number() })),
  holdout: z.object({ people: z.number(), recovered: z.number(), rate: z.number() }).nullable(),
  liftPoints: z.number().nullable(),
});

/**
 * What the follow-ups recovered.
 *
 * Separate from `/analytics` rather than folded into it, for two reasons. It is
 * gated on a different feature — an author can be entitled to send nudges and
 * not to advanced analytics, and refusing them the report on the mail they are
 * paying to send would be absurd — and it is dead weight on every form that has
 * follow-ups switched off, which is most of them.
 *
 * An unentitled or never-configured form gets `everScheduled: false` and zeros
 * rather than a 402. There is nothing withheld here: the client draws the pitch
 * for a feature that is off, and a payment-required on a page someone opened to
 * read their results is a worse answer than "nothing to show yet".
 */
resultsRouter.get(
  "/forms/:id/followup-analytics",
  describeRoute({
    tags: ["dashboard"],
    summary: "Follow-up recovery report (sent, clicked, recovered, holdout lift)",
    responses: { 200: { description: "Recovery report", content: { "application/json": { schema: resolver(FollowUpSummary) } } } },
  }),
  async (c) => {
    const id = c.get("form")!.id;
    return c.json(await computeFollowUpStats(c.env, id));
  },
);
