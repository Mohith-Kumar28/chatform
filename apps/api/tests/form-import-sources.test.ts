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
import typeform3 from "./fixtures/import/typeform-3.json";
import jotformCamp from "./fixtures/import/jotform-20840494923456.html?raw";
import jotformEvent from "./fixtures/import/jotform-221091427437049.html?raw";
import jotformEngagement from "./fixtures/import/jotform-221093382736962.html?raw";
import jotformExit from "./fixtures/import/jotform-240353619407960.html?raw";
import jotformYoga from "./fixtures/import/jotform-201112518659957.html?raw";
import jotformService from "./fixtures/import/jotform-211401670560040.html?raw";
import { readJotform } from "../src/lib/import/jotform.js";
import { parseYouformData, readYouform } from "../src/lib/import/youform.js";
import { rehostImages } from "../src/lib/import/rehost.js";
import youform1 from "./fixtures/import/youform-1.html?raw";
import googleMemorie from "./fixtures/import/google-memorie.html?raw";
import { parseGoogleData } from "../src/lib/import/google.js";
import { formInPage } from "../src/lib/import/read.js";

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
  typeform3: () => importedToDoc(readTypeform(typeform3, "https://form.typeform.com/to/yWBgS4vK")),
  jotformCamp: () => importedToDoc(readJotform(jotformCamp, "https://form.jotform.com/20840494923456")),
  jotformEvent: () => importedToDoc(readJotform(jotformEvent, "https://form.jotform.com/221091427437049")),
  jotformEngagement: () => importedToDoc(readJotform(jotformEngagement, "https://form.jotform.com/221093382736962")),
  jotformExit: () => importedToDoc(readJotform(jotformExit, "https://form.jotform.com/240353619407960")),
  jotformYoga: () => importedToDoc(readJotform(jotformYoga, "https://form.jotform.com/201112518659957")),
  youform1: () => importedToDoc(readYouform(parseYouformData(youform1)!, "https://app.youform.com/forms/xrjcjyti")),
  jotformService: () => importedToDoc(readJotform(jotformService, "https://form.jotform.com/211401670560040")),
};

