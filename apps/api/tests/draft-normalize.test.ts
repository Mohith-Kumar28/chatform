import { describe, it, expect } from "vitest";
import { applyBlockConfig, draftToDoc, normalizeDraftEndings, resolveBranches, normalizeEditBlocks } from "../src/lib/draft-normalize.js";
import { extractUrls, htmlToText } from "../src/lib/research.js";
import { Block } from "@repo/form-schema";
import type { GenerationDraft, EditDraft } from "../src/lib/ai.js";

const block = (over: Partial<GenerationDraft["blocks"][number]>): GenerationDraft["blocks"][number] => ({
  ref: "q_x",
  type: "short_text",
  title: "A question",
  description: "",
  required: true,
  options: [],
  scale: 10,
  config: "",
  ...over,
});

const draft = (over: Partial<GenerationDraft>): GenerationDraft => ({
  title: "A form",
  description: "",
  blocks: [block({ ref: "welcome", type: "welcome", title: "Hi" }), block({ ref: "q_email", type: "email" })],
  endings: [{ ref: "end_thanks", title: "Thanks", body: "", kind: "success", requirements: "" }],
  branches: [],
  ...over,
});

const ending = (over: Partial<GenerationDraft["endings"][number]>): GenerationDraft["endings"][number] => ({
  ref: "end_thanks",
  title: "Thanks",
  body: "",
  kind: "success",
  requirements: "",
  ...over,
});

describe("draftToDoc", () => {
  it("keeps a question whose type the model got wrong", () => {
    // The model reliably writes `single_choice` and `multiple_choice`, neither
    // of which is a block type. These used to be dropped silently, so a draft
    // came back missing the very question the author had asked for.
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_platform", type: "single_choice", options: ["Android", "iOS"] }),
          block({ ref: "q_features", type: "multiple_choice", options: ["Search", "Sync"] }),
          block({ ref: "q_email", type: "email" }),
          block({ ref: "q_notes", type: "textarea" }),
        ],
      }),
    );

    expect(doc.blocks.map((b) => [b.ref, b.type])).toEqual([
      ["welcome", "welcome"],
      ["q_platform", "single_select"],
      ["q_features", "multi_select"],
      ["q_email", "email"],
      ["q_notes", "long_text"],
    ]);
  });

  it("never drops a question for an unrecognisable type", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_weird", type: "holographic_input", title: "Still asked" }),
        ],
      }),
    );
    expect(doc.blocks).toHaveLength(2);
    expect(doc.blocks[1]!.type).toBe("short_text");
    expect(doc.blocks[1]!.title).toBe("Still asked");
  });

  it("asks a one-option choice as text rather than losing it", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_one", type: "single_select", options: ["Only"], title: "Which one?" }),
        ],
      }),
    );
    expect(doc.blocks[1]!.type).toBe("short_text");
  });

  it("derives option ids from labels", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_platform", type: "single_select", options: ["Google Play", "App Store", "Google Play"] }),
        ],
      }),
    );
    const options = (doc.blocks[1] as { options: { id: string; label: string }[] }).options;
    expect(options.map((o) => o.id)).toEqual(["opt_google_play", "opt_app_store", "opt_google_play_2"]);
  });

  it("resolves a branch written against an option label", () => {
    // The model is asked for the label because that is the only identifier it
    // has actually seen; the ids are ours, minted after the fact.
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_platform", type: "single_select", options: ["Android", "iPhone or iPad"] }),
          block({ ref: "q_play_email", type: "email" }),
          block({ ref: "q_any_email", type: "email" }),
        ],
        branches: [
          { whenRef: "q_platform", op: "eq", value: "Android", then: "q_play_email" },
          { whenRef: "q_platform", op: "eq", value: "iPhone or iPad", then: "q_any_email" },
        ],
      }),
    );

    const gotos = doc.logic.filter((r) => r.action_kind === "goto" && r.from === "q_platform");
    const values = gotos.map((r) => {
      const c = r.when?.conditions?.[0] as { value?: unknown } | undefined;
      return c?.value;
    });
    expect(values).toEqual(["opt_android", "opt_iphone_or_ipad"]);
  });

  it("de-duplicates refs the model repeated", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_email", type: "email" }),
          block({ ref: "q_email", type: "email", title: "And a backup?" }),
        ],
      }),
    );
    expect(doc.blocks.map((b) => b.ref)).toEqual(["welcome", "q_email", "q_email_2"]);
  });

  it("treats the first block as the welcome whatever it was called", () => {
    const { doc } = draftToDoc(
      draft({ blocks: [block({ ref: "q_intro", type: "statement" }), block({ ref: "q_email", type: "email" })] }),
    );
    expect(doc.blocks[0]!.type).toBe("welcome");
  });

  it("rejects a draft with nothing usable in it", () => {
    expect(() => draftToDoc(draft({ blocks: [block({ ref: "welcome", type: "welcome" })] as never }))).toThrow();
  });
});

