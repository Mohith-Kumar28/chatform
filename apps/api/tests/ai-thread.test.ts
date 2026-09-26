import { describe, it, expect } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { describeEdit, proposalTurn } from "../src/lib/ai-thread.js";

const doc = (blocks: unknown[]) =>
  FormDoc.parse({ title: "T", blocks, endings: [{ id: "end_aaaa01", ref: "end_thanks", title: "Thanks" }] });

describe("the stored AI bar reply", () => {
  it("lists the questions a proposal adds, without the document", () => {
    const base = doc([{ id: "blk_aaaa01", ref: "q_name", type: "short_text", title: "Name?" }]);
    const proposed = doc([
      { id: "blk_aaaa01", ref: "q_name", type: "short_text", title: "Name?" },
      { id: "blk_bbbb01", ref: "q_email", type: "email", title: "Email?" },
    ]);
    const turn = proposalTurn(base, proposed, { rules: 0 });
    expect(turn.role).toBe("assistant");
    expect(turn.blocks?.map((b) => b.ref)).toEqual(["q_email"]);
    expect(turn.text).toBe("Here is the change: 1 new question.");
    expect(turn).not.toHaveProperty("doc");
  });

  it("keeps the model's own summary when it wrote one", () => {
    const base = doc([{ id: "blk_aaaa01", ref: "q_name", type: "short_text", title: "Name?" }]);
    expect(proposalTurn(base, base, { summary: "Made name optional." }).text).toBe("Made name optional.");
    expect(describeEdit(0, 2, 1, 3)).toBe("Here is the change: 2 questions changed, 1 removed, 3 branching rules.");
  });
});
