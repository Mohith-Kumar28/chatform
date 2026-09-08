"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { isMeetingRoom, schedulingLabel, type PublicBlock } from "@repo/form-schema";
import { Chip } from "./composers/primitives";
import { RatingComposer, ScaleComposer } from "./composers/rating";
import { DateComposer } from "./composers/date";
import { SignatureComposer } from "./composers/signature";
import { FieldsComposer, MatrixComposer, RankingComposer } from "./composers/structured";
import { FileUploadControl } from "./file-upload";
import { PaymentAffordance } from "./payment-affordance";
import { QuestionMedia } from "./question-media";
import { assetUrl } from "@/lib/assets";
import { cn } from "@/lib/utils";

/**
 * The controls that belong to the current question, rendered **in the thread**
 * under the agent's message rather than replacing the composer.
 *
 * Replacing the input with chips said "you may only click" — but a person in a
 * chat expects to be able to type. Now the text box is always there, the
 * choices sit below the message as an offer, and either route works: tap a
 * chip, or write "weekly I guess" and let the agent read it.
 *
 * Sealed off while an answer is in flight, with `inert` on the wrapper rather
 * than a `disabled` prop threaded through nine composers. That matters because
 * most of these controls never honoured `disabled` at all — yes/no chips, both
 * scales, the calendar and the structured composers all ignored it — so one
 * place has to take the whole subtree out of pointer, keyboard and
 * accessibility reach.
 *
 * Keyed on the question's ref by its caller, which is what stops one
 * question's half-filled state showing up under the next one.
 */
/*
 * Memoised, for the same reason the bubbles are: this whole subtree — chips,
 * scales, calendars, ranking lists — re-rendered on every streamed token of
 * the agent's *next* message, because its parent does. Its props are five
 * primitives and two stable callbacks, so identity comparison is enough to
 * leave a half-filled multi-select completely alone while the agent talks.
 */
export const QuestionAffordance = memo(function QuestionAffordance(props: {
  block: PublicBlock;
  disabled?: boolean;
  uploadBase: string | null;
  respondentToken: string | null;
  onStructured: (value: unknown, display: string) => void;
  onSkip: () => void;
  /** The form emails people who leave part-way. Shows the opt-out. */
  followUpEnabled?: boolean;
  onDeclineFollowUps?: () => void;
}) {
  return (
    <div
      inert={props.disabled}
      aria-busy={props.disabled}
      /* Read by `useChoiceKeys`: inside this subtree Enter means "continue",
         even when a chip has focus. */
      data-affordance=""
      className={cn(
        "space-y-2 transition-opacity duration-[var(--duration-standard)] ease-[var(--ease-out)]",
        props.disabled && "opacity-55",
      )}
    >
      {/* An image, clip or download attached to the question. It was parsed,
          projected all the way to the client, and then rendered nowhere. */}
      <QuestionMedia media={props.block.media} imageKey={props.block.imageKey} />
      <AffordanceControls {...props} />
      {props.followUpEnabled && collectsAddress(props.block) && props.onDeclineFollowUps && (
        <FollowUpOptOut onDecline={props.onDeclineFollowUps} />
      )}
    </div>
  );
});

/** The block types the follow-up address resolver reads. Kept in step with `respondent-address.ts`. */
function collectsAddress(block: PublicBlock): boolean {
  return block.type === "email" || block.type === "contact_info";
}

/**
 * "Don't email me about this", beside the question that asks for the address.
 *
 * Here rather than in a footer or on a final step because this is a form people
 * abandon — that is the entire premise of the feature — so the moment we ask
 * for their address is the last moment they are reliably still present to
 * decline. An opt-out offered only in the reminder arrives after the thing it
 * exists to prevent, and one on a step they never reach is not offered at all.
 *
 * Deliberately a quiet checkbox rather than a prominent one. It has to be
 * genuinely findable and genuinely work; it does not have to compete with the
 * question for attention.
 */
function FollowUpOptOut({ onDecline }: { onDecline: () => void }) {
  const [declined, setDeclined] = useState(false);
  return (
    <label className="text-muted-foreground flex cursor-pointer items-center gap-2 pt-1 pl-0.5 text-xs select-none">
      <input
        type="checkbox"
        checked={declined}
        className="size-3.5 cursor-pointer rounded-sm border-current accent-current"
        onChange={(e) => {
          setDeclined(e.target.checked);
          // Only ever sent on the way *in* to declining. Unticking the box is
          // rare enough, and re-subscribing somebody automatically is a worse
          // failure than leaving them opted out.
          if (e.target.checked) onDecline();
        }}
      />
      Don’t email me reminders about this form
    </label>
  );
}

