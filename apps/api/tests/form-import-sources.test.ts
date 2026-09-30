import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { lintFormDoc, type FormDoc } from "@repo/form-schema";
import { applySchema, fetchApi, seedTenant } from "./helpers.js";
import { plainTypeformText, readTypeform } from "../src/lib/import/typeform.js";
import { readGoogleForm } from "../src/lib/import/google.js";
import { readTallyForm, tallyText } from "../src/lib/import/tally.js";
import { resolveImportUrl } from "../src/lib/import/read.js";
import { importedToDoc } from "../src/lib/import/to-doc.js";
import { ImportError } from "../src/lib/import/types.js";
import { expireImportTrials } from "../src/routes/import.js";
import typeform1 from "./fixtures/import/typeform-1.json";
import typeform2 from "./fixtures/import/typeform-2.json";
import tally1 from "./fixtures/import/tally-1.json";
import tally2 from "./fixtures/import/tally-2.json";
import google1 from "./fixtures/import/google-1.json";

/**
 * Imports, against real public forms saved as fixtures (Typeform's API JSON,
 * a Tally page's `__NEXT_DATA__`, a Google Form's `FB_PUBLIC_LOAD_DATA_`),
 * so a reader is tested on what the source actually sends, not on a shape we
 * imagined for it.
 */

const convert = {
  typeform1: () => importedToDoc(readTypeform(typeform1, "https://form.typeform.com/to/PxcVKQGb")),
  typeform2: () => importedToDoc(readTypeform(typeform2, "https://form.typeform.com/to/nNyXHtlb")),
  tally1: () => importedToDoc(readTallyForm(tally1 as never, "https://tally.so/r/mZNovm")),
  tally2: () => importedToDoc(readTallyForm(tally2 as never, "https://tally.so/r/3X5kdw")),
  google1: () => importedToDoc(readGoogleForm(google1 as unknown[], "https://docs.google.com/forms/d/e/x/viewform")),
};

const block = (doc: FormDoc, title: string) => {
  const b = doc.blocks.find((x) => x.title.startsWith(title));
  if (!b) throw new Error(`no block titled ${title}`);
  return b;
};
const rulesFrom = (doc: FormDoc, ref: string) => doc.logic.filter((r) => r.action_kind === "goto" && r.from === ref);
const optionId = (doc: FormDoc, title: string, label: string) =>
  ((block(doc, title) as { options: { id: string; label: string }[] }).options.find((o) => o.label === label))!.id;

describe("every fixture converts to a document that publishes", () => {
  for (const [name, run] of Object.entries(convert)) {
    it(name, () => {
      const { doc } = run();
      expect(lintFormDoc(doc).filter((i) => i.level === "error")).toEqual([]);
      expect(doc.blocks[0]!.type).toBe("welcome");
    });
  }
});

describe("Typeform", () => {
  it("copies wording, types and required flags", () => {
    const { doc, report } = convert.typeform1();
    expect(block(doc, "How can we help you today?").type).toBe("single_select");
    expect(block(doc, "What's your business email address?").type).toBe("email");
    expect(block(doc, "What are your organization’s needs?").type).toBe("multi_select");
    expect(block(doc, "And now the legal stuff!").type).toBe("legal_consent");
    expect(block(doc, "What is your first name?").required).toBe(true);
    // An inline group's questions come through one by one, with its heading as a statement.
    expect(block(doc, "We'll get you connected").type).toBe("statement");
    expect(report.provider).toBe("typeform");
  });

  it("copies a jump on the question's own answer exactly, and says which rules it could not copy", () => {
    const { doc, report } = convert.typeform1();
    const help = block(doc, "How can we help you today?");
    const [rule] = rulesFrom(doc, help.ref);
    expect(rule).toMatchObject({
      targetKind: "ending",
      when: { conditions: [{ left: { ref: help.ref }, op: "eq", value: optionId(doc, "How can we help you today?", "I need help with my existing Typeform account") }] },
    });
    // Rules after one question that test another are counted, not copied half-right.
    expect(report.notCopied.some((n) => /8 rules that check an earlier answer/.test(n))).toBe(true);
    expect(report.notCopied.some((n) => /Calendly/.test(n))).toBe(true);
  });

  it("drops bold markers and recalled answers from titles", () => {
    const { doc } = convert.typeform2();
    expect(doc.blocks.some((b) => b.title === "What's your last name?")).toBe(true);
    expect(plainTypeformText("Thanks {{field:abc}}! What's *your* _team_ called?")).toEqual({
      text: "Thanks! What's your team called?",
      recalled: true,
    });
  });

  it("routes a yes/no on its boolean answer", () => {
    const { doc } = convert.typeform2();
    const team = block(doc, "Do you have a team?");
    const rules = rulesFrom(doc, team.ref);
    expect(rules[0]).toMatchObject({ when: { conditions: [{ op: "eq", value: true }] } });
    // Otherwise, past the team questions: an authored jump the builder keeps.
    expect(rules[1]).toMatchObject({ when: { conditions: [], groups: [] }, target: block(doc, "Ok, you have just about").ref });
  });
});

