import { describe, expect, it } from "vitest";
import { Block, validateAnswer, type Block as BlockType } from "@repo/form-schema";
import { gateAnswer, numberIn, planFor, T_DIRECT, T_PICK } from "../src/lib/answer-gate.js";
import { MODELS } from "../src/lib/ai.js";

/**
 * The answer gate, with Jev replaced by a script.
 *
 * What is pinned here is everything around the model: which questions each
 * block type asks, how the answers turn into a value, and above all that every
 * failure (no key, an error, a timeout, a missing answer, a low probability, a
 * type nobody taught it) comes out as `off_script` and never as an answer.
 * How well Jev itself judges replies is measured against the real model by
 * `pnpm --filter @repo/api eval:gate`.
 */

const ENV = { OPENROUTER_API_KEY: "sk-test", ENVIRONMENT: "test" } as const;
const CTX = { organizationId: "org_1", sessionId: "chs_1", formId: "frm_1", source: "chat" };

let n = 0;
const block = (b: Record<string, unknown>): BlockType =>
  Block.parse({ id: `blk_gate${++n}xx`, ref: `q_gate${n}`, required: true, ...b });
const opts = (...labels: string[]) => labels.map((label, i) => ({ id: `opt_${i + 1}xxxx`, label }));

type Answers = Record<string, unknown>;
interface Sent {
  url: string;
  body: { model: string; state: Record<string, unknown>; questions: Record<string, { type: string; criteria?: Record<string, unknown> }>; user?: string; session_id?: string };
}

