import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, fetchApi, seedTenant, type Tenant } from "./helpers.js";
import {
  assignIssue,
  decodeVector,
  deleteOrganizationReports,
  sweepDeletedFormFeedback,
  encodeVector,
  normalise,
  type Decider,
  type Embedder,
} from "../src/lib/feedback-issues.js";
import { runMailJob } from "../src/lib/mail-jobs.js";
import type { Bindings } from "../src/env.js";

/**
 * Grouping bug reports into issues.
 *
 * The model calls are stubbed with something deterministic that behaves like
 * the real pair measured in `feedback-issue-prompt.ts`: notes about the same bug
 * embed close together, different bugs apart, and the decider matches on meaning.
 * What is under test is everything around them — the shortlist, the idempotency,
 * the single write, the derived counts, and the corrections.
 */

const DB = () => env as unknown as Bindings;
let t: Tenant;
let admin: Tenant;

/** Each bug is a direction; a note's words pick the direction, with a little noise per note. */
const BUGS = ["PICKER", "PHONE", "UPLOAD", "SLOW"];
const embed: Embedder = async (text) => {
  const bug = BUGS.find((b) => text.includes(b));
  const v = new Array(16).fill(0.02);
  if (bug) v[BUGS.indexOf(bug)] = 1;
  v[8 + (text.length % 8)] += 0.15;
  return v;
};

/** Matches a candidate whose title names the same bug; otherwise titles a new issue after it. */
const decide: Decider = async ({ note, candidates }) => {
  const bug = BUGS.find((b) => note.includes(b)) ?? "OTHER";
  const hit = candidates.find((c) => c.title.includes(bug));
  return { match: hit?.id ?? null, title: `${bug} issue` };
};
const deps = { embed, decide };

let seq = 0;
async function report(message: string | null, opts: { rating?: number; ageDays?: number; respondent?: string } = {}): Promise<string> {
  seq += 1;
  const id = `fbk_iss_${seq}`;
  await DB()
    .DB.prepare(
      `INSERT INTO respondent_feedback (id, respondent_id, session_id, form_id, organization_id, rating, message, source, status, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'chat', 'new', ?8)`,
    )
    .bind(
      id,
      null,
      opts.respondent ?? `chs_iss_${seq}`,
      t.formId,
      t.orgId,
      opts.rating ?? 2,
      message,
      Date.now() - (opts.ageDays ?? 0) * 86_400_000 + seq,
    )
    .run();
  return id;
}

const issueOf = async (id: string) =>
  (await DB().DB.prepare(`SELECT issue_id FROM respondent_feedback WHERE id = ?`).bind(id).first<{ issue_id: string | null }>())
    ?.issue_id ?? null;

const asAdmin = (path: string, init: RequestInit = {}) =>
  fetchApi(path, { ...init, headers: { ...(init.headers ?? {}), cookie: admin.cookie, "content-type": "application/json" } });

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("issues");
  admin = await seedTenant("issuesadmin");
  (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "issuesadmin@example.com";
});

describe("vectors", () => {
  it("round-trip through base64 exactly", () => {
    const v = normalise([3, 4, 0, -1.5]);
    expect(Array.from(decodeVector(encodeVector(v)))).toEqual(Array.from(v));
  });
});

