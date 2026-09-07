import { describe, expect, it } from "vitest";
import { FormDoc, diffFormDoc, leadFormFixture, mergeChanges, summarizeChanges, type DocChange } from "../src/index.js";

const base = () => FormDoc.parse(structuredClone(leadFormFixture));

/** A deep copy the test can mutate without the compiler objecting to a readonly doc. */
function edit(fn: (d: ReturnType<typeof base>) => void) {
  const d = base();
  fn(d);
  return d;
}

const ops = (cs: DocChange[]) => cs.map((c) => c.op).sort();

describe("diffFormDoc", () => {
  it("sees nothing in a document that did not change", () => {
    expect(diffFormDoc(base(), base())).toEqual([]);
  });

  it("survives a round trip through JSON", () => {
    const doc = base();
    const reparsed = FormDoc.parse(JSON.parse(JSON.stringify(doc)));
    expect(diffFormDoc(doc, reparsed)).toEqual([]);
  });

  it("names an added question by its title", () => {
    const after = edit((d) => {
      d.blocks.push({
        ...structuredClone(d.blocks[1]!),
        id: "blk_new0001",
        ref: "q_budget",
        title: "What's your budget?",
      });
    });
    const changes = diffFormDoc(base(), after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ op: "question.added", label: "What's your budget?" });
  });

  it("reports a removal against the title the question had", () => {
    const before = base();
    const removed = before.blocks[2]!;
    const after = edit((d) => {
      d.blocks.splice(2, 1);
    });
    const changes = diffFormDoc(before, after);
    expect(changes).toEqual([{ op: "question.removed", target: removed.id, label: removed.title }]);
  });

  it("distinguishes rewording from retyping from making required", () => {
    const before = base();
    const after = edit((d) => {
      d.blocks[1]!.title = "And your name?";
      d.blocks[2]!.required = !d.blocks[2]!.required;
    });
    const changes = diffFormDoc(before, after);
    expect(ops(changes)).toContain("question.renamed");
    expect(changes.find((c) => c.op === "question.renamed")).toMatchObject({
      from: before.blocks[1]!.title,
      to: "And your name?",
    });
    expect(changes.some((c) => c.op === "question.required" || c.op === "question.optional")).toBe(true);
  });

  /**
   * The regression this exists for: comparing raw array positions blamed every question
   * below an insertion for moving, so adding one question at the top produced a change
   * per question in the form.
   */
  it("blames only the questions that actually moved", () => {
    const before = base();
    const after = edit((d) => {
      d.blocks.unshift({ ...structuredClone(d.blocks[1]!), id: "blk_new0002", ref: "q_intro" });
    });
    const changes = diffFormDoc(before, after);
    expect(changes.filter((c) => c.op === "question.moved")).toHaveLength(0);
    expect(changes.filter((c) => c.op === "question.added")).toHaveLength(1);
  });

  it("reports a genuine reorder", () => {
    const before = base();
    const after = edit((d) => {
      const [a, b] = [d.blocks[1]!, d.blocks[2]!];
      d.blocks[1] = b;
      d.blocks[2] = a;
    });
    expect(diffFormDoc(before, after).filter((c) => c.op === "question.moved").length).toBeGreaterThan(0);
  });

  it("reads a setting change as one named setting with both values", () => {
    const after = edit((d) => {
      d.settings.navigation.allowBack = !d.settings.navigation.allowBack;
    });
    const before = base();
    const changes = diffFormDoc(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      op: "settings.changed",
      label: "Going back",
      from: before.settings.navigation.allowBack ? "on" : "off",
      to: after.settings.navigation.allowBack ? "on" : "off",
    });
  });

  it("never puts a password in the timeline", () => {
    const after = edit((d) => {
      d.settings.password.enabled = true;
      d.settings.password.value = "hunter2";
    });
    const changes = diffFormDoc(base(), after);
    const pw = changes.find((c) => c.target === "settings.password.value");
    expect(pw?.to).toBe("set");
    expect(JSON.stringify(changes)).not.toContain("hunter2");
  });

  it("collapses a whole re-theme into one change", () => {
    const after = edit((d) => {
      d.theme.accent = "#123456";
      d.theme.background = "#ffffff";
      d.theme.radius = "none";
      d.theme.fontBody = "Georgia";
    });
    const changes = diffFormDoc(base(), after);
    expect(changes).toEqual([{ op: "theme.changed", target: "doc.theme", label: "Design" }]);
  });

  /**
   * Dragging nodes around the flow canvas is not an edit to the form. Before `layout`
   * was excluded, panning the workflow editor wrote a history entry.
   */
  it("ignores workflow canvas positions", () => {
    const after = edit((d) => {
      d.layout = { ...d.layout, [d.blocks[0]!.ref]: { x: 420, y: 99 } };
    });
    expect(diffFormDoc(base(), after)).toEqual([]);
  });

  it("treats a missing predecessor as a creation", () => {
    const changes = diffFormDoc(null, base());
    expect(changes).toEqual([{ op: "title.changed", target: "doc.title", label: "Form created", to: base().title }]);
  });
});

describe("mergeChanges", () => {
  const added = (id: string, label: string): DocChange => ({ op: "question.added", target: id, label });
  const removed = (id: string, label: string): DocChange => ({ op: "question.removed", target: id, label });

  it("cancels a question that was built and deleted in the same sitting", () => {
    expect(mergeChanges([added("b1", "Draft question")], [removed("b1", "Draft question")])).toEqual([]);
  });

  it("keeps an addition an addition when it is later reworded", () => {
    const merged = mergeChanges(
      [added("b1", "Untitled question")],
      [{ op: "question.renamed", target: "b1", label: "Your email", from: "Untitled question", to: "Your email" }],
    );
    expect(merged).toEqual([{ op: "question.added", target: "b1", label: "Your email" }]);
  });

  it("keeps the original value when a field is edited twice", () => {
    const merged = mergeChanges(
      [{ op: "question.renamed", target: "b1", label: "B", from: "A", to: "B" }],
      [{ op: "question.renamed", target: "b1", label: "C", from: "B", to: "C" }],
    );
    expect(merged).toEqual([{ op: "question.renamed", target: "b1", label: "C", from: "A", to: "C" }]);
  });

  it("drops a switch that was flipped and flipped back", () => {
    const merged = mergeChanges(
      [{ op: "settings.changed", target: "settings.captcha.enabled", label: "CAPTCHA", from: "off", to: "on" }],
      [{ op: "settings.changed", target: "settings.captcha.enabled", label: "CAPTCHA", from: "on", to: "off" }],
    );
    expect(merged).toEqual([]);
  });

  it("keeps unrelated changes side by side", () => {
    const merged = mergeChanges([added("b1", "One")], [added("b2", "Two")]);
    expect(merged).toHaveLength(2);
  });

  it("survives a deletion of something it never saw added", () => {
    expect(mergeChanges([], [removed("b9", "Gone")])).toEqual([removed("b9", "Gone")]);
  });
});

describe("summarizeChanges", () => {
  it("tells the whole story when there is only one change", () => {
    expect(summarizeChanges([{ op: "question.added", target: "b1", label: "Your email" }])).toBe("Added “Your email”");
  });

  it("counts rather than names when there are several", () => {
    const summary = summarizeChanges([
      { op: "question.added", target: "b1", label: "One" },
      { op: "question.added", target: "b2", label: "Two" },
      { op: "question.removed", target: "b3", label: "Three" },
    ]);
    expect(summary).toBe("2 questions added, 1 question removed");
  });

  it("says something for an empty list rather than nothing", () => {
    expect(summarizeChanges([])).toBe("No changes");
  });
});
