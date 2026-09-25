"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { FEEDBACK_NOTE_MAX } from "@repo/form-schema";
import { FaceRating } from "@/components/feedback/face-rating";
import { KeyHint, modKeyLabel } from "./composers/primitives";
import { cn } from "@/lib/utils";

/**
 * The respondent's one line back to us.
 *
 * Everything else on this page belongs to the customer whose form it is: their
 * questions, their branding, their thank-you screen. This panel is opened from
 * the footer, and what it collects goes to the people who built the software,
 * not to the people who built the form. That distinction is the whole design
 * brief, and it is why the copy spells the audience out rather than saying a
 * bare "Feedback": a respondent who thinks they are writing to the company
 * running the survey will write about the survey, and we would be collecting
 * somebody else's support queue. `named` decides whether the sentence that does
 * that work is allowed to use our name.
 *
 * Themed from the runtime `--cf-*` variables like every other piece of the chat
 * surface, so it arrives in the form's own palette rather than as a white box
 * dropped on a dark page.
 */

/* The five faces live in `FaceRating`, shared with the builder's feedback panel. */

/** How long the receipt stays up before the panel closes itself. */
const SENT_MS = 1400;

/**
 * Mounted only while it is open — which is also how it is reset.
 *
 * It took an `open` prop and cleared its five pieces of state in an effect when
 * that went false, which is a cascading render to undo state nobody can see and
 * one the React lint rule is right to refuse. Unmounting does the same job with
 * no code: the next tap on "Report a bug" builds a new panel, and a new panel
 * has no rating, no half-written note and no error from last time.
 */
