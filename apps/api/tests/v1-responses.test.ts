import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, seedKey, fetchApi, type Tenant } from "./helpers.js";

/**
 * The response lifecycle, and the reason it is a lifecycle.
 *
 * A single "post the whole form" endpoint would create completed rows with no
 * per-question history, and every partial count, drop-off funnel and Summary
 * distribution would quietly mean something different for API traffic. So the
 * central assertion here is not that the endpoints work — it is that an answer
 * row appears the moment each answer is recorded, exactly as a conversation
 * produces one.
 */

let t: Tenant;
let key: string;

const SLUG = "v1-responses";
const VERSION_ID = "ver_v1resp";

/** Two questions and a branch: enough to prove flow enforcement means something. */
const DOC = {
  schemaVersion: 4,
  title: "Lifecycle",
  blocks: [
    { id: "blk_lcemail1", ref: "q_email", type: "email", title: "Email?", required: true },
    {
      id: "blk_lcrole01", ref: "q_role", type: "single_select", title: "Role?", required: true,
      options: [
        { id: "opt_founder1", label: "Founder" },
        { id: "opt_design01", label: "Designer" },
      ],
    },
    {
      id: "blk_lcdetail", ref: "q_detail", type: "long_text", title: "Tell us more", required: false,
      minLength: 0, maxLength: 200,
      visibility: {
        op: "and",
        conditions: [{ left: { kind: "ref", ref: "q_role" }, op: "neq", value: "opt_design01" }],
        groups: [],
      },
    },
    { id: "blk_lcrate01", ref: "q_rating", type: "rating", title: "Rate us", required: true, scale: 5 },
  ],
  endings: [{ id: "end_lc00001", ref: "end_thanks", title: "Thanks!", bodyMd: "" }],
  logic: [],
  endingRules: [],
  variables: [],
  hiddenFields: [{ name: "utm_source" }],
  layout: {},
  settings: {},
  theme: {},
};

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
    .bind(`sub_v1r_${orgId}`, orgId, `dodo_v1r_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const api = (path: string, init: RequestInit = {}) =>
  fetchApi(path, {
    ...init,
    headers: { "x-api-key": key, "content-type": "application/json", ...(init.headers as Record<string, string>) },
  });

const answerRows = async (id: string) =>
  (
    await env.DB.prepare(
      `SELECT block_ref, block_type, value_json, value_number FROM submission_answers WHERE submission_id = ? ORDER BY block_ref`,
    )
      .bind(id)
      .all<{ block_ref: string; block_type: string; value_json: string; value_number: number | null }>()
  ).results ?? [];

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("v1resp");
  await subscribePro(t.orgId);
  key = (
    await seedKey(t, "v1respkey", {
      scopes: { form: ["read"], response: ["read", "write"], session: ["create", "write", "read"] },
    })
  ).raw;

  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(VERSION_ID, t.formId, JSON.stringify(DOC), now, t.userId),
    env.DB.prepare(
      `UPDATE forms SET status = 'published', slug = ?1, working_schema = ?2, active_version_id = ?3 WHERE id = ?4`,
    ).bind(SLUG, JSON.stringify(DOC), VERSION_ID, t.formId),
  ]);
});

describe("the lifecycle", () => {
  it("writes one answer row per append, keeping the response in progress", async () => {
    const created = await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body: JSON.stringify({ hiddenFields: { utm_source: "docs" } }),
    });
    expect(created.status).toBe(201);
    const response = (await created.json()) as {
      id: string;
      status: string;
      next: { kind: string; block: { ref: string } };
      progress: { answered: number };
    };
    expect(response.status).toBe("in_progress");
    expect(response.next.block.ref).toBe("q_email");

    // The row exists before any answer arrives: opening a response is the start,
    // exactly as opening a conversation is.
    expect(await answerRows(response.id)).toHaveLength(0);

    const first = await api(`/v1/responses/${response.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_email", value: "  Maya@Northwind.CO " }),
    });
    expect(first.status).toBe(200);

    // Immediately — not eventually. The chat path defers this to waitUntil so the
    // stream is never blocked; a REST caller's next read must not be able to
    // miss what it just wrote.
    const afterFirst = await answerRows(response.id);
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]!.block_ref).toBe("q_email");
    // Canonicalised, not stored as sent.
    expect(JSON.parse(afterFirst[0]!.value_json)).toBe("maya@northwind.co");

    const row = await env.DB.prepare(`SELECT status, updated_at FROM submissions WHERE id = ?`)
      .bind(response.id)
      .first<{ status: string; updated_at: number }>();
    expect(row!.status).toBe("in_progress");
    expect(row!.updated_at).toBeGreaterThan(0);

    await api(`/v1/responses/${response.id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_role", value: "Founder" }),
    });
    expect(await answerRows(response.id)).toHaveLength(2);
  });

  it("refuses an answer the flow has not reached", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };

    const res = await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_rating", value: 5 }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; issues: { ref: string; code: string }[] } };
    // Accepting it would report two abandonments at questions nobody was asked.
    expect(body.error.issues[0]!.code).toBe("block_not_reachable");
  });

  it("refuses an answer to a question the branch hid", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };
    await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answers: [{ ref: "q_email", value: "a@b.co" }, { ref: "q_role", value: "opt_design01" }] }),
    });

    const res = await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_detail", value: "hidden by visibility" }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { issues: { code: string }[] } };
    expect(body.error.issues[0]!.code).toBe("block_not_visible");
  });

  it("rejects a whole batch when one answer fails", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };

    const res = await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ answers: [{ ref: "q_email", value: "a@b.co" }, { ref: "q_role", value: "not an option" }] }),
    });
    expect(res.status).toBe(422);
    // All or nothing: a partial write leaves the caller unable to tell what landed.
    expect(await answerRows(id)).toHaveLength(0);
  });

  it("refuses to complete while a required question is unanswered, and names it", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };
    await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_email", value: "a@b.co" }),
    });

    const res = await api(`/v1/responses/${id}/complete`, { method: "POST", body: "{}" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; issues: { ref: string }[] } };
    expect(body.error.code).toBe("incomplete");
    expect(body.error.issues.map((i) => i.ref)).toContain("q_role");
  });

  it("completes, resolving the real ending and stamping the response", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };
    await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({
        answers: [
          { ref: "q_email", value: "a@b.co" },
          { ref: "q_role", value: "opt_design01" },
          { ref: "q_rating", value: 4 },
        ],
      }),
    });

    const res = await api(`/v1/responses/${id}/complete`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; ending_ref: string; ending: { title: string }; duration_ms: number };
    expect(body.status).toBe("completed");
    expect(body.ending_ref).toBe("end_thanks");
    // The real ending, not the placeholder {title:"Complete"} the old /v1 sent.
    expect(body.ending.title).toBe("Thanks!");

    const row = await env.DB.prepare(`SELECT status, duration_ms, search_text FROM submissions WHERE id = ?`)
      .bind(id)
      .first<{ status: string; duration_ms: number; search_text: string }>();
    expect(row!.status).toBe("completed");
    expect(row!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(row!.search_text).toContain("a@b.co");

    // Completing twice is a conflict, not a second webhook.
    const again = await api(`/v1/responses/${id}/complete`, { method: "POST", body: "{}" });
    expect(again.status).toBe(409);
  });

  it("keeps later answers when one is retracted, as the chat edit does", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };
    await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({
        answers: [{ ref: "q_email", value: "a@b.co" }, { ref: "q_role", value: "opt_design01" }],
      }),
    });

    const res = await api(`/v1/responses/${id}/answers/q_email`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { next: { block: { ref: string } } };
    expect(body.next.block.ref, "the flow moves back to the retracted question").toBe("q_email");

    const rows = await answerRows(id);
    expect(rows.map((r) => r.block_ref)).toEqual(["q_role"]);
  });

  it("abandons an unfinished response without pretending it completed", async () => {
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };
    await api(`/v1/responses/${id}/answers`, {
      method: "POST",
      body: JSON.stringify({ ref: "q_email", value: "a@b.co" }),
    });

    const res = await api(`/v1/responses/${id}/abandon`, {
      method: "POST",
      body: JSON.stringify({ reason: "gave_up" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; abandon_reason: string };
    expect(body.status).toBe("abandoned");
    expect(body.abandon_reason).toBe("gave_up");
    // The partial answer is kept: that is the whole point of tracking partials.
    expect(await answerRows(id)).toHaveLength(1);
  });
});

describe("single-shot", () => {
  it("produces the same per-answer rows as the step-by-step path", async () => {
    const res = await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body: JSON.stringify({
        answers: { q_email: "one@shot.co", q_role: "opt_design01", q_rating: 5 },
        complete: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string; ending_ref: string };
    expect(body.status).toBe("completed");
    expect(body.ending_ref).toBe("end_thanks");

    // The convenience is a shortcut through the API, not through the data model:
    // three answers, three rows, with the numeric one extracted for the Summary
    // tab's averages.
    const rows = await answerRows(body.id);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.block_ref === "q_rating")?.value_number).toBe(5);
    expect(rows.find((r) => r.block_ref === "q_email")?.block_type).toBe("email");
  });

  it("refuses to complete a single-shot that is missing a required answer", async () => {
    const res = await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body: JSON.stringify({ answers: { q_email: "half@done.co" }, complete: true }),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("incomplete");
  });
});

describe("idempotency", () => {
  it("replays the first result instead of creating a second response", async () => {
    const idem = crypto.randomUUID();
    const body = JSON.stringify({ answers: { q_email: "idem@x.co" } });

    const first = await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body,
      headers: { "idempotency-key": idem },
    });
    const second = await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body,
      headers: { "idempotency-key": idem },
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotency-replayed")).toBe("true");
    const a = (await first.json()) as { id: string };
    const b = (await second.json()) as { id: string };
    expect(b.id).toBe(a.id);

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ? AND search_text IS NULL AND id IN (?, ?)`,
    )
      .bind(t.formId, a.id, b.id)
      .first<{ n: number }>();
    expect(count!.n).toBe(1);
  });

  it("refuses the same key with a different body", async () => {
    const idem = crypto.randomUUID();
    await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body: JSON.stringify({ answers: { q_email: "one@x.co" } }),
      headers: { "idempotency-key": idem },
    });
    const res = await api(`/v1/forms/${t.formId}/responses`, {
      method: "POST",
      body: JSON.stringify({ answers: { q_email: "two@x.co" } }),
      headers: { "idempotency-key": idem },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    // Replaying the first response here would hide a caller bug behind a
    // plausible success.
    expect(body.error.code).toBe("idempotency_key_reuse");
  });
});

describe("tenancy", () => {
  it("hides another organization's response behind a 404", async () => {
    const other = await seedTenant("v1respb");
    // On a paid plan, so the request reaches the resource lookup rather than
    // stopping at the api_access gate — a 402 would prove nothing about tenancy.
    await subscribePro(other.orgId);
    const otherKey = (await seedKey(other, "v1respbkey")).raw;
    const { id } = (await (
      await api(`/v1/forms/${t.formId}/responses`, { method: "POST", body: "{}" })
    ).json()) as { id: string };

    const res = await fetchApi(`/v1/responses/${id}`, { headers: { "x-api-key": otherKey } });
    expect(res.status).toBe(404);
  });
});
