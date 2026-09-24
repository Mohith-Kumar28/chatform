import type { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import { getEntitlements } from "../entitlements.js";
import { listAccounts } from "./accounts.js";
import { gatewayEnabled } from "./flag.js";

/** Rupees only on these, as the builder pins them (`INR_ONLY_PROVIDERS` on the web side). */
const INR_ONLY = new Set(["razorpay", "cashfree"]);

/**
 * Point the AI's new payment questions at the organization's default account.
 *
 * A model cannot choose an account: it cannot see them, and must never invent
 * an id. So drafts write a payment as a plain link, and this upgrades the ones
 * that are only that because nothing better was known: new in this document,
 * `link`, and with no link or UPI id of their own. A question the model gave a
 * real checkout URL or UPI id to keeps it, since the author asked for exactly
 * that, and so does every question the form already had.
 *
 * Nothing happens without a default to use: the flag off, a plan without
 * `collect_payments`, or no working account all leave the draft as it was.
 */
export async function withDefaultPaymentAccount(
  env: Bindings,
  orgId: string | null | undefined,
  doc: FormDoc,
  before?: FormDoc,
): Promise<FormDoc> {
  if (!orgId) return doc;
  const existing = new Set((before?.blocks ?? []).map((b) => b.ref));
  const candidates = new Set(
    doc.blocks
      .filter((b) => b.type === "payment" && b.method === "link" && !b.url && !b.upiId && !existing.has(b.ref))
      .map((b) => b.ref),
  );
  if (candidates.size === 0) return doc;
  if (!gatewayEnabled(env, orgId)) return doc;

  try {
    const ent = await getEntitlements(env, orgId);
    if (!ent.features.collect_payments) return doc;
    const account = (await listAccounts(env, orgId)).find((a) => a.isDefault && a.status === "active");
    if (!account) return doc;

    return {
      ...doc,
      blocks: doc.blocks.map((b) => {
        if (b.type !== "payment" || !candidates.has(b.ref)) return b;
        const currency = INR_ONLY.has(account.provider) ? "INR" : (account.currencies[0] ?? b.currency);
        return { ...b, method: "gateway" as const, paymentAccountId: account.id, currency: currency.toUpperCase() };
      }),
    };
  } catch (err) {
    // A draft is still a draft without this: the author can pick the account by hand.
    console.error("default_payment_account_failed", {
      orgId,
      errName: err instanceof Error ? err.name : "unknown",
      errMessage: err instanceof Error ? err.message : String(err),
    });
    return doc;
  }
}