const block = (doc: FormDoc, title: string) => {
  // Titles are asked as questions ("Contact Details" → "What's your contact details?").
  const b = doc.blocks.find((x) => x.title.toLowerCase().includes(title.toLowerCase()));
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

  it("makes a contact card required when its lines are", () => {
    // Typeform keeps "required" on each line (first name, last name, email), not the card.
    const { doc } = convert.typeform3();
    expect(block(doc, "Contact Details")).toMatchObject({ type: "contact_info", required: true, fields: ["first_name", "last_name", "email"] });
    // The ones Typeform itself leaves optional stay optional.
    expect(block(doc, "What is your current monthly revenue?").required).toBe(false);
    expect(block(doc, "What is your current ads situation?").required).toBe(true);
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

describe("Jotform", () => {
  it("reads fields, required stars and headings from the page", () => {
    const { doc, report } = convert.jotformCamp();
    expect(doc.blocks[0]).toMatchObject({ type: "welcome", title: "Summer Camp Registration ☀️ 🏕️" });
    expect(block(doc, "Child Name")).toMatchObject({ type: "contact_info", required: true, fields: ["first_name", "last_name"] });
    expect(block(doc, "Birth Date")).toMatchObject({ type: "date", required: true });
    expect(block(doc, "Grade")).toMatchObject({ type: "number", required: true });
    expect(block(doc, "Address")).toMatchObject({ type: "address", required: true });
    expect(block(doc, "Medical Concerns")).toMatchObject({ type: "long_text", required: false });
    expect(block(doc, "Child Information").type).toBe("statement");
    expect(report.provider).toBe("jotform");
  });

  it("turns 'show the guest fields for Yes' into a branch", () => {
    const { doc } = convert.jotformEvent();
    const q = block(doc, "Will you have a guest with you?");
    const rules = rulesFrom(doc, q.ref);
    expect(rules[0]).toMatchObject({ target: block(doc, "Guest Name").ref, when: { conditions: [{ op: "eq", value: optionId(doc, "Will you have a guest with you?", "Yes") }] } });
    expect(rules.at(-1)).toMatchObject({ target: block(doc, "Would you like to be updated").ref, when: { conditions: [] } });
  });

  it("keeps grids and scales with their labels", () => {
    const grid = block(convert.jotformEngagement().doc, "Please, rate your satisfaction") as unknown as { type: string; rows: { label: string }[]; columns: { label: string }[] };
    expect(grid.type).toBe("matrix");
    expect(grid.rows[0]!.label).toBe("Comfortable working environment");
    expect(grid.columns.map((c) => c.label)).toContain("Extremely Satisfied");
    const scale = block(convert.jotformExit().doc, "How would you rate your overall job satisfaction");
    expect(scale).toMatchObject({ type: "opinion_scale", steps: 5, labelLow: "Very Dissatisfied", labelHigh: "Very Satisfied" });
  });

  it("reads a star rating drawn as a select, and grid headers that wrap", () => {
    const { doc } = convert.jotformService();
    expect(block(doc, "Overall, how satisfied are you")).toMatchObject({ type: "rating", scale: 5 });
    const grid = block(doc, "Please rate how strongly you agree") as unknown as { columns: { label: string }[] };
    expect(grid.columns[0]!.label).toBe("Totally Disagree");
  });

  it("says a payment field was not copied", () => {
    expect(convert.jotformYoga().report.notCopied.some((n) => /Payment/.test(n))).toBe(true);
  });
});

describe("Youform", () => {
  it("reads blocks, required flags, the welcome and the thank-you screen", () => {
    const { doc, report } = convert.youform1();
    expect(doc.blocks[0]).toMatchObject({ type: "welcome", title: "👋 Welcome! This is a live Youform", buttonLabel: "Let's Start" });
    expect(block(doc, "Where did you hear about Youform?")).toMatchObject({ type: "short_text", required: true, placeholder: 'e.g "Google", "ChatGPT" etc' });
    expect(block(doc, "Please upload a file").type).toBe("file_upload");
    expect(block(doc, "Based on what you've seen so far")).toMatchObject({ type: "rating", required: false });
    expect(block(doc, "You can ask for signatures")).toMatchObject({ type: "signature", required: true });
    expect(doc.endings[0]!.title).toBe("That's the end of this form! ✅");
    expect(report.provider).toBe("youform");
  });

  it("keeps the pictures on a picture choice, and routes each answer to its own reply", () => {
    const { doc } = convert.youform1();
    const q = block(doc, "Which do you prefer?") as unknown as { ref: string; type: string; options: { label: string; image_key: string | null }[] };
    expect(q.type).toBe("picture_choice");
    expect(q.options.find((o) => o.label === "Youform")!.image_key).toMatch(/^https:\/\/files\.youform\.io\//);
    const rules = rulesFrom(doc, q.ref);
    expect(rules.map((r) => r.action_kind === "goto" && r.target)).toEqual([
      block(doc, "You chose correctly").ref,
      block(doc, "That is incorrect").ref,
      block(doc, "How would you like to use Youform?").ref,
    ]);
    // The first reply jumps past the second one, as the source says.
    expect(rulesFrom(doc, block(doc, "You chose correctly").ref)[0]).toMatchObject({ target: block(doc, "How would you like to use Youform?").ref });
  });
});

describe("images", () => {
  it("come over on questions, picture choices, the welcome and the thank-you screen", () => {
    const { doc } = convert.typeform2();
    expect(block(doc, "What's your first name?")).toMatchObject({ media: { kind: "image", url: "https://images.typeform.com/images/9T4uH8HuyaH7" } });
    expect(doc.blocks[0]).toMatchObject({ media: { url: "https://images.typeform.com/images/UNT9r6QxDXAC" } });
    expect(doc.endings[0]!.imageUrl).toBe("https://public-assets.typeform.com/public/admin/2dpnUBBkz2VN.gif");
    const pictures = doc.blocks.find((b) => b.type === "picture_choice") as unknown as { options: { image_key: string | null }[] };
    expect(pictures.options.every((o) => o.image_key?.startsWith("https://images.typeform.com/"))).toBe(true);
  });

  it("keep a YouTube video from a Google Form as an embed", () => {
    const { doc } = convert.google1();
    expect(block(doc, "Watch this video").description).toContain("https://www.youtube.com/watch?v=Hi8SztClWBk");
  });
});

describe("rehostImages", () => {
  beforeAll(applySchema);
  afterEach(() => vi.restoreAllMocks());

  it("copies each image into our storage and keeps the link when a copy fails", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    stubSources({
      "https://images.typeform.com/images/9T4uH8HuyaH7": () => new Response(png, { status: 200, headers: { "content-type": "image/png" } }),
      "https://images.typeform.com/images/UNT9r6QxDXAC": () => new Response("nope", { status: 404 }),
    });
    const { doc } = convert.typeform2();
    const t = await seedTenant(`imprehost${Date.now()}`);
    const hosted = await rehostImages(env as never, doc, { orgId: t.orgId, apiOrigin: "https://api.test" });
    const q = hosted.doc.blocks.find((b) => b.title.startsWith("What's your first name")) as unknown as { media: { key: string | null; url: string | null } };
    expect(q.media.url).toBeNull();
    expect(q.media.key).toMatch(new RegExp(`^assets/${t.orgId}/ast_`));
    const id = q.media.key!.split("/").pop()!.split("-")[0]!;
    const served = await fetchApi(`/p/assets/${id}`);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    // The one that 404'd keeps its original link rather than vanishing.
    expect(hosted.doc.blocks[0]).toMatchObject({ media: { url: "https://images.typeform.com/images/UNT9r6QxDXAC" } });
  });

  it("stops copying at the plan's storage", async () => {
    stubSources({ "https://images.typeform.com/": () => new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "image/png" } }) });
    const t = await seedTenant(`impbudget${Date.now()}`);
    const hosted = await rehostImages(env as never, convert.typeform2().doc, { orgId: t.orgId, apiOrigin: "https://api.test", budgetBytes: 3000 });
    expect(hosted.copied).toBe(1);
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
    expect(resolveImportUrl("https://form.jotform.com/221091427437049")).toEqual({ provider: "jotform", target: "https://form.jotform.com/221091427437049" });
    expect(resolveImportUrl("https://www.jotform.com/build/221091427437049")).toEqual({ provider: "jotform", target: "https://form.jotform.com/221091427437049" });
    expect(resolveImportUrl("https://app.youform.com/forms/xrjcjyti")).toEqual({ provider: "youform", target: "https://app.youform.com/forms/xrjcjyti" });
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

describe("talking to a trial form", () => {
  beforeAll(applySchema);
  afterEach(() => vi.restoreAllMocks());

  it("caps a signed-out device's starts on one trial form", async () => {
    stubSources({ "https://api.typeform.com/forms/yWBgS4vK": () => json(typeform3) });
    const { slug } = (await (await preview({ url: "https://form.typeform.com/to/yWBgS4vK", deviceSignal: `d-${crypto.randomUUID()}` })).json()) as { slug: string };
    const deviceSignal = `respondent-${crypto.randomUUID()}`;
    const open = () =>
      fetchApi(`/p/forms/${slug}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceSignal }) });
    for (let i = 0; i < 6; i++) expect((await open()).status).toBe(200);
    const refused = await open();
    expect(refused.status).toBe(403);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toMatch(/free previews/);
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

describe("Google Forms, as the page renders it", () => {
  const form = readGoogleForm(parseGoogleData(googleMemorie)!, "https://docs.google.com/forms/d/e/x/viewform", googleMemorie);
  const { doc } = importedToDoc(form);

  it("keeps the bold and the paragraphs of the description", () => {
    expect(form.description).toContain("**WhatsApp messages, screenshots, saving Insta reels only to never find them again?**");
    expect(form.description).toContain("organises it.\n\nLooking for something specific?");
  });

  it("copies an image item as a message, its picture shown with the question after it", () => {
    const hello = block(doc, "Hi, I am Memorie");
    expect(hello.type).toBe("statement");
    // The chat draws a picture only for the block on screen, and a message is never on screen.
    expect((hello as { media?: unknown }).media ?? null).toBeNull();
    const email = block(doc, "email address") as { media?: { url: string } };
    expect(email.media?.url).toMatch(/^https:\/\/docs\.google\.com\/forms-images-rt\/.+=w1200$/);
    expect(form.notCopied).not.toContain("Images");
  });

  it("asks a bare label as a question and keeps a question as written", () => {
    const titles = doc.blocks.map((b) => b.title);
    expect(titles).toContain("What's your email address?");
    expect(titles).toContain("What's your first name?");
    expect(titles).toContain("What's your phone number?");
    expect(titles).toContain("What device are you most likely to use Memorie on upon launch?");
    expect(titles).toContain("Anything you want to add? OPTIONAL");
  });
});

describe("a form on any web page", () => {
  const page = `<html><head><title>Contact us</title></head><body><h1>Talk to sales</h1>
    <form><label for="n">Full name *</label><input id="n" name="name" required>
    <label for="e">Work email</label><input id="e" type="email" name="email" required>
    <label for="s">Team size</label><select id="s" name="size"><option value="">Pick one</option><option>1-10</option><option>11-50</option></select>
    <textarea name="msg" placeholder="How can we help?"></textarea></form></body></html>`;

  it("is found by the same detector the AI builder uses, and converts", async () => {
    const form = (await formInPage(page, "https://acme.test/contact"))!;
    expect(form.provider).toBe("website");
    const { doc } = importedToDoc(form);
    expect(block(doc, "full name").type).toBe("short_text");
    expect(block(doc, "work email").type).toBe("email");
    expect(block(doc, "team size").options.map((o) => o.label)).toEqual(["1-10", "11-50"]);
  });

  it("says so when a page has no form", async () => {
    expect(await formInPage("<html><body><h1>About us</h1><p>We make things.</p></body></html>", "https://acme.test/about")).toBeNull();
  });
});
