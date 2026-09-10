import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant, type Tenant } from "./helpers.js";
import { hashPassword } from "../src/lib/crypto.js";
import { sha256Hex } from "@repo/form-schema";

/**
 * The gates on session creation.
 *
 * Every one of these was inert in production: they read
 * `form_versions.settings_json`, a column no write path populates, so the
 * parsed settings were always `{}` and each check passed unconditionally.
 * The password gate in particular let anyone into a protected form. These
 * tests exist so that can never happen quietly again — each one fails if its
 * gate stops reading the published document.
 */

let t: Tenant;

/**
 * Put the tenant on Pro. `plans` needs a row because `subscriptions.plan_id` is a foreign
 * key; the entitlement arithmetic itself comes from the shared catalogue, not the table.
 */
async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1)
     ON CONFLICT (id) DO NOTHING`,
  )
    .bind(
      PLANS.pro.priceMonthlyCents,
      PLANS.pro.priceYearlyCents,
      JSON.stringify(PLANS.pro.features),
      JSON.stringify(PLANS.pro.limits),
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?)
     ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_pg_${orgId}`, orgId, `dodo_pg_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

/** Publish a form whose doc carries `settings`, and return its slug. */
async function publish(label: string, settings: Record<string, unknown>): Promise<string> {
  const slug = `gate-${label}`;
  const formId = `frm_gate_${label}`;
  const versionId = `fv_gate_${label}`;
  // Template mode keeps these hermetic: a session that reaches the agent makes
  // a real model call, and what is under test here is the gate in front of it.
  const doc = {
    ...minimalDoc(label),
    settings: { ...settings, agent: { mode: "template", ...(settings.agent as object) } },
  };
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'published', ?7, 'salt', ?8, ?9, ?9)`,
    ).bind(formId, t.orgId, t.workspaceId, t.userId, label, slug, JSON.stringify(doc), versionId, now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
      // settings_json deliberately left NULL — exactly as every real publish
      // writes it. A gate that only works when this column is populated is a
      // gate that does not work.
    ).bind(versionId, formId, JSON.stringify(doc), now, t.userId),
  ]);
  return slug;
}