describe("matching a report to its issue", () => {
  it("opens an issue, groups the same bug into it, and keeps a different bug apart", async () => {
    const a = await report("The PICKER will not open on my phone");
    const b = await report("Tapping the PICKER does nothing at all, tried twice");
    const c = await report("My PHONE number is rejected as invalid");

    const first = await assignIssue(DB(), a, deps);
    const second = await assignIssue(DB(), b, deps);
    const third = await assignIssue(DB(), c, deps);

    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.issueId).toBe(first?.issueId);
    expect(third?.created).toBe(true);
    expect(third?.issueId).not.toBe(first?.issueId);

    const issue = await DB()
      .DB.prepare(`SELECT title, centroid_n FROM feedback_issues WHERE id = ?`)
      .bind(first!.issueId)
      .first<{ title: string; centroid_n: number }>();
    expect(issue?.title).toBe("PICKER issue");
    expect(issue?.centroid_n).toBe(2);
  });

  it("does nothing the second time — the retry rule", async () => {
    const id = await report("UPLOAD stuck at ninety percent");
    const once = await assignIssue(DB(), id, deps);
    let calls = 0;
    const counting: Decider = async (input) => {
      calls += 1;
      return decide(input);
    };
    const twice = await assignIssue(DB(), id, { embed, decide: counting });
    expect(twice?.issueId).toBe(once?.issueId);
    expect(calls).toBe(0);
    const n = await DB().DB.prepare(`SELECT COUNT(*) AS n FROM feedback_issues WHERE title = 'UPLOAD issue'`).first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it("never groups a report with no words", async () => {
    const id = await report(null);
    expect(await assignIssue(DB(), id, deps)).toBeNull();
    expect(await issueOf(id)).toBeNull();
  });

  it("opens a new issue when the model names one it was never offered", async () => {
    const id = await report("SLOW replies from the bot");
    const rogue: Decider = async () => ({ match: "fis_does_not_exist", title: "SLOW issue" });
    const result = await assignIssue(DB(), id, { embed, decide: rogue });
    expect(result?.created).toBe(true);
  });

  it("leaves the report unassigned, without throwing, when the model is down", async () => {
    const id = await report("PICKER again, broken");
    const down: Embedder = async () => {
      throw new Error("Workers AI unavailable");
    };
    expect(await assignIssue(DB(), id, { embed: down, decide })).toBeNull();
    expect(await issueOf(id)).toBeNull();
  });

  it("does not call a model under test unless handed one", async () => {
    const id = await report("PHONE field broken");
    expect(await assignIssue(DB(), id)).toBeNull();
  });

  it("treats an issue quiet for a quarter as over, and a merged one as gone", async () => {
    const old = await report("PICKER problem from last season", { ageDays: 120 });
    // An issue whose only report is 120 days old must not be offered.
    const oldIssue = await assignIssue(DB(), old, { embed, decide: async () => ({ match: null, title: "PICKER issue (old)" }) });
    const offered: string[][] = [];
    const spy: Decider = async (input) => {
      offered.push(input.candidates.map((c) => c.id));
      return decide(input);
    };
    await assignIssue(DB(), await report("PICKER still broken"), { embed, decide: spy });
    expect(offered[0]).not.toContain(oldIssue!.issueId);
  });
});

describe("the issues inbox", () => {
  it("derives counts from reports, resolves an issue by resolving its reports, and notices when it comes back", async () => {
    const x = await report("UPLOAD fails with an error", { respondent: "chs_same_person" });
    const y = await report("UPLOAD does not work on my resume", { respondent: "chs_same_person" });
    const { issueId } = (await assignIssue(DB(), x, deps))!;
    await assignIssue(DB(), y, deps);

    const list = await (await asAdmin("/api/admin/feedback/issues?status=all&limit=100")).json<{
      issues: { id: string; reports: number; people: number; forms: number; status: string; reopened: boolean }[];
    }>();
    const upload = list.issues.find((i) => i.id === issueId)!;
    expect(upload.reports).toBeGreaterThanOrEqual(2);
    // One person filing twice is one person.
    expect(upload.people).toBeLessThan(upload.reports);
    expect(upload.forms).toBe(1);
    expect(upload.status).toBe("new");

    const resolved = await asAdmin(`/api/admin/feedback/issues/${issueId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(resolved.status).toBe(200);
    const stillNew = await DB()
      .DB.prepare(`SELECT COUNT(*) AS n FROM respondent_feedback WHERE issue_id = ? AND status = 'new'`)
      .bind(issueId)
      .first<{ n: number }>();
    expect(stillNew?.n).toBe(0);

    // A new report of the resolved problem lands on it and reopens it.
    const again = await report("UPLOAD broken again today");
    expect((await assignIssue(DB(), again, deps))?.issueId).toBe(issueId);
    const after = await (await asAdmin(`/api/admin/feedback/issues/${issueId}`)).json<{ status: string; reopened: boolean }>();
    expect(after.status).toBe("new");
    expect(after.reopened).toBe(true);

    // And the mail says so.
    const sent: { subject: string; text: string }[] = [];
    const binding = { send: async (m: unknown) => (sent.push(m as never), { messageId: "m" }) } as unknown as SendEmail;
    await runMailJob({ ...DB(), EMAIL: binding, PLATFORM_ADMIN_EMAILS: "founder@example.com" }, { kind: "respondent_feedback", feedbackId: again });
    expect(sent[0]?.subject).toContain("(reopened)");
    expect(sent[0]?.text).toContain("Issue: UPLOAD issue");
  });

  it("filters the reports list to one issue", async () => {
    const id = await report("SLOW bot replies again");
    const { issueId } = (await assignIssue(DB(), id, deps))!;
    const body = await (await asAdmin(`/api/admin/feedback/reports?status=all&issue=${issueId}`)).json<{
      reports: { id: string; issueId: string; issueTitle: string }[];
    }>();
    expect(body.reports.length).toBeGreaterThan(0);
    expect(body.reports.every((r) => r.issueId === issueId)).toBe(true);
    expect(body.reports[0]?.issueTitle).toBe("SLOW issue");
  });

  it("renames, and keeps the rename", async () => {
    const id = await report("PHONE rejected once more");
    const { issueId } = (await assignIssue(DB(), id, deps))!;
    await asAdmin(`/api/admin/feedback/issues/${issueId}`, { method: "PATCH", body: JSON.stringify({ title: "+91 numbers rejected" }) });
    const row = await DB()
      .DB.prepare(`SELECT title, title_edited FROM feedback_issues WHERE id = ?`)
      .bind(issueId)
      .first<{ title: string; title_edited: number }>();
    expect(row).toEqual({ title: "+91 numbers rejected", title_edited: 1 });
  });
});

describe("corrections", () => {
  it("merges two issues that are the same bug, and an old link still lands", async () => {
    const one = await report("SLOW loading of answers");
    const two = await report("waiting forever, very SLOW");
    const a = (await assignIssue(DB(), one, { embed, decide: async () => ({ match: null, title: "Loading is SLOW" }) }))!;
    const b = (await assignIssue(DB(), two, { embed, decide: async () => ({ match: null, title: "Bot SLOW to answer" }) }))!;
    expect(a.issueId).not.toBe(b.issueId);

    const merged = await asAdmin(`/api/admin/feedback/issues/${b.issueId}/merge`, {
      method: "POST",
      body: JSON.stringify({ into: a.issueId }),
    });
    expect(merged.status).toBe(200);
    expect(await issueOf(two)).toBe(a.issueId);

    const viaOldLink = await (await asAdmin(`/api/admin/feedback/issues/${b.issueId}`)).json<{ id: string }>();
    expect(viaOldLink.id).toBe(a.issueId);
  });

  it("moves a report out to an issue of its own, and an emptied issue disappears", async () => {
    const lone = await report("PICKER shows wrong date");
    const { issueId: original } = (await assignIssue(DB(), lone, { embed, decide: async () => ({ match: null, title: "Solo PICKER bug" }) }))!;

    const nearest = await (await asAdmin(`/api/admin/feedback/reports/${lone}/nearest`)).json<{ issues: { id: string }[] }>();
    expect(nearest.issues.every((i) => i.id !== original)).toBe(true);

    const moved = await asAdmin(`/api/admin/feedback/reports/${lone}/move`, { method: "POST", body: JSON.stringify({ issueId: "new" }) });
    expect(moved.status).toBe(200);
    const { issueId: fresh } = await moved.json<{ issueId: string }>();
    expect(fresh).not.toBe(original);
    expect(await issueOf(lone)).toBe(fresh);

    const gone = await DB().DB.prepare(`SELECT id FROM feedback_issues WHERE id = ?`).bind(original).first();
    expect(gone).toBeNull();
  });

  it("is admin-only", async () => {
    (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "someone-else@example.com";
    expect((await asAdmin("/api/admin/feedback/issues")).status).toBe(404);
    (env as unknown as Record<string, string | undefined>).PLATFORM_ADMIN_EMAILS = "issuesadmin@example.com";
  });
});

describe("deleting", () => {
  const count = async (sql: string, ...binds: unknown[]) =>
    Number((await DB().DB.prepare(sql).bind(...binds).first<{ n: number }>())?.n ?? 0);

  it("deletes a report with its snapshot and vector, and the issue once nothing is left in it", async () => {
    const one = await report("UPLOAD button spins forever");
    const two = await report("cannot UPLOAD my resume");
    // Its own issue, not one an earlier test opened for the same bug.
    const { issueId } = (await assignIssue(DB(), one, { embed, decide: async () => ({ match: null, title: "Deletable" }) }))!;
    expect((await assignIssue(DB(), two, { embed, decide: async () => ({ match: issueId, title: "" }) }))!.issueId).toBe(issueId);
    // A tombstone merged into it, which must not outlive it.
    await DB().DB.prepare(`INSERT INTO feedback_issues (id, title, title_edited, centroid, centroid_n, created_at, merged_into) VALUES ('fis_tomb', 'old', 0, '', 0, 0, ?)`).bind(issueId).run();
    const key = `feedback/${t.orgId}/${one}.json`;
    await DB().R2.put(key, "{}");
    await DB().DB.prepare(`UPDATE respondent_feedback SET snapshot_key = ? WHERE id = ?`).bind(key, one).run();

    expect((await asAdmin(`/api/admin/feedback/reports/${one}`, { method: "DELETE" })).status).toBe(200);
    expect(await count(`SELECT COUNT(*) n FROM respondent_feedback WHERE id = ?`, one)).toBe(0);
    expect(await count(`SELECT COUNT(*) n FROM feedback_embeddings WHERE feedback_id = ?`, one)).toBe(0);
    expect(await DB().R2.get(key)).toBeNull();
    expect(await count(`SELECT COUNT(*) n FROM feedback_issues WHERE id = ?`, issueId)).toBe(1);

    expect((await asAdmin(`/api/admin/feedback/reports/${two}`, { method: "DELETE" })).status).toBe(200);
    expect(await count(`SELECT COUNT(*) n FROM feedback_issues WHERE id IN (?, 'fis_tomb')`, issueId)).toBe(0);
    expect((await asAdmin(`/api/admin/feedback/reports/${two}`, { method: "DELETE" })).status).toBe(404);
  });

  it("clears a deleted form's reports after the retention week, not before", async () => {
    const gone = await seedTenant("issuesgone");
    const put = async (id: string) => {
      await DB().DB.prepare(
        `INSERT INTO respondent_feedback (id, session_id, form_id, organization_id, rating, message, source, status, created_at)
         VALUES (?1, ?1, ?2, ?3, 2, 'PHONE rejected', 'chat', 'new', ?4)`,
      ).bind(id, gone.formId, gone.orgId, Date.now()).run();
      await assignIssue(DB(), id, deps);
    };
    await put("fbk_gone_1");

    await DB().DB.prepare(`UPDATE forms SET deleted_at = ? WHERE id = ?`).bind(Date.now() - 86_400_000, gone.formId).run();
    await sweepDeletedFormFeedback(DB());
    expect(await count(`SELECT COUNT(*) n FROM respondent_feedback WHERE id = 'fbk_gone_1'`)).toBe(1);

    await DB().DB.prepare(`UPDATE forms SET deleted_at = ? WHERE id = ?`).bind(Date.now() - 8 * 86_400_000, gone.formId).run();
    await sweepDeletedFormFeedback(DB());
    expect(await count(`SELECT COUNT(*) n FROM respondent_feedback WHERE id = 'fbk_gone_1'`)).toBe(0);
    expect(await count(`SELECT COUNT(*) n FROM feedback_embeddings WHERE feedback_id = 'fbk_gone_1'`)).toBe(0);
  });

  it("clears every report of an organization that is being deleted", async () => {
    const leaving = await seedTenant("issuesleaving");
    for (const id of ["fbk_leave_1", "fbk_leave_2"]) {
      await DB().DB.prepare(
        `INSERT INTO respondent_feedback (id, session_id, form_id, organization_id, rating, message, source, status, created_at)
         VALUES (?1, ?1, ?2, ?3, 2, 'SLOW to load', 'chat', 'new', ?4)`,
      ).bind(id, leaving.formId, leaving.orgId, Date.now()).run();
    }
    await deleteOrganizationReports(DB(), leaving.orgId);
    expect(await count(`SELECT COUNT(*) n FROM respondent_feedback WHERE organization_id = ?`, leaving.orgId)).toBe(0);
  });
});
