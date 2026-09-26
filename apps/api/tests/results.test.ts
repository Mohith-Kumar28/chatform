import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";

/**
 * The submissions list and its status filter.
 *
 * The filter regressed when the status was moved out of an interpolated string
 * into a bound parameter: mixing `?` with `?1` makes SQLite renumber the
 * placeholders, so the statement wanted two bindings while three were supplied
 * and every request 500'd. The tenancy suite only asserted the 404 path, so
 * nothing caught it.
 */

let t: Tenant;

/** Put the tenant on Pro. The plan row exists because `subscriptions.plan_id` is an FK. */
async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1) ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?) ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_rs_${orgId}`, orgId, `dodo_rs_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("results");

  const now = Date.now();
  // submissions.form_version_id is a real FK — a published version must exist.
  await env.DB.prepare(
    `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
     VALUES ('ver_x', ?, 1, ?, 'sum', ?, ?, ?)`,
  )
    .bind(t.formId, JSON.stringify(minimalDoc("results")), now, t.userId, now)
    .run();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at, duration_ms)
       VALUES (?, ?, 'ver_x', ?, 'chs_done', 'completed', ?, ?, 4200)`,
    ).bind("sbm_done", t.formId, t.orgId, now - 5000, now),
    env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at)
       VALUES (?, ?, 'ver_x', ?, 'chs_part', 'in_progress', ?)`,
    ).bind("sbm_partial", t.formId, t.orgId, now - 2000),
    env.DB.prepare(
      `INSERT INTO submission_answers (id, submission_id, form_id, block_ref, block_type, value_json, updated_at)
       VALUES ('ans_1', 'sbm_done', ?, 'q_email', 'email', ?, ?)`,
    ).bind(t.formId, JSON.stringify("grace@hopper.dev"), now),
  ]);
});

const auth = () => ({ cookie: t.cookie });

interface Row {
  id: string;
  status: string;
  answers: { blockRef: string; value: unknown }[];
  transcript: unknown[];
  followUp: {
    sent: number;
    clicked: number;
    recovered: boolean;
    recoveredAt: number | null;
    recoveredStep: number | null;
    recoveredSentAt: number | null;
  } | null;
}

interface ListBody {
  submissions: Row[];
  retiredColumns: { ref: string; title: string; type: string }[];
  total: number;
  limit: number;
  offset: number;
  counts: { total: number; completed: number; partial: number };
}

