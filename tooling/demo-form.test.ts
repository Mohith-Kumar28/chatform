import { describe, expect, it } from "vitest";
import { FormDoc, hasErrors, lintFormDoc, resolveNext } from "@repo/form-schema";
import { DEMO_FORM, DEMO_SLUG, DEMO_REVISION, DEMO_KNOWLEDGE } from "./demo-form/index.js";

/**
 * The demo form is the one form whose failure is a lost customer.
 *
 * It is the first thing a visitor touches, it is public, and it is backed by a
 * model that costs money per conversation — so the things asserted here are the
 * ones nobody would notice by reading the definition: that it is short enough
 * to finish, cheap enough to leave open, and gated the way it claims to be.
 *
 * `buildAuthoredDoc` already throws on a broken flow at generation time. Some of
 * that is re-asserted anyway, because a test that fails is a better bug report
 * than a generator that throws during an unrelated `pnpm check`.
 */

const doc = DEMO_FORM.doc;

describe("the document", () => {
  it("is a valid form", () => {
    expect(() => FormDoc.parse(doc)).not.toThrow();
    expect(hasErrors(lintFormDoc(doc))).toBe(false);
  });

  it("keeps its slug", () => {
    // The public URL is /f/<slug>, and it goes in an env var, a marketing page
    // and every link anyone shares. Changing it is a decision, not a tidy-up.
    expect(DEMO_SLUG).toBe("how-you-use-forms");
    expect(DEMO_REVISION).toBeGreaterThanOrEqual(1);
  });
});

describe("short enough that people finish it", () => {
  /**
   * The longest run through the form, which is the only length that matters:
   * it branches, so nobody sees every question.
   */
  function longestPath(): number {
    const index = new Map(doc.blocks.map((b, i) => [b.ref, i]));
    const seen = new Map<string, number>();

    const from = (ref: string | null): number => {
      const key = ref ?? "";
      const cached = seen.get(key);
      if (cached !== undefined) return cached;
      seen.set(key, 0); // cycle guard; the flow is a DAG, but do not trust that here
      const next = resolveNext(doc, ref, { answers: {}, variables: {}, hidden: {} });
      let total = 0;
      if (next.kind === "block") {
        const asked = next.block.type === "welcome" || next.block.type === "statement" ? 0 : 1;
        total = asked + from(next.block.ref);
      }
      seen.set(key, total);
      return total;
    };

    // `resolveNext` with no answers walks the fallthrough path. Every branch
    // target is checked separately below, so the deepest arm is covered.
    const trunk = from(null);
    const arms = doc.logic
      .filter((r) => r.action_kind === "goto" && (r.targetKind ?? "block") === "block")
      .map((r) => (index.has(r.target) ? 1 + from(r.target) : 0));
    return Math.max(trunk, ...arms);
  }

  it("asks at most twelve questions on any single run", () => {
    // Past about four minutes, demo drop-off climbs sharply — and a visitor
    // abandoning the demo is a worse signal than a shorter form.
    expect(longestPath()).toBeLessThanOrEqual(12);
    expect(DEMO_FORM.estMinutes).toBeLessThanOrEqual(4);
  });

  it("says in the greeting how long it will take", () => {
    // The greeting is the only place someone can decide whether to start, and
    // it sits directly above a sign-in they will be asked for shortly.
    const welcome = doc.blocks.find((b) => b.type === "welcome");
    expect(welcome?.title).toMatch(/minute/i);
  });
});

describe("shows the product off", () => {
  it("branches, and every arm rejoins something", () => {
    const gotos = doc.logic.filter((r) => r.action_kind === "goto");
    const conditional = gotos.filter((r) => (r.when?.conditions.length ?? 0) > 0);
    expect(conditional.length).toBeGreaterThanOrEqual(5);
  });

  it("routes to more than one ending", () => {
    const aimed = new Set(
      doc.logic
        .filter((r) => r.action_kind === "goto" && (r.targetKind ?? "block") === "ending")
        .map((r) => r.target),
    );
    expect(doc.endings.length).toBeGreaterThanOrEqual(2);
    // An ending nothing routes to is an outcome the form can never reach.
    for (const ending of doc.endings.slice(1)) expect(aimed.has(ending.ref)).toBe(true);
  });

  it("uses the block types the landing page is selling", () => {
    const types = new Set(doc.blocks.map((b) => b.type));
    for (const wanted of ["single_select", "multi_select", "long_text", "ranking", "rating", "file_upload"]) {
      expect(types, `demo form no longer demonstrates ${wanted}`).toContain(wanted);
    }
  });

  it("never leans on a block type that is only half-built", () => {
    // `aiQualityCheck` is in the schema and read nowhere. A demo that showed it
    // off would be demonstrating nothing, silently.
    for (const block of doc.blocks) {
      if (block.type === "long_text") expect(block.aiQualityCheck).toBe(false);
    }
    expect(doc.blocks.some((b) => b.type === "payment" || b.type === "scheduling")).toBe(false);
  });
});

