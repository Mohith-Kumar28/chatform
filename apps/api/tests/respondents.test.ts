import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { deviceKeyFor, resolveRespondent } from "../src/lib/respondents.js";

/**
 * Recognising one person across forms, devices and sign-ins.
 *
 * Almost every assertion here is about *merging*, because that is the only part
 * that can be wrong in a way nobody notices: a missed merge shows up as two
 * people who are one, which looks exactly like two people. The counts this
 * table exists to produce are wrong from that moment on and nothing complains.
 */

let t: Tenant;

const LAPTOP = "visitor-laptop-abc";
const PHONE = "visitor-phone-xyz";
const ME = { provider: "google", subject: "google-sub-me" };

const key = (signal: string) => deviceKeyFor(env as never, signal)!;

function personOf(id: string) {
  return env.DB.prepare(
    `SELECT id, display_name, email, first_seen_at, last_seen_at, merged_into FROM respondents WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      display_name: string | null;
      email: string | null;
      first_seen_at: number;
      last_seen_at: number;
      merged_into: string | null;
    }>();
}

function keysOf(id: string) {
  return env.DB.prepare(`SELECT kind, value FROM respondent_keys WHERE respondent_id = ? ORDER BY kind`)
    .bind(id)
    .all<{ kind: string; value: string }>();
}

const countPeople = async () =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM respondents WHERE merged_into IS NULL`).first<{ n: number }>())
    ?.n ?? 0;

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("rspnd");
});

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM respondent_keys`).run();
  await env.DB.prepare(`DELETE FROM respondents`).run();
});

describe("deviceKeyFor", () => {
  it("is stable for one browser and different for another", () => {
    expect(key(LAPTOP)).toBe(key(LAPTOP));
    expect(key(LAPTOP)).not.toBe(key(PHONE));
    expect(key(LAPTOP)).toHaveLength(64);
  });

  it("is the same value whichever form they are answering", () => {
    // The whole point, and the one way it differs from `submissions.fingerprint`:
    // nothing about the form goes into it.
    expect(deviceKeyFor(env as never, LAPTOP)).toBe(deviceKeyFor(env as never, LAPTOP));
  });

  it("has nothing to key on when the browser said nothing", () => {
    expect(deviceKeyFor(env as never, null)).toBeNull();
    expect(deviceKeyFor(env as never, "   ")).toBeNull();
  });
});

describe("resolveRespondent", () => {
  it("declines to invent a person out of nothing", async () => {
    // A headless caller with no identity and no browser. A row here would make
    // every anonymous request its own "person" and the count meaningless.
    expect(await resolveRespondent(env as never, {})).toBeNull();
    expect(await countPeople()).toBe(0);
  });

  it("records somebody it has never seen", async () => {
    const id = await resolveRespondent(env as never, { deviceKey: key(LAPTOP), name: "Maya" });
    expect(id).toMatch(/^rsp_[0-9a-f]{20}$/);
    expect((await personOf(id!))?.display_name).toBe("Maya");
    expect((await keysOf(id!)).results).toEqual([{ kind: "device", value: key(LAPTOP) }]);
  });

  it("recognises the same browser rather than counting it twice", async () => {
    const first = await resolveRespondent(env as never, { deviceKey: key(LAPTOP) });
    const second = await resolveRespondent(env as never, { deviceKey: key(LAPTOP) });
    expect(second).toBe(first);
    expect(await countPeople()).toBe(1);
  });

  it("attaches a sign-in to the browser it happened in", async () => {
    const anon = await resolveRespondent(env as never, { deviceKey: key(LAPTOP) });
    const signedIn = await resolveRespondent(env as never, {
      deviceKey: key(LAPTOP),
      identity: ME,
      email: "Maya@Northwind.example",
      name: "Maya",
    });

    expect(signedIn).toBe(anon);
    expect((await keysOf(anon!)).results.map((r) => r.kind)).toEqual(["device", "email", "identity"]);
    // Lowercased on the way in, so one inbox is one key.
    expect((await personOf(anon!))?.email).toBe("maya@northwind.example");
  });

  it("merges a laptop and a phone once a sign-in connects them", async () => {
    const laptop = await resolveRespondent(env as never, { deviceKey: key(LAPTOP), identity: ME });
    // Seen a day earlier, so "the oldest survives" has something to decide on
    // rather than falling through to the id tie-break.
    await env.DB.prepare(`UPDATE respondents SET first_seen_at = ? WHERE id = ?`)
      .bind(Date.now() - 86_400_000, laptop)
      .run();
    const phone = await resolveRespondent(env as never, { deviceKey: key(PHONE) });
    expect(phone).not.toBe(laptop);
    expect(await countPeople()).toBe(2);

    // They sign in on the phone. The two rows were always one person.
    const merged = await resolveRespondent(env as never, { deviceKey: key(PHONE), identity: ME });

    expect(merged).toBe(laptop);
    expect(await countPeople()).toBe(1);
    expect((await keysOf(laptop!)).results.map((r) => r.value).sort()).toEqual(
      [key(LAPTOP), key(PHONE), `${ME.provider}:${ME.subject}`].sort(),
    );
  });

  it("keeps the oldest id and leaves a tombstone on the other", async () => {
    const older = await resolveRespondent(env as never, { deviceKey: key(LAPTOP) });
    await env.DB.prepare(`UPDATE respondents SET first_seen_at = ? WHERE id = ?`)
      .bind(Date.now() - 90 * 86_400_000, older)
      .run();
    const newer = await resolveRespondent(env as never, { email: "maya@northwind.example" });

    const survivor = await resolveRespondent(env as never, {
      deviceKey: key(LAPTOP),
      email: "maya@northwind.example",
    });

    expect(survivor).toBe(older);
    // The id somebody may already be holding still leads to the person.
    expect((await personOf(newer!))?.merged_into).toBe(older);
    // And the span widens to cover both halves of what is now one history.
    expect((await personOf(older!))?.first_seen_at).toBeLessThan(Date.now() - 80 * 86_400_000);
  });

  it("never leaves a key pointing at a merged-away row", async () => {
    // The invariant that keeps every lookup one query: keys are repointed, so
    // nothing ever has to follow a chain of tombstones.
    const laptop = await resolveRespondent(env as never, { deviceKey: key(LAPTOP), identity: ME });
    // Explicitly the older of the two, or the survivor is decided by the id
    // tie-break and this test would assert against a coin toss.
    await env.DB.prepare(`UPDATE respondents SET first_seen_at = ? WHERE id = ?`)
      .bind(Date.now() - 86_400_000, laptop)
      .run();
    await resolveRespondent(env as never, { deviceKey: key(PHONE) });
    await resolveRespondent(env as never, { deviceKey: key(PHONE), identity: ME });

    const dangling = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM respondent_keys k
         JOIN respondents r ON r.id = k.respondent_id
        WHERE r.merged_into IS NOT NULL`,
    ).first<{ n: number }>();
    expect(dangling?.n).toBe(0);
    expect((await keysOf(laptop!)).results).toHaveLength(3);
  });

  it("carries the responses of the row that lost the merge", async () => {
    const phone = await resolveRespondent(env as never, { deviceKey: key(PHONE) });
    await env.DB.prepare(
      `INSERT INTO submissions (id, form_id, organization_id, status, source, is_test, started_at, updated_at, respondent_id)
       VALUES ('sbm_rsp_merge', ?, ?, 'completed', 'chat', 0, ?, ?, ?)`,
    )
      .bind(t.formId, t.orgId, Date.now(), Date.now(), phone)
      .run();

    const laptop = await resolveRespondent(env as never, { deviceKey: key(LAPTOP), identity: ME });
    await env.DB.prepare(`UPDATE respondents SET first_seen_at = ? WHERE id = ?`)
      .bind(Date.now() - 86_400_000, laptop)
      .run();
    const survivor = await resolveRespondent(env as never, { deviceKey: key(PHONE), identity: ME });

    const row = await env.DB.prepare(`SELECT respondent_id FROM submissions WHERE id = 'sbm_rsp_merge'`)
      .first<{ respondent_id: string }>();
    // Their earlier response followed them, or the history the merge exists to
    // assemble would be missing the half it just absorbed.
    expect(row?.respondent_id).toBe(survivor);
    expect(survivor).toBe(laptop);
  });

  it("recognises an email given from a browser we have never seen", async () => {
    const first = await resolveRespondent(env as never, {
      deviceKey: key(LAPTOP),
      email: "maya@northwind.example",
    });
    // A different machine entirely — a library computer, say — and no sign-in.
    const again = await resolveRespondent(env as never, { email: "MAYA@northwind.example" });

    expect(again).toBe(first);
    expect(await countPeople()).toBe(1);
  });
});
