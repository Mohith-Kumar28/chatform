import { sha256Hex, canonicalJson } from "@repo/form-schema";
import type { PlanId } from "@repo/entitlements";

/**
 * Whether a form's draft has drifted from what is live.
 *
 * With autosave there are two clocks — "saved" and "published" — and the header used to
 * show only the first. Someone who edited a live form five minutes after publishing it
 * had no way to tell whether the version their respondents were answering included that
 * edit, and the Publish button looked identical either way.
 *
 * The answer has to be exact, because a wrong one in either direction is worse than none:
 * a false "up to date" hides an unpublished change, and a false "edited" nags someone into
 * republishing a form that has not moved.
 */

/**
 * The fingerprint of a draft, as it would be published on a given plan.
 *
 * Two inputs, both of which genuinely change what respondents get:
 *
 * - the working document, canonicalised so that key order and whitespace — which the
 *   editor reorders constantly — do not read as edits;
 * - the plan, because `stripForPublish` removes gated settings from the published
 *   version. The same draft published on Free and on Business is two different live
 *   forms, so an upgrade has to mark the draft publishable again. Nothing else would
 *   ever tell someone that the branding they just paid for is not live yet.
 */
export function publishFingerprint(workingSchema: string, planId: PlanId): string {
  return sha256Hex(`${canonicalJson(workingSchema)}\n${planId}`);
}

/**
 * Does this form have changes its live version does not?
 *
 * `false` for a form that has never been published — there is nothing to be out of date
 * with, and the button says "Publish" rather than "Publish changes" anyway.
 */
export function hasUnpublishedChanges(args: {
  workingSchema: string;
  planId: PlanId;
  activeChecksum: string | null;
}): boolean {
  if (!args.activeChecksum) return false;
  /*
    Versions published before checksums meant anything hold a random 16-character string
    (`crypto.randomUUID().slice(0, 16)`), which can never equal a hash. Treating those as
    "changed" would put an amber dot on every form in every existing account on the day
    this ships, all of them wrong. Unknown means quiet: they resolve themselves on the
    next publish, which writes a real fingerprint.
  */
  if (!/^[0-9a-f]{64}$/.test(args.activeChecksum)) return false;
  return publishFingerprint(args.workingSchema, args.planId) !== args.activeChecksum;
}