describe("Tally", () => {
  it("reads rich-text titles as plain words", () => {
    expect(tallyText([["What did you do, did you"], [[[" "], ["try", [["text-decoration", "underline"]]], [" "]], [["font-style", "italic"]]], ["to get an answer?"]])).toBe(
      "What did you do, did you try to get an answer?",
    );
  });

  it("turns 'show this follow-up for No' into: No goes to it, everyone else skips it", () => {
    const { doc } = convert.tally1();
    const q = block(doc, "What did you do about that question");
    const followUp = block(doc, "Why not?");
    const next = block(doc, "Did you find an answer");
    const rules = rulesFrom(doc, q.ref);
    expect(rules[0]).toMatchObject({ target: followUp.ref, when: { conditions: [{ op: "eq", value: optionId(doc, "What did you do about that question", "No") }] } });
    // The last rule off the question is the "otherwise" past every follow-up;
    // the follow-up itself jumps past the one below it so No never falls into Yes.
    expect(rules.at(-1)).toMatchObject({ target: next.ref, when: { conditions: [] } });
    expect(rulesFrom(doc, followUp.ref)[0]).toMatchObject({ target: next.ref });
  });

  it("drops the half of a condition a required question makes impossible", () => {
    const { doc } = convert.tally2();
    const rating = block(doc, "Comment jugez-vous vos conditions");
    const [rule] = rulesFrom(doc, rating.ref);
    expect(rule!.action_kind === "goto" && rule!.when?.conditions.map((c) => c.op)).toEqual(["gte"]);
    expect(lintFormDoc(doc).filter((i) => i.code === "never_true_route")).toEqual([]);
  });

  it("knows a closed form is closed, and imports it anyway", () => {
    expect(convert.tally1().report.closed).toBe(true);
  });
});

describe("Google Forms", () => {
  it("sends an answer to the first question of the section it names", () => {
    const { doc } = convert.google1();
    const q = block(doc, "Would you like to see more things");
    const rules = rulesFrom(doc, q.ref);
    expect(rules.map((r) => r.action_kind === "goto" && r.target)).toEqual([
      block(doc, "More examples of Forms questions").ref,
      block(doc, "But wait, there's more!").ref,
    ]);
  });

  it("keeps grids, scales and the confirmation message", () => {
    const { doc } = convert.google1();
    expect(block(doc, "How do you feel about the following statements").type).toBe("matrix");
    expect(block(doc, "How much do you enjoy").type).toBe("opinion_scale");
    expect(doc.endings[0]!.title).toBe("Your response has been recorded.");
  });
});

describe("links", () => {
  const code = (url: string) => {
    try {
      resolveImportUrl(url);
      return "ok";
    } catch (err) {
      return err instanceof ImportError ? err.code : "threw";
    }
  };

  it("recognises each builder's share links", () => {
    expect(resolveImportUrl("https://form.typeform.com/to/PxcVKQGb")).toEqual({ provider: "typeform", target: "PxcVKQGb" });
    expect(resolveImportUrl("acme.typeform.com/to/AbCd1234?utm=x")).toEqual({ provider: "typeform", target: "AbCd1234" });
    expect(resolveImportUrl("https://tally.so/embed/mZNovm?alignLeft=1")).toEqual({ provider: "tally", target: "https://tally.so/r/mZNovm" });
    expect(resolveImportUrl("https://forms.gle/SCaZgu449bHcdJHP6").provider).toBe("google_forms");
    expect(resolveImportUrl("https://docs.google.com/forms/d/e/1FAIpQLSciCcNILfeSdgUavm_GYuCFE_G8InD1YVkIWAiTU_B3-l9AkA/viewform?usp=sf_link")).toEqual({
      provider: "google_forms",
      target: "https://docs.google.com/forms/d/e/1FAIpQLSciCcNILfeSdgUavm_GYuCFE_G8InD1YVkIWAiTU_B3-l9AkA/viewform",
    });
  });

  it("refuses a Google editor link with the reason", () => {
    expect(code("https://docs.google.com/forms/d/1a2B3c4D5e6F7g8H9i0JkLmNoPqRsTuVwXyZ/edit")).toBe("edit_link");
  });

  it("reads any other site for an embedded form", () => {
    expect(resolveImportUrl("https://acme.com/contact")).toEqual({ provider: null, target: "https://acme.com/contact" });
  });
});

