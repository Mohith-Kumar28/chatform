import { z } from "zod";
import { PAYMENT_PROVIDERS } from "./payment-link";

export const FileDescriptor = z.object({
  fileId: z.string(),
  filename: z.string().max(300),
  mime: z.string().max(120),
  size: z.number().int().min(0),
  r2Key: z.string().max(500),
});
export type FileDescriptor = z.infer<typeof FileDescriptor>;

export const AnswerValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(FileDescriptor),
  z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  /**
   * `field_group`: one record per entry, keyed by each field's `key`.
   *
   * A union member one nesting level away from the two above it, and safe
   * beside them because zod refuses an array for a record and refuses an object
   * for `z.array(z.string())` — so a roster can only ever match this one.
   */
  z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))),
  z.object({
    fileId: z.string(),
    r2Key: z.string(),
    signedName: z.string().optional(),
  }),
  z.object({
    accepted: z.boolean(),
    textSha256: z.string().length(64),
    ts: z.number().int(),
  }),
  z.object({
    provider: z.string(),
    url: z.string(),
    slotIso: z.string().optional(),
    confirmedAt: z.number().int().optional(),
  }),
  /**
   * A payment, in one of two very different states of trust.
   *
   * `method: "link" | "upi"` (or absent, on answers from before gateways):
   * payment happened on someone else's checkout page or in the payer's UPI app,
   * so `status: "paid"` is the respondent's word for it and `verified` is always
   * false. `reference` is the code they were asked to put in the payment note,
   * which is what makes a UPI credit traceable back to this response.
   *
   * `method: "gateway"`: written only by the server, from a `respondent_payments`
   * record the admin's own gateway confirmed. `verified` is true, `provider`
   * names the gateway, `paymentRecordId` is our record, `paymentId` the
   * gateway's, and `amount` is what was actually charged. `refunded` is set
   * afterwards when the gateway reports a refund; the answer is kept, because
   * the respondent did pay once and the admin needs to see both halves.
   */
  z.object({
    status: z.enum(["pending", "paid"]),
    method: z.enum(["link", "upi", "gateway"]).optional(),
    verified: z.boolean().optional(),
    reference: z.string().max(40).optional(),
    paymentId: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().max(3).optional(),
    provider: z.enum(PAYMENT_PROVIDERS).optional(),
    paymentRecordId: z.string().max(40).optional(),
    /** Epoch ms, from the gateway where it reports one. */
    paidAt: z.number().int().optional(),
    refunded: z.boolean().optional(),
    /**
     * Confirmed by an account in test mode. Verified, and worth nothing: a
     * published form on a sandbox account accepts public test cards, so the
     * answer carries the fact rather than reading as money received.
     */
    testMode: z.boolean().optional(),
  }),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

/** Map of blockRef → answer value. */
export const AnswerMap = z.record(z.string(), AnswerValue);
export type AnswerMap = z.infer<typeof AnswerMap>;