/**
 * The numbered choices a question offers, in the order the chips show them.
 *
 * One list, used both to render the `1` `2` `3` hints and to answer the key
 * presses — which is the whole point. They were derived separately before, from
 * `block.options`, and a `yes_no` block has no options: its chips advertised
 * "1" and "2" and pressing 1 typed a literal "1" into the message box.
 */
interface Choice {
  id: string;
  label: string;
  value: unknown;
  /** The character that picks it. Absent when there is no single key for it. */
  key?: string;
}

function choicesFor(block: PublicBlock): Choice[] {
  const numbered = (list: { id: string; label: string }[]): Choice[] =>
    list.map((o, i) => ({ id: o.id, label: o.label, value: o.id, key: i < 9 ? String(i + 1) : undefined }));

  /**
   * A scale answers to its own numbers, not to positions.
   *
   * "Tap a number, or type it…" is the placeholder under every rating and
   * scale, and pressing 4 put a 4 in the box for the agent to extract instead
   * of just picking 4. On an NPS the key and the value are the same digit, so
   * matching by character rather than by index is what makes 0 mean 0.
   */
  const scale = (min: number, max: number): Choice[] =>
    Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => ({
      id: String(n),
      label: String(n),
      value: n,
      key: n >= 0 && n <= 9 ? String(n) : undefined,
    }));

  switch (block.type) {
    case "yes_no":
      return [
        { id: "yes", label: block.yesLabel ?? "Yes", value: true, key: "1" },
        { id: "no", label: block.noLabel ?? "No", value: false, key: "2" },
      ];
    case "single_select":
    case "dropdown":
    case "picture_choice":
    case "multi_select":
      return numbered(block.options ?? []);
    case "legal_consent":
      return block.allowDecline
        ? [
            { id: "agree", label: block.agreeLabel ?? "I agree", value: true, key: "1" },
            { id: "decline", label: block.declineLabel ?? "I do not agree", value: false, key: "2" },
          ]
        : [{ id: "agree", label: block.agreeLabel ?? "I agree", value: true, key: "1" }];
    case "rating":
      return scale(1, block.scale ?? 5);
    case "nps":
      return scale(0, 10);
    case "opinion_scale":
      return scale(block.startAt ?? 1, (block.startAt ?? 1) + (block.steps ?? 5) - 1);
    default:
      return [];
  }
}

/**
 * Digit keys pick a choice, and they win over the message box.
 *
 * The composer takes focus on every question, so a shortcut that yielded to
 * "the event came from an INPUT" was a shortcut that never fired. Hijacking a
 * keystroke inside a text field is safe exactly while the field is empty —
 * someone typing "1 or 2 a week" keeps their digits — and only for a question
 * that has numbered choices on offer, which is why a `number`, `rating` or
 * `nps` answer is untouched.
 */
