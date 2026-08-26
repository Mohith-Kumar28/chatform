import { z } from "zod";

/**
 * Who filled the form in, when the form asked.
 *
 * Respondents are deliberately NOT application users: verifying an identity
 * here never creates a Better Auth account, never joins an organization, and
 * never grants access to anything in the dashboard. It is an attestation
 * attached to one chat session and copied onto the resulting submission, so
 * the form owner can see who answered and so duplicate rules have something
 * durable to key on.
 */
export const RespondentIdentity = z.object({
  provider: z.enum(["google", "phone"]),
  /** Stable per-provider id: Google's `sub`, or the E.164 number. */
  subject: z.string().min(1).max(200),
  email: z.string().max(320).nullable().default(null),
  phone: z.string().max(20).nullable().default(null),
  name: z.string().max(200).nullable().default(null),
  pictureUrl: z.string().max(2000).nullable().default(null),
  verifiedAt: z.number().int(),
});
export type RespondentIdentity = z.infer<typeof RespondentIdentity>;

export const RespondentAuthMethod = z.enum(["google", "phone"]);
export type RespondentAuthMethod = z.infer<typeof RespondentAuthMethod>;

/** What the client needs to render the sign-in card, and nothing more. */
export interface AuthChallenge {
  methods: RespondentAuthMethod[];
  message: string;
  /** Set once a code has been sent, so a reload can resume at the code step. */
  phoneSentTo?: string | null;
}

const E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Best-effort E.164 normalization, shared by the phone block validator and the
 * OTP flow so a number verified at sign-in matches a number typed as an answer.
 * Returns null rather than guessing at a number with no country code.
 */
export function normalizeE164(raw: string, defaultDialCode?: string): string | null {
  let v = raw.trim().replace(/[\s\-().]/g, "");
  if (v.startsWith("00")) v = `+${v.slice(2)}`;
  if (/^\d+$/.test(v) && defaultDialCode) v = `+${defaultDialCode.replace(/\D/g, "")}${v}`;
  return E164_RE.test(v) ? v : null;
}