const createSession = (slug: string, body: Record<string, unknown> = {}) =>
  fetchApi(`/p/forms/${slug}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("gates");
});

describe("password gate", () => {
  it("refuses a session with no password, and accepts the right one", async () => {
    const slug = await publish("pw", {
      password: { enabled: true, value: await hashPassword("hunter2") },
    });

    const bare = await createSession(slug);
    expect(bare.status).toBe(401);

    const wrong = await createSession(slug, { password: "hunter3" });
    expect(wrong.status).toBe(401);

    const right = await createSession(slug, { password: "hunter2" });
    expect(right.status).toBe(200);
  });

  it("still accepts a legacy plaintext password", async () => {
    const slug = await publish("pwplain", { password: { enabled: true, value: "letmein" } });
    expect((await createSession(slug, { password: "letmein" })).status).toBe(200);
    expect((await createSession(slug, { password: "nope" })).status).toBe(401);
  });

  it("lets everyone in when the gate is off", async () => {
    const slug = await publish("pwoff", { password: { enabled: false, value: "" } });
    expect((await createSession(slug)).status).toBe(200);
  });

  it("never returns the stored password in the public config", async () => {
    const slug = await publish("pwleak", { password: { enabled: true, value: "topsecret" } });
    const body = await (await fetchApi(`/p/forms/${slug}/config`)).text();
    expect(body).not.toContain("topsecret");
  });
});

describe("close rules", () => {
  it("closes the form once the scheduled time has passed", async () => {
    const slug = await publish("closed", {
      closeRules: { closeAt: new Date(Date.now() - 60_000).toISOString(), closedMessageMd: "All done, thanks!" },
    });
    expect((await createSession(slug)).status).toBe(403);

    const config = (await (await fetchApi(`/p/forms/${slug}/config`)).json()) as {
      closed?: boolean;
      closedMessage?: string;
    };
    expect(config.closed).toBe(true);
    expect(config.closedMessage).toBe("All done, thanks!");
  });

  it("stays open before the scheduled time", async () => {
    const slug = await publish("open", {
      closeRules: { closeAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    expect((await createSession(slug)).status).toBe(200);
    const config = (await (await fetchApi(`/p/forms/${slug}/config`)).json()) as { closed?: boolean };
    expect(config.closed).toBeFalsy();
  });

  /**
   * The respondent-facing countdown says two different things at zero — "this
   * form has closed" to somebody who has not started, and "you can still
   * finish this response" to somebody mid-conversation — and the second is a
   * promise this test is the only thing holding up.
   *
   * It is true because the close date is checked when a session is created and
   * nowhere else: `SessionDO` gates turns on the session's own status and
   * never reads `closeRules`. That is easy to change by accident. If this test
   * ever fails, the copy in `closing-time.ts` is lying to somebody about
   * whether their answers are going anywhere, and it — not this test — is what
   * needs fixing.
   */
  it("lets a conversation that was already open finish after the deadline", async () => {
    const slug = await publish("late", {
      closeRules: { closeAt: new Date(Date.now() + 3_600_000).toISOString() },
    });
    const opened = await createSession(slug);
    expect(opened.status).toBe(200);
    const s = (await opened.json()) as { sessionId: string; respondentToken: string };

    // The deadline passes underneath them. `forms.close_at` is the
    // denormalised copy, which `isClosed` honours when the doc has nothing
    // earlier to say — the cheapest way to move time in a test.
    await env.DB.prepare(`UPDATE forms SET close_at = ?1 WHERE id = 'frm_gate_late'`)
      .bind(Date.now() - 1_000)
      .run();

    // Nobody new gets in…
    expect((await createSession(slug)).status).toBe(403);

    // …and the person already answering is not thrown out mid-sentence.
    const headers = { "content-type": "application/json", "x-respondent-token": s.respondentToken };
    const turn = await fetchApi(`/p/sessions/${s.sessionId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ type: "structured", ref: "q_email", value: "late@example.com" }),
    });
    expect(turn.status).toBe(202);

    const submit = await fetchApi(`/p/sessions/${s.sessionId}/actions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "submit" }),
    });
    expect(submit.status).toBe(202);
  });

  it("closes once the response cap is reached, counting only completed responses", async () => {
    const slug = await publish("cap", { closeRules: { maxSubmissions: 2 } });
    const formId = "frm_gate_cap";

    const insert = (n: number, status: string) =>
      env.DB.prepare(
        `INSERT INTO submissions (id, form_id, organization_id, status, started_at) VALUES (?1, ?2, ?3, ?4, ?5)`,
      ).bind(`sbm_cap_${status}_${n}`, formId, t.orgId, status, Date.now());

    await env.DB.batch([insert(1, "completed"), insert(2, "in_progress"), insert(3, "abandoned")]);
    // One completed against a cap of two: a partial must not count toward it.
    expect((await createSession(slug)).status).toBe(200);

    await insert(4, "completed").run();
    expect((await createSession(slug)).status).toBe(403);
  });
});

describe("branding", () => {
  /**
   * The watermark needs the document to ask AND the plan to allow.
   *
   * This used to assert only the first half, which was the bug: `hidePoweredBy` was
   * honoured straight out of the document with no plan check, so any free user removed
   * the footer by flipping a toggle. Both halves are asserted now, and the second one is
   * the one that earns money.
   */
  const read = async (slug: string) =>
    ((await (await fetchApi(`/p/forms/${slug}/config`)).json()) as { brandingHidden: boolean }).brandingHidden;

  it("keeps the footer on Free however the document was authored", async () => {
    const on = await publish("brandon", { branding: { hidePoweredBy: true } });
    const off = await publish("brandoff", { branding: { hidePoweredBy: false } });
    expect(await read(on)).toBe(false);
    expect(await read(off)).toBe(false);
  });

  it("honours the document once the plan includes it", async () => {
    const on = await publish("brandpro", { branding: { hidePoweredBy: true } });
    const off = await publish("brandprooff", { branding: { hidePoweredBy: false } });
    await subscribePro(t.orgId);
    expect(await read(on)).toBe(true);
    // Entitled but not asked for: the footer stays, which is the default.
    expect(await read(off)).toBe(false);
  });
});

describe("duplicate responses", () => {
  const withIp = (slug: string, ip: string, deviceSignal?: string) =>
    fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify(deviceSignal ? { deviceSignal } : {}),
    });

  /** Mark every session opened from an address as finished, as completing the form would. */
  const finishFrom = (ip: string) =>
    env.DB.prepare(`UPDATE chat_sessions SET status = 'completed' WHERE ip_hash = ?1`)
      .bind(sha256Hex(ip))
      .run();

  it("turns a finished respondent away on a repeat, and lets a different device through", async () => {
    const slug = await publish("dup", { allowResubmissions: false });
    expect((await withIp(slug, "203.0.113.9", "devicealpha01")).status).toBe(200);
    await finishFrom("203.0.113.9");
    expect((await withIp(slug, "203.0.113.9", "devicealpha01")).status).toBe(409);
    // Same network, different machine: the key is the device, not the address.
    expect((await withIp(slug, "203.0.113.9", "devicebeta002")).status).toBe(200);
  });

  /**
   * The rule that used to close a form for a whole office.
   *
   * `respondentKey` falls back to the hashed IP when the browser sends no
   * device signal, and the gate matched on `ip_hash` besides — so the first
   * person behind a campus NAT to finish the form locked out everybody else
   * on it, and the author's only clue was responses that never arrived.
   *
   * Refusing to enforce on an address is the deliberate trade. Letting a
   * determined duplicate through is what sign-in is for, and the setting has
   * never claimed to stop one; silently losing real respondents is the
   * failure that cannot be noticed or undone.
   */
  it("does not enforce on an address, so a shared network is not one person", async () => {
    const slug = await publish("dupnat", { allowResubmissions: false });
    expect((await withIp(slug, "203.0.113.20")).status).toBe(200);
    await finishFrom("203.0.113.20");
    // A colleague on the same office wifi, with no device signal to tell them apart.
    expect((await withIp(slug, "203.0.113.20")).status).toBe(200);
  });

  /**
   * Opening the link and leaving is not an answer.
   *
   * The rule used to expire after a day, which hid this: an abandoned session
   * blocked the same person for 24h and then let them back in. With no window
   * left to expire, a gate that counted opens would lock someone out forever
   * over a closed tab.
   */
  it("does not count a session that was opened and abandoned", async () => {
    const slug = await publish("dupopen", { allowResubmissions: false });
    expect((await withIp(slug, "203.0.113.12", "devicegamma01")).status).toBe(200);
    expect((await withIp(slug, "203.0.113.12", "devicegamma01")).status).toBe(200);
  });

  /**
   * Pro keeps the browser key even behind a sign-in gate.
   *
   * The device check stands down only when something stronger is going to
   * run in its place, and on Pro nothing is: `one_response_per_identity` is
   * a Business feature. Standing down here would turn the switch off in
   * silence on exactly the forms most likely to have it on.
   */
  it("still uses the browser key on a gated form the plan cannot key by identity", async () => {
    const slug = await publish("dupgated", {
      allowResubmissions: false,
      requireAuth: { enabled: true, method: "google" },
    });
    expect((await withIp(slug, "203.0.113.30", "deviceepsil01")).status).toBe(200);
    await finishFrom("203.0.113.30");
    expect((await withIp(slug, "203.0.113.30", "deviceepsil01")).status).toBe(409);
  });

  it("lets everyone through when resubmissions are allowed", async () => {
    const slug = await publish("nodup", { allowResubmissions: true });
    expect((await withIp(slug, "203.0.113.11", "devicedelta01")).status).toBe(200);
    await finishFrom("203.0.113.11");
    expect((await withIp(slug, "203.0.113.11", "devicedelta01")).status).toBe(200);
  });
});

describe("on completion", () => {
  it("applies the form-level redirect to endings that have none", async () => {
    const slug = await publish("redir", {
      onComplete: { redirectUrl: "https://example.com/thanks", delaySec: 3 },
    });
    const config = (await (await fetchApi(`/p/forms/${slug}/config`)).json()) as {
      endings: { redirectUrl?: string; redirectDelaySec?: number }[];
    };
    expect(config.endings[0]!.redirectUrl).toBe("https://example.com/thanks");
    expect(config.endings[0]!.redirectDelaySec).toBe(3);
  });

  it("leaves an ending that sets its own redirect alone", async () => {
    const slug = `gate-redir2`;
    const doc = {
      ...minimalDoc("redir2"),
      settings: { agent: { mode: "template" }, onComplete: { redirectUrl: "https://example.com/form-level" } },
      endings: [
        {
          id: "end_own001",
          ref: "end_thanks",
          title: "Thanks",
          bodyMd: "",
          redirectUrl: "https://example.com/ending-level",
          redirectDelaySec: 9,
        },
      ],
    };
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'r2', ?5, 'published', ?6, 'salt', ?7, ?8, ?8)`,
      ).bind("frm_gate_redir2", t.orgId, t.workspaceId, t.userId, slug, JSON.stringify(doc), "fv_gate_redir2", now),
      env.DB.prepare(
        `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
         VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
      ).bind("fv_gate_redir2", "frm_gate_redir2", JSON.stringify(doc), now, t.userId),
    ]);

    const config = (await (await fetchApi(`/p/forms/${slug}/config`)).json()) as {
      endings: { redirectUrl?: string; redirectDelaySec?: number }[];
    };
    expect(config.endings[0]!.redirectUrl).toBe("https://example.com/ending-level");
    expect(config.endings[0]!.redirectDelaySec).toBe(9);
  });
});
