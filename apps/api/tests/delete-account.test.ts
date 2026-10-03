import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, minimalDoc, seedTenant } from "./helpers.js";
import { purgeDeletedAccounts, sweepAccountDeletionNotices } from "../src/lib/account-deletion.js";

type T = Awaited<ReturnType<typeof seedTenant>>;

function scheduleDeletion(t: T, body: Record<string, unknown>): Promise<Response> {
  return fetchApi("/api/auth/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: t.cookie, origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

/** Delete the account, then let the thirty days pass and run the sweep. */
async function deleteAndPurge(t: T, email: string): Promise<void> {
  const res = await scheduleDeletion(t, { confirmation: email, password: "supersecret123" });
  expect(res.ok).toBe(true);
  await env.DB.prepare(`UPDATE users SET deleted_at = ? WHERE id = ?`).bind(Date.now() - 31 * 86_400_000, t.userId).run();
  await purgeDeletedAccounts(env);
}

/** Sign in again, as the person coming back to recover it would. */
async function signIn(email: string): Promise<string> {
  const res = await fetchApi("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email, password: "supersecret123" }),
  });
  expect(res.ok).toBe(true);
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

/**
 * Deleting an account has to mean it.
 *
 * `DELETE FROM users` cascades to four tables and stops. Left at that, closing
 * an account would leave the workspace it created still standing — with its
 * forms, its responses and its uploaded files — owned by nobody and reachable
 * by nobody, while the confirmation dialog said everything had been removed.
 *
 * Two cases, and the difference between them is ownership rather than
 * authorship: a workspace nobody else is in goes with its owner, and a shared
 * one survives with the departing member's name taken off it.
 */
describe("account deletion", () => {
  beforeAll(applySchema);

  it("takes the sole-member workspace, its forms and its files with it", async () => {
    const t = await seedTenant("delsolo");

    // A file row, so the R2 purge has something to find. `r2_key` is the only
    // index we have of what a workspace put in the bucket.
    await env.DB.prepare(
      `INSERT INTO files (id, organization_id, uploaded_by, uploader_user_id, r2_key, filename, mime, size_bytes, status, created_at)
       VALUES ('file_delsolo', ?1, 'builder', ?2, 'assets/delsolo/x.png', 'x.png', 'image/png', 10, 'confirmed', ?3)`,
    )
      .bind(t.orgId, t.userId, Date.now())
      .run();
    await env.R2.put("assets/delsolo/x.png", "bytes");

    await deleteAndPurge(t, "delsolo@example.com");

    const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(t.userId).first();
    expect(user).toBeNull();

    const org = await env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(t.orgId).first();
    expect(org).toBeNull();

    const form = await env.DB.prepare(`SELECT id FROM forms WHERE id = ?`).bind(t.formId).first();
    expect(form).toBeNull();

    // The part a cascade could never have done.
    expect(await env.R2.head("assets/delsolo/x.png")).toBeNull();
  });

  /**
   * One form with a file question and a hundred responses.
   *
   * The purge pages `files` a thousand rows at a time, and the statement that
   * cleared each page named every key it had just removed — which is a bound
   * parameter each, against a D1 query that accepts a hundred. It broke at a
   * hundred files, and it broke in the worst possible order: the R2 objects
   * were already deleted when the statement threw, so the respondent's uploads
   * were gone, the rows still pointed at them, and the deletion the customer
   * asked for came back as an error.
   *
   * 150 rather than 101 so the test still means something if the cap moves.
   */
  it("purges a workspace with more files than a query has parameters", async () => {
    const t = await seedTenant("delmany");
    const COUNT = 150;

    const now = Date.now();
    for (let i = 0; i < COUNT; i += 25) {
      await env.DB.batch(
        Array.from({ length: Math.min(25, COUNT - i) }, (_, n) => {
          const id = String(i + n).padStart(4, "0");
          return env.DB.prepare(
            `INSERT INTO files (id, organization_id, uploaded_by, uploader_user_id, r2_key, filename, mime, size_bytes, status, created_at)
             VALUES (?1, ?2, 'builder', ?3, ?4, 'x.png', 'image/png', 10, 'confirmed', ?5)`,
          ).bind(`file_delmany_${id}`, t.orgId, t.userId, `assets/delmany/${id}.png`, now);
        }),
      );
    }
    await env.R2.put("assets/delmany/0000.png", "bytes");
    await env.R2.put("assets/delmany/0149.png", "bytes");

    await deleteAndPurge(t, "delmany@example.com");

    expect(await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(t.userId).first()).toBeNull();
    expect(await env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(t.orgId).first()).toBeNull();

    const files = await env.DB.prepare(`SELECT COUNT(*) AS n FROM files WHERE organization_id = ?`)
      .bind(t.orgId)
      .first<{ n: number }>();
    expect(files?.n).toBe(0);

    // Both ends of the run, so a purge that stopped after the first page fails.
    expect(await env.R2.head("assets/delmany/0000.png")).toBeNull();
    expect(await env.R2.head("assets/delmany/0149.png")).toBeNull();
  });

  it("leaves a shared workspace standing and only drops the departing member", async () => {
    const owner = await seedTenant("delshared");

    // A second member, so the workspace outlives the one who leaves.
    await env.DB.prepare(
      `INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
       VALUES ('usr_delstay', 'Stays', 'stays@example.com', 1, ?1, ?1)`,
    )
      .bind(Date.now())
      .run();
    await env.DB.prepare(
      `INSERT INTO members (id, organization_id, user_id, role, created_at) VALUES ('mem_delstay', ?1, 'usr_delstay', 'admin', ?2)`,
    )
      .bind(owner.orgId, Date.now())
      .run();

    await deleteAndPurge(owner, "delshared@example.com");

    const org = await env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(owner.orgId).first();
    expect(org).toBeTruthy();

    // The team's form survives; the departing member's name does not.
    const form = await env.DB.prepare(`SELECT created_by AS by FROM forms WHERE id = ?`)
      .bind(owner.formId)
      .first<{ by: string | null }>();
    expect(form).toBeTruthy();
    expect(form!.by).toBeNull();

    const members = await env.DB.prepare(`SELECT user_id AS uid FROM members WHERE organization_id = ?`)
      .bind(owner.orgId)
      .all<{ uid: string }>();
    expect(members.results?.map((m) => m.uid)).toEqual(["usr_delstay"]);
  });

  it("schedules rather than deletes, and signing back in recovers it", async () => {
    const t = await seedTenant("delgrace");
    const email = "delgrace@example.com";

    // A published form, so the freeze has something to stop.
    const doc = { ...minimalDoc("delgrace"), settings: { agent: { mode: "template" } } };
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, active_version_id, created_at, updated_at)
         VALUES ('frm_delgrace_pub', ?1, ?2, ?3, 'Live', 'delgrace-live', 'published', ?4, 'salt', 'fv_delgrace_pub', ?5, ?5)`,
      ).bind(t.orgId, t.workspaceId, t.userId, JSON.stringify(doc), now),
      env.DB.prepare(
        `INSERT INTO form_versions (id, form_id, version, schema_json, checksum, published_at, created_by, created_at)
         VALUES ('fv_delgrace_pub', 'frm_delgrace_pub', 1, ?1, 'ck', ?2, ?3, ?2)`,
      ).bind(JSON.stringify(doc), now, t.userId),
    ]);
    expect((await fetchApi("/p/forms/delgrace-live/config")).status).toBe(200);

    // The typed confirmation has to be their email, and the password has to be right.
    expect((await scheduleDeletion(t, { confirmation: "nope", password: "supersecret123" })).status).toBe(400);
    expect((await scheduleDeletion(t, { confirmation: email, password: "wrong-password" })).status).toBe(400);
    expect((await scheduleDeletion(t, { confirmation: email.toUpperCase(), password: "supersecret123" })).ok).toBe(true);

    // Marked, signed out everywhere, and nothing removed.
    const row = await env.DB.prepare(`SELECT deleted_at FROM users WHERE id = ?`).bind(t.userId).first<{ deleted_at: number | null }>();
    expect(row?.deleted_at).toBeGreaterThan(0);
    const sessions = await env.DB.prepare(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`).bind(t.userId).first<{ n: number }>();
    expect(sessions?.n).toBe(0);
    expect(await env.DB.prepare(`SELECT id FROM forms WHERE id = ?`).bind(t.formId).first()).toBeTruthy();

    // Their only workspace stops serving its forms.
    expect((await fetchApi("/p/forms/delgrace-live/config")).status).toBe(404);

    // Signing up again with the address says why, and points at signing in.
    const signup = await fetchApi("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, password: "anotherpass123", name: "Again" }),
    });
    expect(signup.status).toBe(403);
    expect(((await signup.json()) as { code?: string }).code).toBe("ACCOUNT_PENDING_DELETION");

    // Signing in works, but the app stays closed until they recover it.
    const cookie = await signIn(email);
    const blocked = await fetchApi("/api/forms", { headers: { cookie } });
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("account_pending_deletion");

    const restore = await fetchApi("/api/auth/account/restore", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "http://localhost:3000" },
      body: "{}",
    });
    expect(restore.ok).toBe(true);
    // The refreshed cookies replace the old ones by name, as a browser would.
    const jar = new Map(cookie.split("; ").map((c) => [c.split("=")[0], c] as const));
    for (const c of restore.headers.getSetCookie()) jar.set(c.split("=")[0]!, c.split(";")[0]!);
    const fresh = [...jar.values()].join("; ");

    const cleared = await env.DB.prepare(`SELECT deleted_at FROM users WHERE id = ?`).bind(t.userId).first<{ deleted_at: number | null }>();
    expect(cleared?.deleted_at).toBeNull();
    expect((await fetchApi("/api/forms", { headers: { cookie: fresh } })).status).toBe(200);
    expect((await fetchApi("/p/forms/delgrace-live/config")).status).toBe(200);

    // And a recovered account is never purged.
    await purgeDeletedAccounts(env);
    expect(await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(t.userId).first()).toBeTruthy();
  });

  it("keeps a scheduled account until its thirty days are up", async () => {
    const t = await seedTenant("delwait");
    expect((await scheduleDeletion(t, { confirmation: "delwait@example.com", password: "supersecret123" })).ok).toBe(true);
    await env.DB.prepare(`UPDATE users SET deleted_at = ? WHERE id = ?`).bind(Date.now() - 29 * 86_400_000, t.userId).run();
    await purgeDeletedAccounts(env);
    expect(await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(t.userId).first()).toBeTruthy();
    expect(await env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(t.orgId).first()).toBeTruthy();
  });

  it("warns three days out and the day before, once each, and starts over after a recovery", async () => {
    const t = await seedTenant("delnotice");
    expect((await scheduleDeletion(t, { confirmation: "delnotice@example.com", password: "supersecret123" })).ok).toBe(true);
    const DAY = 86_400_000;
    // The sweep only runs in its morning hour.
    const now = Date.UTC(2026, 9, 10, 3, 15);
    const notice = async () =>
      (await env.DB.prepare(`SELECT deletion_notice AS n FROM users WHERE id = ?`).bind(t.userId).first<{ n: string | null }>())?.n;
    const deletedAt = (ms: number) => env.DB.prepare(`UPDATE users SET deleted_at = ? WHERE id = ?`).bind(ms, t.userId).run();

    await deletedAt(now - 20 * DAY);
    await sweepAccountDeletionNotices(env, now);
    expect(await notice()).toBeNull();

    await deletedAt(now - 27 * DAY - 3_600_000);
    expect(await sweepAccountDeletionNotices(env, now + 3_600_000)).toBe(0); // wrong hour
    await sweepAccountDeletionNotices(env, now);
    expect(await notice()).toBe("3d");
    await sweepAccountDeletionNotices(env, now);
    expect(await notice()).toBe("3d");

    await deletedAt(now - 29 * DAY - 3_600_000);
    await sweepAccountDeletionNotices(env, now);
    expect(await notice()).toBe("1d");

    // Recovering clears it, so a later deletion is warned again.
    await env.DB.prepare(`UPDATE users SET deleted_at = NULL WHERE id = ?`).bind(t.userId).run();
    const cookie = await signIn("delnotice@example.com");
    await fetchApi("/api/auth/account/restore", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "http://localhost:3000" },
      body: "{}",
    });
    expect(await notice()).toBeNull();
  });
});
