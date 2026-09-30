import { describe, it, expect } from "vitest";
import { lintFormDoc } from "@repo/form-schema";
import { applySourceForm, applySourceFormToDoc, linkedFormSection, mergeSourceForms, sourceFormOf } from "../src/lib/form-import.js";
import { parseGoogleData, readGoogleForm } from "../src/lib/import/google.js";
import { readHtmlForm } from "../src/lib/import/html-form.js";

/** What `formInPage` gives the AI builder for a page with no embedded builder link, synchronously. */
function extractSourceForm(html: string, url: string) {
  const google = parseGoogleData(html);
  const form = google ? readGoogleForm(google, url, html) : readHtmlForm(html, url);
  return form ? sourceFormOf(form) : null;
}
import { draftToDoc } from "../src/lib/draft-normalize.js";
import type { GenerationDraft } from "../src/lib/ai.js";

/** The shape of a public Google Form's `FB_PUBLIC_LOAD_DATA_`, trimmed to what we read. */
const googleData = [
  null,
  [
    "Tell us about you.",
    [
      [1, "FULL NAME", "", 0, [[11, null, 1, null, null]]],
      [2, "Email Address", "We reply here.", 0, [[12, null, 1, null, [[2, 102]]]]],
      [3, "PRONOUNS", "", 2, [[13, [["She/Her", null, null, null, 0], ["He/Him", null, null, null, 0], ["", null, null, null, 1]], 1, null, null]]],
      [4, "Country", "", 3, [[14, [["India", null, null, null, 0], ["Nepal", null, null, null, 0]], 0, null, null]]],
      [5, "Interested in running brackets?", "", 2, [[15, [["Yes", null, -2, null, 0], ["No, other ways", null, 9, null, 0]], 1, null, null]]],
      [6, "Bracket experience", "", 4, [[16, [["Paper", null, null, null, 0], ["Tablet", null, null, null, 0]], 0, null, null]]],
      [9, "Other roles", "", 8, null],
      [7, "How sure are you?", "", 5, [[17, [["1"], ["2"], ["3"], ["4"], ["5"]], 1, ["Not at all", "Very"]]]],
      [8, "Anything else?", "", 1, [[18, null, 0, null, null]]],
      [10, null, null, 11, null, null, ["img"]],
    ],
    null, null, null, null, null, null,
    "Volunteer Application",
  ],
  "/forms",
  "Volunteer Application (file name)",
];
const googleHtml = `<html><body><div>Loading</div><script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(googleData)};</script></body></html>`;

describe("extractSourceForm: Google Forms", () => {
  const form = extractSourceForm(googleHtml, "https://forms.gle/x")!;

  it("reads every question exactly, with its type and required flag", () => {
    expect(form.provider).toBe("google_forms");
    expect(form.title).toBe("Volunteer Application");
    expect(form.description).toBe("Tell us about you.");
    expect(form.fields.map((f) => [f.title, f.type, f.required])).toEqual([
      ["FULL NAME", "short_text", true],
      ["Email Address", "email", true],
      ["PRONOUNS", "single_select", true],
      ["Country", "dropdown", false],
      ["Interested in running brackets?", "single_select", true],
      ["Bracket experience", "multi_select", false],
      // A section header is words for the respondent, and the target of its jump.
      ["Other roles", "statement", false],
      ["How sure are you?", "opinion_scale", true],
      ["Anything else?", "long_text", false],
    ]);
  });

  it("keeps options in order, the Other box, section jumps and scale labels", () => {
    const [, email, pronouns, country, brackets, , , scale] = form.fields;
    expect(email!.description).toBe("We reply here.");
    expect(pronouns!.options).toEqual(["She/Her", "He/Him"]);
    expect(pronouns!.allowOther).toBe(true);
    expect(country!.options).toEqual(["India", "Nepal"]);
    expect(brackets!.jumps).toEqual({ "No, other ways": "question: Other roles" });
    expect(scale!.scale).toBe(5);
    expect(scale!.scaleLabels).toEqual({ low: "Not at all", high: "Very", startAt: 1 });
  });

  it("puts every field in the prompt under its src ref, as JSON strings", () => {
    const prompt = linkedFormSection(form, "create");
    expect(prompt).toContain(`- src_1 | short_text? | required | title="FULL NAME"`);
    expect(prompt).toContain(`options=["India","Nepal"]`);
    expect(prompt).toContain(`- src_7 | statement | optional | title="Other roles"`);
  });
});

