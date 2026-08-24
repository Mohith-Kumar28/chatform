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
  z.object({
    status: z.enum(["pending", "paid"]),
    paymentId: z.string().optional(),
    amount: z.number(),
  }),
]);
export type AnswerValue = z.infer<typeof AnswerValue>;

/** Map of blockRef → answer value. */
export const AnswerMap = z.record(z.string(), AnswerValue);
export type AnswerMap = z.infer<typeof AnswerMap>;