describe("resolveBranches", () => {
  const blocks = [
    { ref: "q_yes", type: "yes_no" },
    { ref: "q_score", type: "nps" },
    { ref: "q_text", type: "short_text" },
  ] as never;

  it("coerces a value to what the question stores", () => {
    const resolved = resolveBranches(
      [
        { whenRef: "q_yes", op: "eq", value: "yes", then: "q_text" },
        { whenRef: "q_score", op: "lte", value: "6", then: "q_text" },
        { whenRef: "q_text", op: "contains", value: "urgent", then: "q_yes" },
      ],
      blocks,
      new Map(),
    );
    expect(resolved.map((r) => r.when.value)).toEqual([true, 6, "urgent"]);
  });

  // A model reaches for these to spell "and then", which the flow already does
  // by falling through — and the canvas then draws the question as a decision
  // with a live arm and a dead one. An author can still pick either operator by
  // hand in the builder; a draft may not.
  it("drops the emptiness operators, which a draft only ever uses as filler", () => {
    const resolved = resolveBranches(
      [
        { whenRef: "q_text", op: "is_not_empty", value: "", then: "q_yes" },
        { whenRef: "q_text", op: "is_empty", value: "", then: "q_yes" },
        { whenRef: "q_text", op: "contains", value: "urgent", then: "q_yes" },
      ],
      blocks,
      new Map(),
    );
    expect(resolved.map((r) => r.when.op)).toEqual(["contains"]);
  });

  it("drops a branch hanging off a question that does not exist", () => {
    const resolved = resolveBranches([{ whenRef: "q_ghost", op: "eq", value: "x", then: "q_text" }], blocks, new Map());
    expect(resolved).toHaveLength(0);
  });
});

describe("normalizeEditBlocks", () => {
  it("skips a greeting and renames a ref the form already uses", () => {
    const draft: EditDraft = {
      addBlocks: [
        { ref: "welcome", type: "welcome", title: "Hi again", description: "", required: false, options: [], scale: 10, insertAfter: "" },
        { ref: "q_email", type: "email", title: "Your email?", description: "", required: true, options: [], scale: 10, insertAfter: "q_platform" },
      ],
      removeRefs: [],
      rewireRefs: [],
      branches: [],
      summary: "",
    };
    const { blocks, renamed } = normalizeEditBlocks(draft, new Set(["q_platform", "q_email"]));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.block.ref).toBe("q_email_2");
    expect(renamed.get("q_email")).toBe("q_email_2");
    expect(blocks[0]!.insertAfter).toBe("q_platform");
  });

  it("accepts an edit that adds no questions at all", () => {
    // The case the old append-only schema could not express, which is why the
    // model padded a routing change with an invented question.
    const draft: EditDraft = {
      addBlocks: [],
      removeRefs: [],
      rewireRefs: ["q_platform"],
      branches: [{ whenRef: "q_platform", op: "eq", value: "Android", then: "q_play_email" }],
      summary: "Re-routed Android.",
    };
    const { blocks } = normalizeEditBlocks(draft, new Set(["q_platform", "q_play_email"]));
    expect(blocks).toHaveLength(0);
  });
});