function useChoiceKeys(choices: Choice[], onPick: (choice: Choice) => void, onEnter?: () => void) {
  const latest = useRef({ choices, onPick, onEnter });
  useEffect(() => {
    latest.current = { choices, onPick, onEnter };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      const tag = target?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      // Safe only while the box is empty: someone writing "1 or 2 a week"
      // keeps their digits.
      if (inField && (target as HTMLInputElement).value !== "") return;
      /*
       * Enter finishes a multi-select, and has to win against the chip.
       *
       * Picking the last option leaves that chip focused, so the browser's own
       * "Enter activates the focused button" would un-pick what was just
       * picked — the exact opposite of what the ⏎ on the Continue button now
       * promises. Inside the affordance we take the key and preventDefault so
       * the chip never sees the click; Space still toggles. Outside it — the
       * skip link, the send button — the focused control keeps its Enter.
       */
      if (e.key === "Enter") {
        if (!latest.current.onEnter) return;
        if (tag === "BUTTON" && !target?.closest("[data-affordance]")) return;
        e.preventDefault();
        latest.current.onEnter();
        return;
      }
      const hit = latest.current.choices.find((c) => c.key === e.key);
      if (!hit) return;
      e.preventDefault();
      latest.current.onPick(hit);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function AffordanceControls({
  block,
  disabled,
  uploadBase,
  respondentToken,
  onStructured,
  onSkip,
}: {
  block: PublicBlock;
  disabled?: boolean;
  uploadBase: string | null;
  respondentToken: string | null;
  onStructured: (value: unknown, display: string) => void;
  onSkip: () => void;
}) {
  const [multi, setMulti] = useState<string[]>([]);
  // Memoised because `submitMulti` depends on it, and `block.options ?? []`
  // makes a new array on every render — which would rebuild the callback on
  // every streamed token.
  const options = useMemo(() => block.options ?? [], [block.options]);
  const choices = choicesFor(block);
  const isMulti = block.type === "multi_select";

  // How many may be picked, honoured *before* the answer is sent. The server
  // enforces the same bounds, but finding out from a rejection — after the
  // answer has already appeared in the thread — is not enforcement, it is a
  // scolding.
  const maxSelections = Math.min(block.maxSelections ?? options.length, options.length);
  const minSelections = Math.max(block.minSelections ?? 1, block.required ? 1 : 0);

  const toggle = useCallback(
    (id: string) =>
      setMulti((m) =>
        m.includes(id) ? m.filter((x) => x !== id) : m.length >= maxSelections ? m : [...m, id],
      ),
    [maxSelections],
  );

  const submitMulti = useCallback(() => {
    // Read the selection from state, not from inside a `setMulti` updater —
    // React invokes updaters twice in development, and sending the answer from
    // inside one would post the same answer twice.
    if (multi.length < minSelections) return;
    onStructured(multi, multi.map((id) => options.find((o) => o.id === id)?.label).filter(Boolean).join(", "));
    setMulti([]);
  }, [minSelections, multi, onStructured, options]);

  useChoiceKeys(
    disabled ? [] : choices,
    (choice) => {
      if (isMulti) toggle(choice.id);
      else onStructured(choice.value, choice.label);
    },
    isMulti && !disabled ? submitMulti : undefined,
  );

  switch (block.type) {
    case "welcome":
    case "statement":
      return (
        <Affordance>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onStructured(true, "")}
            className="h-10 rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100"
          >
            {block.buttonLabel || "Continue"}
          </button>
        </Affordance>
      );

    case "yes_no":
      return (
        <Affordance>
          {choices.map((c, i) => (
            <Chip key={c.id} shortcut={i + 1} disabled={disabled} onClick={() => onStructured(c.value, c.label)}>
              {c.label}
            </Chip>
          ))}
        </Affordance>
      );

    case "single_select":
    case "dropdown":
      return (
        <Affordance>
          {options.map((o, i) => (
            <Chip key={o.id} shortcut={i + 1} disabled={disabled} onClick={() => onStructured(o.id, o.label)}>
              {o.label}
            </Chip>
          ))}
        </Affordance>
      );

    // Pictures, in a picture choice. The option's `imageKey` reached the client
    // and was thrown away, so this rendered as text chips — the one block type
    // whose entire reason for existing is the image.
    case "picture_choice":
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {options.map((o, i) => (
            <PictureOption
              key={o.id}
              index={i}
              label={o.label}
              imageUrl={assetUrl(o.imageKey)}
              disabled={disabled}
              onClick={() => onStructured(o.id, o.label)}
            />
          ))}
        </div>
      );

    case "multi_select":
      return (
        <div className="space-y-2">
          <Affordance>
            {options.map((o, i) => {
              const selected = multi.includes(o.id);
              return (
                <Chip
                  key={o.id}
                  shortcut={i + 1}
                  selected={selected}
                  // At the ceiling, the unpicked ones stop responding rather
                  // than letting an answer be built that will be refused.
                  disabled={disabled || (!selected && multi.length >= maxSelections)}
                  onClick={() => toggle(o.id)}
                >
                  {o.label}
                </Chip>
              );
            })}
          </Affordance>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={disabled || multi.length < minSelections}
              onClick={submitMulti}
              className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--cf-accent)] px-4 text-sm font-medium text-[var(--cf-accent-text)] transition-transform active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40"
            >
              Continue{multi.length > 0 ? ` · ${multi.length}` : ""}
              {/* The shortcut was already live and completely invisible. */}
              <CornerDownLeft className="hidden size-3.5 opacity-70 sm:block" aria-hidden />
            </button>
            <p className="text-xs opacity-55">
              {multi.length >= maxSelections
                ? `That's the most you can pick (${maxSelections}).`
                : minSelections > 1 && multi.length < minSelections
                  ? `Pick at least ${minSelections}.`
                  : `Pick up to ${maxSelections}.`}
            </p>
          </div>
        </div>
      );

    case "rating":
      return (
        <RatingComposer
          scale={block.scale ?? 5}
          shape={(block.shape as "star" | "heart" | "number") ?? "star"}
          onPick={onStructured}
        />
      );

    case "nps":
      return (
        <ScaleComposer
          min={0}
          max={10}
          labelLow={block.labels?.low}
          labelHigh={block.labels?.high}
          onPick={onStructured}
        />
      );

    case "opinion_scale": {
      const start = block.startAt ?? 1;
      return (
        <ScaleComposer
          min={start}
          max={start + (block.steps ?? 5) - 1}
          labelLow={block.labels?.low}
          labelHigh={block.labels?.high}
          onPick={onStructured}
        />
      );
    }

    case "date":
      return (
        <DateComposer
          min={block.minDate}
          max={block.maxDate}
          disablePast={block.disablePast}
          includeTime={block.includeTime}
          timeStepMinutes={block.timeStepMinutes}
          timeMin={block.timeMin}
          timeMax={block.timeMax}
          onPick={onStructured}
        />
      );

    case "ranking":
      return <RankingComposer items={block.items ?? []} onSubmit={onStructured} />;

    case "matrix":
      return (
        <MatrixComposer
          rows={block.rows ?? []}
          columns={block.columns ?? []}
          multiple={block.multiplePerRow ?? false}
          onSubmit={onStructured}
        />
      );

    case "contact_info":
    case "address":
      return <FieldsComposer fields={block.fields ?? []} required={block.required} onSubmit={onStructured} />;

    case "legal_consent": {
      const agree = block.agreeLabel ?? "I agree";
      const decline = block.declineLabel ?? "I do not agree";
      return (
        <div className="space-y-2">
          {block.consentText && (
            <p className="rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2.5 text-sm">
              {block.consentText}
            </p>
          )}
          <Affordance>
            <Chip shortcut={1} disabled={disabled} onClick={() => onStructured(true, agree)}>
              {agree}
            </Chip>
            {/*
              Same weight as agreeing, deliberately.
              A refusal styled as the quiet secondary option is a nudge, and
              this is the one control in the product where nudging is not a
              product decision but a consent one. The form's own routing
              decides what happens next.
            */}
            {block.allowDecline && (
              <Chip shortcut={2} disabled={disabled} onClick={() => onStructured(false, decline)}>
                {decline}
              </Chip>
            )}
          </Affordance>
        </div>
      );
    }

    case "signature":
      return (
        <SignatureComposer
          requireName={block.drawnNameRequired ?? false}
          blockRef={block.ref}
          uploadBase={uploadBase}
          respondentToken={respondentToken}
          onSubmit={onStructured}
        />
      );

    case "file_upload":
      return uploadBase && respondentToken ? (
        <FileUploadControl
          blockRef={block.ref}
          accept={block.accept ?? ["image/png"]}
          maxFiles={block.maxFiles ?? 1}
          maxSizeMB={block.maxSizeMB ?? 10}
          uploadBase={uploadBase}
          respondentToken={respondentToken}
          disabled={disabled}
          onSubmit={onStructured}
        />
      ) : null;

    case "scheduling": {
      const url = block.url ?? "";
      // Whatever the builder pasted decides the copy: "I've booked" is wrong
      // under a bare Zoom room, where there was never a slot to pick.
      const room = url ? isMeetingRoom(url) : false;
      return (
        <Affordance>
          <a
            href={url || "#"}
            target="_blank"
            rel="noreferrer"
            className="flex h-10 items-center rounded-full bg-[var(--cf-accent)] px-5 text-sm font-medium text-[var(--cf-accent-text)]"
          >
            {schedulingLabel(url, block.buttonLabel)}
          </a>
          <Chip
            disabled={disabled}
            onClick={() =>
              onStructured(
                { provider: "external", url, confirmedAt: Date.now() },
                room ? "Joined" : "Booked",
              )
            }
          >
            {room ? "I’ve got the link" : "I’ve booked"}
          </Chip>
        </Affordance>
      );
    }

    case "payment":
      return (
        <PaymentAffordance
          block={block}
          disabled={disabled}
          onStructured={onStructured}
          onSkip={onSkip}
        />
      );

    // short_text, long_text, email, phone, url, number — the composer is the
    // whole affordance; nothing extra belongs in the thread.
    default:
      return null;
  }
}

function PictureOption({
  index,
  label,
  imageUrl,
  disabled,
  onClick,
}: {
  index: number;
  label: string;
  imageUrl: string | null;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group overflow-hidden rounded-2xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] text-left",
        "transition-[border-color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
        "hover:border-[var(--cf-accent)] active:scale-[0.98] motion-reduce:active:scale-100",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
      ) : (
        <span className="grid aspect-[4/3] w-full place-items-center text-2xl opacity-25">{label.charAt(0)}</span>
      )}
      <span className="flex items-center gap-1.5 px-3 py-2 text-sm">
        {index < 9 && (
          <kbd className="hidden size-4 place-items-center rounded bg-[var(--cf-chip-border)]/40 text-[0.625rem] font-medium sm:grid">
            {index + 1}
          </kbd>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </span>
    </button>
  );
}

function Affordance({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2">{children}</div>;
}
