import { describe, expect, it } from "vitest";
import { Block, displayAnswer } from "../src/index";

/**
 * Every surface that shows a stored answer back to a person goes through
 * `displayAnswer`: the respondent's thread and review card, the results table,
 * and the CSV export. These assert the cases that used to leak internal ids —
 * the ones a customer of the form's builder would have seen.
 */

const parse = (input: unknown) => Block.parse(input);

describe("displayAnswer", () => {
  it("resolves a select's option id to its label", () => {
    const block = parse({
      id: "blk_00000001", ref: "q_role", type: "single_select", title: "Role",
      options: [{ id: "opt_founder01", label: "Founder" }, { id: "opt_dev000001", label: "Developer" }],
    });
    expect(displayAnswer(block, "opt_founder01")).toBe("Founder");
  });

  it("resolves every id in a multi-select", () => {
    const block = parse({
      id: "blk_00000002", ref: "q_ch", type: "multi_select", title: "Channels",
      options: [{ id: "opt_email00001", label: "Email" }, { id: "opt_slack00001", label: "Slack" }],
    });
    expect(displayAnswer(block, ["opt_email00001", "opt_slack00001"])).toBe("Email, Slack");
  });

  it("numbers a ranking by its item labels", () => {
    const block = parse({
      id: "blk_00000003", ref: "q_rank", type: "ranking", title: "Rank",
      items: [{ id: "itm_speed0001", label: "Speed" }, { id: "itm_price0001", label: "Price" }],
    });
    expect(displayAnswer(block, ["itm_price0001", "itm_speed0001"])).toBe("1. Price, 2. Speed");
  });

  it("reads a matrix as rows and columns, not JSON", () => {
    const block = parse({
      id: "blk_00000004", ref: "q_matrix", type: "matrix", title: "Rate",
      rows: [{ id: "row_ui000001", label: "Interface" }],
      columns: [{ id: "col_great0001", label: "Great" }, { id: "col_bad00001", label: "Bad" }],
    });
    expect(displayAnswer(block, { row_ui000001: "col_great0001" })).toBe("Interface: Great");
  });

  it("uses the block's own yes/no wording", () => {
    const block = parse({
      id: "blk_00000005", ref: "q_yn", type: "yes_no", title: "Ok?",
      yesLabel: "Absolutely", noLabel: "Not really",
    });
    expect(displayAnswer(block, true)).toBe("Absolutely");
    expect(displayAnswer(block, false)).toBe("Not really");
  });

  it("names a signature by its signer rather than dumping the file", () => {
    const block = parse({
      id: "blk_00000006", ref: "q_sig", type: "signature", title: "Sign", drawnNameRequired: true,
    });
    const value = { fileId: "file_1", filename: "signature.png", mime: "image/png", size: 12, r2Key: "k", signedName: "Mohith Kumar" };
    expect(displayAnswer(block, value)).toBe("Signed — Mohith Kumar");
  });

  it("lists uploaded files by name", () => {
    const block = parse({
      id: "blk_00000007", ref: "q_file", type: "file_upload", title: "Upload", accept: ["image/png"], maxFiles: 2,
    });
    const files = [
      { fileId: "f1", filename: "a.png", mime: "image/png", size: 1, r2Key: "k1" },
      { fileId: "f2", filename: "b.png", mime: "image/png", size: 1, r2Key: "k2" },
    ];
    expect(displayAnswer(block, files)).toBe("a.png, b.png");
  });

  it("says a payment is self-declared and carries its reference", () => {
    const block = parse({
      id: "blk_00000008", ref: "q_pay", type: "payment", title: "Pay", method: "link", currency: "USD",
      url: "https://example.com/checkout",
    });
    const value = { status: "paid", method: "link", verified: false, reference: "CFTEST", amount: 10, currency: "USD" };
    expect(displayAnswer(block, value)).toBe("Paid $10 · ref CFTEST");
  });

  it("splits a date that carries a time", () => {
    const block = parse({
      id: "blk_00000009", ref: "q_when", type: "date", title: "When", includeTime: true,
    });
    expect(displayAnswer(block, "2026-10-01T14:30")).toBe("2026-10-01 at 14:30");
    expect(displayAnswer(parse({ id: "blk_00000010", ref: "q_d", type: "date", title: "When" }), "2026-10-01"))
      .toBe("2026-10-01");
  });

  it("flattens a record answer into its values", () => {
    const block = parse({
      id: "blk_00000011", ref: "q_addr", type: "address", title: "Address",
      fields: ["street", "city"],
    });
    expect(displayAnswer(block, { street: "1 Main", city: "BLR" })).toBe("1 Main, BLR");
  });

  it("distinguishes an unanswered question from an empty one", () => {
    const block = parse({ id: "blk_00000012", ref: "q_s", type: "short_text", title: "Name" });
    expect(displayAnswer(block, undefined)).toBe("(skipped)");
    expect(displayAnswer(block, "")).toBe("(skipped)");
  });
});
