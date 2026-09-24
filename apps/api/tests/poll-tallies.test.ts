import { describe, expect, it, beforeEach, inject } from "vitest";
import { env, applyD1Migrations } from "cloudflare:test";
import { movePollVote, readPollTally } from "../src/lib/poll-tallies.js";

/**
 * The arithmetic behind a poll, which is the only thing this file has to be
 * right about: the runtime decides who may see a tally, and the block schema
 * decides when. What happens here is a counter that must agree with the
 * answers it summarises, however many times somebody changes their mind.
 */

const FORM = "frm_polltally";
const REF = "q_stack";

/**
 * A real form row, because `poll_tallies.form_id` is a foreign key and the
 * cascade on it is the only thing that stops a deleted form leaving its counts
 * behind. A fixture that dodged the constraint would prove nothing about the
 * table that ships.
 *
 * Seeded with SQL rather than through `seedTenant`, which builds a tenant by
 * signing up through the real auth endpoints and so boots the whole app — and
 * the app's AI and Vectorize bindings are remote-only, so importing it here
 * makes seven assertions about arithmetic depend on the network being up.
 */
beforeEach(async () => {
  await applyD1Migrations(env.DB, inject("migrations"));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR IGNORE INTO organizations (id, name, slug, created_at) VALUES ('org_polls', 'Polls', 'polls', ?1)`,
    ).bind(now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO workspaces (id, organization_id, name, slug, created_at) VALUES ('ws_polls', 'org_polls', 'Polls', 'polls', ?1)`,
    ).bind(now),
    env.DB.prepare(
      `INSERT OR IGNORE INTO forms (id, organization_id, workspace_id, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?1, 'org_polls', 'ws_polls', 'Poll', 'poll-tally-test', 'published', '{}', 'salt', ?2, ?2)`,
    ).bind(FORM, now),
    env.DB.prepare(`DELETE FROM poll_tallies WHERE form_id = ?`).bind(FORM),
  ]);
});

describe("moving a vote", () => {
  it("counts a first vote", async () => {
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    expect(await readPollTally(env, FORM, REF)).toEqual({ counts: { opt_a: 1 }, total: 1 });
  });

  it("moves a vote rather than adding a second one", async () => {
    // The bug this exists to prevent: an increment on the answer path and a
    // decrement somewhere else leaves a respondent counted twice, and a poll
    // whose total exceeds the number of people who answered it.
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    await movePollVote(env, { formId: FORM, blockRef: REF, from: "opt_a", to: "opt_b" });
    expect(await readPollTally(env, FORM, REF)).toEqual({ counts: { opt_b: 1 }, total: 1 });
  });

  it("takes a vote back", async () => {
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    await movePollVote(env, { formId: FORM, blockRef: REF, from: "opt_a", to: null });
    expect(await readPollTally(env, FORM, REF)).toEqual({ counts: {}, total: 0 });
  });

  it("does nothing when the answer has not actually changed", async () => {
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    await movePollVote(env, { formId: FORM, blockRef: REF, from: "opt_a", to: "opt_a" });
    expect(await readPollTally(env, FORM, REF)).toEqual({ counts: { opt_a: 1 }, total: 1 });
  });

  it("never goes negative", async () => {
    // A retry, or a tally rebuilt underneath a session, must not leave a bar
    // below zero on a page strangers are looking at.
    await movePollVote(env, { formId: FORM, blockRef: REF, from: "opt_a", to: null });
    await movePollVote(env, { formId: FORM, blockRef: REF, from: "opt_a", to: null });
    const tally = await readPollTally(env, FORM, REF);
    expect(tally.total).toBe(0);
    expect(tally.counts.opt_a ?? 0).toBe(0);
  });

  it("keeps each question's count to itself", async () => {
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    await movePollVote(env, { formId: FORM, blockRef: "q_other", to: "opt_a" });
    expect((await readPollTally(env, FORM, REF)).total).toBe(1);
    expect((await readPollTally(env, FORM, "q_other")).total).toBe(1);
  });

  it("adds up across options", async () => {
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_a" });
    await movePollVote(env, { formId: FORM, blockRef: REF, to: "opt_b" });
    expect(await readPollTally(env, FORM, REF)).toEqual({ counts: { opt_a: 2, opt_b: 1 }, total: 3 });
  });
});
