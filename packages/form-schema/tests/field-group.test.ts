import { describe, expect, it } from "vitest";
import { Block, displayAnswer, validateAnswer, type Block as BlockT } from "../src/index";

/**
 * The repeating group, past what `ANSWER_CATALOG` documents.
 *
 * The catalogue proves the published contract; this covers the decisions inside
 * it that a reader of the docs would not think to ask about — an optional group
 * left blank, a column the block does not define, and the fact that every value
 * goes through the validator its own kind would use.
 */

const uid = (p: string, n: number) => `${p}_${String(n).padStart(8, "0")}`;

function group(over: Partial<Record<string, unknown>> = {}): BlockT {
  return Block.parse({
    id: uid("blk", 1),
    ref: "q_team",
    type: "field_group",
    title: "Who is on your team?",
    itemLabel: "Team member",
    minEntries: 2,
    maxEntries: 4,
    fields: [
      { id: uid("gf", 1), key: "name", label: "Full name", kind: "short_text", required: true },
      { id: uid("gf", 2), key: "email", label: "Email", kind: "email" },
      { id: uid("gf", 3), key: "phone", label: "Phone", kind: "phone" },
      {
        id: uid("gf", 4), key: "role", label: "Role", kind: "single_select",
        options: [
          { id: uid("opt", 1), label: "Lead" },
          { id: uid("opt", 2), label: "Member" },
        ],
      },
      { id: uid("gf", 5), key: "first_time", label: "First hackathon?", kind: "yes_no" },
      { id: uid("gf", 6), key: "age", label: "Age", kind: "number", min: 16, max: 99 },
    ],
    ...over,
  });
}

const two = [{ name: "Maya" }, { name: "Rahul" }];

describe("how many entries", () => {
  it("takes a roster between the floor and the ceiling", () => {
    expect(validateAnswer(group(), two).ok).toBe(true);
    expect(validateAnswer(group(), [...two, { name: "Sana" }, { name: "Ali" }]).ok).toBe(true);
  });

  it("refuses fewer than the floor and more than the ceiling", () => {
    expect(validateAnswer(group(), [{ name: "Maya" }]).code).toBe("too_few");
    expect(validateAnswer(group(), [...two, ...two, { name: "Ali" }]).code).toBe("too_many");
  });

  it("counts the ceiling before the floor, so an over-long answer is not called short", () => {
    // Both bounds fail on a block whose floor is above what was sent — the
    // respondent needs to be told to remove rows, not add them.
    const block = group({ minEntries: 4, maxEntries: 4 });
    expect(validateAnswer(block, [...two, ...two, { name: "Ali" }]).code).toBe("too_many");
  });
});

describe("an empty answer", () => {
  it("is a skip when the group is optional", () => {
    const result = validateAnswer(group(), []);
    expect(result.ok).toBe(true);
    expect(result.value).toBeUndefined();
  });

  it("is a refusal when the group is required", () => {
    expect(validateAnswer(group({ required: true }), []).code).toBe("required");
  });

  it("refuses an entry with nothing in it at all", () => {
    // Only reachable when no column is required — with one, the missing column
    // is the more useful thing to say.
    const optional = group({
      minEntries: 1,
      fields: [{ id: uid("gf", 9), key: "name", label: "Full name", kind: "short_text" }],
    });
    expect(validateAnswer(optional, [{}]).code).toBe("incomplete");
  });
});

describe("each column, by its own rules", () => {
  it("canonicalizes every value the way its kind would alone", () => {
    const result = validateAnswer(group(), [
      { name: "  Maya  ", email: "MAYA@X.CO", phone: "+91 98123 45678", age: "22" },
      { name: "Rahul", role: uid("opt", 1), first_time: "yes" },
    ]);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual([
      { name: "Maya", email: "maya@x.co", phone: "+919812345678", age: 22 },
      { name: "Rahul", role: uid("opt", 1), first_time: true },
    ]);
  });

  it("resolves a choice given by its label, as the same question would", () => {
    const result = validateAnswer(group(), [{ name: "Maya", role: "Lead" }, { name: "Rahul" }]);
    expect((result.value as Record<string, unknown>[])[0]?.role).toBe(uid("opt", 1));
  });

  it("enforces a column's own bounds", () => {
    expect(validateAnswer(group(), [{ name: "Maya", age: 12 }, { name: "Rahul" }]).code).toBe("too_small");
    expect(validateAnswer(group(), [{ name: "Maya", role: "Captain" }, { name: "Rahul" }]).code)
      .toBe("invalid_option");
  });

  it("names the entry and the column it is complaining about", () => {
    const result = validateAnswer(group(), [{ name: "Maya" }, { name: "Rahul", email: "nope" }]);
    expect(result.hint).toContain("Team member 2");
    expect(result.hint).toContain("Email");
  });

  it("drops a key the block does not define", () => {
    // A client that invents a column must not get one into an export.
    const result = validateAnswer(group(), [{ name: "Maya", salary: "100000" }, { name: "Rahul" }]);
    expect(result.value).toEqual([{ name: "Maya" }, { name: "Rahul" }]);
  });

  it("holds a column to the pattern the author gave it", () => {
    // A USN column exists to be a USN. The same regex a standalone short text
    // block takes has to reach the cell, or the shape is only checked outside
    // groups — see `groupFieldBlock`.
    const usn = group({
      minEntries: 1,
      maxEntries: 4,
      fields: [
        {
          id: uid("gf", 7),
          key: "usn",
          label: "USN",
          kind: "short_text",
          required: true,
          pattern: "^1[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$",
        },
      ],
    });
    expect(validateAnswer(usn, [{ usn: "1MS22CS001" }]).ok).toBe(true);
    const bad = validateAnswer(usn, [{ usn: "not-a-usn" }]);
    expect(bad.code).toBe("pattern");
    expect(bad.hint).toContain("USN");
  });

  it("ignores a pattern on a kind that has no use for one", () => {
    // The inspector only offers it for short text and clears it on a switch,
    // but a document written by hand or by the agent can still carry one.
    const dated = group({
      minEntries: 1,
      fields: [
        { id: uid("gf", 8), key: "joined", label: "Joined", kind: "date", pattern: "^nope$" },
      ],
    });
    expect(validateAnswer(dated, [{ joined: "2026-03-01" }]).ok).toBe(true);
  });

  it("refuses an entry that is not an object", () => {
    expect(validateAnswer(group(), ["Maya", "Rahul"]).code).toBe("type");
    expect(validateAnswer(group(), { name: "Maya" }).code).toBe("type");
  });
});

describe("reading it back", () => {
  it("names the entry, and labels every value in it", () => {
    const shown = displayAnswer(group(), [
      { name: "Maya", email: "maya@x.co", role: uid("opt", 1), first_time: true },
      { name: "Rahul", age: 22 },
    ]);
    expect(shown).toBe(
      "Team member 1 — Full name: Maya, Email: maya@x.co, Role: Lead, First hackathon?: Yes · " +
        "Team member 2 — Full name: Rahul, Age: 22",
    );
  });

  it("says an entry is empty rather than printing nothing", () => {
    expect(displayAnswer(group(), [{}])).toBe("Team member 1 — (empty)");
  });
});
