import { describe, it, expect } from "vitest";
import { draftToDoc, resolveBranches, normalizeEditBlocks } from "../src/lib/draft-normalize.js";
import { extractUrls, htmlToText } from "../src/lib/research.js";
import type { GenerationDraft, EditDraft } from "../src/lib/ai.js";

const block = (over: Partial<GenerationDraft["blocks"][number]>): GenerationDraft["blocks"][number] => ({
  ref: "q_x",
  type: "short_text",
  title: "A question",
  description: "",
  required: true,
  options: [],
  scale: 10,
  ...over,
});

const draft = (over: Partial<GenerationDraft>): GenerationDraft => ({
  title: "A form",
  description: "",
  blocks: [block({ ref: "welcome", type: "welcome", title: "Hi" }), block({ ref: "q_email", type: "email" })],
  endings: [{ ref: "end_thanks", title: "Thanks", body: "" }],
  branches: [],
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
        { whenRef: "q_text", op: "is_empty", value: "", then: "q_yes" },
      ],
      blocks,
      new Map(),
    );
    expect(resolved.map((r) => r.when.value)).toEqual([true, 6, "urgent", null]);
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