describe("submissions list", () => {
  it("lists every reminder step, including one cancelled because they came back", async () => {
    const now = Date.now();
    await env.DB.prepare(`DELETE FROM followups WHERE submission_id = 'sbm_done'`).run();
    await env.DB.batch(
      (
        [
          [1, "sent", null, now - 3_600_000],
          [2, "cancelled", "resumed", null],
        ] as const
      ).map(([step, status, reason, sentAt]) =>
        env.DB.prepare(
          `INSERT INTO followups (id, submission_id, form_id, organization_id, channel, address,
                                  address_source, step, status, reason, scheduled_at, sent_at, created_at)
           VALUES (?, 'sbm_done', ?, ?, 'email', 'p@example.com', 'answer', ?, ?, ?, ?, ?, ?)`,
        ).bind(`flw_steps_${step}`, t.formId, t.orgId, step, status, reason, now, sentAt, now),
      ),
    );
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=completed`, { headers: auth() });
    const { submissions: rows } = await res.json<{
      submissions: Array<{ id: string; followUp: { sent: number; steps: unknown; stoppedReason: string | null } | null }>;
    }>();
    const f = rows.find((r) => r.id === "sbm_done")?.followUp;
    expect(f?.sent).toBe(1);
    expect(f?.steps).toEqual([
      { step: 1, status: "sent" },
      { step: 2, status: "cancelled" },
    ]);
    expect(f?.stoppedReason).toBe("resumed");
    await env.DB.prepare(`DELETE FROM followups WHERE id LIKE 'flw_steps_%'`).run();
  });

  it("returns rows with their answers", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions`, { headers: auth() });
    expect(res.status).toBe(200);
    const { submissions: rows } = await res.json<ListBody>();
    expect(rows.length).toBeGreaterThan(0);
    const done = rows.find((r) => r.id === "sbm_done");
    expect(done?.answers[0]?.value).toBe("grace@hopper.dev");
  });

  it("filters by status", async () => {
    const completed = await fetchApi(`/api/forms/${t.formId}/submissions?status=completed`, {
      headers: auth(),
    });
    expect(completed.status).toBe(200);
    const { submissions: rows } = await completed.json<ListBody>();
    expect(rows.every((r) => r.status === "completed")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(false);
  });

  it("status=all degrades to completed-only on Free rather than erroring", async () => {
    // Unfinished responses are a Pro feature. `all` is what the dashboard sends by
    // default, so it narrows instead of failing — the results page must still render.
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    expect(res.status).toBe(200);
    const { submissions: rows } = await res.json<ListBody>();
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(false);
  });

  it("status=all returns both once the plan includes partials", async () => {
    await subscribePro(t.orgId);
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    const { submissions: rows } = await res.json<ListBody>();
    expect(rows.some((r) => r.id === "sbm_done")).toBe(true);
    expect(rows.some((r) => r.id === "sbm_partial")).toBe(true);
  });

  /**
   * Newest submitted first — not newest opened.
   *
   * A response begun before every other one and finished after every other one
   * is the newest submission on the form, and the table's own Submitted column
   * says so. Ordering on `started_at` filed it under the day it was opened, so
   * the newest row landed halfway down a list whose dates then read as random.
   */
  it("sorts by when a response was submitted, not when it was opened", async () => {
    await subscribePro(t.orgId);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at)
       VALUES ('sbm_slow', ?, 'ver_x', ?, 'chs_slow', 'completed', ?, ?)`,
    )
      .bind(t.formId, t.orgId, now - 86_400_000, now + 1000)
      .run();

    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    const { submissions: rows } = await res.json<ListBody>();
    expect(rows[0]?.id).toBe("sbm_slow");
    // And the one completed a moment ago still outranks the one merely opened
    // a moment ago, which is the same rule seen from the other side.
    expect(rows.findIndex((r) => r.id === "sbm_done")).toBeLessThan(
      rows.findIndex((r) => r.id === "sbm_partial"),
    );
  });

  /**
   * The page, and how much of the table it is.
   *
   * The endpoint used to return the newest fifty rows and say nothing about the
   * rest, so a form with thousands of responses had all but fifty of them
   * missing from the only screen that shows them.
   */
  it("pages, and says how many rows there are in total", async () => {
    await subscribePro(t.orgId);
    const first = await fetchApi(`/api/forms/${t.formId}/submissions?status=all&limit=1&offset=0`, {
      headers: auth(),
    });
    expect(first.status).toBe(200);
    const one = await first.json<ListBody>();
    expect(one.submissions.length).toBe(1);
    expect(one.total).toBeGreaterThanOrEqual(2);
    expect(one.limit).toBe(1);
    expect(one.offset).toBe(0);

    const second = await fetchApi(`/api/forms/${t.formId}/submissions?status=all&limit=1&offset=1`, {
      headers: auth(),
    });
    const two = await second.json<ListBody>();
    expect(two.submissions.length).toBe(1);
    // A different row, and the same total — newest first, so the offset walks back.
    expect(two.submissions[0]?.id).not.toBe(one.submissions[0]?.id);
    expect(two.total).toBe(one.total);
    // The answers and the transcript still belong to the row on *this* page.
    expect(two.submissions[0]?.answers).toBeDefined();
  });

  it("counts both tabs whichever one is being read", async () => {
    await subscribePro(t.orgId);
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=completed&limit=1`, {
      headers: auth(),
    });
    const body = await res.json<ListBody>();
    // `total` is the filter's, `counts` is the table's — the completed tab must
    // still be able to badge the partial one.
    expect(body.total).toBe(body.counts.completed);
    expect(body.counts.partial).toBeGreaterThanOrEqual(1);
  });

  it("status=partial is every started-and-unfinished response", async () => {
    await subscribePro(t.orgId);
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=partial`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = await res.json<ListBody>();
    expect(body.submissions.every((r) => r.status !== "completed")).toBe(true);
    expect(body.submissions.some((r) => r.id === "sbm_partial")).toBe(true);
    expect(body.total).toBe(body.counts.partial);
  });

  /**
   * The reminder pill, which is the only place an author sees attribution
   * per response.
   *
   * It used to be computed in the handler as "was reminded, and is completed",
   * so every completion that had ever had a reminder scheduled came back green
   * — including one that finished a month after the last message — while the
   * analytics page counted only what `creditFollowUpRecovery` had credited. The
   * two screens disagreed about the same form. These assert that the row now
   * reports what the table has, and nothing more.
   */
  describe("reminder attribution on a row", () => {
    /** One sent reminder against `sbm_done`, credited or not as asked. */
    async function reminder(opts: { recoveredAt: number | null; sentAgoMs: number }): Promise<void> {
      const now = Date.now();
      await env.DB.prepare(`DELETE FROM followups WHERE submission_id = 'sbm_done'`).run();
      await env.DB.prepare(
        `INSERT INTO followups (id, submission_id, form_id, organization_id, channel, address,
                                address_source, step, status, scheduled_at, sent_at, recovered_at, created_at)
         VALUES ('flw_res_1', 'sbm_done', ?, ?, 'email', 'grace@hopper.dev', 'answer', 2, 'sent',
                 ?, ?, ?, ?)`,
      )
        .bind(t.formId, t.orgId, now - opts.sentAgoMs, now - opts.sentAgoMs, opts.recoveredAt, now)
        .run();
    }

    async function rowFor(id: string): Promise<Row | undefined> {
      const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=completed`, {
        headers: auth(),
      });
      const body = await res.json<ListBody>();
      return body.submissions.find((r) => r.id === id);
    }

    it("reports the credited step and when the message that earned it went out", async () => {
      const at = Date.now();
      await reminder({ recoveredAt: at, sentAgoMs: 6 * 3_600_000 });
      const row = await rowFor("sbm_done");
      expect(row?.followUp?.recovered).toBe(true);
      expect(row?.followUp?.recoveredAt).toBe(at);
      // Which of the author's messages, so the column can name it rather than
      // saying "a reminder" about a sequence of three.
      expect(row?.followUp?.recoveredStep).toBe(2);
      expect(row?.followUp?.recoveredSentAt).toBe(at - 6 * 3_600_000);
    });

    it("does not call a completion a recovery just because a reminder went out", async () => {
      // Sent, completed, and never credited — a response that finished long
      // after the reminder had stopped being the reason. The pill must say they
      // were reminded and must not claim the reminder did it.
      await reminder({ recoveredAt: null, sentAgoMs: 40 * 86_400_000 });
      const row = await rowFor("sbm_done");
      expect(row?.followUp?.sent).toBe(1);
      expect(row?.followUp?.recovered).toBe(false);
      expect(row?.followUp?.recoveredAt).toBeNull();
      expect(row?.followUp?.recoveredStep).toBeNull();
    });

    it("reports opens separately from credit", async () => {
      await reminder({ recoveredAt: null, sentAgoMs: 3_600_000 });
      const clickedAt = Date.now() - 1_800_000;
      await env.DB.prepare(`UPDATE followups SET clicked_at = ? WHERE id = 'flw_res_1'`)
        .bind(clickedAt)
        .run();
      const row = await rowFor("sbm_done");
      // They opened the link. That is its own fact about the mail — the
      // click-through rate — and it is no longer what earns the credit.
      expect(row?.followUp?.clicked).toBe(1);
      expect(row?.followUp?.recovered).toBe(false);
    });

    it("leaves a response that was never in a sequence alone", async () => {
      await env.DB.prepare(`DELETE FROM followups WHERE submission_id = 'sbm_done'`).run();
      const row = await rowFor("sbm_done");
      expect(row?.followUp).toBeNull();
    });
  });

  it("analytics responds", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/analytics`, { headers: auth() });
    expect(res.status).toBe(200);
    const a = await res.json<{ completed: number }>();
    expect(a.completed).toBeGreaterThanOrEqual(1);
  });

  it("CSV export responds with rows", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions/export`, { headers: auth() });
    expect(res.status).toBe(200);
    const csv = await res.text();
    expect(csv).toContain("grace@hopper.dev");
  });
});

