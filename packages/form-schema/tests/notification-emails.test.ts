import { describe, expect, it } from "vitest";
import { MAX_NOTIFICATION_EMAILS, SettingsDoc } from "../src/settings";

describe("onComplete.notificationEmails", () => {
  const list = (n: number) => Array.from({ length: n }, (_, i) => `owner${i}@example.com`);

  it("takes up to the cap", () => {
    const r = SettingsDoc.safeParse({ onComplete: { notificationEmails: list(MAX_NOTIFICATION_EMAILS) } });
    expect(r.success).toBe(true);
  });

  it("refuses one past the cap", () => {
    const r = SettingsDoc.safeParse({ onComplete: { notificationEmails: list(MAX_NOTIFICATION_EMAILS + 1) } });
    expect(r.success).toBe(false);
  });
});
