import { env } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PLANS } from "@repo/entitlements";
import { applySchema, minimalDoc, seedTenant } from "./helpers.js";
import type { Bindings } from "../src/env.js";
import { Ledger } from "../src/lib/authoring/ledger.js";
import { readLinks, type LinkProgress } from "../src/lib/authoring/links.js";
import { addPagesToKnowledge } from "../src/lib/authoring/knowledge.js";
import { requestContext } from "../src/lib/agent-prompts.js";
import { applySourceFields, finishSourceForm, sourceFormOf } from "../src/lib/form-import.js";
import { readHtmlForm } from "../src/lib/import/html-form.js";
import { applyEditDraft } from "../src/lib/edit-apply.js";
import { FormDoc } from "@repo/form-schema";
import type { EditDraft, TokenUsage } from "../src/lib/ai.js";

/**
 * The building blocks both AI authoring flows share: a new form (the AI box)
 * and an edit (the builder's chat). Each is tested here once, because each is
 * now written once.
 */

const E = () => env as unknown as Bindings;
const usage = (input: number, output: number): TokenUsage => ({ input, output, costUsd: null, generationId: null });

const CONTACT_PAGE = `<html><head><title>Contact Acme</title></head><body><h1>Talk to sales</h1>
  <form><label for="n">Full name *</label><input id="n" name="name" required>
  <label for="e">Work email</label><input id="e" type="email" name="email" required>
  <label for="s">Team size</label><select id="s" name="size"><option value="">Pick one</option><option>1-10</option><option>11-50</option></select>
  </form></body></html>`;
const PRODUCT_PAGE = `<html><head><title>Acme</title></head><body><h1>Acme makes rockets</h1><p>${"Acme builds small rockets for weather research. ".repeat(12)}</p></body></html>`;

const realFetch = globalThis.fetch;
function stubPages(pages: Record<string, string>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    for (const [prefix, html] of Object.entries(pages)) {
      if (url.startsWith(prefix)) return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.startsWith("http://localhost")) return realFetch(input, init);
    // The research model and anything else: unreachable, as a real outage is.
    return new Response("nope", { status: 503 });
  });
}

describe("Ledger", () => {
  beforeAll(applySchema);

  it("sums every call, relabels only what it is told to, and writes each row once", async () => {
    const ledger = new Ledger();
    ledger.add("research", "r", usage(10, 5));
    ledger.add("edit", "g", usage(100, 50));
    ledger.add("edit", "g", usage(0, 0));
    expect(ledger.tokens).toBe(165);
    ledger.relabel("edit", "edit_question");

    const t = await seedTenant(`ledger${Date.now()}`);
    await ledger.log(E(), { organizationId: t.orgId, formId: t.formId, latencyMs: 12 });
    await ledger.log(E(), { organizationId: t.orgId, formId: t.formId, latencyMs: 12 });
    const rows = await E().DB.prepare(`SELECT kind FROM ai_generations WHERE organization_id = ? ORDER BY kind`).bind(t.orgId).all<{ kind: string }>();
    // `logAiGeneration` skips a zero-token call that did not fail; logging twice writes nothing new.
    expect(rows.results.map((r) => r.kind)).toEqual(["edit_question", "research"]);
  });
});

describe("readLinks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says so and reads nothing when the request has no link", async () => {
    const seen: LinkProgress[] = [];
    const out = await readLinks({ env: E(), prompt: "a waitlist form", ledger: new Ledger(), onProgress: (p) => void seen.push(p) });
    expect(out.urls).toEqual([]);
    expect(seen).toEqual([
      { step: "reading", status: "skip" },
      { step: "researching", status: "skip" },
    ]);
  });

  it("copies a linked form, keeps the product page for knowledge, and narrates in order", async () => {
    stubPages({ "https://acme.example.com/contact": CONTACT_PAGE, "https://acme.example.com/": PRODUCT_PAGE });
    const seen: string[] = [];
    const out = await readLinks({
      env: E(),
      prompt: "copy https://acme.example.com/contact for https://acme.example.com/",
      ledger: new Ledger(),
      onProgress: (p) => void seen.push(`${p.step}:${"status" in p ? p.status : ""}`),
    });
    expect(out.sourceForm?.fields.map((f) => f.title)).toEqual(["Full name", "Work email", "Team size"]);
    // The form is copied, not remembered; the page about the product is what the agent should know.
    expect(out.knowledgeUrls).toEqual(["https://acme.example.com/"]);
    // With the research model unreachable, the brief is skipped, never the reading.
    expect(out.brief).toBeNull();
    expect(seen).toEqual(["reading:start", "reading:done", "pages:", "researching:start", "researching:skip"]);
  }, 60_000);

  it("keeps a site that also has a form on it, and every page linked", async () => {
    const homeWithForm = PRODUCT_PAGE.replace("</body>", `${CONTACT_PAGE.replace(/<\/?(html|head|body)>|<title>.*<\/title>/g, "")}</body>`);
    stubPages({ "https://acme.example.com/": homeWithForm, "https://blog.example.org/": PRODUCT_PAGE });
    const out = await readLinks({ env: E(), prompt: "a work with us form for https://acme.example.com/ and https://blog.example.org/", ledger: new Ledger() });
    // Its form is still offered to copy; the site is still what the agent should know.
    expect(out.sourceForm?.fields.map((f) => f.title)).toEqual(["Full name", "Work email", "Team size"]);
    expect(out.knowledgeUrls).toEqual(["https://acme.example.com/", "https://blog.example.org/"]);
  }, 60_000);

  it("never throws for a page that will not load", async () => {
    stubPages({});
    const out = await readLinks({ env: E(), prompt: "see https://down.example.com/", ledger: new Ledger() });
    expect(out.sites).toEqual([]);
    expect(out.sourceForm).toBeNull();
  });
});