/** A fake OpenRouter System One route: answers what `script` says, records what it was sent. */
function fakeJev(script: (sent: Sent["body"]) => Answers | Response) {
  const sent: Sent[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Sent["body"];
    sent.push({ url, body });
    const out = script(body);
    if (out instanceof Response) return out;
    return Response.json({
      id: "gen-dec-1",
      model: "typesafe/jev-1.13-20260917",
      answers: out,
      usage: { input_tokens: 300, output_tokens: 40, cost: 0.0000126 },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, sent };
}

const noul = (p: number) => ({ type: "noul", noul: p });
const choice = (c: string, confidence = 0.95) => ({ type: "choice", choice: c, probabilities: { [c]: confidence }, confidence });
const yesDirect = { direct: noul(0.97) };

const instrument = block({
  type: "single_select",
  title: "Which instrument do you play?",
  options: opts("Guitar", "Piano"),
  allowOther: true,
});
const name = block({ type: "short_text", title: "What's your name?" });
const plan = block({ type: "single_select", title: "Which plan are you on?", options: opts("Free", "Pro") });

describe("gateAnswer: what reaches Jev", () => {
  it("goes to OpenRouter's System One route with the pinned model and the chat's attribution", async () => {
    const jev = fakeJev(() => ({ ...yesDirect, pick: choice("o1") }));
    await gateAnswer(ENV, instrument, "guitar mostly", CTX, { fetch: jev.fetch });
    expect(jev.sent).toHaveLength(1);
    const { url, body } = jev.sent[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    expect(body.model).toBe(MODELS.answerGate);
    expect(body.user).toBe("org_1");
    expect(body.session_id).toBe("chs_1");
    // The question and the reply, and nothing from the rest of the conversation.
    expect(body.state).toEqual({ question: "Which instrument do you play?", reply: "guitar mostly" });
    expect(Object.keys(body.questions)).toEqual(["direct", "pick", "other_text"]);
    expect(body.questions.pick!.criteria).toEqual({
      o1: "Guitar",
      o2: "Piano",
      other: expect.any(String),
      none: expect.any(String),
    });
  });

  it("offers no Other when the author did not allow one", () => {
    const planned = planFor(plan, "pro");
    expect("questions" in planned && planned.questions.pick?.type === "choice" && Object.keys(planned.questions.pick.criteria)).toEqual([
      "o1",
      "o2",
      "none",
    ]);
  });

  it("never calls for a reply that reads as a question, and says so", async () => {
    const jev = fakeJev(() => ({}));
    const r = await gateAnswer(ENV, name, "why do you need my name", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "off_script", reason: "question" });
    expect(jev.sent).toHaveLength(0);
  });
});

describe("gateAnswer: turning answers into values", () => {
  it("picks an option by meaning and returns its id", async () => {
    const jev = fakeJev(() => ({ ...yesDirect, pick: choice("o2") }));
    const r = await gateAnswer(ENV, plan, "the paid one", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "answer", value: "opt_2xxxx" });
    expect(r.call?.usage).toMatchObject({ input: 300, output: 40, costUsd: 0.0000126, generationId: "gen-dec-1" });
  });

  it("records an unlisted instrument as Other, in the respondent's own words", async () => {
    const jev = fakeJev((body) => {
      const spans = body.questions.other_text!.criteria!;
      const violin = Object.keys(spans).find((k) => spans[k] === "violin")!;
      return { ...yesDirect, pick: choice("other"), other_text: choice(violin) };
    });
    const r = await gateAnswer(ENV, instrument, "I play the violin", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "answer", value: "violin" });
    expect(validateAnswer(instrument, "violin")).toMatchObject({ ok: true, value: "violin" });
  });

  it("counts a call that skipped one of its questions as failed, not as a no", async () => {
    const jev = fakeJev(() => ({ ...yesDirect, pick: choice("o1") }));
    const r = await gateAnswer(ENV, instrument, "guitar mostly", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "off_script", reason: "failed" });
  });

  it("hands on a reply that picks nothing", async () => {
    const jev = fakeJev(() => ({ ...yesDirect, pick: choice("none") }));
    const r = await gateAnswer(ENV, plan, "enterprise", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "off_script", reason: "no_match" });
  });

  it("cuts the answer out of a sentence by choosing one of the spans code offered", async () => {
    const jev = fakeJev((body) => {
      const spans = body.questions.span!.criteria!;
      return { ...yesDirect, span: choice(Object.keys(spans).find((k) => spans[k] === "Priya Sharma")!) };
    });
    const r = await gateAnswer(ENV, name, "my name is Priya Sharma", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "answer", value: "Priya Sharma" });
    // Every span offered is a piece of what they typed. Jev cannot write one.
    const offered = Object.values(jev.sent[0]!.body.questions.span!.criteria!).filter((v) => v !== "None of these is the answer");
    for (const s of offered) expect("my name is Priya Sharma").toContain(s as string);
  });

  it("finds an email in a sentence with no choice to make", async () => {
    const email = block({ type: "email", title: "Email?" });
    const jev = fakeJev((body) => {
      expect(Object.keys(body.questions)).toEqual(["direct"]);
      return yesDirect;
    });
    const r = await gateAnswer(ENV, email, "you can reach me at Sam@Acme.io thanks", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "answer", value: "Sam@Acme.io" });
  });

  it("never trims two glued addresses into one that nobody owns", async () => {
    const email = block({ type: "email", title: "Email?" });
    const jev = fakeJev(() => yesDirect);
    // A pre-filled address with a second typed onto its end.
    const glued = await gateAnswer(ENV, email, "respondent@example.comasha@example.com", CTX, { fetch: jev.fetch });
    expect(glued.outcome).toMatchObject({ kind: "off_script" });
    // Still found at the end of a sentence, and with a country domain.
    const dotted = await gateAnswer(ENV, email, "it's asha@example.co.in.", CTX, { fetch: jev.fetch });
    expect(dotted.outcome).toEqual({ kind: "answer", value: "asha@example.co.in" });
  });

  it("asks per option on a multi-select, and returns every one picked", async () => {
    const langs = block({ type: "multi_select", title: "Languages?", options: opts("JS", "Python", "Go"), maxSelections: 3 });
    const jev = fakeJev(() => ({ ...yesDirect, o1: noul(0.95), o2: noul(0.02), o3: noul(0.9), unlisted: noul(0.03) }));
    const r = await gateAnswer(ENV, langs, "js and go", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "answer", value: ["opt_1xxxx", "opt_3xxxx"] });
  });

  it("hands on a multi-select reply that names something unlisted, or sits on the fence", async () => {
    const langs = block({ type: "multi_select", title: "Languages?", options: opts("JS", "Python") });
    const extra = fakeJev(() => ({ ...yesDirect, o1: noul(0.95), o2: noul(0.02), unlisted: noul(0.9) }));
    expect((await gateAnswer(ENV, langs, "js and elixir", CTX, { fetch: extra.fetch })).outcome).toMatchObject({ kind: "off_script" });
    const fence = fakeJev(() => ({ ...yesDirect, o1: noul(0.95), o2: noul(0.5), unlisted: noul(0.01) }));
    expect((await gateAnswer(ENV, langs, "js, python a bit", CTX, { fetch: fence.fetch })).outcome).toEqual({ kind: "off_script", reason: "unsure" });
  });

  it("refuses a multi-select pick the validator would, rather than pass it to record", async () => {
    const two = block({ type: "multi_select", title: "Pick two at most", options: opts("A", "B", "C"), maxSelections: 2 });
    const jev = fakeJev(() => ({ ...yesDirect, o1: noul(0.9), o2: noul(0.9), o3: noul(0.9), unlisted: noul(0.01) }));
    expect((await gateAnswer(ENV, two, "all three", CTX, { fetch: jev.fetch })).outcome).toEqual({ kind: "off_script", reason: "invalid" });
  });

  it("reads a number in code and asks Jev only whether it is the answer", async () => {
    const rating = block({ type: "rating", title: "Rate it", scale: 5 });
    const jev = fakeJev((body) => {
      expect(Object.keys(body.questions)).toEqual(["direct"]);
      return yesDirect;
    });
    expect((await gateAnswer(ENV, rating, "4 out of 5", CTX, { fetch: jev.fetch })).outcome).toEqual({ kind: "answer", value: 4 });
    // Out of range never reaches Jev.
    expect((await gateAnswer(ENV, rating, "11", CTX, { fetch: jev.fetch })).outcome).toEqual({ kind: "off_script", reason: "invalid" });
  });

  it("maps words to a level when there is no number", async () => {
    const rating = block({ type: "rating", title: "Rate it", scale: 5 });
    const jev = fakeJev(() => ({ ...yesDirect, pick: choice("l5") }));
    expect((await gateAnswer(ENV, rating, "it was excellent", CTX, { fetch: jev.fetch })).outcome).toEqual({ kind: "answer", value: 5 });
  });

  it("answers yes/no, and a consent with the validator's stamp still to come", async () => {
    const yn = block({ type: "yes_no", title: "Used one before?" });
    const jev = fakeJev(() => ({ ...yesDirect, pick: choice("no") }));
    expect((await gateAnswer(ENV, yn, "nahi", CTX, { fetch: jev.fetch })).outcome).toEqual({ kind: "answer", value: false });
  });
});

