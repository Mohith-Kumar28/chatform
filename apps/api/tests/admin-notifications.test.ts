import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { applySchema, seedTenant, type Tenant } from "./helpers.js";
import { runMailJob } from "../src/lib/mail-jobs.js";
import type { Bindings } from "../src/env.js";

/** A new sign-up and a new form, mailed to the platform admins. */

let t: Tenant;
const DB = () => env as unknown as Bindings;

interface Captured {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function captureBinding(): { sent: Captured[]; binding: SendEmail } {
  const sent: Captured[] = [];
  const binding = {
    send: async (msg: unknown) => {
      sent.push(msg as Captured);
      return { messageId: `msg_${sent.length}` } as unknown as EmailSendResult;
    },
  } as unknown as SendEmail;
  return { sent, binding };
}

const ADMINS = "founder@example.com, second@example.com";

beforeAll(async () => {
  await applySchema();
  t = await seedTenant("adminmail");
});

describe("admin notifications", () => {
  it("mails every admin about a new sign-up, linked to the new account", async () => {
    const { sent, binding } = captureBinding();
    const out = await runMailJob(
      { ...DB(), EMAIL: binding, PLATFORM_ADMIN_EMAILS: ADMINS },
      { kind: "admin_new_user", userId: t.userId },
    );

    expect(out.messages).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(["founder@example.com", "second@example.com"]);
    expect(sent[0]?.subject).toBe("chatform new sign-up: adminmail@example.com");
    expect(sent[0]?.text).toContain("email and password");
    expect(sent[0]?.text).toMatch(/\/admin\/accounts\/org_/);
  });

  it("mails every admin about a new form, naming how it was made", async () => {
    const { sent, binding } = captureBinding();
    const out = await runMailJob(
      { ...DB(), EMAIL: binding, PLATFORM_ADMIN_EMAILS: ADMINS },
      { kind: "admin_new_form", formId: t.formId, source: "ai" },
    );

    expect(out.messages).toBe(2);
    expect(sent[0]?.subject).toMatch(/^chatform new form: /);
    expect(sent[0]?.text).toContain("AI generator");
    expect(sent[0]?.text).toContain("adminmail@example.com");
    expect(sent[0]?.text).toContain(`/admin/accounts/${t.orgId}`);
  });

  it("stays quiet about forms an admin made themselves", async () => {
    const { sent, binding } = captureBinding();
    await runMailJob(
      { ...DB(), EMAIL: binding, PLATFORM_ADMIN_EMAILS: "adminmail@example.com" },
      { kind: "admin_new_form", formId: t.formId, source: "builder" },
    );
    expect(sent).toHaveLength(0);
  });

  it("sends nothing when no admins are configured", async () => {
    const { sent, binding } = captureBinding();
    await runMailJob({ ...DB(), EMAIL: binding, PLATFORM_ADMIN_EMAILS: "" }, { kind: "admin_new_user", userId: t.userId });
    expect(sent).toHaveLength(0);
  });
});
