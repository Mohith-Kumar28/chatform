import { describe, expect, it } from "vitest";
import {
  csvCellsFor,
  csvHeadersFor,
  displayCell,
  splitAnswers,
  uncountedPayments,
  type PaymentAttempt,
  type ResultColumn,
} from "@/components/builder/response-answers";

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

describe("csvHeadersFor / csvCellsFor", () => {
  /*
    The rows downloaded from the results screen are the file the server's export
    would have produced for them. A payment question brings the same four
    reconciliation columns there as here, or a person checking one file against
    the other finds columns that only exist in one.
  */
  const pay = { ...column("q_ticket", "payment", "Ticket"), currency: "INR" } as ResultColumn;

  it("adds status, amount, currency and gateway id after a payment column", () => {
    expect(csvHeadersFor(pay)).toEqual([
      "Ticket",
      "Ticket — Payment status",
      "Ticket — Amount",
      "Ticket — Currency",
      "Ticket — Gateway payment ID",
    ]);
    const value = { status: "paid", method: "gateway", verified: true, provider: "stripe", paymentId: "pi_1", amount: 499, currency: "INR" };
    expect(csvCellsFor(pay, value)).toEqual(["Paid ₹499 · verified", "paid · verified", "499", "INR", "pi_1"]);
  });

  it("falls back to the block's currency for a manual answer that carries none", () => {
    expect(csvCellsFor(pay, { status: "paid", method: "upi", verified: false, amount: 50 }).slice(1, 4)).toEqual([
      "paid · unverified",
      "50",
      "INR",
    ]);
  });

  it("leaves every other column as one cell", () => {
    const text = column("q_name", "short_text", "Name");
    expect(csvHeadersFor(text)).toEqual(["Name"]);
    expect(csvCellsFor(text, "Ada")).toEqual(["Ada"]);
  });

  it("marks a removed payment question on all five headers", () => {
    expect(csvHeadersFor({ ...pay, retired: true }).every((h) => h.startsWith("Ticket (archived)"))).toBe(true);
  });

  it("writes five empty cells for an unanswered payment", () => {
    expect(csvCellsFor(pay, undefined)).toEqual(["", "", "", "", ""]);
  });
});

/**
 * Money that reached the gateway and that no answer counts.
 *
 * The case this exists for has no answer at all: the respondent paid ₹100, changed the quantity,
 * and never paid the new total. The server takes the answer off the question and flags the
 * record, and until the results dialog reads the records there is nothing anywhere in the
 * product that tells the admin they are holding that ₹100.
 */
describe("uncountedPayments", () => {
  const attempt = (over: Partial<PaymentAttempt> & { id: string }): PaymentAttempt => ({
    blockRef: "q_pay",
    provider: "razorpay",
    environment: "test",
    status: "paid",
    duplicate: false,
    failureReason: null,
    amount: 100,
    currency: "INR",
    providerPaymentId: null,
    dashboardUrl: null,
    ...over,
  });

  it("finds a paid record the price moved away from, with no answer on the question", () => {
    const rows = [attempt({ id: "rpay_1", failureReason: "amount_changed" })];
    expect(uncountedPayments(rows, "q_pay").map((p) => p.id)).toEqual(["rpay_1"]);
  });

  it("finds a duplicate beside the payment that did become the answer", () => {
    const rows = [
      attempt({ id: "rpay_answer" }),
      attempt({ id: "rpay_dup", duplicate: true, failureReason: "duplicate" }),
    ];
    expect(uncountedPayments(rows, "q_pay", "rpay_answer").map((p) => p.id)).toEqual(["rpay_dup"]);
  });

  it("leaves out the record the answer counts, other questions, and money already given back", () => {
    const rows = [
      attempt({ id: "rpay_answer" }),
      attempt({ id: "rpay_other_block", blockRef: "q_donation", failureReason: "duplicate" }),
      attempt({ id: "rpay_refunded", status: "refunded", failureReason: "duplicate" }),
      attempt({ id: "rpay_never_paid", status: "created" }),
      attempt({ id: "rpay_failed", status: "failed", failureReason: "provider_upstream" }),
    ];
    expect(uncountedPayments(rows, "q_pay", "rpay_answer")).toEqual([]);
  });
});