describe("extractSourceForm: HTML forms", () => {
  const html = `<html><head><title>Contact us | Acme</title></head><body>
    <h1>Contact Acme</h1>
    <form role="search" action="/search"><input name="q" placeholder="Search"></form>
    <form action="/contact" method="post">
      <label for="n">Full name *</label><input id="n" name="name" required>
      <label>Work email <input type="email" name="email" required></label>
      <label for="p">Phone</label><input id="p" type="tel" name="phone">
      <label for="s">Company size</label>
      <select id="s" name="size" required><option value="">Select one…</option><option>1-10</option><option>11-50</option><option value="51+">51+ &amp; more</option></select>
      <fieldset><legend>How did you hear about us?</legend>
        <label><input type="radio" name="src" value="g"> Google</label>
        <label><input type="radio" name="src" value="f"> A friend</label>
      </fieldset>
      <label for="m">Message</label><textarea id="m" name="message"></textarea>
      <label><input type="checkbox" name="terms" required> I agree to the terms</label>
      <input type="hidden" name="csrf" value="x"><button type="submit">Send</button>
    </form></body></html>`;
  const form = extractSourceForm(html, "https://acme.test/contact")!;

  it("reads labels, types, options and required from the markup, skipping the search box", () => {
    expect(form.provider).toBe("website");
    expect(form.title).toBe("Contact Acme");
    expect(form.fields.map((f) => [f.title, f.type, f.required])).toEqual([
      ["Full name", "short_text", true],
      ["Work email", "email", true],
      ["Phone", "phone", false],
      ["Company size", "dropdown", true],
      ["How did you hear about us?", "single_select", false],
      ["Message", "long_text", false],
      ["I agree to the terms", "yes_no", true],
    ]);
    expect(form.fields[3]!.options).toEqual(["1-10", "11-50", "51+ & more"]);
    expect(form.fields[4]!.options).toEqual(["Google", "A friend"]);
  });

  it("ignores a page whose only form is one box", () => {
    expect(extractSourceForm(`<form><input type="email" name="e" placeholder="Your email"></form>`, "x")).toBeNull();
  });
});

describe("extractSourceForm: a React form with plain text boxes and button choices", () => {
  // The shape of tgmlabs.co/vc: a honeypot, no `required` anywhere, and a choice drawn as buttons.
  const html = `<h1>Running a VC portfolio?</h1><form>
    <input type="text" tabindex="-1" autoComplete="off" aria-hidden="true" name="company"/>
    <div><label><span>Name</span><input type="text" placeholder="your full name" name="name"/></label>
    <label><span>Email</span><input type="text" placeholder="work@company.com" name="email"/></label></div>
    <label><span>Firm Website</span><input type="text" placeholder="https://" name="firmWebsite"/></label>
    <div><span>Portfolio company type you&#x27;re investing in</span><div>
      <button type="button">B2B SaaS</button><button type="button">Fintech</button><button type="button">Other</button></div></div>
    <label><span>Where did you hear about us?</span><input type="text" placeholder="Referral, LinkedIn..." name="source"/></label>
    <button type="submit">Submit the case</button></form>`;
  const form = extractSourceForm(html, "https://x.test/vc")!;

  it("skips the honeypot and reads the button choice in its place", () => {
    expect(form.fields.map((f) => f.title)).toEqual([
      "Name", "Email", "Firm Website", "Portfolio company type you're investing in", "Where did you hear about us?",
    ]);
    const choice = form.fields[3]!;
    expect([choice.options, choice.allowOther, choice.typeKnown]).toEqual([["B2B SaaS", "Fintech"], true, false]);
  });

  it("types a plain text box from its name and placeholder, and leaves the rest to the generator", () => {
    expect(form.fields.map((f) => [f.type, f.typeKnown])).toEqual([
      ["short_text", false], ["email", true], ["url", true], ["multi_select", false], ["short_text", false],
    ]);
    expect(form.fields[0]!.placeholder).toBe("your full name");
    // Nothing on the page is marked required, so none of it is a copy of "optional".
    expect(form.fields.every((f) => !f.requiredKnown)).toBe(true);
  });

  // The words are the model's, the options the page's.
  it("keeps the generator's type and required flag where the page said nothing", () => {
    const draft: GenerationDraft = {
      title: "VC",
      description: "",
      blocks: [
        { ref: "welcome", type: "welcome", title: "Hi", description: "", required: false, options: [], scale: 0, config: "" },
        { ref: "src_1", type: "short_text", title: "What's your name?", description: "", required: true, options: [], scale: 0, config: "" },
        { ref: "src_2", type: "short_text", title: "What's your email?", description: "", required: true, options: [], scale: 0, config: "" },
        { ref: "src_3", type: "url", title: "What's your firm website?", description: "", required: false, options: [], scale: 0, config: "" },
        { ref: "src_4", type: "single_select", title: "What's the portfolio company type you're investing in?", description: "", required: true, options: ["x"], scale: 0, config: "" },
        { ref: "src_5", type: "single_select", title: "Where did you hear about us?", description: "", required: false, options: ["LinkedIn", "Referral"], scale: 0, config: "" },
      ],
      endings: [{ ref: "end", title: "Thanks", body: "", kind: "success", requirements: "", redirectUrl: "" }],
      branches: [],
    };
    const fixed = applySourceForm(draft, form).blocks;
    expect(fixed.map((b) => [b.title, b.type, b.required, b.options])).toEqual([
      ["Hi", "welcome", false, []],
      ["What's your name?", "short_text", true, []],
      ["What's your email?", "email", true, []],
      ["What's your firm website?", "url", false, []],
      ["What's the portfolio company type you're investing in?", "single_select", true, ["B2B SaaS", "Fintech"]],
      ["Where did you hear about us?", "single_select", false, ["LinkedIn", "Referral"]],
    ]);
    const doc = applySourceFormToDoc(draftToDoc(applySourceForm(draft, form)).doc, form);
    const name = doc.blocks.find((b) => b.title === "What's your name?")!;
    expect(name.type === "short_text" && name.placeholder).toBe("your full name");
  });
});