describe("gateAnswer: everything unsure is off script", () => {
  const cases: [string, () => ReturnType<typeof fakeJev>][] = [
    ["not direct enough", () => fakeJev(() => ({ direct: noul(T_DIRECT - 0.01), pick: choice("o1") }))],
    ["an unsure pick", () => fakeJev(() => ({ ...yesDirect, pick: choice("o1", T_PICK - 0.01) }))],
    ["a missing answer", () => fakeJev(() => ({ ...yesDirect }))],
    ["a mistyped answer", () => fakeJev(() => ({ ...yesDirect, pick: noul(0.99) }))],
    ["a 402", () => fakeJev(() => new Response("no credits", { status: 402 }))],
    ["a 529", () => fakeJev(() => new Response("overloaded", { status: 529 }))],
    ["a body that is not JSON", () => fakeJev(() => new Response("<html>", { status: 200 }))],
  ];
  for (const [what, make] of cases) {
    it(`on ${what}`, async () => {
      const r = await gateAnswer(ENV, instrument, "guitar", CTX, { fetch: make().fetch });
      expect(r.outcome.kind).toBe("off_script");
    });
  }

  it("on a timeout", async () => {
    const hang = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as unknown as typeof fetch;
    const { askJev } = await import("../src/lib/jev.js");
    const r = await askJev(ENV, {}, { direct: { type: "noul", instructions: "?" } }, CTX, { fetch: hang, timeoutMs: 20 });
    expect(r).toBeNull();
  });

  it("with no OpenRouter key, without calling anything", async () => {
    const jev = fakeJev(() => ({}));
    const r = await gateAnswer({ ENVIRONMENT: "test" }, instrument, "guitar", CTX, { fetch: jev.fetch });
    expect(r.outcome).toEqual({ kind: "off_script", reason: "unavailable" });
    expect(jev.sent).toHaveLength(0);
  });

  it("for block types it does not handle, including ones that do not exist yet", async () => {
    const jev = fakeJev(() => ({}));
    const ranking = block({ type: "ranking", title: "Rank", items: [{ id: "itm_aaaaaa", label: "A" }, { id: "itm_bbbbbb", label: "B" }] });
    const upload = block({ type: "file_upload", title: "Your CV?", accept: ["application/pdf"] });
    const future = { ...name, type: "hologram" } as unknown as BlockType;
    for (const b of [ranking, upload, future]) {
      expect((await gateAnswer(ENV, b, "A then B", CTX, { fetch: jev.fetch })).outcome).toEqual({ kind: "off_script", reason: "unsupported" });
    }
    expect(jev.sent).toHaveLength(0);
  });

  it("for a dropdown too long for one Choice", () => {
    const huge = block({ type: "dropdown", title: "Country", options: Array.from({ length: 300 }, (_, i) => ({ id: `opt_${i}xxxxx`, label: `C${i}` })) });
    expect(planFor(huge, "India")).toEqual({ kind: "off_script", reason: "unsupported" });
  });
});

describe("numberIn", () => {
  it.each([
    ["4", 4],
    ["a 4", 4],
    ["four stars", 4],
    ["8 out of 10", 8],
    ["7/10", 7],
    ["zero chance", 0],
    ["pretty good", null],
    ["between 3 and 4", null],
  ])("%s → %s", (text, want) => {
    expect(numberIn(text)).toBe(want);
  });
});
