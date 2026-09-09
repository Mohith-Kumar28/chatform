import { describe, it, expect } from "vitest";
import { FormDoc } from "@repo/form-schema";
import { buildAgentTools, type ToolOutcome } from "../src/do/agent-tools.js";
import type { KnowledgeHit } from "../src/lib/knowledge/index.js";

/**
 * What the agent gets back when it asks the knowledge base something.
 *
 * The tool is the only path from indexed material to the model, so these pin
 * the three outcomes that matter: a hit is quoted, a miss defers to the
 * guardrail, and a retrieval failure is indistinguishable from a miss — a
 * respondent must never see a turn die because a vector search timed out.
 */

const doc = (agent: Record<string, unknown> = {}) =>
  FormDoc.parse({
    title: "Waitlist",
    blocks: [
      { id: "blk_aaa1", ref: "welcome", type: "welcome", title: "Hi" },
      { id: "blk_bbb1", ref: "q_email", type: "email", title: "Your email?", required: true },
    ],
    endings: [{ id: "end_aaa1", ref: "end_thanks", title: "Thanks" }],
    settings: { agent },
  });

function toolsFor(opts: {
  agent?: Record<string, unknown>;
  hasKnowledge?: boolean;
  search?: (q: string) => Promise<KnowledgeHit[]>;
}) {
  const parsed = doc(opts.agent);
  const outcomes: ToolOutcome[] = [];
  const tools = buildAgentTools(
    {
      doc: parsed,
      currentBlock: parsed.blocks[1]!,
      allowedNext: [],
      clarifications: 0,
      hasKnowledge: opts.hasKnowledge,
      searchKnowledge: opts.search,
    },
    (o) => outcomes.push(o),
  );
  return { tools, outcomes };
}

const run = async (tools: ReturnType<typeof toolsFor>["tools"], query: string) =>
  (await (tools.answer_from_knowledge as { execute: (a: { query: string }) => Promise<string> }).execute({
    query,
  })) as string;

const hit = (over: Partial<KnowledgeHit> = {}): KnowledgeHit => ({
  sourceId: "kbs_1",
  title: "Pricing",
  text: "Pro is $24 a month.",
  score: 0.9,
  ...over,
});

describe("answer_from_knowledge", () => {
  it("quotes the passages retrieval returned", async () => {
    const { tools } = toolsFor({ hasKnowledge: true, search: async () => [hit()] });
    const out = await run(tools, "how much is pro?");
    expect(out).toContain("Pro is $24 a month.");
    expect(out).toContain("### Pricing");
  });

  it("returns several passages, in the order retrieval ranked them", async () => {
    const { tools } = toolsFor({
      hasKnowledge: true,
      search: async () => [hit({ title: "A", text: "first" }), hit({ title: "B", text: "second" })],
    });
    const out = await run(tools, "anything");
    expect(out.indexOf("first")).toBeLessThan(out.indexOf("second"));
  });

  it("says the form has no knowledge base when it has none", async () => {
    const { tools } = toolsFor({ hasKnowledge: false });
    expect(await run(tools, "pricing?")).toContain("No knowledge base is configured");
  });

  it("degrades to no-knowledge when retrieval is not wired at all", async () => {
    // Miniflare implements neither Vectorize nor Workers AI, so this is the
    // shape of every local dev run.
    const { tools } = toolsFor({ hasKnowledge: true, search: undefined });
    expect(await run(tools, "pricing?")).toContain("No knowledge base is configured");
  });

  it("falls back to general knowledge on a miss when the guardrail allows it", async () => {
    const { tools } = toolsFor({
      agent: { guardrails: { answerOffTopic: true } },
      hasKnowledge: true,
      search: async () => [],
    });
    expect(await run(tools, "unrelated")).toContain("Answer briefly from general knowledge");
  });

  it("uses the author's refusal line on a miss when off-topic answering is off", async () => {
    const { tools } = toolsFor({
      agent: { guardrails: { answerOffTopic: false, refusalMessage: "I can't help with that." } },
      hasKnowledge: true,
      search: async () => [],
    });
    expect(await run(tools, "unrelated")).toContain("I can't help with that.");
  });

  it("treats a retrieval failure as a miss rather than ending the turn", async () => {
    // A vector search that throws must not surface to the respondent. The
    // guardrail decides what to say, exactly as it would for a genuine miss.
    const { tools, outcomes } = toolsFor({
      agent: { guardrails: { answerOffTopic: false, refusalMessage: "Ask support." } },
      hasKnowledge: true,
      search: async () => {
        throw new Error("vectorize unavailable");
      },
    });
    expect(await run(tools, "pricing?")).toContain("Ask support.");
    // Still recorded as a completed tool call, not a rejected one.
    expect(outcomes.at(-1)?.ok).toBe(true);
  });

  it("passes the model's query through to retrieval unchanged", async () => {
    const seen: string[] = [];
    const { tools } = toolsFor({
      hasKnowledge: true,
      search: async (q) => {
        seen.push(q);
        return [hit()];
      },
    });
    await run(tools, "what is the refund window");
    expect(seen).toEqual(["what is the refund window"]);
  });
});