/**
 * The transcript belongs to the response, not to the session that opened it.
 *
 * `submissions.session_id` names whichever session created the row and is never
 * re-pointed. A respondent who reloads continues in a *new* session, which
 * adopts the open row — so the conversation ends up under a session id the
 * response has never heard of. Joining on the stale pointer showed "No
 * conversation was recorded" on a completed registration whose seventeen
 * messages were sitting in the table the whole time, and showed only the first
 * half of a conversation that spanned two sittings.
 */
describe("transcripts follow the response, not the pointer", () => {
  const now = Date.now();

  beforeAll(async () => {
    await subscribePro(t.orgId);
    await env.DB.batch([
      // The row was opened by `chs_opener`, which then went quiet with nothing said.
      env.DB.prepare(
        `INSERT INTO submissions (id, form_id, form_version_id, organization_id, session_id, status, started_at, completed_at)
         VALUES ('sbm_adopted', ?, 'ver_x', ?, 'chs_opener', 'completed', ?, ?)`,
      ).bind(t.formId, t.orgId, now - 9000, now),
      env.DB.prepare(
        `INSERT INTO chat_sessions (id, form_id, organization_id, respondent_token_hash, status, created_at, last_activity_at)
         VALUES ('chs_opener', ?, ?, 'h_opener', 'abandoned', ?, ?)`,
      ).bind(t.formId, t.orgId, now - 9000, now - 9000),
      // The respondent reloaded; this session adopted the row and holds the talking.
      env.DB.prepare(
        `INSERT INTO chat_sessions (id, form_id, organization_id, respondent_token_hash, status, submission_id, created_at, last_activity_at)
         VALUES ('chs_adopter', ?, ?, 'h_adopter', 'completed', 'sbm_adopted', ?, ?)`,
      ).bind(t.formId, t.orgId, now - 8000, now),
      env.DB.prepare(
        `INSERT INTO chat_messages (id, session_id, role, content, created_at)
         VALUES ('cm_a1', 'chs_adopter', 'assistant', 'What is your Team Name?', ?)`,
      ).bind(now - 7000),
      env.DB.prepare(
        `INSERT INTO chat_messages (id, session_id, role, content, created_at)
         VALUES ('cm_a2', 'chs_adopter', 'user', 'Tech Divas', ?)`,
      ).bind(now - 6000),
    ]);
  });

  it("reads the adopting session's messages, not the empty opener's", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    expect(res.status).toBe(200);
    const { submissions: rows } = await res.json<ListBody>();
    const adopted = rows.find((r) => r.id === "sbm_adopted");
    expect(adopted?.transcript).toHaveLength(2);
    expect(adopted?.transcript).toMatchObject([
      { role: "assistant", content: "What is your Team Name?" },
      { role: "user", content: "Tech Divas" },
    ]);
  });

  it("keeps a conversation that spanned two sittings whole", async () => {
    // The opener did say something after all — both halves must come back, in order.
    await env.DB.prepare(
      `INSERT INTO chat_messages (id, session_id, role, content, created_at)
       VALUES ('cm_o1', 'chs_opener', 'assistant', 'Welcome back.', ?)`,
    )
      .bind(now - 8500)
      .run();
    await env.DB.prepare(`UPDATE chat_sessions SET submission_id = 'sbm_adopted' WHERE id = 'chs_opener'`).run();

    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    const { submissions: rows } = await res.json<ListBody>();
    const adopted = rows.find((r) => r.id === "sbm_adopted");
    expect(adopted?.transcript.map((m) => (m as { content: string }).content)).toEqual([
      "Welcome back.",
      "What is your Team Name?",
      "Tech Divas",
    ]);
  });

  /*
   * Not covered here: a message whose session row has been swept away. The
   * production database has them — the response this suite was written for
   * pointed at a session id `chat_sessions` no longer holds — but the FK is
   * enforced in the test binding, so the state cannot be built. It is why the
   * session join in the query is LEFT and why the second arm matches on
   * `m.session_id` rather than `cs.id`; an inner join drops those rows.
   */
  it("a response that never had a chat still reads as empty", async () => {
    const res = await fetchApi(`/api/forms/${t.formId}/submissions?status=all`, { headers: auth() });
    const { submissions: rows } = await res.json<ListBody>();
    expect(rows.find((r) => r.id === "sbm_partial")?.transcript).toEqual([]);
  });
});
