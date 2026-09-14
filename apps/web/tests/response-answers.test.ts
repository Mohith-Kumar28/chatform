import { describe, expect, it } from "vitest";
import { displayCell, splitAnswers, type ResultColumn } from "@/components/builder/response-answers";

/**
 * The columns of one response, split into what was said and what was not.
 *
 * Written against the response that prompted it: an open mic registration with
 * fourteen questions, of which a performer taking the music arm is asked nine
 * and answers seven. The detail panel used to print all fourteen, five of them
 * reading "Not answered" about arms of the form he was never taken down — a
 * wall of blanks that says nothing about the respondent and quite a lot about
 * the flow, which is not what somebody opens a response to read.
 */

const column = (ref: string, type: ResultColumn["type"], title = ref): ResultColumn => ({ ref, title, type });

const COLUMNS: ResultColumn[] = [
  column("q_contact", "contact_info", "Contact details"),
  column("q_role", "single_select", "Performer or audience?"),
  column("q_music_instruments", "short_text", "Which instruments?"),
  // The other arms. Never asked, never answered.
  column("q_spoken_topic", "short_text", "Your poetry piece?"),
  column("q_comedy_style", "short_text", "Format of your set?"),
  column("q_party_size", "number", "How many in your party?"),
];

const ANSWERS = new Map<string, unknown>([
  ["q_contact", { first_name: "Vinod", email: "v@example.com" }],
  ["q_role", "opt_i_want_to_perform"],
  ["q_music_instruments", "a classical guitar"],
]);

describe("splitAnswers", () => {
  it("keeps only what the respondent actually said", () => {
    const { answered } = splitAnswers(COLUMNS, ANSWERS);
    expect(answered.map((c) => c.ref)).toEqual(["q_contact", "q_role", "q_music_instruments"]);
  });

  it("puts everything else aside rather than throwing it away", () => {
    // Behind a disclosure, not deleted: which optional question everybody
    // skips is a real thing to want to know, and it is unknowable if the rows
    // never exist.
    const { blank } = splitAnswers(COLUMNS, ANSWERS);
    expect(blank.map((c) => c.ref)).toEqual(["q_spoken_topic", "q_comedy_style", "q_party_size"]);
  });

  it("accounts for every column exactly once", () => {
    const { answered, blank } = splitAnswers(COLUMNS, ANSWERS);
    expect(answered.length + blank.length).toBe(COLUMNS.length);
    expect(new Set([...answered, ...blank].map((c) => c.ref)).size).toBe(COLUMNS.length);
  });

  it("holds document order on both sides", () => {
    // The panel reads top to bottom as the form was asked; a split that sorted
    // would renumber somebody's answers under them.
    const { answered } = splitAnswers(COLUMNS, ANSWERS);
    const order = COLUMNS.map((c) => c.ref);
    expect(answered.map((c) => order.indexOf(c.ref))).toEqual([...answered.map((c) => order.indexOf(c.ref))].sort((a, b) => a - b));
  });

  it("treats a response with nothing in it as all blank", () => {
    const { answered, blank } = splitAnswers(COLUMNS, new Map());
    expect(answered).toEqual([]);
    expect(blank).toHaveLength(COLUMNS.length);
  });

  it("counts a zero as an answer", () => {
    // `0` is falsy and is a perfectly good answer to "how many in your party".
    // Reading blankness off the rendered string rather than the raw value is
    // what keeps it out of the blanks.
    const { answered } = splitAnswers([column("q_party_size", "number")], new Map([["q_party_size", 0]]));
    expect(answered.map((c) => c.ref)).toEqual(["q_party_size"]);
  });

  it("counts an explicit no as an answer", () => {
    const { answered } = splitAnswers([column("q_ok", "yes_no")], new Map([["q_ok", false]]));
    expect(answered.map((c) => c.ref)).toEqual(["q_ok"]);
  });

  it("does not count an empty multi-select as an answer", () => {
    const { blank } = splitAnswers([column("q_tech", "multi_select")], new Map([["q_tech", []]]));
    expect(blank.map((c) => c.ref)).toEqual(["q_tech"]);
  });
});

describe("displayCell", () => {
  it("is empty for the three ways a cell has nothing in it", () => {
    const c = column("q_x", "short_text");
    for (const value of [undefined, null, ""]) expect(displayCell(c, value)).toBe("");
  });
});
