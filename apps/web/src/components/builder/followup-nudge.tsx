"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MailPlus, X } from "lucide-react";
import { followUpReadiness, type FormDoc } from "@repo/form-schema";
import { PLANS, minPlanFor } from "@repo/entitlements";
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
import { useBuilderStore } from "@/stores/builder-store";

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
 * The "up to 2x" on the banner, and what backs it.
 *
 * Abandoned-cart email is the same mechanic against the same behaviour and the
 * only evidence at this scale: Klaviyo's 2023 benchmark puts recovery around
 * 3–5% of abandoners per sequence, Barilliance measured 18.2% on three
 * messages. On a form converting at ~20%, recovering 18% of the 80% who left is
 * roughly a doubling, which is where the ceiling comes from and why it is
 * written "up to" rather than as a flat promise.
 *
 * The holdout in this feature measures the customer's own number, so if this
 * claim is wrong for them the product is what tells them.
 */

/**
 * The same copy the settings panel fills empty steps with, so the two places
 * that can switch this feature on cannot send different mail. Kept in sync by
 * hand rather than imported, because the panel's array is local to a component
 * this one must not depend on.
 */
/**
 * The author's own time zone, as a settings fragment, or nothing.
 *
 * The fallback used when a respondent's browser did not report one. Absent
 * rather than guessed when this browser will not say either: the scheduler
 * reads a missing zone as UTC, which is a worse answer than the author's but a
 * defensible one, and inventing a zone here would be neither.
 */
function quietHoursZone(): { timezone: string } | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz ? { timezone: tz } : null;
  } catch {
    return null;
  }
}

const DEFAULT_BODIES = [
  "Everything you answered is saved, and picking up where you left off takes about a minute.",
  "Just a nudge in case it slipped. Your answers are still here whenever you're ready.",
  "This is the last one we'll send. Your answers are saved if you'd still like to finish.",
];

/**
 * What the two dismissals mean, and why they are not the same thing.
 *
 * The X is permanent: somebody who closes a banner has answered the question it
 * asked. "Not now" is not that answer — it is "later" — and honouring it as
 * "never" was the one place this component said something it did not mean.
 *
 * Snoozing therefore records *when* and *how many partials there were*, and
 * lets either one bring the banner back: the fortnight passing, or the problem
 * getting materially worse while the author was not looking. The second matters
 * more than the first. Three abandoned responses is a shrug; twelve is the
 * reason they opened this page.
 */
const NUDGE_KEY = (formId: string) => `cf.seen.followup-nudge.${formId}`;
const SNOOZE_DAYS = 14;

type NudgeMemory = { kind: "dismissed" } | { kind: "snoozed"; until: number; partials: number };

/**
 * What we remember about this banner, with the clock already applied.
 *
 * `snoozeExpired` is resolved here rather than where the banner decides whether
 * to render, and that placement is the whole point. Reading the clock during
 * render is impure — the same component would answer differently on a re-render
 * nobody asked for — and moving it into an effect instead would let the banner
 * paint before the snooze that suppresses it had been evaluated, so an author
 * who pressed "Not now" yesterday would see it flash back at them on every
 * load. Read once, next to the value it is about.
 */
interface StoredNudge {
  memory: NudgeMemory | null;
  /** The fortnight is up. The count half of the rule depends on props, so it stays in render. */
  snoozeExpired: boolean;
}

function readNudge(formId: string): StoredNudge {
  const memory = readMemory(formId);
  return {
    memory,
    snoozeExpired: memory?.kind === "snoozed" ? Date.now() >= memory.until : false,
  };
}

