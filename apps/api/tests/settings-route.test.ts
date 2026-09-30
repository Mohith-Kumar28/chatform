import { describe, expect, it } from "vitest";
import { SETTING_SECTION_IDS } from "@repo/form-schema";
import { routeRequest } from "../src/lib/settings-route.js";

/**
 * The builder's request router, with Jev replaced by a script.
 *
 * Pinned here: which sections a set of probabilities selects, and that every
 * failure sends every section rather than none. How well Jev places real
 * requests is measured against the model by the eval script.
 */

const ENV = { OPENROUTER_API_KEY: "sk-test", ENVIRONMENT: "test" } as const;
const CTX = { organizationId: "org_1", formId: "frm_1", source: "dashboard" };

type Probs = Record<string, number>;

function fakeJev(probs: Probs | Response) {
  const sent: { state: Record<string, unknown>; questions: Record<string, unknown> }[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    sent.push(body);
    if (probs instanceof Response) return probs;
    const answers: Record<string, unknown> = {};
    for (const id of Object.keys(body.questions)) answers[id] = { type: "noul", noul: probs[id] ?? 0.02 };
    return Response.json({ id: "gen-1", model: "typesafe/jev-1.13", answers, usage: { input_tokens: 400, output_tokens: 30, cost: 0.00001 } });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

describe("routeRequest", () => {
  it("sends only the sections that clear the bar", async () => {
    const jev = fakeJev({ section_design: 0.92, section_agent_persona: 0.6 });
    const route = await routeRequest(ENV, { request: "make it navy and sound more professional" }, CTX, { fetch: jev.fetch });
    expect(route.sections).toEqual(["design", "agent_persona"]);
    expect(route.fellBack).toBe(false);
    expect(route.asksHowTo).toBe(false);
  });

  it("sends no settings for a request about questions", async () => {
    const jev = fakeJev({ questions_only: 0.95 });
    const route = await routeRequest(ENV, { request: "add a phone number question" }, CTX, { fetch: jev.fetch });
    expect(route.sections).toEqual([]);
  });

  it("sends everything when it cannot place a request", async () => {
    const jev = fakeJev({});
    const route = await routeRequest(ENV, { request: "hmm, do the thing" }, CTX, { fetch: jev.fetch });
    expect(route.sections).toEqual(SETTING_SECTION_IDS);
  });

  it("sends everything when Jev fails", async () => {
    const jev = fakeJev(new Response("overloaded", { status: 503 }));
    const route = await routeRequest(ENV, { request: "make it navy" }, CTX, { fetch: jev.fetch });
    expect(route).toMatchObject({ sections: SETTING_SECTION_IDS, fellBack: true, call: null });
  });

  it("sends everything without a key, and asks nobody", async () => {
    const jev = fakeJev({});
    const route = await routeRequest({ ENVIRONMENT: "test" } as never, { request: "make it navy" }, CTX, { fetch: jev.fetch });
    expect(route.fellBack).toBe(true);
    expect(jev.sent).toHaveLength(0);
  });

  it("reads a how-to question, and gives Jev the last reply for short answers", async () => {
    const jev = fakeJev({ how_to: 0.9, section_design: 0.8 });
    const route = await routeRequest(ENV, { request: "where do I upload a logo?", previous: "Done." }, CTX, { fetch: jev.fetch });
    expect(route.asksHowTo).toBe(true);
    expect(jev.sent[0]!.state).toEqual({ request: "where do I upload a logo?", previous_reply: "Done." });
  });
});
