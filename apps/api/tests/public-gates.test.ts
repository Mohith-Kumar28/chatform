import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, minimalDoc, seedTenant, type Tenant } from "./helpers.js";
import { hashPassword } from "../src/lib/crypto.js";

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
  it("honours hidePoweredBy from the published document", async () => {
    const on = await publish("brandon", { branding: { hidePoweredBy: true } });
    const off = await publish("brandoff", { branding: { hidePoweredBy: false } });
    const read = async (slug: string) =>
      ((await (await fetchApi(`/p/forms/${slug}/config`)).json()) as { brandingHidden: boolean }).brandingHidden;
    expect(await read(on)).toBe(true);
    expect(await read(off)).toBe(false);
  });
});

describe("duplicate responses", () => {
  const withIp = (slug: string, ip: string) =>
    fetchApi(`/p/forms/${slug}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": ip },
      body: JSON.stringify({}),
    });

  it("turns one-per-day away on a repeat, and lets a different address through", async () => {
    const slug = await publish("dup", { duplicates: { strategy: "ip_daily" } });
    expect((await withIp(slug, "203.0.113.9")).status).toBe(200);
    expect((await withIp(slug, "203.0.113.9")).status).toBe(409);
    // An IP identifies a network, not a person, so the block must be per-address.
    expect((await withIp(slug, "203.0.113.10")).status).toBe(200);
  });

  it("lets everyone through when the strategy is none", async () => {
    const slug = await publish("nodup", { duplicates: { strategy: "none" } });
    expect((await withIp(slug, "203.0.113.11")).status).toBe(200);
    expect((await withIp(slug, "203.0.113.11")).status).toBe(200);
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
