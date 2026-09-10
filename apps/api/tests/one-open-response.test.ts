import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { findOpenResponseId } from "../src/lib/respondent-history.js";
import type { Bindings } from "../src/env.js";

/**
 * One response in progress per person per form.
 *
 * Finished responses may multiply — that is the author's `allowResubmissions`
 * setting. A draft cannot: being part-way through a form is a fact about the
 * person, and a second open row is the same draft written twice. It splits
 * their answers, shows the author duplicates that stand for one attempt, and
 * earns each copy its own reminder email.
 *
 * These pin the matching rules, which is where the danger is. Matching too
 * loosely hands one person another person's half-finished answers; that is a
 * far worse failure than the duplicate it would be preventing.
 */

let t: Tenant;
const OTHER_FORM = "frm_other0001";

async function seed(
  id: string,
  cols: {
    status?: string;
    provider?: string | null;
    subject?: string | null;
    fingerprint?: string | null;
    isTest?: boolean;
    sessionId?: string | null;
    formId?: string;
    updatedAt?: number;
  } = {},
): Promise<string> {
  const now = cols.updatedAt ?? Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test,
                              started_at, updated_at, session_id, fingerprint,
                              respondent_provider, respondent_subject)
     VALUES (?1, ?2, NULL, ?3, ?4, 'chat', ?5, ?6, ?6, ?7, ?8, ?9, ?10)`,
  )
    .bind(
      id,
      cols.formId ?? t.formId,
      t.orgId,
      cols.status ?? "abandoned",
      cols.isTest ? 1 : 0,
      now,
      cols.sessionId ?? null,
      cols.fingerprint ?? null,
      cols.provider ?? null,
      cols.subject ?? null,
    )
    .run();
  return id;
}

const find = (who: Parameters<typeof findOpenResponseId>[2]) =>
  findOpenResponseId(env as unknown as Bindings, t.formId, who);

const GOOGLE = { provider: "google", subject: "sub_maya", email: "maya@northwind.example" } as const;
const BASE = { isTest: false, sessionId: "chs_current" };

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("oneopen");
});

beforeEach(async () => {
  await env.DB.prepare(`DELETE FROM submissions`).run();
});

describe("finding the response this person already has open", () => {
  it("matches a verified identity", async () => {
    await seed("sbm_mine", { provider: "google", subject: "sub_maya" });
    expect(await find({ ...BASE, identity: GOOGLE })).toBe("sbm_mine");
  });

  it("takes the one they touched most recently", async () => {
    // Not the one they started first: somebody who opened the form twice and
    // carried on in the second sitting wants the sitting they were in.
    await seed("sbm_older", { provider: "google", subject: "sub_maya", updatedAt: Date.now() - 60_000 });
    await seed("sbm_newer", { provider: "google", subject: "sub_maya", updatedAt: Date.now() });
    expect(await find({ ...BASE, identity: GOOGLE })).toBe("sbm_newer");
  });

  it("ignores a response that is finished", async () => {
    // The whole point: completed responses may multiply, drafts may not.
    await seed("sbm_done", { provider: "google", subject: "sub_maya", status: "completed" });
    await seed("sbm_out", { provider: "google", subject: "sub_maya", status: "disqualified" });
    expect(await find({ ...BASE, identity: GOOGLE })).toBeNull();
  });

  it("ignores a different person", async () => {
    await seed("sbm_them", { provider: "google", subject: "sub_someone_else" });
    expect(await find({ ...BASE, identity: GOOGLE })).toBeNull();
  });

  it("never reaches across forms", async () => {
    // Answering one of a customer's forms says nothing about any other, and a
    // draft on one must never surface in another.
    await seed("sbm_here", { provider: "google", subject: "sub_maya" });
    expect(
      await findOpenResponseId(env as unknown as Bindings, OTHER_FORM, { ...BASE, identity: GOOGLE }),
    ).toBeNull();
  });

  it("never matches the session's own row", async () => {
    await seed("sbm_self", { provider: "google", subject: "sub_maya", sessionId: "chs_current" });
    expect(await find({ ...BASE, identity: GOOGLE })).toBeNull();
  });

  it("keeps rehearsals and real responses apart", async () => {
    await seed("sbm_test", { provider: "google", subject: "sub_maya", isTest: true });
    expect(await find({ ...BASE, identity: GOOGLE })).toBeNull();
    expect(await find({ ...BASE, isTest: true, identity: GOOGLE })).toBe("sbm_test");
  });

  describe("without a sign-in", () => {
    it("matches a real device signal", async () => {
      await seed("sbm_dev", { fingerprint: "fp_device" });
      expect(await find({ ...BASE, fingerprint: "fp_device", fingerprintSource: "device" })).toBe("sbm_dev");
    });

    it("refuses a hashed IP, which is a whole office and not a person", async () => {
      // The failure this prevents is a colleague being handed somebody else's
      // half-finished response because they share a router.
      await seed("sbm_ip", { fingerprint: "fp_shared" });
      expect(await find({ ...BASE, fingerprint: "fp_shared", fingerprintSource: "ip" })).toBeNull();
      expect(await find({ ...BASE, fingerprint: "fp_shared", fingerprintSource: null })).toBeNull();
    });

    it("refuses to claim a row that belongs to somebody who signed in", async () => {
      // Otherwise a guessed device key is a way past the sign-in gate to a
      // named person's answers.
      await seed("sbm_named", { fingerprint: "fp_device", provider: "google", subject: "sub_maya" });
      expect(await find({ ...BASE, fingerprint: "fp_device", fingerprintSource: "device" })).toBeNull();
    });
  });

  it("prefers the identity over the device when both could match", async () => {
    await seed("sbm_by_device", { fingerprint: "fp_device" });
    await seed("sbm_by_identity", { provider: "google", subject: "sub_maya" });
    expect(
      await find({ ...BASE, identity: GOOGLE, fingerprint: "fp_device", fingerprintSource: "device" }),
    ).toBe("sbm_by_identity");
  });
});