describe("extractUrls", () => {
  it("finds an explicit URL and a bare hostname", () => {
    expect(extractUrls("survey for https://memorie.in/ please")).toEqual(["https://memorie.in/"]);
    expect(extractUrls("a waitlist for acme.io, thanks")).toEqual(["https://acme.io/"]);
  });

  it("does not register the same site twice", () => {
    expect(extractUrls("https://acme.io/pricing and acme.io/pricing")).toEqual(["https://acme.io/pricing"]);
  });

  it("ignores prose that looks numeric or addressed", () => {
    expect(extractUrls("rate it 3.5 out of 5, costs 9.99/mo")).toEqual([]);
    expect(extractUrls("email me at sam@acme.io")).toEqual([]);
  });

  it("refuses loopback and metadata hosts", () => {
    expect(extractUrls("http://localhost:3000/x http://169.254.169.254/latest")).toEqual([]);
    expect(extractUrls("http://192.168.1.1/admin")).toEqual([]);
  });

  it("reads at most two pages", () => {
    expect(extractUrls("a.com b.com c.com d.com")).toHaveLength(2);
  });
});

describe("htmlToText", () => {
  it("drops scripts and their contents", () => {
    const text = htmlToText(
      `<html><head><title>T</title><script>window.__NEXT_DATA__={"a":"secret"}</script></head><body><h1>Real heading</h1><p>Body copy here.</p></body></html>`,
    );
    expect(text).toContain("Real heading");
    expect(text).toContain("Body copy here.");
    expect(text).not.toContain("__NEXT_DATA__");
    expect(text).not.toContain("secret");
  });

  it("decodes entities and collapses whitespace", () => {
    expect(htmlToText("<p>Save&nbsp;it &amp; find   it</p>")).toBe("Save it & find it ·");
  });
});


/**
 * The types the prompt used to forbid.
 *
 * Both prompts named 16 of the 26 block types and then told the model that
 * anything else was wrong, and the draft had nowhere to carry an amount or a
 * booking link — so `payment` and `scheduling` were unreachable in practice.
 * Asked for a 499-rupee ticket over UPI, the builder produced a short-text
 * question titled "Payment Confirmation": it collected nothing and took no
 * money, and nothing anywhere said so.
 */
describe("block types that need setup", () => {
  it("builds a UPI payment block from the amount and id in the request", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({
            ref: "q_ticket",
            type: "payment",
            title: "Ticket",
            config: "method=upi; upi=mohith808@axl; amount=499; currency=INR",
          }),
        ],
      }),
    );
    const paid = doc.blocks.find((b) => b.ref === "q_ticket");
    expect(paid?.type).toBe("payment");
    if (paid?.type !== "payment") throw new Error("not a payment block");
    expect(paid.method).toBe("upi");
    expect(paid.upiId).toBe("mohith808@axl");
    expect(paid.amount).toBe(499);
    expect(paid.currency).toBe("INR");
  });

  it("reads an amount a model wrote the way a person would", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_fee", type: "payment", config: "method=upi; upi=a@b; amount=₹1,250" }),
        ],
      }),
    );
    const paid = doc.blocks.find((b) => b.ref === "q_fee");
    if (paid?.type !== "payment") throw new Error("not a payment block");
    expect(paid.amount).toBe(1250);
    expect(paid.currency).toBe("INR");
  });

  it("still makes a payment block when the destination is missing", () => {
    // A payment block with nowhere to pay is caught by the linter before it can
    // be published. A text question pretending to take money is not caught at
    // all — which is the failure worth avoiding.
    const { doc } = draftToDoc(
      draft({
        blocks: [block({ ref: "welcome", type: "welcome" }), block({ ref: "q_pay", type: "payment", config: "" })],
      }),
    );
    expect(doc.blocks.find((b) => b.ref === "q_pay")?.type).toBe("payment");
  });

  it("takes a booking link for scheduling", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_slot", type: "scheduling", config: "url=https://cal.com/acme/30min" }),
        ],
      }),
    );
    const slot = doc.blocks.find((b) => b.ref === "q_slot");
    if (slot?.type !== "scheduling") throw new Error("not a scheduling block");
    expect(slot.url).toBe("https://cal.com/acme/30min");
  });

  it("asks for a time directly when there is no calendar to book against", () => {
    // "What time will you reach the venue?" is a date question, not a booking.
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_arrival", type: "scheduling", title: "What time will you arrive?", config: "" }),
        ],
      }),
    );
    expect(doc.blocks.find((b) => b.ref === "q_arrival")?.type).toBe("date");
  });

  it("builds a matrix from rows in config and columns in options", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({
            ref: "q_grid",
            type: "matrix",
            options: ["Poor", "Fine", "Great"],
            config: "rows=Food|Venue|Music",
          }),
        ],
      }),
    );
    const grid = doc.blocks.find((b) => b.ref === "q_grid");
    if (grid?.type !== "matrix") throw new Error("not a matrix block");
    expect(grid.rows.map((r) => r.label)).toEqual(["Food", "Venue", "Music"]);
    expect(grid.columns).toHaveLength(3);
  });

  it("ranks the options it was given", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_rank", type: "ranking", options: ["Speed", "Price", "Support"] }),
        ],
      }),
    );
    const ranked = doc.blocks.find((b) => b.ref === "q_rank");
    if (ranked?.type !== "ranking") throw new Error("not a ranking block");
    expect(ranked.items).toHaveLength(3);
  });

  it("maps the words a model reaches for instead of the type name", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_pay", type: "upi", config: "upi=a@b; amount=100" }),
          block({ ref: "q_book", type: "booking", config: "url=https://cal.com/x" }),
        ],
      }),
    );
    expect(doc.blocks.find((b) => b.ref === "q_pay")?.type).toBe("payment");
    expect(doc.blocks.find((b) => b.ref === "q_book")?.type).toBe("scheduling");
  });

  it("narrows an address to the parts that were asked for", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_addr", type: "address", config: "fields=city|country" }),
        ],
      }),
    );
    const addr = doc.blocks.find((b) => b.ref === "q_addr");
    if (addr?.type !== "address") throw new Error("not an address block");
    expect(addr.fields).toEqual(["city", "country"]);
  });
});

