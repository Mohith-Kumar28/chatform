import { describe, it, expect } from "vitest";
import { lintFormDoc } from "@repo/form-schema";
import { draftToDoc, pruneOrphanEndings } from "../src/lib/draft-normalize.js";
import { finishAccepted } from "../src/lib/ai.js";
import type { GenerationDraft } from "../src/lib/ai.js";

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

/** Two paths, two endings: the shape that shipped an ending nothing reached. */
const twoPaths = (then: string): GenerationDraft => ({
  title: "Intake",
  description: "",
  blocks: [
    block({ ref: "welcome", type: "welcome", title: "Hi" }),
    block({ ref: "q_intent", type: "single_select", title: "Proceed how?", options: ["Book a call", "Submit intake"] }),
    block({ ref: "q_company", title: "Company?" }),
  ],
  endings: [
    { ref: "call_booked", title: "Call booked", body: "", kind: "success", requirements: "" },
    { ref: "intake_received", title: "Intake received", body: "", kind: "success", requirements: "" },
  ],
  branches: [
    { whenRef: "q_intent", op: "eq", value: "Book a call", then: "call_booked" },
    { whenRef: "q_intent", op: "eq", value: "Submit intake", then },
  ],
});

const unreachableEndings = (doc: ReturnType<typeof draftToDoc>["doc"]) =>
  lintFormDoc(doc).filter((i) => i.code === "ending_unreachable");

describe("draftToDoc: branches follow renamed endings", () => {
  it("routes to an ending named by the ref the model wrote, before it was normalized", () => {
    const { doc } = draftToDoc(twoPaths("intake_received"));
    expect(doc.endings.map((e) => e.ref)).toEqual(["end_call_booked", "end_intake_received"]);
    expect(doc.logic.some((r) => r.action_kind === "goto" && r.target === "end_intake_received")).toBe(true);
    expect(unreachableEndings(doc)).toEqual([]);
  });

  it("routes to an ending named by its title", () => {
    const { doc } = draftToDoc(twoPaths("Intake received"));
    expect(doc.logic.some((r) => r.action_kind === "goto" && r.target === "end_intake_received")).toBe(true);
  });
});

describe("pruneOrphanEndings", () => {
  it("drops an ending nothing reaches, and keeps the rest", () => {
    const { doc } = draftToDoc(twoPaths("nowhere"));
    expect(unreachableEndings(doc)).toHaveLength(1);
    const pruned = pruneOrphanEndings(doc);
    expect(pruned.endings.map((e) => e.ref)).toEqual(["end_call_booked"]);
    expect(unreachableEndings(pruned)).toEqual([]);
  });

  it("returns the same doc when nothing is orphaned", () => {
    const { doc } = draftToDoc(twoPaths("intake_received"));
    expect(pruneOrphanEndings(doc)).toBe(doc);
  });
});

describe("finishAccepted", () => {
  const step = (toolName: string, output: string) => ({ toolResults: [{ toolName, output }] });
  it("does not stop the loop on a rejected finish_edit, so the repair round runs", () => {
    expect(finishAccepted({ steps: [step("finish_edit", "Rejected: your changes broke the flow.")] })).toBe(false);
  });
  it("stops on an accepted finish_edit", () => {
    expect(finishAccepted({ steps: [step("finish_edit", "The flow checks out. Edit complete.")] })).toBe(true);
  });
  it("ignores other tools", () => {
    expect(finishAccepted({ steps: [step("set_branch", "ok")] })).toBe(false);
  });
});