// ─── the routes ───

const realFetch = globalThis.fetch;

/** Answer the builders' URLs from fixtures; anything else is a network error. */
function stubSources(routes: Record<string, () => Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (const [prefix, answer] of Object.entries(routes)) if (url.startsWith(prefix)) return answer();
    if (url.startsWith("http://localhost")) return realFetch(input, init);
    throw new TypeError(`unexpected fetch ${url}`);
  });
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const preview = (body: unknown, headers: Record<string, string> = {}) =>
  fetchApi("/api/import/preview", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("POST /api/import/preview", () => {
  beforeAll(applySchema);
  afterEach(() => vi.restoreAllMocks());

  it("publishes a trial anyone can talk to, and caps a signed-out device at three a day", async () => {
    stubSources({
      "https://api.typeform.com/forms/PxcVKQGb": () => json(typeform1),
      "https://api.typeform.com/forms/Missing1": () => json({ code: "FORM_NOT_FOUND" }, 404),
      "https://form.typeform.com/to/Missing1": () => new Response("", { status: 404 }),
    });
    const device = `device-${crypto.randomUUID()}`;

    const first = await preview({ url: "https://form.typeform.com/to/PxcVKQGb", deviceSignal: device });
    expect(first.status).toBe(200);
    const body = (await first.json()) as { token: string; slug: string; remaining: number; report: { questions: number } };
    expect(body.remaining).toBe(2);
    expect(body.report.questions).toBeGreaterThan(5);

    // Live: the public form config answers for the trial's slug.
    const form = await env.DB.prepare(`SELECT organization_id, status FROM forms WHERE slug = ?`).bind(body.slug).first<{ organization_id: string; status: string }>();
    expect(form).toEqual({ organization_id: "org_import_trials", status: "published" });
    expect((await fetchApi(`/p/forms/${body.slug}/config`)).status).toBe(200);

    // A link that fails costs nothing.
    const missing = await preview({ url: "https://form.typeform.com/to/Missing1", deviceSignal: device });
    expect(missing.status).toBe(422);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe("not_found");

    expect((await preview({ url: "https://form.typeform.com/to/PxcVKQGb", deviceSignal: device })).status).toBe(200);
    expect((await preview({ url: "https://form.typeform.com/to/PxcVKQGb", deviceSignal: device })).status).toBe(200);
    const fourth = await preview({ url: "https://form.typeform.com/to/PxcVKQGb", deviceSignal: device });
    expect(fourth.status).toBe(429);
    expect(((await fourth.json()) as { error: { code: string } }).error.code).toBe("import_limit");
  });

  it("does not cap someone who is signed in", async () => {
    stubSources({ "https://api.typeform.com/forms/PxcVKQGb": () => json(typeform1) });
    const t = await seedTenant(`impcap${Date.now()}`);
    for (let i = 0; i < 4; i++) {
      const res = await preview({ url: "https://form.typeform.com/to/PxcVKQGb", deviceSignal: "same-device-signal" }, { cookie: t.cookie });
      expect(res.status).toBe(200);
      expect(((await res.json()) as { remaining: number | null }).remaining).toBeNull();
    }
  });

  it("says why a Google Form cannot be read", async () => {
    stubSources({
      "https://docs.google.com/forms/d/e/1FAIpQLSdSignedInOnlyxxxxxxxxxxxxxxxxxxxxx/viewform": () => new Response("You must sign in", { status: 401 }),
      "https://docs.google.com/forms/d/e/1FAIpQLSdClosedFormxxxxxxxxxxxxxxxxxxxxxxxx/viewform": () =>
        new Response("", { status: 302, headers: { location: "https://docs.google.com/forms/d/e/1FAIpQLSdClosedFormxxxxxxxxxxxxxxxxxxxxxxxx/closedform" } }),
      "https://docs.google.com/forms/d/e/1FAIpQLSdClosedFormxxxxxxxxxxxxxxxxxxxxxxxx/closedform": () =>
        new Response("<html>This form is no longer accepting responses</html>", { status: 200, headers: { "content-type": "text/html" } }),
    });
    const code = async (url: string) => ((await (await preview({ url, deviceSignal: `d-${crypto.randomUUID()}` })).json()) as { error: { code: string } }).error.code;
    expect(await code("https://docs.google.com/forms/d/e/1FAIpQLSdSignedInOnlyxxxxxxxxxxxxxxxxxxxxx/viewform")).toBe("sign_in_required");
    expect(await code("https://docs.google.com/forms/d/e/1FAIpQLSdClosedFormxxxxxxxxxxxxxxxxxxxxxxxx/viewform")).toBe("closed_hidden");
  });
});

describe("POST /api/import/claim", () => {
  beforeAll(applySchema);
  afterEach(() => vi.restoreAllMocks());

  it("copies the trial into the person's workspace once, and to nobody else", async () => {
    stubSources({ "https://tally.so/r/mZNovm": () => new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: tally1 } })}</script>`, { status: 200, headers: { "content-type": "text/html" } }) });
    const res = await preview({ url: "https://tally.so/r/mZNovm", deviceSignal: `d-${crypto.randomUUID()}` });
    const { token } = (await res.json()) as { token: string };

    const owner = await seedTenant(`impown${Date.now()}`);
    const claim = (cookie: string) =>
      fetchApi("/api/import/claim", { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ token }) });

    const first = await claim(owner.cookie);
    expect(first.status).toBe(200);
    const { formId, report } = (await first.json()) as { formId: string; report: { provider: string } };
    expect(report.provider).toBe("tally");
    const copy = await env.DB.prepare(`SELECT organization_id, workspace_id, created_by, status FROM forms WHERE id = ?`).bind(formId).first();
    expect(copy).toEqual({ organization_id: owner.orgId, workspace_id: owner.workspaceId, created_by: owner.userId, status: "draft" });

    // A reload hands back the same form rather than a second copy.
    expect(((await (await claim(owner.cookie)).json()) as { formId: string }).formId).toBe(formId);

    const stranger = await seedTenant(`impstr${Date.now()}`);
    expect((await claim(stranger.cookie)).status).toBe(409);
  });

  it("needs a session", async () => {
    const res = await fetchApi("/api/import/claim", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "imp_nothing_here" }) });
    expect(res.status).toBe(401);
  });

  it("expired trials are swept, form and ticket", async () => {
    stubSources({ "https://api.typeform.com/forms/nNyXHtlb": () => json(typeform2) });
    const { token } = (await (await preview({ url: "https://form.typeform.com/to/nNyXHtlb", deviceSignal: `d-${crypto.randomUUID()}` })).json()) as { token: string };
    const trial = await env.DB.prepare(`SELECT form_id FROM import_trials WHERE token = ?`).bind(token).first<{ form_id: string }>();
    await expireImportTrials(env as never, Date.now() + 31 * 60 * 60 * 1000);
    expect(await env.DB.prepare(`SELECT 1 FROM import_trials WHERE token = ?`).bind(token).first()).toBeNull();
    const form = await env.DB.prepare(`SELECT deleted_at FROM forms WHERE id = ?`).bind(trial!.form_id).first<{ deleted_at: number | null }>();
    expect(form?.deleted_at).not.toBeNull();
  });
});

describe("POST /api/import/forms", () => {
  beforeAll(applySchema);
  afterEach(() => vi.restoreAllMocks());

  it("imports straight into the workspace as a draft", async () => {
    stubSources({ "https://api.typeform.com/forms/nNyXHtlb": () => json(typeform2) });
    const t = await seedTenant(`impdash${Date.now()}`);
    const res = await fetchApi("/api/import/forms", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: t.cookie },
      body: JSON.stringify({ url: "https://form.typeform.com/to/nNyXHtlb" }),
    });
    expect(res.status).toBe(200);
    const { formId, report } = (await res.json()) as { formId: string; report: { questions: number } };
    expect(report.questions).toBe(30);
    const row = await env.DB.prepare(`SELECT workspace_id, status FROM forms WHERE id = ?`).bind(formId).first();
    expect(row).toEqual({ workspace_id: t.workspaceId, status: "draft" });
  });
});
