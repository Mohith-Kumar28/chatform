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
    respondentId?: string | null;
  } = {},
): Promise<string> {
  const now = cols.updatedAt ?? Date.now();
  await env.DB.prepare(
    `INSERT INTO submissions (id, form_id, form_version_id, organization_id, status, source, is_test,
                              started_at, updated_at, session_id, fingerprint,
                              respondent_provider, respondent_subject, respondent_id)
     VALUES (?1, ?2, NULL, ?3, ?4, 'chat', ?5, ?6, ?6, ?7, ?8, ?9, ?10, ?11)`,
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
      cols.respondentId ?? null,
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
  /*
    A real second form, because the cross-form cases below now *write* rather
    than only query: `submissions.form_id` is a foreign key, and an id that
    names nothing fails on that long before it reaches the rule under test.
  */
  await env.DB.prepare(
    `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status,
                        working_schema, fingerprint_salt, created_at, updated_at)
     SELECT ?1, organization_id, workspace_id, created_by, 'Another form', 'another-form', 'draft',
            working_schema, 'salt', created_at, updated_at
       FROM forms WHERE id = ?2`,
  )
    .bind(OTHER_FORM, t.formId)
    .run();
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

  /**
   * The key that is set before anybody signs in.
   *
   * Both of the matches above need something the visit has already proved — a
   * verified subject, or a device signal strong enough to trust — and the
   * duplicates this exists to stop were being made in the minutes before either
   * was true. `respondent_id` is resolved when the session opens, out of
   * whatever the visit offered, and merged across every identifier that turns
   * out to name one human, so it recognises somebody earlier than the other two
   * and keeps recognising them after a merge moves their id.
   */
  describe("by the respondent id", () => {
    it("matches the person, however they arrived this time", async () => {
      await seed("sbm_theirs", { respondentId: "rsp_maya" });
      expect(await find({ ...BASE, respondentId: "rsp_maya" })).toBe("sbm_theirs");
    });

    it("finds a draft opened before they signed in", async () => {
      // The case neither other rule can reach: no subject on the row yet,
      // and this visit is a different browser so there is no device to match.
      await seed("sbm_anon", { respondentId: "rsp_maya", fingerprint: "fp_their_laptop" });
      expect(
        await find({ ...BASE, respondentId: "rsp_maya", identity: GOOGLE, fingerprint: "fp_their_phone", fingerprintSource: "device" }),
      ).toBe("sbm_anon");
    });

    it("ignores a different person, a finished response, and another form", async () => {
      await seed("sbm_them", { respondentId: "rsp_someone_else" });
      await seed("sbm_done", { respondentId: "rsp_maya", status: "completed" });
      await seed("sbm_elsewhere", { respondentId: "rsp_maya", formId: OTHER_FORM });
      expect(await find({ ...BASE, respondentId: "rsp_maya" })).toBeNull();
    });

    it("leads, because it is the strongest thing the visit knows", async () => {
      await seed("sbm_by_device", { fingerprint: "fp_device" });
      await seed("sbm_by_identity", { provider: "google", subject: "sub_maya" });
      await seed("sbm_by_respondent", { respondentId: "rsp_maya" });
      expect(
        await find({
          ...BASE,
          respondentId: "rsp_maya",
          identity: GOOGLE,
          fingerprint: "fp_device",
          fingerprintSource: "device",
        }),
      ).toBe("sbm_by_respondent");
    });

    it("matches any session when the caller asks for any", async () => {
      // What `openResponse` wants after a collision: by then the question is
      // not "does somebody else have one" but "which row did the constraint
      // keep", and its own session is a legitimate owner of the answer.
      await seed("sbm_ours", { respondentId: "rsp_maya", sessionId: "chs_current" });
      expect(await find({ ...BASE, respondentId: "rsp_maya" })).toBeNull();
      expect(await find({ ...BASE, sessionId: null, respondentId: "rsp_maya" })).toBe("sbm_ours");
    });
  });
});

/**
 * The invariant, as the database states it.
 *
 * Everything above is a lookup, and a lookup is advice: `ensureSubmissionRow`
 * was free to skip it, and on "Start over" it did — which is how one respondent
 * came to hold two abandoned drafts of one form. `0027` moves the rule to where
 * it cannot be skipped.
 */
describe("uq_submissions_one_open_per_respondent", () => {
  const second = (id: string, cols: Parameters<typeof seed>[1]) =>
    seed(id, cols).then(
      () => null,
      (err: unknown) => err,
    );

  it("refuses a second open response for one person on one form", async () => {
    await seed("sbm_first", { respondentId: "rsp_maya", status: "in_progress" });
    const err = await second("sbm_second", { respondentId: "rsp_maya", status: "abandoned" });
    // Named, so this cannot pass on some unrelated constraint the seed trips.
    expect(String(err)).toMatch(/UNIQUE constraint failed/i);
  });

  it("refuses it from the other direction too — abandoned first, then in progress", async () => {
    await seed("sbm_left", { respondentId: "rsp_maya", status: "abandoned" });
    expect(
      String(await second("sbm_returned", { respondentId: "rsp_maya", status: "in_progress" })),
    ).toMatch(/UNIQUE constraint failed/i);
  });

  it("allows a second finished one, which is the author's setting to make", async () => {
    await seed("sbm_done", { respondentId: "rsp_maya", status: "completed" });
    expect(await second("sbm_done_again", { respondentId: "rsp_maya", status: "completed" })).toBeNull();
    // And an open draft alongside them: answering again starts somewhere.
    expect(await second("sbm_open", { respondentId: "rsp_maya", status: "in_progress" })).toBeNull();
  });

  it("leaves unattributed responses alone", async () => {
    // A headless caller who volunteered nothing to recognise anybody by has no
    // person to be one draft of, and two of them are two responses.
    await seed("sbm_anon_a", { respondentId: null, status: "in_progress" });
    expect(await second("sbm_anon_b", { respondentId: null, status: "in_progress" })).toBeNull();
  });

  it("keeps rehearsals out of the way of real responses", async () => {
    await seed("sbm_real", { respondentId: "rsp_maya", status: "in_progress" });
    expect(await second("sbm_rehearsal", { respondentId: "rsp_maya", status: "in_progress", isTest: true })).toBeNull();
  });

  it("does not reach across forms", async () => {
    await seed("sbm_here", { respondentId: "rsp_maya", status: "in_progress" });
    expect(
      await second("sbm_there", { respondentId: "rsp_maya", status: "in_progress", formId: OTHER_FORM }),
    ).toBeNull();
  });
});