/**
 * The half of an edit that changes a question already in the form.
 *
 * Until `applyBlockConfig` existed the AI bar could set any documented setting
 * on a NEW question and nothing at all on an existing one — so "the team name
 * has to be unique", which is a sentence about a question the author is looking
 * at, could only be answered by adding a second team-name question with the
 * flag on.
 */
describe("a repeating group from a draft", () => {
  const built = (config: string) => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_team", type: "field_group", title: "Your team", config }),
        ],
      }),
    );
    return doc.blocks.find((b) => b.ref === "q_team");
  };

  it("reads columns, an entry name and the bounds out of one config string", () => {
    const group = built("fields=Full name:short_text*|Email:email*|Year:number; item=Team member; min=2; max=5");
    if (group?.type !== "field_group") throw new Error("not a field_group block");
    expect(group.itemLabel).toBe("Team member");
    expect(group.minEntries).toBe(2);
    expect(group.maxEntries).toBe(5);
    expect(group.fields.map((f) => [f.key, f.kind, f.required])).toEqual([
      ["full_name", "short_text", true],
      ["email", "email", true],
      ["year", "number", false],
    ]);
  });

  it("keeps a select's own choices, which are separated by the same character", () => {
    // `|` divides the columns AND the choices inside one; only bracket depth
    // tells them apart.
    const group = built("fields=Name:short_text|Role:single_select[Lead|Member|Mentor]");
    if (group?.type !== "field_group") throw new Error("not a field_group block");
    expect(group.fields[1]?.kind).toBe("single_select");
    expect(group.fields[1]?.options.map((o) => o.label)).toEqual(["Lead", "Member", "Mentor"]);
  });

  it("takes a bare label as a text column, and a near-miss kind as what it meant", () => {
    const group = built("fields=Name|Mobile:tel|Portfolio:link|Attending:boolean");
    if (group?.type !== "field_group") throw new Error("not a field_group block");
    expect(group.fields.map((f) => f.kind)).toEqual(["short_text", "phone", "url", "yes_no"]);
  });

  it("demotes a choice column with nothing to choose from rather than dropping it", () => {
    const group = built("fields=Name:short_text|Role:single_select");
    if (group?.type !== "field_group") throw new Error("not a field_group block");
    expect(group.fields[1]?.kind).toBe("short_text");
    expect(group.fields[1]?.label).toBe("Role");
  });

  it("keeps the question as text when the model named the type and forgot the columns", () => {
    // An empty grid is worse than the plain question it replaced.
    expect(built("item=Team member; min=2")?.type).toBe("short_text");
  });

  it("gives duplicate labels distinct keys", () => {
    const group = built("fields=Email:email|Email:email");
    if (group?.type !== "field_group") throw new Error("not a field_group block");
    expect(group.fields.map((f) => f.key)).toEqual(["email", "email_2"]);
  });
});

