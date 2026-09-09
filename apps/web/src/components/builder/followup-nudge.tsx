"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MailPlus, Sparkles, X } from "lucide-react";
import { followUpReadiness, type FormDoc } from "@repo/form-schema";
import {
  getGetApiFormsByIdQueryKey,
  usePostApiFormsByIdPublish,
  usePutApiFormsByIdDoc,
} from "@/lib/api/dashboard/dashboard";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/hooks/use-entitlements";
import { useUpgrade } from "@/components/billing/gate";
import { useActiveOrg } from "@/hooks/use-active-org";
import { FollowUpAddressDialog } from "./followup-address-dialog";

/**
 * The moment to mention follow-ups, and the only honest one.
 *
 * Everything about this banner is timed rather than placed: it appears on the
 * results page, next to a number the author has just read and does not like.
 * The same sentence in the settings panel is a feature description; here it is
 * an answer to the question they are already asking, which is why this exists
 * at all rather than another row in Settings.
 *
 * The three states below are the three honest things we can say to three
 * different people, and none of them is the same pitch with a different button:
 *
 *  - Not on a plan that includes it → what it does, and what it costs.
 *  - On the plan, but the form can never learn an address → the setup step,
 *    because switching it on without one produces a feature that silently
 *    sends nothing. This is the failure the server-side check produces and the
 *    reason it needs a counterpart in front of the author.
 *  - On the plan, form is ready → one button.
 *
 * It also stops appearing. Dismissal is per-form and permanent, and it hides
 * itself the moment follow-ups are on, because a banner that survives being
 * acted on is how you teach somebody to stop reading banners.
 */

/**
 * The claim on the banner, and where it comes from.
 *
 * Deliberately a range and deliberately about *abandoned-cart* email, which is
 * the same mechanic against the same behaviour and the only body of evidence
 * that actually exists at this scale. Klaviyo's 2023 benchmark puts recovery
 * around 3–5% of abandoners per sequence; Barilliance measured 18.2% on a
 * three-message sequence. Nothing here promises "3x more submissions", because
 * nobody has measured that for forms and the holdout in this very feature is
 * what will eventually tell this customer their own number.
 *
 * The copy therefore sells the mechanism, not a multiplier — and points at the
 * holdout as the thing that will answer it honestly for them.
 */
const PITCH = "Most of them are one reminder away from finishing.";

/**
 * The same copy the settings panel fills empty steps with, so the two places
 * that can switch this feature on cannot send different mail. Kept in sync by
 * hand rather than imported, because the panel's array is local to a component
 * this one must not depend on.
 */
const DEFAULT_BODIES = [
  "Everything you answered is saved, and picking up where you left off takes about a minute.",
  "Just a nudge in case it slipped. Your answers are still here whenever you're ready.",
  "This is the last one we'll send. Your answers are saved if you'd still like to finish.",
];

