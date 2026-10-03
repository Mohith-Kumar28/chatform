import { describe, expect, it } from "vitest";
import { FEATURE_KEYS, resolve } from "@repo/entitlements";
import { FormDoc, SETTINGS_REGISTRY, applySettingOps, leadFormFixture, type SettingDef } from "@repo/form-schema";
import { stripForPublish } from "../src/lib/doc-entitlements.js";

/**
 * The builder AI's settings list and publish must agree on what is paid.
 *
 * The AI refuses a locked setting at proposal time, and publish strips one the
 * author set by hand. If the two drifted, the AI would either refuse something
 * free or offer something publish then quietly removes.
 */

const free = resolve({ planId: "free", status: "none", now: Date.now() });
const base = () => FormDoc.parse(structuredClone(leadFormFixture));

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
      return "a@example.com";
    case "list":
      return "pricing";
    case "font":
      return "Lora";
    case "language":
      return "hi";
    case "languages":
      return "hi";
    case "date":
      return "2026-10-30T18:00";
  }
}

describe("settings registry gates", () => {
  it("names only real features", () => {
    for (const d of SETTINGS_REGISTRY) {
      if (d.feature) expect(FEATURE_KEYS).toContain(d.feature);
    }
  });

  it("starts from a document publish leaves alone on free", () => {
    expect(stripForPublish(base(), free).stripped).toEqual([]);
  });

  it.each(SETTINGS_REGISTRY.map((d) => [d.key, d] as const))("%s is gated exactly where publish strips it", (_key, d) => {
    // Sign-in is on for the method check, so the method has something to gate.
    const start =
      d.key === "settings.requireAuth.method"
        ? applySettingOps(base(), [{ key: "settings.requireAuth.enabled", value: "true" }]).doc
        : base();
    const startStripped = new Set(stripForPublish(start, free).stripped.map((s) => s.feature));
    const { doc, changes } = applySettingOps(start, [{ key: d.key, value: sample(d) }]);
    const change = changes.find((c) => c.key === d.key)!;
    const needs = d.gate?.(change.after, doc) ?? null;
    const stripped = stripForPublish(doc, free).stripped.map((s) => s.feature).filter((f) => !startStripped.has(f));
    if (needs && !startStripped.has(needs as never)) expect(stripped).toContain(needs);
    else expect(stripped).toEqual([]);
  });
});