describe("applyBlockConfig", () => {
  const short = Block.parse({
    id: "blk_apply001", ref: "q_team", type: "short_text", title: "Team name?",
    required: false, minLength: 0, maxLength: 80,
  });

  it("turns on a flag the request asked for", () => {
    const next = applyBlockConfig(short, "unique=true");
    if (next?.type !== "short_text") throw new Error("not a short_text block");
    expect(next.unique).toBe(true);
    expect(next.ref).toBe("q_team");
  });

  it("accepts the other words a model writes for true", () => {
    // A strict `=== "true"` turned `unique=yes` into silence: the author asked
    // for it, the model agreed, and the setting did not appear.
    for (const raw of ["unique=yes", "unique=1", "unique=on", "unique=TRUE"]) {
      const next = applyBlockConfig(short, raw);
      expect(next?.type === "short_text" && next.unique, raw).toBe(true);
    }
  });

  it("leaves every setting the config did not mention alone", () => {
    const next = applyBlockConfig({ ...short, maxLength: 40, pattern: "^[A-Z]" }, "unique=true");
    if (next?.type !== "short_text") throw new Error("not a short_text block");
    expect(next.maxLength).toBe(40);
    expect(next.pattern).toBe("^[A-Z]");
  });

  it("reports no change when the setting is already what was asked for", () => {
    // The route counts this as nothing happening, which is what lets an edit
    // that does nothing be refused rather than applied as a no-op.
    expect(applyBlockConfig({ ...short, unique: true }, "unique=true")).toBeNull();
    expect(applyBlockConfig(short, "")).toBeNull();
  });

  it("ignores a key the type does not read", () => {
    // `unique` is not offered on a paragraph, so a model reaching for it there
    // should cost the author nothing rather than corrupt the block.
    const long = Block.parse({
      id: "blk_apply002", ref: "q_why", type: "long_text", title: "Why?",
      required: false, minLength: 0, maxLength: 500,
    });
    expect(applyBlockConfig(long, "unique=true")).toBeNull();
  });

  it("changes required, which is what authors say in the same breath", () => {
    const next = applyBlockConfig(short, "required=true; unique=true");
    if (next?.type !== "short_text") throw new Error("not a short_text block");
    expect(next.required).toBe(true);
    expect(next.unique).toBe(true);
  });

  it("carries the per-type keys the catalog documents", () => {
    const email = Block.parse({ id: "blk_apply003", ref: "q_email", type: "email", title: "Email?", required: true });
    const next = applyBlockConfig(email, "businessonly=true; unique=true");
    if (next?.type !== "email") throw new Error("not an email block");
    expect(next.businessOnly).toBe(true);
    expect(next.unique).toBe(true);

    const number = Block.parse({ id: "blk_apply004", ref: "q_seats", type: "number", title: "Seats?", required: true });
    const capped = applyBlockConfig(number, "max=50");
    if (capped?.type !== "number") throw new Error("not a number block");
    expect(capped.max).toBe(50);
  });
});

describe("editing a repeating group", () => {
  const group = Block.parse({
    id: "blk_group001", ref: "q_team", type: "field_group", title: "Your team",
    itemLabel: "Team member", minEntries: 2, maxEntries: 4,
    fields: [{ id: "gf_name0001", key: "name", label: "Full name", kind: "short_text", required: true }],
  });

  it("raises the ceiling without touching anything else", () => {
    const next = applyBlockConfig(group, "max=6");
    if (next?.type !== "field_group") throw new Error("not a field_group block");
    expect(next.maxEntries).toBe(6);
    expect(next.minEntries).toBe(2);
    expect(next.fields).toHaveLength(1);
  });

  it("never leaves a floor above its own ceiling", () => {
    // The schema would accept min 2 / max 1 and the composer cannot render it.
    // The written number wins: "up to one" means one, not "still two".
    const next = applyBlockConfig(group, "max=1");
    if (next?.type !== "field_group") throw new Error("not a field_group block");
    expect(next.minEntries).toBe(1);
    expect(next.maxEntries).toBe(1);
  });

  it("reads two crossed bounds as two numbers the wrong way round", () => {
    const next = applyBlockConfig(group, "min=6; max=3");
    if (next?.type !== "field_group") throw new Error("not a field_group block");
    expect([next.minEntries, next.maxEntries]).toEqual([3, 6]);
  });

  it("replaces the columns when the edit restates them", () => {
    const next = applyBlockConfig(group, "fields=Name:short_text*|Email:email*");
    if (next?.type !== "field_group") throw new Error("not a field_group block");
    expect(next.fields.map((f) => f.key)).toEqual(["name", "email"]);
  });
});

