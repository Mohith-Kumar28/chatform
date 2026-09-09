import type { FormDoc } from "./form-doc";

/**
 * Can this form ever learn where to write?
 *
 * Follow-ups need an address, and the API resolves one per response in
 * `resolveRespondentAddress` — from a verified identity, from an answer the
 * respondent typed, or from a hidden field the author named. That resolution is
 * authoritative and happens far too late to help anybody: it runs at
 * abandonment, in a queue, and its failure mode is silence. An author can
 * switch follow-ups on, publish, wait a week and discover the feature never had
 * anywhere to send anything.
 *
 * This is the same question asked of the *document* instead of a response, so
 * the builder and the results page can say it out loud beforehand. It is
 * deliberately the optimistic half — "could this ever work" — because the
 * pessimistic half is a fact about one respondent and cannot be known here.
 */

export type AddressCapability =
  /**
   * Everyone who starts will have a verified address, because they cannot start
   * without signing in. The only source that is a guarantee rather than a hope.
   */
  | "identity"
  /** Somebody who reaches the email question and answers it will have one. */
  | "answer"
  /** Only the visitors whose link carried the named hidden field. */
  | "hidden";

export interface FollowUpReadiness {
  /** Every source this document could produce an address from, strongest first. */
  sources: AddressCapability[];
  /** Nothing at all — follow-ups would schedule zero messages. */
  none: boolean;
  /**
   * True when sign-in is on *and* offers a method that yields an address.
   *
   * Phone verification is deliberately not one: the follow-up channel is email,
   * and a verified phone number is not an email address. The column in
   * `followups` is called `channel` for the day that changes.
   */
  verifiedIdentity: boolean;
}

export function followUpReadiness(doc: FormDoc): FollowUpReadiness {
  const sources: AddressCapability[] = [];

  const auth = doc.settings.requireAuth;
  const verifiedIdentity = Boolean(auth?.enabled && auth.methods.includes("google"));
  if (verifiedIdentity) sources.push("identity");

  if (doc.blocks.some((b) => b.type === "email" || b.type === "contact_info")) {
    sources.push("answer");
  }

  const field = doc.settings.followUp?.addressField;
  if (field && doc.hiddenFields.some((f) => f.name === field)) sources.push("hidden");

  return { sources, none: sources.length === 0, verifiedIdentity };
}
