import { describe, it, expect, beforeAll } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, fetchApi, seedTenant } from "./helpers.js";

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

    const res = await fetchApi("/api/auth/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: t.cookie, origin: "http://localhost:3000" },
      body: JSON.stringify({ password: "supersecret123" }),
    });
    expect(res.ok).toBe(true);

    const user = await env.DB.prepare(`SELECT id FROM users WHERE id = ?`).bind(t.userId).first();
    expect(user).toBeNull();

    const org = await env.DB.prepare(`SELECT id FROM organizations WHERE id = ?`).bind(t.orgId).first();
    expect(org).toBeNull();

    const form = await env.DB.prepare(`SELECT id FROM forms WHERE id = ?`).bind(t.formId).first();
    expect(form).toBeNull();

    // The part a cascade could never have done.
    expect(await env.R2.head("assets/delsolo/x.png")).toBeNull();
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

    const res = await fetchApi("/api/auth/delete-user", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: owner.cookie, origin: "http://localhost:3000" },
      body: JSON.stringify({ password: "supersecret123" }),
    });
    expect(res.ok).toBe(true);

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
});
