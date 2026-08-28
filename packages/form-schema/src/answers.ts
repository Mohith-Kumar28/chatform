import { z } from "zod";

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
    reference: z.string().max(40).optional(),
    paymentId: z.string().optional(),
    amount: z.number().optional(),
    currency: z.string().max(3).optional(),
  }),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

/** Map of blockRef → answer value. */
export const AnswerMap = z.record(z.string(), AnswerValue);
export type AnswerMap = z.infer<typeof AnswerMap>;