function readMemory(formId: string): NudgeMemory | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(NUDGE_KEY(formId));
    if (!raw) return null;
    /*
      `"1"` is what every dismissal wrote before this distinction existed. It
      cannot be told apart from a snooze after the fact, so it is read as the
      permanent one: re-showing a banner somebody already closed is the worse
      of the two mistakes.
    */
    if (raw === "1") return { kind: "dismissed" };
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "kind" in parsed) {
      const m = parsed as NudgeMemory;
      if (m.kind === "dismissed") return m;
      if (m.kind === "snoozed" && typeof m.until === "number" && typeof m.partials === "number") {
        return m;
      }
    }
    return null;
  } catch {
    // Storage blocked or the value is not ours. Showing it is the safer
    // failure: the banner is dismissible, an invisible one is not recoverable.
    return null;
  }
}

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

  const [{ memory, snoozeExpired }, setStored] = useState<StoredNudge>(() => readNudge(formId));
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

  /**
   * A snooze expires on either clock: the fortnight, or the count doubling.
   * `partials` only ever grows, so the second test cannot be tripped by the
   * same drop-offs the author already declined to act on.
   */
  const suppressed =
    memory?.kind === "dismissed" ||
    (memory?.kind === "snoozed" && !snoozeExpired && partials < memory.partials * 2);

  if (!doc || suppressed || on || !enough || !published || ent.isLoading) return null;

  const readiness = followUpReadiness(doc);
  const storedAddress = (org as { postalAddress?: string | null } | undefined)?.postalAddress;
  const hasPostal = Boolean((justSavedAddress ?? storedAddress)?.trim());

  function remember(next: NudgeMemory) {
    // A snooze the author has just set cannot already have run out.
    setStored({ memory: next, snoozeExpired: false });
    try {
      localStorage.setItem(NUDGE_KEY(formId), JSON.stringify(next));
    } catch {
      /* At worst it comes back next visit. */
    }
  }

  /** The X. Answered, and not asked again. */
  function dismiss() {
    remember({ kind: "dismissed" });
  }

  /** "Not now". Asked again when the fortnight is up or the problem doubles. */
  function snooze() {
    remember({
      kind: "snoozed",
      until: Date.now() + SNOOZE_DAYS * 86_400_000,
      partials,
    });
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
              Quiet hours too, and the author's own zone with it.

              This nudge only ever appears on a form that is not sending at all
              yet, so there is no prior behaviour to preserve — which is the
              whole reason the v8→v9 migration pins existing documents to
              `false`. Somebody switching sending on for the first time should
              get the same safe default whether they did it here or in Settings,
              and without this line they would get the opposite one.
            */
            quietHours: true,
            ...(quietHoursZone() ?? {}),
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

      /*
        The second writer to `PUT /forms/:id/doc`, and the only one that does not
        go through the builder store.

        It has to state a revision like every other save, or it silently
        overwrites whatever the builder has open — and, having written, it has to
        put the new revision and document back into the store, or the *next* edit
        made in the builder conflicts with this one and the author is asked to
        resolve a clash with themselves.
      */
      const store = useBuilderStore.getState();
      const mine = store.formId === formId ? store.revision : null;
      const result = (await saveDoc.mutateAsync({
        id: formId as never,
        data: { doc: next, ...(mine === null ? {} : { baseRevision: mine }) } as never,
      })) as { revision?: number } | undefined;
      if (store.formId === formId) store.hydrate(formId, next, result?.revision ?? null, true);
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
              Get up to 2x more submissions.{" "}
              <span className="text-muted-foreground font-normal">
                {partials} people started your form and didn&apos;t finish.
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              {!entitled
                ? "We email them automatically, more than once, with a link back to where they stopped. Their answers are still there waiting."
                : needsSetup
                  ? "To send a reminder we need somewhere to send it. Sign-in with Google gives everyone a verified address, with nothing to type. It does add a step before the first question."
                  : "We'll email anyone who walks away, with a link back to where they stopped."}
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
                Enable automatic follow-ups
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
            <Button size="sm" variant="ghost" onClick={snooze}>
              Not now
            </Button>
          </div>

          {/*
            Only when there is something the author cannot act without knowing:
            that the route the button offers is on a higher plan, and that a
            plain email question is the way around it.

            The holdout sentence that used to sit here unconditionally was the
            third paragraph of a banner, and the settings panel says it at the
            point where somebody is actually configuring the sequence.
          */}
          {entitled && needsSetup && !canGoogleAuth && (
            <p className="text-muted-foreground/80 text-xs">
              Verified sign-in is a {PLANS[minPlanFor("respondent_auth_google")].name} feature. An
              email question on the form works too.
            </p>
          )}
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