describe("unique on a newly added question", () => {
  it("is set from the config the model wrote", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome" }),
          block({ ref: "q_team", type: "short_text", config: "unique=true" }),
          block({ ref: "q_city", type: "short_text" }),
        ],
      }),
    );
    const team = doc.blocks.find((b) => b.ref === "q_team");
    const city = doc.blocks.find((b) => b.ref === "q_city");
    expect(team?.type === "short_text" && team.unique).toBe(true);
    // Off unless asked for. Every existing question keeps the behaviour it had.
    expect(city?.type === "short_text" && city.unique).toBe(false);
  });
});

describe("screen-out endings from a draft", () => {
  it("carries the kind through to the stored ending", () => {
    const { doc } = draftToDoc(
      draft({
        endings: [
          ending({}),
          ending({
            ref: "end_ineligible",
            title: "You can't submit this",
            kind: "screen_out",
            requirements: "A team of 2 to 5 people | Agreement to the code of conduct",
          }),
        ],
      }),
    );
    const out = doc.endings.find((e) => e.ref === "end_ineligible")!;
    expect(out.kind).toBe("screen_out");
    expect(out.requirements.map((r) => r.label)).toEqual([
      "A team of 2 to 5 people",
      "Agreement to the code of conduct",
    ]);
    // Unconditional: the model writes branches, not conditions, and the branch
    // that routed here is the condition.
    expect(out.requirements.every((r) => r.when === null)).toBe(true);
  });

  it("strips the bullets a model puts in front of a list", () => {
    const { doc } = draftToDoc(
      draft({
        endings: [
          ending({}),
          ending({ ref: "end_no", title: "No", kind: "screen_out", requirements: "- Be 18 or over\n• Live in the EU" }),
        ],
      }),
    );
    expect(doc.endings[1]!.requirements.map((r) => r.label)).toEqual(["Be 18 or over", "Live in the EU"]);
  });

  it("ignores requirements written on a success ending", () => {
    const { doc } = draftToDoc(draft({ endings: [ending({ requirements: "Something | Else" })] }));
    expect(doc.endings[0]!.requirements).toEqual([]);
  });

  it("lets a branch point at the screen-out it was drafted with", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome", title: "Hi" }),
          block({ ref: "q_size", type: "number", title: "Team size?" }),
          block({ ref: "q_why", type: "long_text", title: "Why?" }),
        ],
        endings: [ending({}), ending({ ref: "end_ineligible", title: "No", kind: "screen_out", requirements: "2 to 5 people" })],
        branches: [{ whenRef: "q_size", op: "gt", value: "5", then: "end_ineligible" }],
      }),
    );
    const rule = doc.logic.find((r) => r.action_kind === "goto" && r.target === "end_ineligible");
    expect(rule).toBeDefined();
    expect(rule && rule.action_kind === "goto" && rule.targetKind).toBe("ending");
  });
});

