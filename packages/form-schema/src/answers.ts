import { z } from "zod";
import { boundedString } from "@repo/guard";

export const FileDescriptor = z.object({
  fileId: z.string().max(64),
  filename: boundedString(300),
  mime: boundedString(120),
  size: z.number().int().min(0),
  r2Key: z.string().max(500),
});
export type FileDescriptor = z.infer<typeof FileDescriptor>;

/**
 * The widest an answer string may be, at the shape layer.
 *
 * Every answer has already been through `validateAnswer`, which applies the
 * block's own limit — `maxLength` on a short text is capped at 500 by the
 * schema, a long text at 5000. This is the backstop for the paths that build
 * an `AnswerMap` without going through a block: a resumed draft, an imported
 * response, a value replayed out of storage. It is the long-text ceiling, so
 * it never contradicts a block's own rule.
 */
const ANSWER_MAX = 5000;

export const AnswerValue = z.union([
  boundedString(ANSWER_MAX),
  z.number(),
  z.boolean(),
  z.array(boundedString(ANSWER_MAX)).max(100),
  z.array(FileDescriptor).max(10),
  z.record(boundedString(200), z.union([boundedString(ANSWER_MAX), z.array(boundedString(ANSWER_MAX)).max(100)])),
  /**
   * `field_group`: one record per entry, keyed by each field's `key`.
   *
   * A union member one nesting level away from the two above it, and safe
   * beside them because zod refuses an array for a record and refuses an object
   * for `z.array(z.string())` — so a roster can only ever match this one.
   */
  z.array(z.record(boundedString(200), z.union([boundedString(ANSWER_MAX), z.number(), z.boolean()]))).max(20),
  z.object({
    fileId: z.string().max(64),
    r2Key: z.string().max(500),
    signedName: boundedString(200).optional(),
  }),
  z.object({
    accepted: z.boolean(),
    textSha256: z.string().length(64),
    ts: z.number().int(),
  }),
  z.object({
    provider: boundedString(60),
    url: boundedString(1000),
    slotIso: z.string().max(40).optional(),
    confirmedAt: z.number().int().optional(),
  }),
  /**
   * Payment happens on someone else's checkout page or in the payer's UPI app,
   * so `status: "paid"` is the respondent's word for it. `verified` says
   * whether anything actually checked — always false while payment is external.
   * `reference` is the code they were asked to put in the payment note, which
   * is what makes a UPI credit traceable back to this response.
   */
  z.object({
    status: z.enum(["pending", "paid"]),
    method: z.enum(["link", "upi"]).optional(),
    verified: z.boolean().optional(),
    reference: boundedString(40).optional(),
    paymentId: z.string().optional(),
    amount: z.number().optional(),
    currency: boundedString(3).optional(),
  }),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

/** Map of blockRef → answer value. */
export const AnswerMap = z.record(z.string(), AnswerValue);
export type AnswerMap = z.infer<typeof AnswerMap>;
