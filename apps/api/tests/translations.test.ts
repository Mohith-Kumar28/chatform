import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant, type Tenant } from "./helpers.js";
import { parseCsv, textHash } from "../src/lib/translations.js";

/**
 * One form in several languages.
 *
 * No model is called anywhere here: the suite has no key, so the AI button
 * translates nothing and says so. What is under test is everything around the
 * model, which is where a form would actually break: which languages a
 * respondent is offered, what a filled-in spreadsheet does, and that a
 * translated form is still the same form.
 */

let t: Tenant;

async function subscribePro(orgId: string): Promise<void> {
  const { PLANS } = await import("@repo/entitlements");
  const { invalidateEntitlements } = await import("../src/lib/entitlements.js");
  await env.DB.prepare(
    `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, currency, features_json, limits_json, is_active, sort_order)
     VALUES ('pro', 'pro', 'Pro', ?, ?, 'USD', ?, ?, 1, 1)
     ON CONFLICT (id) DO NOTHING`,
  )
    .bind(PLANS.pro.priceMonthlyCents, PLANS.pro.priceYearlyCents, JSON.stringify(PLANS.pro.features), JSON.stringify(PLANS.pro.limits))
    .run();
  await env.DB.prepare(
    `INSERT INTO subscriptions (id, organization_id, plan_id, dodo_subscription_id, cycle, status,
                                current_period_start, current_period_end, seats, created_at, updated_at)
     VALUES (?, ?, 'pro', ?, 'monthly', 'active', ?, ?, 1, ?, ?)
     ON CONFLICT (dodo_subscription_id) DO NOTHING`,
  )
    .bind(`sub_tr_${orgId}`, orgId, `dodo_tr_${orgId}`, Date.now() - 1000, Date.now() + 86_400_000 * 20, Date.now(), Date.now())
    .run();
  await invalidateEntitlements(env as never, orgId);
}

const doc = (label: string, languages: string[]) => ({
  ...minimalDoc(label),
  blocks: [
    { id: `blk_${label}1`, ref: "welcome", type: "welcome", title: "Hi", required: false },
    {
      id: `blk_${label}2`,
      ref: "q_role",
      type: "single_select",
      title: "What do you do, {{q_name}}?",
      required: true,
      options: [
        { id: "opt_student01", label: "Student" },
        { id: "opt_working01", label: "Working" },
      ],
    },
  ],
  settings: { languages, agent: { mode: "template" }, captcha: { enabled: false } },
});