export function FollowUpNudge({
  formId,
  doc,
  partials,
  published,
  hasUnpublishedChanges,
}: {
  formId: string;
  doc: FormDoc | undefined;
  /** Unfinished responses. The whole reason the banner is on screen. */
  partials: number;
  /** A draft has no audience to recover, so there is nothing to sell yet. */
  published: boolean;
  /** Whether the draft already differs from what is live — see `turnOn`. */
  hasUnpublishedChanges: boolean;
}) {
  const ent = useEntitlements();
  const upgrade = useUpgrade();
  const { org } = useActiveOrg();
  const queryClient = useQueryClient();
  const saveDoc = usePutApiFormsByIdDoc();
  const publish = usePostApiFormsByIdPublish();

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`cf.seen.followup-nudge.${formId}`) === "1";
    } catch {
      // Storage blocked. Showing it is the safer failure: the banner is
      // dismissible, an invisible one is not recoverable.
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [askAddress, setAskAddress] = useState(false);
  const [justSavedAddress, setJustSavedAddress] = useState<string | null>(null);

  const entitled = ent.can("followup_email");
  const canGoogleAuth = ent.can("respondent_auth_google");

  /**
   * Three unfinished responses before we say anything.
   *
   * One is an accident and two is a coincidence; three is a pattern the author
   * can recognise in their own data, which is what makes the sentence land
   * rather than read as an advertisement attached to a rounding error.
   */
  const enough = partials >= 3;
  const followUp = doc?.settings.followUp;
  const on = Boolean(followUp?.enabled);

  if (!doc || dismissed || on || !enough || !published || ent.isLoading) return null;

  const readiness = followUpReadiness(doc);
  const storedAddress = (org as { postalAddress?: string | null } | undefined)?.postalAddress;
  const hasPostal = Boolean((justSavedAddress ?? storedAddress)?.trim());

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(`cf.seen.followup-nudge.${formId}`, "1");
    } catch {
      /* At worst it comes back next visit. */
    }
  }

  /**
   * The one button.
   *
   * It does the whole setup — sign-in, Google as a method, follow-ups on — and
   * then publishes, because none of it reaches a respondent until it is live:
   * `scheduleFollowUps` reads the *published* version, so a saved-but-unpublished
   * switch is a switch that does nothing while looking like it did.
   *
   * Publishing is skipped when the draft was already ahead of what is live.
   * Somebody else's half-finished edits are sitting in that draft, and shipping
   * them as a side effect of turning on reminders would be a far worse surprise
   * than one more click. They are told, rather than left to wonder why nothing
   * is sending.
   */
  async function turnOn(addressJustSaved?: string) {
    if (!doc) return;
    /*
      `addressJustSaved` rather than reading state.

      The dialog's `onSaved` sets the address and immediately calls this to
      finish the job. State set in that handler is not visible to this closure —
      it is the same render — so reading `hasPostal` here would find it still
      false, re-open the dialog the author just completed, and do it again on
      every save. The value is passed down instead.
    */
    if (!hasPostal && !addressJustSaved?.trim()) return setAskAddress(true);

    const wantsAuth = readiness.none;
    if (wantsAuth && !canGoogleAuth) {
      upgrade({ feature: "respondent_auth_google" }, { surface: "followup-nudge", partials });
      return;
    }

    setBusy(true);
    const shipNow = !hasUnpublishedChanges;
    /**
     * Whether the document write landed, tracked separately from the publish.
     *
     * These are two requests and the second one can fail on its own — a publish
     * refused for a plan limit answers 402, and the network does what it does.
     * When that happens the settings are already saved: telling the author
     * "could not turn on follow-ups" would be false, and would send them to
     * re-do a change that is sitting in their draft.
     */
    let saved = false;
    try {
      const next: FormDoc = {
        ...doc,
        settings: {
          ...doc.settings,
          ...(wantsAuth
            ? {
                requireAuth: {
                  ...doc.settings.requireAuth,
                  enabled: true,
                  /*
                    Google, and only Google. The gate takes one method now, and
                    this branch is reached only when the form has no address
                    source at all — which includes a gate already set to phone,
                    since a verified number is not somewhere an email can go.
                    Anything else here would turn follow-ups on with nowhere to
                    send them.
                  */
                  method: "google" as const,
                },
              }
            : {}),
          followUp: {
            ...doc.settings.followUp,
            enabled: true,
            /*
              Backfill the copy, the same way the settings panel's `enable`
              does. A step whose body was cleared would otherwise go out as a
              subject line and a button, and the two screens that turn this
              feature on must not produce different email.
            */
            steps: doc.settings.followUp.steps.map((step, i) =>
              step.bodyMd ? step : { ...step, bodyMd: DEFAULT_BODIES[i] ?? "" },
            ),
          },
        },
      };

      await saveDoc.mutateAsync({ id: formId as never, data: { doc: next } as never });
      saved = true;
      if (shipNow) await publish.mutateAsync({ id: formId as never });

      dismiss();
      toast.success(
        shipNow ? "Follow-ups are on" : "Follow-ups saved to your draft",
        {
          description: shipNow
            ? wantsAuth
              ? "Respondents sign in with Google, and anyone who leaves gets a reminder with a link back."
              : "Anyone who starts and leaves now gets a reminder with a link back to their answers."
            : "Your form has other unpublished edits, so nothing was published. Hit Publish in the builder to start sending.",
        },
      );
    } catch {
      toast.error(
        saved ? "Follow-ups are on, but the form wasn't published" : "Could not turn on follow-ups",
        {
          description: saved
            ? "Your settings are saved to the draft. Publish from the builder to start sending."
            : "Nothing was changed. You can try again from the Follow-ups tab in Settings.",
        },
      );
    } finally {
      /**
       * Always, on both outcomes.
       *
       * The draft can have changed on the server even when the publish that
       * followed it did not, and this query feeds the builder header, its
       * publish button and the leave guard as well as this page. Leaving it
       * stale after a half-completed run is exactly the divergence where the
       * server knows the form is dirty and nothing on screen does.
       */
      await queryClient.invalidateQueries({
        queryKey: getGetApiFormsByIdQueryKey(formId as never),
      });
      setBusy(false);
    }
  }

  const needsSetup = entitled && readiness.none;

  return (
    <div className="border-primary/25 from-primary/[0.06] relative overflow-hidden rounded-xl border bg-gradient-to-br to-transparent p-4 sm:p-5">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="text-muted-foreground/60 hover:text-foreground absolute top-3 right-3 p-1"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-8 sm:gap-4">
        <div className="bg-primary/10 text-primary hidden size-9 shrink-0 items-center justify-center rounded-lg sm:flex">
          <MailPlus className="size-4.5" />
        </div>

        <div className="min-w-0 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {partials} people started your form and didn&apos;t finish.{" "}
              <span className="text-muted-foreground font-normal">{PITCH}</span>
            </p>
            <p className="text-muted-foreground text-sm">
              {!entitled
                ? "Automated follow-ups email anyone who walks away, with a link straight back to where they stopped — their answers are still there. Recovered responses are counted separately, so you see exactly what it brought back."
                : needsSetup
                  ? "To send a reminder we need somewhere to send it. Turning on sign-in with Google gives everyone who starts a verified address — nothing for them to type. It does add a step before the first question, so expect slightly fewer people to start, and it sets Google as the form's sign-in method."
                  : "We'll email anyone who walks away, with a link back to where they stopped. You can edit the timing and wording afterwards."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!entitled ? (
              <Button
                size="sm"
                onClick={() =>
                  upgrade({ feature: "followup_email" }, { surface: "followup-nudge", partials })
                }
              >
                <Sparkles className="size-3.5" />
                See how follow-ups work
              </Button>
            ) : (
              <Button size="sm" onClick={() => void turnOn()} disabled={busy}>
                {busy
                  ? "Setting up…"
                  : needsSetup
                    ? "Turn on sign-in & follow-ups"
                    : "Turn on follow-ups"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Not now
            </Button>
          </div>

          {/*
            Said here rather than only in the settings panel, because this is
            where somebody decides whether the feature is worth having: the
            answer to "does this actually work" is a number we will measure for
            them, not a number we are quoting at them.
          */}
          <p className="text-muted-foreground/80 text-xs">
            {entitled && needsSetup && !canGoogleAuth
              ? "Verified sign-in is a Business feature. You can also add an email question to your form and follow-ups will use that answer."
              : "Hold a few people back from the reminders and we'll show you how many came back without one — so the recovery number is yours, not ours."}
          </p>
        </div>
      </div>

      {org?.id && (
        <FollowUpAddressDialog
          open={askAddress}
          onOpenChange={setAskAddress}
          organizationId={org.id}
          onSaved={(address) => {
            setJustSavedAddress(address);
            // The dialog closed on a click that meant "turn this on". Finish
            // the job rather than making them press the button a second time.
            void turnOn(address);
          }}
        />
      )}
    </div>
  );
}
