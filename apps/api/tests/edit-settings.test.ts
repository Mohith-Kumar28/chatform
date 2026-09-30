import { describe, expect, it } from "vitest";
import { resolve } from "@repo/entitlements";
import { FormDoc, leadFormFixture } from "@repo/form-schema";
import { z } from "zod";
import { checkSettingsDraft, lockPaidBlockOptions, settingsDraftFields, settingsPrompt } from "../src/lib/edit-settings.js";
import type { RequestRoute } from "../src/lib/settings-route.js";

const free = resolve({ planId: "free", status: "none", now: Date.now() });
const pro = resolve({ planId: "pro", status: "active", now: Date.now() });
const base = () => FormDoc.parse(structuredClone(leadFormFixture));
const route = (sections: RequestRoute["sections"], more: Partial<RequestRoute> = {}): RequestRoute => ({
  sections,
  asksHowTo: false,
  wantsKnowledge: false,
  call: null,
  fellBack: false,
  ...more,
});

describe("settingsPrompt", () => {
  it("shows only the sections Jev picked, and always the map", () => {
    const { text, keys } = settingsPrompt(base(), route(["closing"]), pro);
    expect(text).toContain("Where things are in the builder");
    expect(text).toContain("settings.closeRules.maxSubmissions");
    expect(text).not.toContain("theme.accent");
    expect(keys.every((k) => k.startsWith("settings.closeRules."))).toBe(true);
  });

  it("names a locked setting as locked and keeps it out of the keys", () => {
    const { text, keys } = settingsPrompt(base(), route(["display"]), free);
    expect(text).toMatch(/settings\.branding\.hidePoweredBy.*LOCKED: needs Pro/);
    expect(keys).not.toContain("settings.branding.hidePoweredBy");
    expect(keys).toContain("settings.progressBar");
  });

  it("sends no settings at all for a question edit", () => {
    const { text, keys } = settingsPrompt(base(), route([]), pro);
    expect(keys).toEqual([]);
    expect(text).not.toContain("Form settings you can change");
  });

  it("tells a free plan which question options are paid", () => {
    expect(settingsPrompt(base(), route([]), free).text).toContain("verify=true");
    expect(settingsPrompt(base(), route([]), resolve({ planId: "business", status: "active", now: Date.now() })).text).not.toContain("verify=true");
  });
});

describe("settingsDraftFields", () => {
  it("refuses a key outside this request's enum at the schema", () => {
    const schema = z.object(settingsDraftFields(["settings.agent.tone"]));
    expect(schema.safeParse({ settings: [{ key: "settings.agent.tone", value: "playful" }] }).success).toBe(true);
    expect(schema.safeParse({ settings: [{ key: "settings.password.value", value: "x" }] }).success).toBe(false);
  });
});

describe("checkSettingsDraft", () => {
  it("applies what parses and reports what does not", () => {
    const r = checkSettingsDraft(
      base(),
      {
        settings: [
          { key: "theme.accent", value: "#1E40AF" },
          { key: "settings.closeRules.maxSubmissions", value: "lots" },
        ],
      },
      pro,
    );
    expect(r.doc.theme.accent).toBe("#1E40AF");
    expect(r.settings.map((c) => c.key)).toEqual(["theme.accent"]);
    expect(r.rejected[0]).toMatch(/maxSubmissions: a whole number/);
  });

  it("marks knowledge past the plan's source limit as locked", () => {
    const r = checkSettingsDraft(
      base(),
      { knowledge: [{ kind: "link", url: "acme.com/faq" }, { kind: "text", title: "Refunds", body: "30 days." }] },
      free,
      { usedSources: 2 },
    );
    expect(r.knowledge).toEqual([
      { kind: "link", url: "https://acme.com/faq" },
      { kind: "text", title: "Refunds", body: "30 days.", locked: { limit: "knowledge_sources_count" } },
    ]);
  });

  it("refuses a link that is not one", () => {
    expect(checkSettingsDraft(base(), { knowledge: [{ kind: "link", url: "our faq" }] }, pro).rejected).toHaveLength(1);
  });
});

describe("lockPaidBlockOptions", () => {
  it("takes verification back off a new question on free, and says so", () => {
    const b = base();
    const proposed = structuredClone(b);
    const email = proposed.blocks.find((x) => x.type === "email")!;
    if (email.type === "email") email.verify = true;
    const { doc, locked } = lockPaidBlockOptions(b, proposed, free);
    const out = doc.blocks.find((x) => x.ref === email.ref)!;
    expect(out.type === "email" && out.verify).toBe(false);
    expect(locked[0]).toMatchObject({ locked: { feature: "verified_answers" } });
    expect(lockPaidBlockOptions(b, proposed, resolve({ planId: "business", status: "active", now: Date.now() })).locked).toEqual([]);
  });
});