/** A published form whose draft and live version are the same document. */
async function publish(label: string, languages: string[]): Promise<{ formId: string; slug: string }> {
  const slug = `tr-${label}`;
  const formId = `frm_tr_${label}`;
  const versionId = `fv_tr_${label}`;
  const json = JSON.stringify(doc(label, languages));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'published', ?7, 'salt', ?8, ?9, ?9)`,
    ).bind(formId, t.orgId, t.workspaceId, t.userId, label, slug, json, versionId, now),
    env.DB.prepare(
      `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
       VALUES (?1, ?2, 1, ?3, 'ck', ?4, ?5, ?4)`,
    ).bind(versionId, formId, json, now, t.userId),
  ]);
  return { formId, slug };
}

const authed = (path: string, init: RequestInit = {}) =>
  fetchApi(path, { ...init, headers: { cookie: t.cookie, ...(init.headers as Record<string, string> | undefined) } });

const config = async (slug: string, lang?: string) =>
  (await (await fetchApi(`/p/forms/${slug}/config${lang ? `?lang=${lang}` : ""}`)).json()) as {
    language: string;
    languages: string[];
    title: string;
    blocks: { title: string; options?: { id: string; label: string }[] }[];
  };

async function upload(formId: string, lang: string, rows: [string, string][]): Promise<Response> {
  const csv = ["id,English,Other", ...rows.map(([source, text]) => `${textHash(source)},"${source}","${text}"`)].join("\r\n");
  return authed(`/api/forms/${formId}/translations/${lang}/csv`, { method: "PUT", headers: { "content-type": "text/csv" }, body: csv });
}

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("translate");
  await subscribePro(t.orgId);
});

describe("parseCsv", () => {
  it("reads quoted cells with commas, quotes and newlines", () => {
    expect(parseCsv('﻿id,a,b\r\n1,"Hello, ""you""","line one\nline two"\r\n2,plain,\r\n')).toEqual([
      ["id", "a", "b"],
      ["1", 'Hello, "you"', "line one\nline two"],
      ["2", "plain", ""],
    ]);
  });
});

describe("a form in several languages", () => {
  it("offers only its own language until another has been translated", async () => {
    const { slug } = await publish("fresh", ["hi", "es"]);
    const shown = await config(slug, "hi");
    expect(shown.languages).toEqual(["en"]);
    expect(shown.language).toBe("en");
    expect(shown.blocks[1]!.title).toBe("What do you do, {{q_name}}?");
  });

  it("starts every added language as translation needed", async () => {
    const { formId } = await publish("status", ["hi"]);
    const res = await authed(`/api/forms/${formId}/translations`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { languages: { lang: string; total: number; translated: number }[] };
    expect(body.languages).toHaveLength(1);
    expect(body.languages[0]).toMatchObject({ lang: "hi", translated: 0 });
    expect(body.languages[0]!.total).toBeGreaterThan(3);
  });

  it("downloads a spreadsheet with a row per string and takes it back filled in", async () => {
    const { formId, slug } = await publish("manual", ["hi"]);

    const file = await authed(`/api/forms/${formId}/translations/hi/csv`);
    expect(file.headers.get("content-type")).toContain("text/csv");
    const rows = parseCsv(await file.text());
    expect(rows[0]).toEqual(["id", "English", "Hindi"]);
    expect(rows.find((r) => r[1] === "Student")).toEqual([textHash("Student"), "Student", ""]);

    const saved = await upload(formId, "hi", [
      ["Student", "छात्र"],
      ["What do you do, {{q_name}}?", "{{q_name}}, आप क्या करते हैं?"],
      ["Not in this form", "ignored"],
      ["Working", ""],
    ]);
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ saved: 2, skipped: 0 });

    const hindi = await config(slug, "hi");
    expect(hindi.languages).toEqual(["en", "hi"]);
    expect(hindi.language).toBe("hi");
    expect(hindi.blocks[1]!.title).toBe("{{q_name}}, आप क्या करते हैं?");
    // Same option, by id; the one with no translation reads as written.
    expect(hindi.blocks[1]!.options).toMatchObject([
      { id: "opt_student01", label: "छात्र" },
      { id: "opt_working01", label: "Working" },
    ]);

    // Nobody who did not ask gets it.
    const plain = await config(slug);
    expect(plain.language).toBe("en");
    expect(plain.blocks[1]!.options![0]!.label).toBe("Student");
  });

  it("refuses a translation that lost a recall token", async () => {
    const { formId, slug } = await publish("token", ["hi"]);
    const saved = await upload(formId, "hi", [
      ["What do you do, {{q_name}}?", "आप क्या करते हैं?"],
      ["Student", "छात्र"],
    ]);
    expect(await saved.json()).toMatchObject({ saved: 1, skipped: 1 });
    expect((await config(slug, "hi")).blocks[1]!.title).toBe("What do you do, {{q_name}}?");
  });

  it("opens a conversation in the chosen language, and stores the same answer", async () => {
    const { formId, slug } = await publish("session", ["hi"]);
    await upload(formId, "hi", [["Student", "छात्र"]]);

    const open = async (body: Record<string, unknown>) => {
      const res = await fetchApi(`/p/forms/${slug}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fresh: true, ...body }),
      });
      expect(res.status).toBe(200);
      const opened = (await res.json()) as { sessionId: string; respondentToken: string };
      return { sessionId: opened.sessionId, token: opened.respondentToken };
    };
    const answer = (s: { sessionId: string; token: string }, value: string) =>
      fetchApi(`/p/sessions/${s.sessionId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-respondent-token": s.token },
        body: JSON.stringify({ type: "structured", ref: "q_role", value }),
      });
    const collected = async (s: { sessionId: string; token: string }) =>
      ((await (await fetchApi(`/p/sessions/${s.sessionId}?t=${s.token}`)).json()) as { collected: number }).collected;

    // The Hindi word is an answer in a Hindi conversation and not in an English one.
    const hindi = await open({ language: "hi" });
    await answer(hindi, "छात्र");
    expect(await collected(hindi)).toBe(1);

    const english = await open({});
    await answer(english, "छात्र");
    expect(await collected(english)).toBe(0);

    // And it is the same answer either way: the option, not the wording.
    const stored = await env.DB.prepare(
      `SELECT sa.value_json FROM submission_answers sa JOIN chat_sessions cs ON cs.submission_id = sa.submission_id WHERE cs.id = ?`,
    )
      .bind(hindi.sessionId)
      .first<{ value_json: string }>();
    if (stored) expect(stored.value_json).toContain("opt_student01");
  });

  it("will not translate a language the form does not offer", async () => {
    const { formId } = await publish("stranger", ["hi"]);
    expect((await authed(`/api/forms/${formId}/translations/fr/ai`, { method: "POST" })).status).toBe(404);
    expect((await authed(`/api/forms/${formId}/translations/en/csv`)).status).toBe(404);
  });
});

describe("on a plan without languages", () => {
  it("serves the form as written and refuses the translate button", async () => {
    const free = await seedTenant("translatefree");
    const formId = "frm_tr_free";
    const json = JSON.stringify(doc("free", ["hi"]));
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'free', 'tr-free', 'published', ?5, 'salt', 'fv_tr_free', ?6, ?6)`,
      ).bind(formId, free.orgId, free.workspaceId, free.userId, json, now),
      env.DB.prepare(
        `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
         VALUES ('fv_tr_free', ?1, 1, ?2, 'ck', ?3, ?4, ?3)`,
      ).bind(formId, json, now, free.userId),
      env.DB.prepare(
        `INSERT INTO form_translations (form_id, lang, source_hash, source, text, edited, updated_at) VALUES (?1, 'hi', ?2, 'Student', 'छात्र', 1, ?3)`,
      ).bind(formId, textHash("Student"), now),
    ]);
    const res = await fetchApi(`/api/forms/${formId}/translations/hi/ai`, { method: "POST", headers: { cookie: free.cookie } });
    expect(res.status).toBe(402);
    const shown = await config("tr-free", "hi");
    expect(shown.languages).toEqual(["en"]);
    expect(shown.blocks[1]!.options![0]!.label).toBe("Student");
  });
});
