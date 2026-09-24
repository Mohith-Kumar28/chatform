import { describe, it, expect } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { draftToDoc } from "../src/lib/draft-normalize.js";
import { applyEditDraft } from "../src/lib/edit-apply.js";
import { EditDraft, type GenerationDraft } from "../src/lib/ai.js";

/**
 * "Basic 499, Pro 999, Team 1999, charged by whatever they pick", written by
 * the AI as `price_from=<ref>; prices=Basic:499|Pro:999|Team:1999`, becomes a
 * payment priced by that answer, on both the generate and the edit paths.
 */

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

const draft = (blocks: GenerationDraft["blocks"]): GenerationDraft => ({
  title: "Plans",
  description: "",
  blocks,
  endings: [{ ref: "end_thanks", title: "Thanks", body: "", kind: "success", requirements: "" }],
  branches: [],
});

const payOf = (doc: FormDoc) => doc.blocks.find((b) => b.type === "payment") as Extract<FormDoc["blocks"][number], { type: "payment" }>;
const planOf = (doc: FormDoc) => doc.blocks.find((b) => b.type === "single_select") as Extract<FormDoc["blocks"][number], { type: "single_select" }>;

describe("price_from on a generated form", () => {
  it("prices each option of the named question", () => {
    const { doc } = draftToDoc(
      draft([
        block({ ref: "welcome", type: "welcome", title: "Hi" }),
        block({ ref: "q_plan", type: "single_choice", title: "Which plan?", options: ["Basic", "Pro", "Team"] }),
        block({ ref: "q_pay", type: "payment", title: "Pay", config: "currency=INR; price_from=q_plan; prices=Basic:499|Pro:999|Team:1,999" }),
      ]),
    );
    const pay = payOf(doc);
    const plan = planOf(doc);
    expect(pay.amountMode).toBe("answer");
    expect(pay.priceFrom?.ref).toBe(plan.ref);
    const byLabel = Object.fromEntries(plan.options.map((o) => [o.label, pay.priceFrom?.prices[o.id]]));
    expect(byLabel).toEqual({ Basic: 499, Pro: 999, Team: 1999 });
  });

  it("finds the question by its title, and keeps a fixed price when nothing matches", () => {
    const byTitle = draftToDoc(
      draft([
        block({ ref: "welcome", type: "welcome", title: "Hi" }),
        block({ ref: "q_size", type: "single_choice", title: "T-shirt size", options: ["S", "M"] }),
        block({ ref: "q_pay", type: "payment", title: "Pay", config: "price_from=T-shirt size; prices=S=300|M=350" }),
      ]),
    ).doc;
    // One-letter options used to mint an id too short to parse, and the question became text.
    expect(byTitle.blocks.find((b) => b.ref === "q_size")?.type).toBe("single_select");
    expect(payOf(byTitle).amountMode).toBe("answer");

    const unmatched = draftToDoc(
      draft([
        block({ ref: "welcome", type: "welcome", title: "Hi" }),
        block({ ref: "q_pay", type: "payment", title: "Pay", config: "amount=500; price_from=q_missing; prices=A:1" }),
      ]),
    ).doc;
    expect(payOf(unmatched).amountMode).toBe("fixed");
    expect(payOf(unmatched).amount).toBe(500);
  });
});

describe("price_from on an edit", () => {
  const base = draftToDoc(
    draft([
      block({ ref: "welcome", type: "welcome", title: "Hi" }),
      block({ ref: "q_email", type: "email", title: "Email" }),
      block({ ref: "q_pay", type: "payment", title: "Pay", config: "amount=500; currency=INR" }),
    ]),
  ).doc;

  it("adds the plan question and prices the existing payment by it, in one edit", () => {
    const edit = EditDraft.parse({
      summary: "Charge by plan",
      addBlocks: [
        { ref: "q_plan", type: "single_select", title: "Which plan?", options: ["Basic", "Pro"], scale: 0, insertAfter: "q_email", required: true, description: "", config: "" },
      ],
      updateBlocks: [{ ref: "q_pay", config: "price_from=q_plan; prices=Basic:499|Pro:999", description: "" }],
      removeRefs: [],
      rewireRefs: [],
      branches: [],
      endings: [],
    });
    const { doc } = applyEditDraft(base, edit);
    const pay = payOf(doc);
    const plan = planOf(doc);
    expect(doc.blocks.indexOf(plan)).toBeLessThan(doc.blocks.indexOf(pay));
    expect(pay.amountMode).toBe("answer");
    expect(Object.values(pay.priceFrom?.prices ?? {}).sort()).toEqual([499, 999]);
  });
});