describe("a consent that can be declined", () => {
  it("reads decline=true off the draft config", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome", title: "Hi" }),
          block({
            ref: "q_conduct",
            type: "legal_consent",
            title: "Code of conduct",
            description: "I agree to the code of conduct.",
            config: "decline=true; declineLabel=I do not agree",
          }),
        ],
      }),
    );
    const consent = doc.blocks.find((b) => b.ref === "q_conduct")!;
    expect(consent.type).toBe("legal_consent");
    expect(consent.type === "legal_consent" && consent.allowDecline).toBe(true);
    expect(consent.type === "legal_consent" && consent.declineLabel).toBe("I do not agree");
  });

  it("stays a turnstile when the config says nothing", () => {
    const { doc } = draftToDoc(
      draft({
        blocks: [
          block({ ref: "welcome", type: "welcome", title: "Hi" }),
          block({ ref: "q_terms", type: "legal_consent", title: "Terms", description: "I agree." }),
        ],
      }),
    );
    const consent = doc.blocks.find((b) => b.ref === "q_terms")!;
    expect(consent.type === "legal_consent" && consent.allowDecline).toBe(false);
  });

  it("also accepts allowDecline, which is what a model tends to write", () => {
    const patched = applyBlockConfig(
      Block.parse({
        id: "blk_c0000001",
        ref: "q_terms",
        type: "legal_consent",
        title: "Terms",
        consentText: "I agree.",
      }),
      "allowDecline=yes",
    );
    expect(patched && patched.type === "legal_consent" && patched.allowDecline).toBe(true);
  });

  it("turns the words a model uses for a refusal into a boolean condition", () => {
    const consent = Block.parse({
      id: "blk_c0000002",
      ref: "q_conduct",
      type: "legal_consent",
      title: "Code of conduct",
      consentText: "I agree.",
      allowDecline: true,
    });
    const branches = resolveBranches(
      [
        { whenRef: "q_conduct", op: "eq", value: "declined", then: "end_no" },
        { whenRef: "q_conduct", op: "eq", value: "I do not agree", then: "end_no" },
        { whenRef: "q_conduct", op: "eq", value: "agreed", then: "q_next" },
      ],
      [consent],
      new Map(),
    );
    expect(branches.map((b) => b.when.value)).toEqual([false, false, true]);
  });
});

describe("editing the outcomes", () => {
  it("changes an ending that is already in the form rather than adding a second", () => {
    const existing = [
      { id: "end_00000001", ref: "end_thanks", title: "Thanks", bodyMd: "", imageUrl: null, redirectDelaySec: 5, showSummary: false, kind: "success" as const, requirements: [] },
    ];
    const out = normalizeDraftEndings(
      [{ ref: "end_thanks", title: "You're in", body: "See you Friday.", kind: "success", requirements: "" }],
      existing,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.ref).toBe("end_thanks");
    expect(out[0]!.id).toBe("end_00000001");
    expect(out[0]!.title).toBe("You're in");
  });

  it("adds a screen-out beside the endings that are there", () => {
    const existing = [
      { id: "end_00000001", ref: "end_thanks", title: "Thanks", bodyMd: "", imageUrl: null, redirectDelaySec: 5, showSummary: false, kind: "success" as const, requirements: [] },
    ];
    const out = normalizeDraftEndings(
      [{ ref: "end_ineligible", title: "You can't submit", body: "", kind: "screen_out", requirements: "Be 18 or over" }],
      existing,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.ref).toBe("end_ineligible");
    expect(out[0]!.kind).toBe("screen_out");
  });

  it("keeps the requirements a reword did not restate", () => {
    const existing = [
      {
        id: "end_00000002",
        ref: "end_no",
        title: "No",
        bodyMd: "",
        imageUrl: null,
        redirectDelaySec: 5,
        showSummary: false,
        kind: "screen_out" as const,
        requirements: [{ id: "req_00000001", label: "A team of 2 to 5 people", when: null }],
      },
    ];
    const out = normalizeDraftEndings(
      [{ ref: "end_no", title: "You're not eligible this round", body: "", kind: "screen_out", requirements: "" }],
      existing,
    );
    expect(out[0]!.title).toBe("You're not eligible this round");
    expect(out[0]!.requirements.map((r) => r.label)).toEqual(["A team of 2 to 5 people"]);
  });

  it("does not collide a new ending's ref with one already taken", () => {
    const existing = [
      { id: "end_00000001", ref: "end_thanks", title: "Thanks", bodyMd: "", imageUrl: null, redirectDelaySec: 5, showSummary: false, kind: "success" as const, requirements: [] },
    ];
    // Same ref, different case — a model reaching for the obvious slug again.
    const out = normalizeDraftEndings([{ ref: "END_THANKS ", title: "Second", body: "", kind: "success", requirements: "" }], existing);
    expect(out[0]!.ref).toBe("end_thanks");
    expect(out[0]!.id).toBe("end_00000001");
  });
});