describe("safe to leave open to the internet", () => {
  const settings = doc.settings;

  it("requires a verified respondent, a few questions in", () => {
    expect(settings.requireAuth.enabled).toBe(true);
    expect(settings.requireAuth.method).toBe("google");
    // False here and true on a real form. A demo exists to be tried, and one
    // response per identity means somebody who took it once can never open it
    // again — they come back to a dead end. Sign-in still gates it and
    // `maxSubmissions` still caps the spend.
    expect(settings.requireAuth.onePerIdentity).toBe(false);
    expect(settings.allowResubmissions).toBe(true);
    // Not 0: a sign-in card at interaction zero is where a demo loses people.
    // Not late either — everything before it is ungated and costs real tokens.
    expect(settings.requireAuth.afterBlocks).toBeGreaterThan(0);
    expect(settings.requireAuth.afterBlocks).toBeLessThanOrEqual(4);
  });

  it("has a hard ceiling on how much it can cost", () => {
    // Every response is a real model conversation billed to the owner's org,
    // against the same monthly bucket as their real forms.
    expect(settings.closeRules.maxSubmissions).toBeGreaterThan(0);
    expect(settings.closeRules.maxSubmissions).toBeLessThanOrEqual(5000);
    expect(settings.agent.guardrails.maxTurns).toBeLessThanOrEqual(40);
    expect(settings.agent.sessionTokenBudget).toBeLessThanOrEqual(14000);
    expect(settings.agent.responseMaxTokens).toBeLessThanOrEqual(400);
  });

  it("still says something useful once it is full", () => {
    // A closed demo is still a landing page. Convert or say nothing.
    expect(settings.closeRules.closedMessageMd).toMatch(/chatform\.in/);
  });

  it("refuses to be a free chatbot", () => {
    expect(settings.agent.guardrails.forbiddenTopics.length).toBeGreaterThanOrEqual(4);
    // Answering questions about chatform IS the feature being demonstrated, so
    // this one stays on — the topic list is what keeps it from being abused.
    expect(settings.agent.guardrails.answerOffTopic).toBe(true);
  });

  it("does not mail the owner once per response", () => {
    // maxSubmissions emails would arrive otherwise. Read the results tab.
    expect(settings.onComplete.notificationEmails).toEqual([]);
  });
});

describe("the knowledge base", () => {
  /*
   * Read from `DEMO_KNOWLEDGE` rather than from the document.
   *
   * Knowledge left `settings.agent.knowledge` when it stopped being inlined
   * into the system prompt: it is seeded into `knowledge_sources` by
   * `gen-seed-demo-form.ts`, chunked and embedded, and retrieved per question.
   * What is asserted here is unchanged — this is the only thing the public
   * demo agent is allowed to say about the product, and every claim in it is
   * one a visitor can hold us to.
   */
  const knowledge = DEMO_KNOWLEDGE;

  it("covers enough ground to answer a visitor", () => {
    expect(knowledge.length).toBeGreaterThanOrEqual(5);
    // No prompt-size ceiling any more — retrieval pulls only what a question
    // needs, so the old 8 000-character cap measured nothing. What still
    // matters is that no entry is a stub: a title with two lines under it
    // chunks into one thin passage that matches everything and answers
    // nothing.
    for (const entry of knowledge) {
      expect(entry.body.trim().length, `"${entry.title}" is too thin to retrieve`).toBeGreaterThan(200);
    }
  });

  it("is seeded into the knowledge tables, not into the document", () => {
    // The document must not carry knowledge any more. If this fails, the demo
    // is paying for a prompt prefix nothing reads.
    expect((doc.settings.agent as Record<string, unknown>).knowledge).toBeUndefined();
  });

  it("quotes prices that came from the plans, not from someone's memory", () => {
    // A hand-typed price would be a number in a published form version that
    // nothing recomputes when pricing changes — and the agent would state it
    // with total confidence to every visitor.
    const pricing = knowledge.find((k) => /pricing/i.test(k.title));
    expect(pricing, "no pricing entry").toBeDefined();
    expect(pricing!.body).toContain("$24");
    expect(pricing!.body).toContain("$84");
  });

  it("admits what the product cannot do", () => {
    // Someone evaluating a form product will poke at the edges, and an agent
    // that only knows good news reads as marketing the moment they find one.
    const all = knowledge.map((k) => k.body).join("\n").toLowerCase();
    expect(all).toContain("not verified");
    expect(all).toMatch(/scheduling is a hand-off/i);
  });

  it("tells respondents what happens to their answers", () => {
    const all = knowledge.map((k) => k.body).join("\n").toLowerCase();
    expect(all).toMatch(/research/);
    expect(all).toMatch(/removed|delete/);
  });
});
