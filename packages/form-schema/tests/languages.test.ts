import { describe, expect, it } from "vitest";
import {
  FormDoc,
  acceptedLanguages,
  formLanguages,
  formTexts,
  keepsTokens,
  leadFormFixture,
  localizeFormDoc,
  mapFormText,
  pickFormLanguage,
  toPublicConfig,
  validateAnswer,
} from "../src";

/**
 * A translated form has to be the same form: same questions, same options by
 * id, same branching. Only what is read changes. These hold that line.
 */

const doc = () =>
  FormDoc.parse({
    ...structuredClone(leadFormFixture),
    blocks: [
      { id: "blk_role00001", ref: "q_role", type: "single_select", title: "What do you do, {{q_name}}?", required: true, options: [{ id: "opt_student01", label: "Student" }, { id: "opt_working01", label: "Working" }] },
      { id: "blk_team00001", ref: "q_team", type: "field_group", title: "Your team", required: false, fields: [{ id: "fld_name00001", key: "name", label: "Name", kind: "short_text", placeholder: "Full name" }] },
      { id: "blk_contact01", ref: "q_contact", type: "contact_info", title: "How do we reach you?", required: false, fields: ["email", "phone"] },
    ],
  });

const upper = (text: string) => text.toUpperCase();

describe("mapFormText", () => {
  it("changes what is read and nothing else", () => {
    const before = doc();
    const after = mapFormText(before, upper);
    expect(after.blocks.map((b) => [b.id, b.ref, b.type])).toEqual(before.blocks.map((b) => [b.id, b.ref, b.type]));
    const select = after.blocks[0]!;
    expect(select.title).toBe("WHAT DO YOU DO, {{Q_NAME}}?");
    expect(select.type === "single_select" && select.options.map((o) => [o.id, o.label])).toEqual([
      ["opt_student01", "STUDENT"],
      ["opt_working01", "WORKING"],
    ]);
    // A group's columns are text; a contact block's `fields` are names, not text.
    const group = after.blocks[1]!;
    expect(group.type === "field_group" && [group.fields[0]!.key, group.fields[0]!.label, group.fields[0]!.placeholder]).toEqual(["name", "NAME", "FULL NAME"]);
    const contact = after.blocks[2]!;
    expect(contact.type === "contact_info" && contact.fields).toEqual(["email", "phone"]);
    expect(after.endings[0]!.ref).toBe(before.endings[0]!.ref);
    expect(after.logic).toEqual(before.logic);
  });

  it("leaves the original untouched", () => {
    const before = doc();
    mapFormText(before, upper);
    expect(before.blocks[0]!.title).toBe("What do you do, {{q_name}}?");
  });

  it("lists each string once", () => {
    const texts = formTexts(doc());
    expect(texts).toContain("Student");
    expect(texts).toContain("Full name");
    expect(new Set(texts).size).toBe(texts.length);
  });
});

describe("localizeFormDoc", () => {
  const hindi = new Map([
    ["Student", "छात्र"],
    ["What do you do, {{q_name}}?", "{{q_name}}, आप क्या करते हैं?"],
  ]);

  it("is the same document in the form's own language", () => {
    const before = doc();
    expect(localizeFormDoc(before, before.settings.language, hindi)).toBe(before);
  });

  it("translates what it can and leaves the rest as written", () => {
    const shown = localizeFormDoc(doc(), "hi", hindi);
    const select = shown.blocks[0]!;
    expect(select.title).toBe("{{q_name}}, आप क्या करते हैं?");
    expect(select.type === "single_select" && select.options.map((o) => o.label)).toEqual(["छात्र", "Working"]);
    expect(shown.settings.language).toBe("hi");
    expect(shown.settings.agent.language).toBe("hi");
  });

  it("stores the same answer whichever language it was picked in", () => {
    const shown = localizeFormDoc(doc(), "hi", hindi);
    const english = validateAnswer(doc().blocks[0]!, "Student");
    const translated = validateAnswer(shown.blocks[0]!, "छात्र");
    expect(english).toMatchObject({ ok: true, value: "opt_student01" });
    expect(translated).toMatchObject({ ok: true, value: "opt_student01" });
  });

  it("lays an Arabic form out right to left", () => {
    const shown = localizeFormDoc(doc(), "ar", new Map());
    expect(shown.settings.rtl).toBe(true);
    expect(toPublicConfig(shown, { slug: "s", brandingHidden: false, language: "ar" }).rtl).toBe(true);
  });
});

describe("choosing a language", () => {
  it("offers the form's own language first and drops what it cannot read", () => {
    const d = doc();
    d.settings.languages = ["hi", "en", "zz", "hi", "es"];
    expect(formLanguages(d)).toEqual(["en", "hi", "es"]);
  });

  it("ignores region, and falls back to the form's own language", () => {
    expect(pickFormLanguage(["en", "hi"], ["hi-IN"])).toBe("hi");
    expect(pickFormLanguage(["en", "hi"], [undefined, "fr-FR", "HI"])).toBe("hi");
    expect(pickFormLanguage(["en", "hi"], ["fr"])).toBe("en");
  });

  it("reads Accept-Language in order of preference", () => {
    expect(acceptedLanguages("en-GB;q=0.7, hi-IN, *;q=0.1, fr;q=0.9")).toEqual(["hi-IN", "fr", "en-GB"]);
    expect(acceptedLanguages(null)).toEqual([]);
  });
});

describe("keepsTokens", () => {
  it("refuses a translation that lost or reworded a token", () => {
    expect(keepsTokens("Hi {{q_name}}, pick {count}", "नमस्ते {{q_name}}, {count} चुनें")).toBe(true);
    expect(keepsTokens("Hi {{q_name}}", "नमस्ते {{नाम}}")).toBe(false);
    expect(keepsTokens("Pick {count}", "चुनें")).toBe(false);
    expect(keepsTokens("No tokens", "कोई टोकन नहीं")).toBe(true);
  });
});