export function FeedbackDialog({
  onClose,
  onSubmit,
  named = true,
}: {
  onClose: () => void;
  onSubmit: (rating: number, message: string) => Promise<{ ok: boolean; error?: string }>;
  /**
   * Whether this panel may say "chatform" out loud.
   *
   * False on a form whose owner pays to have our name off it. The panel still
   * has to answer the question every respondent has — *who am I writing to* —
   * because a note meant for the form's author landing in our console helps
   * nobody, and the author is the one person who cannot act on it. So the
   * unnamed copy says the same thing about the audience and leaves out the
   * one word that was bought back: "the team who builds the software running
   * this form" is true, useful and not a logo.
   */
  named?: boolean;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /*
    The panel takes focus itself, rather than handing it to the first control.

    Autofocusing the first face would both pop that face's tooltip open on a
    pointer device and announce "Terrible" as the first thing a screen reader
    says about a panel that has not asked its question yet. Focusing the
    container announces the heading, and keeps Tab inside somewhere sensible.
  */
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const submit = useCallback(async () => {
    if (rating === null || sending) return;
    setSending(true);
    setError(null);
    const result = await onSubmit(rating, message);
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "That didn't send. Try again in a moment.");
      return;
    }
    setSent(true);
  }, [rating, message, sending, onSubmit]);

  /**
   * The panel's two keys, taken before anything else sees them.
   *
   * ⌘↵ sends and Escape closes — the same pair the review card binds, which is
   * exactly the problem: that card can arrive underneath while this is open,
   * and then one ⌘↵ would file the report *and* submit the form. So this
   * listens in the capture phase and stops the event dead. A modal that lets
   * keys through to the screen behind it is not modal.
   *
   * Enter on its own is deliberately left alone: the box below is where
   * somebody types three numbered steps, and a bug report that sends itself on
   * the first line is a bug report nobody can read.
   *
   * Rebound whenever `submit` changes, which is every keystroke in the note.
   * That is two cheap calls per character and the honest way to write it; a ref
   * to dodge them would be a moving part in exchange for nothing measurable.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void submit();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose, submit]);

  /* The receipt is the last thing that happens, so it closes the panel. */
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(onClose, SENT_MS);
    return () => clearTimeout(t);
  }, [sent, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/*
        The scrim is a button in everything but name — tapping outside a panel
        closes it, and on a phone that is the gesture people actually use.
        `aria-hidden`, because the close control is inside the panel where a
        keyboard and a screen reader can both reach it.
      */}
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={named ? "Report a problem with chatform" : "Report a problem with this form\u2019s software"}
        tabIndex={-1}
        className={cn(
          "animate-message-in relative m-0 w-full max-w-md outline-none sm:m-4",
          // A sheet on a phone, a card on a desktop: the same panel, docked to
          // the thumb or centred on the screen.
          "rounded-t-2xl sm:rounded-2xl",
          "border border-[var(--cf-chip-border)] bg-[var(--cf-bg)] text-[var(--cf-text)] shadow-2xl",
        )}
        style={{ maxHeight: "min(90vh, 40rem)" }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 grid size-8 place-items-center rounded-full opacity-50 transition-opacity hover:opacity-100"
        >
          <X className="size-4" />
        </button>

        {sent ? (
          /*
            A receipt, not a form that went blank.

            The panel closes itself a moment later, and the moment is the point:
            somebody who has just reported a bug needs to see that it left,
            otherwise the only evidence of a successful report is a panel
            vanishing, which is indistinguishable from it failing.
          */
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <div
              className="grid size-12 place-items-center rounded-full"
              style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
            >
              <Check className="size-6" strokeWidth={2.5} />
            </div>
            <p className="text-base font-medium">Thank you. That reached us.</p>
            <p className="max-w-xs text-sm opacity-60">
              A real person reads these. It goes to the team who build the software, not to whoever
              made this form.
            </p>
          </div>
        ) : (
          <div className="overflow-y-auto px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
            <h2 className="pr-8 text-lg font-semibold" style={{ fontFamily: "var(--cf-font-heading)" }}>
              How is this going?
            </h2>
            {/*
              Said plainly and said first. The person reading it is a stranger
              to us; without this sentence the obvious assumption is that they
              are writing to whoever sent them the link.
            */}
            <p className="mt-1 text-sm opacity-60">
              {named
                ? "This goes to chatform, the software running this form, not to the people who made this form."
                : "This goes to the team who build the software running this form, not to the people who made this form."}
            </p>

            {/* Themed from the form's own ramp, so the scale arrives in its palette. */}
            <FaceRating
              className="mt-5"
              value={rating}
              onChange={setRating}
              ramp="--cf-rating"
              pickedGround="var(--cf-chip-bg)"
            />

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              maxLength={FEEDBACK_NOTE_MAX}
              placeholder="What happened? A bug, something confusing, anything missing…"
              className={cn(
                "mt-3 w-full resize-none rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-composer-bg)] px-3.5 py-2.5 text-[0.9375rem]",
                "placeholder:opacity-45 focus:border-[var(--cf-accent)] focus:outline-none",
              )}
            />

            {/*
              Only near the end. A number ticking under every keystroke nags
              somebody writing a normal note; the last fifth is where it helps,
              and at the limit it turns the warning colour so the stop in typing
              is explained rather than feeling broken.
            */}
            {message.length >= FEEDBACK_NOTE_MAX * 0.8 && (
              <p
                className="mt-1 text-right text-xs tabular-nums"
                style={{ color: message.length >= FEEDBACK_NOTE_MAX ? "var(--cf-warning)" : undefined, opacity: message.length >= FEEDBACK_NOTE_MAX ? 1 : 0.5 }}
                aria-live="polite"
              >
                {message.length.toLocaleString()} / {FEEDBACK_NOTE_MAX.toLocaleString()}
              </p>
            )}

            {/*
              Said, not buried in a policy. The screen is attached so we can see
              what went wrong, and the respondent — who is using somebody else's
              form, and never agreed to anything of ours — should not find that
              out later.
            */}
            <p className="mt-2 text-xs opacity-50">
              A copy of this conversation is attached so we can see what you saw.
            </p>

            {error && (
              <p className="mt-2 text-sm" style={{ color: "var(--cf-warning)" }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              /*
                Disabled until a face is picked, which is the one thing this
                panel cannot do without: a note with no rating is a support
                ticket nobody can triage, and the faces are the cheap half of
                the ask. The text stays optional throughout.
              */
              disabled={rating === null || sending}
              className={cn(
                "mt-3 inline-flex h-11 w-full items-center justify-center rounded-full text-sm font-medium",
                "transition-transform active:scale-[0.99] motion-reduce:active:scale-100",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
              style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
            >
              {sending ? "Sending…" : "Send"}
              {/*
                The same key chip the composer draws under this panel, so the
                shortcut is taught in the one vocabulary the form already uses.
                `kbd-hint` is what keeps it off a phone — it is a
                `(hover: hover) and (pointer: fine)` question, not a width one —
                and `w-auto` because two glyphs do not fit the square a single
                one gets.
              */}
              {!sending && (
                <KeyHint tone="inverse" className="ml-2 w-auto px-1.5">{`${modKeyLabel()}↵`}</KeyHint>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
