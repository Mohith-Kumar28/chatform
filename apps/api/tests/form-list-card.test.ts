import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, fetchApi, minimalDoc, type Tenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { invalidateEntitlements } from "../src/lib/entitlements.js";
import { PLANS } from "@repo/entitlements";

/**
 * The two numbers the dashboard grid draws its cards from.
 *
 * Both are derived rather than stored, and both were wrong by omission before:
 * the card read "1 response" for a form thirty-seven people had abandoned, and
 * it had no way at all to say that a live form's draft had moved on. Neither
 * is checkable by eye once the grid has thirty cards on it, so they are
 * checked here.
 */

const DB = () => env as unknown as Bindings;
const auth = (t: Tenant) => ({ cookie: t.cookie, "content-type": "application/json" });

let org: Tenant;

interface ListItem {
  id: string;
  responses: number;
  partials: number;
  hasUnpublishedChanges: boolean;
}

async function seedPlans(): Promise<void> {
  for (const plan of Object.values(PLANS)) {
    await DB()
      .DB.prepare(
        `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents,
                            currency, features_json, limits_json, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
         ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json`,
      )
      .bind(plan.id, plan.id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, plan.seatPriceCents,
            JSON.stringify(plan.features), JSON.stringify(plan.limits), plan.sortOrder)
      .run();
  }
}

async function card(): Promise<ListItem> {
  const res = await fetchApi(`/api/forms?ws=${org.workspaceId}`, { headers: auth(org) });
  expect(res.status).toBe(200);
  const rows = await res.json<ListItem[]>();
  const row = rows.find((r) => r.id === org.formId);
  if (!row) throw new Error("seeded form missing from its own workspace listing");
  return row;
}

/** A submission in whatever state, with no answers — only its status is read here. */
async function submission(id: string, status: string): Promise<void> {
  const now = Date.now();
  await DB()
    .DB.prepare(
      `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at, completed_at)
       VALUES (?, ?, ?, ?, 'chat', 0, ?, ?)`,
    )
    .bind(id, org.formId, org.orgId, status, now, status === "completed" ? now : null)
    .run();
}

beforeAll(async () => {
  await applySchema();
  await seedPlans();
  org = await seedTenant("cardnum");
  await invalidateEntitlements(DB(), org.orgId);
});

describe("the response counts a card shows", () => {
  it("counts finished and unfinished separately", async () => {
    await submission("sub_card_done1", "completed");
    await submission("sub_card_done2", "completed");
    /*
      The three states the results filter calls "partial", asserted one each
      rather than three of the same. `in_progress` is somebody still typing,
      `abandoned` is somebody who left, `disqualified` is somebody the form's
      own logic turned away — all three are people the form reached and did not
      finish with, and a card that counted only `abandoned` would say a form
      losing everyone at question one was doing fine.
    */
    await submission("sub_card_part1", "abandoned");
    await submission("sub_card_part2", "in_progress");
    await submission("sub_card_part3", "disqualified");

    const row = await card();
    expect(row.responses).toBe(2);
    expect(row.partials).toBe(3);
  });

  it("leaves spam out of both", async () => {
    /*
      `completed + partial` is not `total`, and this is the row that proves it.
      Spam is neither a response somebody will read nor a person the form lost,
      so counting it in either place would inflate a number an author makes
      decisions on.
    */
    await submission("sub_card_spam1", "spam");
    const row = await card();
    expect(row.responses).toBe(2);
    expect(row.partials).toBe(3);
  });
});

describe("whether a card says the draft has moved on", () => {
  it("is quiet on a form that has never been published", async () => {
    expect((await card()).hasUnpublishedChanges).toBe(false);
  });

  it("is quiet immediately after a publish", async () => {
    const res = await fetchApi(`/api/forms/${org.formId}/publish`, { method: "POST", headers: auth(org) });
    expect(res.status).toBe(200);
    expect((await card()).hasUnpublishedChanges).toBe(false);
  });

  it("turns on when the draft is edited afterwards", async () => {
    const doc = structuredClone(minimalDoc("cardnum")) as { blocks: { title: string }[] };
    doc.blocks[0]!.title = "A question nobody live has been asked yet";
    const res = await fetchApi(`/api/forms/${org.formId}/doc`, {
      method: "PUT",
      headers: auth(org),
      body: JSON.stringify({ doc }),
    });
    expect(res.status).toBe(200);
    expect((await card()).hasUnpublishedChanges).toBe(true);
  });
});
