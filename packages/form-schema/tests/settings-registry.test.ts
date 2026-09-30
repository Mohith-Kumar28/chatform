import { describe, expect, it } from "vitest";
import {
  FormDoc,
  SETTINGS_REGISTRY,
  SETTING_SECTION_IDS,
  applySettingOps,
  leadFormFixture,
  parseSettingValue,
  renderSettingsForPrompt,
  settingDef,
  settingKeysFor,
  type SettingDef,
} from "../src/index.js";

const base = () => FormDoc.parse(structuredClone(leadFormFixture));
const all = () => true;
const none = () => false;

/** A value each format accepts, different from every default. */
function sample(d: SettingDef): string {
  switch (d.format) {
    case "color":
      return "#1E40AF";
    case "bool":
      return String(!(d.get(base()) ?? false));
    case "enum":
      return d.options!.find((o) => o.value !== d.get(base()))!.value;
    case "int":
      return String(d.get(base()) === (d.min ?? 0) + 1 ? (d.min ?? 0) + 2 : (d.min ?? 0) + 1);
    case "text":
    case "longtext":
      return "A new value";
    case "url":
      return "https://example.com/thanks";
    case "emails":
      return "a@example.com; b@example.com";
    case "list":
      return "pricing\nlegal advice";
    case "font":
      return "Lora";
    case "language":
      return "hi";
    case "date":
      return "2026-10-30T18:00";
  }
}

describe("settings registry", () => {
  it("has one entry per key, each in a known section", () => {
    const keys = SETTINGS_REGISTRY.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const d of SETTINGS_REGISTRY) expect(SETTING_SECTION_IDS).toContain(d.section);
  });

  // The document schema catches bad values back to defaults, so a registry
  // entry pointing at the wrong path, or accepting what the schema drops,
  // would "apply" and then vanish on the next read.
  it.each(SETTINGS_REGISTRY.map((d) => [d.key, d] as const))("%s survives a re-parse of the document", (_key, d) => {
    const { doc, changes, rejected } = applySettingOps(base(), [{ key: d.key, value: sample(d) }]);
    expect(rejected).toEqual([]);
    expect(changes).toHaveLength(1);
    const reread = FormDoc.parse(JSON.parse(JSON.stringify(doc)));
    expect(d.get(reread)).toEqual(changes[0]!.after);
  });

  it("refuses values the document would silently replace", () => {
    const accent = settingDef("theme.accent")!;
    expect(parseSettingValue(accent, "url(evil)").ok).toBe(false);
    expect(parseSettingValue(settingDef("theme.fontBody")!, "Comic Sans Deluxe").ok).toBe(false);
    expect(parseSettingValue(settingDef("settings.onComplete.notificationEmails")!, "not-an-email").ok).toBe(false);
    expect(parseSettingValue(settingDef("settings.agent.escalateAfterInvalid")!, "40").ok).toBe(false);
  });

  it("reads an enum by its builder label too", () => {
    expect(parseSettingValue(settingDef("theme.radius")!, "Pill")).toEqual({ ok: true, value: "full" });
  });

  it("writes a local closing time in the author's zone", () => {
    // India is UTC+5:30, which the browser reports as -330.
    const parsed = parseSettingValue(settingDef("settings.closeRules.closeAt")!, "2026-10-30T18:00", { utcOffsetMinutes: -330 });
    expect(parsed).toEqual({ ok: true, value: "2026-10-30T12:30:00.000Z" });
  });

  it("clears an optional setting with an empty value", () => {
    const withLimit = applySettingOps(base(), [{ key: "settings.closeRules.maxSubmissions", value: "200" }]).doc;
    const { doc, changes } = applySettingOps(withLimit, [{ key: "settings.closeRules.maxSubmissions", value: "" }]);
    expect(changes[0]).toMatchObject({ before: 200, after: undefined });
    expect(doc.settings.closeRules.maxSubmissions).toBeUndefined();
  });

  it("reports a change to what is already true as no change", () => {
    const { changes } = applySettingOps(base(), [{ key: "settings.agent.tone", value: base().settings.agent.tone }]);
    expect(changes).toEqual([]);
  });

  it("reports and undoes a locked change, and keeps the free ones", () => {
    const { doc, changes } = applySettingOps(
      base(),
      [
        { key: "settings.branding.hidePoweredBy", value: "true" },
        { key: "settings.agent.tone", value: "professional" },
      ],
      { allowed: none },
    );
    expect(changes.find((c) => c.key === "settings.branding.hidePoweredBy")?.locked).toEqual({ feature: "remove_branding" });
    expect(doc.settings.branding.hidePoweredBy).toBe(false);
    expect(doc.settings.agent.tone).toBe("professional");
  });

  it("judges sign-in by the method it lands on, whichever op came first", () => {
    const { changes } = applySettingOps(
      base(),
      [
        { key: "settings.requireAuth.enabled", value: "true" },
        { key: "settings.requireAuth.method", value: "phone" },
      ],
      { allowed: (f) => f === "respondent_auth_google" },
    );
    expect(changes.map((c) => c.locked?.feature)).toEqual(["respondent_auth_phone", "respondent_auth_phone"]);
  });

  it("does not gate turning a paid setting off", () => {
    const on = applySettingOps(base(), [{ key: "settings.branding.hidePoweredBy", value: "true" }]).doc;
    const { changes } = applySettingOps(on, [{ key: "settings.branding.hidePoweredBy", value: "false" }], { allowed: none });
    expect(changes[0]?.locked).toBeUndefined();
  });

  it("offers a free plan no setting that is paid on every value", () => {
    const keys = settingKeysFor(SETTING_SECTION_IDS, none);
    expect(keys).not.toContain("settings.branding.hidePoweredBy");
    expect(keys).not.toContain("theme.fontBody");
    expect(keys).toContain("settings.requireAuth.method");
    expect(keys).toContain("theme.accent");
    expect(settingKeysFor(SETTING_SECTION_IDS, all)).toHaveLength(SETTINGS_REGISTRY.length);
  });

  it("lists only the sections asked for", () => {
    const text = renderSettingsForPrompt(base(), ["closing"], new Set(settingKeysFor(["closing"], all)), () => null);
    expect(text).toContain("settings.closeRules.maxSubmissions");
    expect(text).not.toContain("theme.accent");
  });
});