describe("addPagesToKnowledge", () => {
  beforeAll(async () => {
    await applySchema();
    for (const plan of Object.values(PLANS)) {
      await E()
        .DB.prepare(
          `INSERT INTO plans (id, slug, name, price_monthly_cents, price_yearly_cents, seat_price_cents, currency, features_json, limits_json, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?, 1, ?)
           ON CONFLICT (id) DO UPDATE SET features_json = excluded.features_json, limits_json = excluded.limits_json`,
        )
        .bind(plan.id, plan.id, plan.name, plan.priceMonthlyCents, plan.priceYearlyCents, plan.seatPriceCents, JSON.stringify(plan.features), JSON.stringify(plan.limits), plan.sortOrder)
        .run();
    }
  });

  it("fills only the room the plan has left after what the author adds by hand, and never twice", async () => {
    const t = await seedTenant(`kl${Date.now()}`);
    const limit = PLANS.free.limits.knowledge_sources_count as number;
    const base = { organizationId: t.orgId, formId: t.formId };
    // Room for everything but the reserved uploads.
    const urls = Array.from({ length: limit + 2 }, (_, i) => `https://site${i}.example.com/`);
    expect(await addPagesToKnowledge(E(), { ...base, urls, reserve: 1 })).toBe(limit - 1);
    // The same pages again, trailing slash or not: already there.
    expect(await addPagesToKnowledge(E(), { ...base, urls: ["https://site0.example.com"] })).toBe(0);
    // A private address is never a knowledge source.
    expect(await addPagesToKnowledge(E(), { ...base, urls: ["http://10.0.0.1/"] })).toBe(0);
    const n = await E().DB.prepare(`SELECT COUNT(*) AS n FROM knowledge_sources WHERE form_id = ?`).bind(t.formId).first<{ n: number }>();
    expect(n?.n).toBe(limit - 1);
  });
});

describe("a linked form, the same in a new form and an edit", () => {
  const form = sourceFormOf(readHtmlForm(CONTACT_PAGE, "https://acme.example.com/contact")!)!;

  it("tells a new form to take it whole and an edit to do what was asked, with no wording examples", () => {
    const create = requestContext("copy https://acme.example.com/contact", { brief: null, sourceForm: form }, "create");
    const edit = requestContext("add https://acme.example.com/contact", { brief: { brief: "Acme makes rockets." }, sourceForm: form }, "edit");
    expect(create).toContain("include every field as its own question");
    expect(edit).toContain("Do with it what the request asks");
    expect(edit).toContain("Acme makes rockets.");
    expect(edit).toContain('src_2 | email | required | title="Work email"');
    expect(edit).not.toContain("What's your");
  });

  it("copies the facts onto the questions an edit adds, and gives them readable refs", () => {
    const base = FormDoc.parse(minimalDoc("edit"));
    const draft: EditDraft = {
      // The model's words, and a wrong type and options for the source's email and choice.
      addBlocks: [
        { ref: "src_2", type: "short_text", title: "What's the best email for you?", description: "", required: false, options: [], scale: 0, config: "", insertAfter: "" },
        { ref: "src_3", type: "single_select", title: "How big is your team?", description: "", required: true, options: ["small", "big"], scale: 0, config: "", insertAfter: "src_2" },
      ],
      updateBlocks: [],
      removeRefs: [],
      rewireRefs: [],
      branches: [],
      endings: [],
      summary: "Added two questions.",
    } as unknown as EditDraft;
    const exact = { ...draft, addBlocks: applySourceFields(draft.addBlocks, form) };
    const applied = applyEditDraft(base, exact);
    const { doc, rename } = finishSourceForm(applied.doc, form);
    const email = doc.blocks.find((b) => b.title === "What's the best email for you?")!;
    const size = doc.blocks.find((b) => b.title === "How big is your team?")!;
    expect([email.type, email.required]).toEqual(["email", true]);
    expect("options" in size && size.options?.map((o) => o.label)).toEqual(["1-10", "11-50"]);
    expect(doc.blocks.map((b) => b.ref)).toEqual(["welcome", "q_email", rename.get("src_2"), rename.get("src_3")]);
    expect(JSON.stringify(doc)).not.toContain("src_");
  });
});
