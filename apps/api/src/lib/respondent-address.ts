import type { FormDoc } from "@repo/form-schema";

/**
 * Where mail to a respondent goes.
 *
 * This began as a private helper in `mail-jobs.ts` that chose the auto-reply's
 * recipient. Follow-ups need exactly the same answer for a response that was
 * never finished, and forking it would have meant a form that can mail a
 * finisher at the address they typed but not a leaver at that same address. So
 * it lives here, widened, and both callers share it.
 *
 * Sources are tried in order of how much we can trust them, which is also the
 * order of how much we know about consent:
 *
 *  1. A verified identity from the sign-in gate — somebody proved they control
 *     this address.
 *  2. An answer they typed when asked for one, from an `email` block or the
 *     `email` sub-field of a `contact_info` block. Unverified, but volunteered.
 *  3. A hidden field, named explicitly by the author. This is the case where we
 *     mailed them the link in the first place.
 *
 * No heuristics and no PII detection: every source is a block type or a field
 * name the schema already understands, which keeps this a pure function over
 * the published document and testable without a database.
 */

export type AddressSource = "identity" | "answer" | "contact_info" | "hidden";

export interface ResolvedAddress {
  address: string;
  source: AddressSource;
  /** From a `contact_info` block, when it collected one. For the greeting. */
  firstName?: string;
  /** From a `contact_info` block. Unused today; the WhatsApp channel will want it. */
  phone?: string;
}

export interface AddressInputs {
  /** `submissions.respondent_email`, denormalised from the verified identity. */
  respondentEmail?: string | null;
  /** Answers by block ref. */
  byRef: Map<string, unknown>;
  /** `submissions.hidden_fields`, already parsed. */
  hiddenFields?: Record<string, string> | null;
  /** `settings.followUp.addressField` — which hidden field carries the address. */
  addressField?: string;
}

/**
 * A minimal sanity check, not validation.
 *
 * The `email` block already validated its answer through the engine's
 * validators; this exists so a hidden field carrying `"unknown"` or an empty
 * string does not become a send attempt that fails in the queue.
 */
function usable(v: unknown): v is string {
  return typeof v === "string" && v.includes("@") && v.trim().length > 3;
}

export function resolveRespondentAddress(doc: FormDoc, input: AddressInputs): ResolvedAddress | null {
  if (usable(input.respondentEmail)) {
    return { address: input.respondentEmail.trim(), source: "identity" };
  }

  // Document order, so a form asking twice uses the one the author put first.
  for (const block of doc.blocks) {
    if (block.type === "email") {
      const v = input.byRef.get(block.ref);
      if (usable(v)) return { address: v.trim(), source: "answer" };
    }
    if (block.type === "contact_info") {
      // The answer is a map of the block's fields to their values, so one
      // lookup yields the address, a name to greet them by, and a phone number.
      const v = input.byRef.get(block.ref);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const rec = v as Record<string, unknown>;
        if (usable(rec.email)) {
          return {
            address: rec.email.trim(),
            source: "contact_info",
            ...(typeof rec.first_name === "string" && rec.first_name.trim()
              ? { firstName: rec.first_name.trim() }
              : {}),
            ...(typeof rec.phone === "string" && rec.phone.trim() ? { phone: rec.phone.trim() } : {}),
          };
        }
      }
    }
  }

  /**
   * Named by the author rather than matched on a magic `email` key. Hidden
   * field names are author-chosen — `lead_email`, `contact`, whatever their CRM
   * calls it — and guessing would work for exactly the forms that did not need
   * the feature to guess.
   */
  if (input.addressField && input.hiddenFields) {
    const v = input.hiddenFields[input.addressField];
    if (usable(v)) return { address: v.trim(), source: "hidden" };
  }

  return null;
}