describe("mergeSourceForms", () => {
  it("keeps every linked form, tagged, in the order given", () => {
    const a = extractSourceForm(`<form><label>A1<input name="a1"></label><label>A2<input name="a2"></label></form>`, "https://x.test/a")!;
    const b = extractSourceForm(`<form><label>B1<input name="b1"></label><label>B2<input name="b2"></label></form>`, "https://x.test/b")!;
    const merged = mergeSourceForms([a, b])!;
    expect(merged.fields.map((f) => f.title)).toEqual(["A1", "A2", "B1", "B2"]);
    expect(linkedFormSection(merged, "create")).toContain("== form");
  });
});

describe("applySourceForm", () => {
  const form = extractSourceForm(googleHtml, "https://forms.gle/x")!;
  const block = (over: Partial<GenerationDraft["blocks"][number]>): GenerationDraft["blocks"][number] => ({
    ref: "q",
    type: "short_text",
    title: "Q",
    description: "",
    required: false,
    options: [],
    scale: 0,
    config: "",
    ...over,
  });
  // A model that reworded, retyped, dropped fields and added one of its own.
  const draft: GenerationDraft = {
    title: "Volunteer",
    description: "",
    blocks: [
      block({ ref: "welcome", type: "welcome", title: "Hi there!" }),
      block({ ref: "src_1", title: "What's your full name?" }),
      block({ ref: "src_3", type: "multi_select", title: "Your pronouns", options: ["she", "he"] }),
      block({ ref: "src_5", type: "single_select", title: "Brackets?", options: ["Yes", "No, other ways"], required: true }),
      block({ ref: "q_extra", title: "Your Discord?" }),
    ],
    endings: [{ ref: "end_thanks", title: "Thanks", body: "", kind: "success", requirements: "", redirectUrl: "" }],
    branches: [{ whenRef: "src_5", op: "eq", value: "No, other ways", then: "end_thanks" }],
  };

  it("overwrites wording, type and options, and restores dropped fields in order", () => {
    const fixed = applySourceForm(draft, form);
    expect(fixed.blocks.map((b) => b.ref)).toEqual([
      "welcome", "src_1", "src_2", "src_3", "src_4", "src_5", "src_6", "src_7", "src_8", "src_9", "q_extra",
    ]);
    const pronouns = fixed.blocks.find((b) => b.ref === "src_3")!;
    // The model's wording stands; type, options and required are the source's.
    expect([pronouns.title, pronouns.type, pronouns.options, pronouns.required]).toEqual([
      "Your pronouns", "single_select", ["She/Her", "He/Him"], true,
    ]);
    expect(fixed.blocks.find((b) => b.ref === "q_extra")!.title).toBe("Your Discord?");
  });

  it("builds a doc with the exact words, readable refs, and the branch still wired", () => {
    const { doc } = draftToDoc(applySourceForm(draft, form));
    const out = applySourceFormToDoc(doc, form);
    const byTitle = Object.fromEntries(out.blocks.map((b) => [b.title, b]));
    expect(byTitle["What's your full name?"]!.ref).toBe("full_name");
    // Dropped by the model and put back: the source's own words.
    expect(byTitle["Email Address"]!.type).toBe("email");
    const pronouns = byTitle["Your pronouns"]!;
    expect(pronouns.type === "single_select" && pronouns.allowOther).toBe(true);
    const scale = byTitle["How sure are you?"]!;
    // Already a question: kept exactly.
    expect(scale.type === "opinion_scale" && [scale.steps, scale.labelLow, scale.labelHigh]).toEqual([5, "Not at all", "Very"]);
    const brackets = byTitle["Brackets?"]!;
    expect(out.logic.some((r) => r.action_kind === "goto" && r.from === brackets.ref && r.target === "end_thanks")).toBe(true);
    expect(JSON.stringify(out)).not.toContain("src_");
    expect(lintFormDoc(out).filter((i) => i.level === "error")).toEqual([]);
  });

  it("gives the form a welcome when the model put a source question first", () => {
    const fixed = applySourceForm({ ...draft, blocks: draft.blocks.slice(1) }, form);
    expect(fixed.blocks[0]!.type).toBe("welcome");
    expect(fixed.blocks[1]!.ref).toBe("src_1");
  });
});
