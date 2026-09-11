"use client";

import { useMemo } from "react";
import { CornerDownLeft, Download, FileText, FileUp, PenLine } from "lucide-react";
import { schedulingLabel, toPublicBlock, type Block, type FormDoc } from "@repo/form-schema";
import { DateComposer } from "@/components/chat/composers/date";
import { PhoneInput } from "@/components/chat/composers/phone";
import { PaymentAffordance } from "@/components/chat/payment-affordance";
import { chatThemeVars } from "@/lib/chat-theme";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api/mutator";
import { LogoMark } from "@/components/brand/logo";
import { useEntitlements } from "@/hooks/use-entitlements";


/**
 * The selected question, rendered as the respondent will see it.
 *
 * The centre used to run a live conversation, which meant you had to answer
 * your way to the question you were editing before you could see it. This is
 * the Youform model: pick a block on the left, see that block here. The full
 * conversation is still one click away behind Preview in the header.
 *
 * Themed with `chatThemeVars`, the same function the live runtime uses, so
 * what shows here is what ships.
 */
export function QuestionPreview({
  doc,
  block,
  slug,
}: {
  doc: FormDoc;
  block: Block;
  /**
   * The form's public slug, which seeds its background pattern. It lives on
   * the form row rather than the document, so it arrives separately — and
   * without it this preview would show a flat page for a form that ships with
   * a texture, which is the exact drift `chatThemeVars` exists to prevent.
   */
  slug?: string | null;
}) {
  const themeVars = useMemo(() => chatThemeVars(doc.theme, slug), [doc.theme, slug]);
  const pub = useMemo(() => toPublicBlock(block), [block]);
  const agentName = doc.settings.agent.displayName || doc.title;

  // Brand logo/name are a Pro feature (`brand_logo`) — publish strips them for
  // a plan that doesn't include it, so a free-plan preview must show the same
  // chatform-branded chrome a respondent will actually get, not the logo that
  // is sitting in the draft waiting for an upgrade.
  const { can } = useEntitlements();
  const branded = can("brand_logo");
  const logoUrl = branded ? doc.theme.logoUrl : null;
  const brandName = branded ? doc.theme.brandName : undefined;

  return (
    <div
      className="chat-surface shadow-md flex max-h-full flex-col overflow-hidden rounded-2xl"
      style={themeVars}
    >
      <header className="flex items-center gap-2.5 px-4 py-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-7 shrink-0 rounded-lg object-contain" />
        ) : (
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--cf-surface)] ring-1 ring-black/5">
            <LogoMark className="size-4" />
          </div>
        )}
        <p className="min-w-0 truncate text-sm font-medium">
          {agentName}
          {brandName && (
            <span className="ml-1.5 font-normal opacity-50">· {brandName}</span>
          )}
        </p>
      </header>

      <div className="min-h-0 overflow-y-auto px-4 pt-2 pb-4">
        <div className="mx-auto flex w-full max-w-md flex-col gap-3">
          <MediaBlock block={block} />

          <div className="flex justify-start">
            <div
              className="bubble-bot max-w-[90%] border px-4 py-2.5 text-[0.9375rem] leading-relaxed"
              style={{
                background: "var(--cf-bot-bubble)",
                color: "var(--cf-bot-bubble-text)",
                borderColor: "var(--cf-bot-bubble-border)",
              }}
            >
              <p className="whitespace-pre-wrap">{block.title || "Your question"}</p>
              {block.description && (
                <p className="mt-1 text-sm opacity-70">{block.description}</p>
              )}
            </div>
          </div>

          <div className="pt-1">
            <StaticComposer block={pub} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Image, video or a downloadable file, above the question. */
function MediaBlock({ block }: { block: Block }) {
  const media = block.media;
  if (!media) return null;

  const src = media.url ?? (media.key ? `${API_ORIGIN}/p/assets/${media.key.split("/").pop()?.split("-")[0]}` : null);
  if (!src) return null;

  if (media.kind === "image") {
    return (
      <figure className="space-y-1">
        {/*
          `object-contain`, not `object-cover`. Paired with `w-full` the cover
          crop sliced the top and bottom off anything that was not already
          letterbox-shaped — a square logo lost its head — and it did so only
          here: the respondent's runtime (`question-media.tsx`) has always drawn
          the whole image. A preview that crops what the live form shows in full
          is worse than no preview, because you correct for a problem that only
          exists on your screen.

          `w-auto` with `mx-auto` so a portrait image is its own width and
          centred, rather than a narrow strip pinned to the left of the card.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={media.alt ?? ""}
          className="mx-auto block max-h-72 w-auto max-w-full rounded-xl object-contain"
          style={{ borderRadius: "var(--cf-radius)" }}
        />
        {media.caption && <figcaption className="px-1 text-xs opacity-60">{media.caption}</figcaption>}
      </figure>
    );
  }

  if (media.kind === "video") {
    return (
      <figure className="space-y-1">
        <video
          src={src}
          controls
          preload="metadata"
          className="max-h-56 w-full bg-black"
          style={{ borderRadius: "var(--cf-radius)" }}
        />
        {media.caption && <figcaption className="px-1 text-xs opacity-60">{media.caption}</figcaption>}
      </figure>
    );
  }

  return (
    <a
      href={src}
      download={media.filename}
      className="flex items-center gap-2.5 border px-3 py-2.5 text-sm transition-opacity hover:opacity-80"
      style={{ borderColor: "var(--cf-chip-border)", borderRadius: "var(--cf-radius)" }}
    >
      <FileText className="size-4 shrink-0 opacity-60" />
      <span className="min-w-0 flex-1 truncate">{media.filename ?? "Attachment"}</span>
      {media.sizeBytes !== undefined && (
        <span className="shrink-0 text-xs opacity-50">{Math.round(media.sizeBytes / 1024)} KB</span>
      )}
      <Download className="size-3.5 shrink-0 opacity-60" />
    </a>
  );
}

/**
 * Shows a real control without letting anyone use it.
 *
 * `inert` rather than `pointer-events-none` alone: the latter stops the mouse
 * and nothing else, so the calendar's month arrows stayed tabbable and the
 * builder's own single-key shortcuts would fire against a focused control in
 * a preview. `inert` takes the whole subtree out of focus and the a11y tree.
 */
function Inert({ children }: { children: React.ReactNode }) {
  return (
    <div inert className="[&_*]:cursor-default">
      {children}
    </div>
  );
}

/**
 * A non-interactive rendering of the control this block shows. Deliberately
 * inert — this is a preview of shape, not a place to answer.
 */
function StaticComposer({ block }: { block: ReturnType<typeof toPublicBlock> }) {
  const chip = "rounded-full border px-3.5 py-2 text-sm";
  const chipStyle = {
    borderColor: "var(--cf-chip-border)",
    background: "var(--cf-chip-bg)",
  };
  const input =
    "flex h-11 items-center rounded-2xl border px-4 text-[0.9375rem] opacity-50";

  switch (block.type) {
    case "welcome":
    case "statement":
      return (
        <div
          className="grid h-11 place-items-center rounded-full text-sm font-medium"
          style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
        >
          {block.buttonLabel || "Continue"}
        </div>
      );

    case "yes_no":
      return (
        <div className="flex flex-wrap gap-2">
          <span className={chip} style={chipStyle}>{block.yesLabel ?? "Yes"}</span>
          <span className={chip} style={chipStyle}>{block.noLabel ?? "No"}</span>
        </div>
      );

    case "single_select":
    case "multi_select":
    case "dropdown":
    case "picture_choice":
      return (
        <div className="flex flex-wrap gap-2">
          {(block.options ?? []).slice(0, 8).map((o) => (
            <span key={o.id} className={chip} style={chipStyle}>
              {o.label || "Option"}
            </span>
          ))}
          {(block.options ?? []).length === 0 && (
            <span className="text-sm opacity-40">No options yet</span>
          )}
        </div>
      );

    case "rating":
      return (
        <div className="flex gap-1 text-2xl" style={{ color: "var(--cf-accent)" }}>
          {Array.from({ length: block.scale ?? 5 }, (_, i) => (
            <span key={i} className="opacity-30">
              {block.shape === "heart" ? "♥" : block.shape === "number" ? i + 1 : "★"}
            </span>
          ))}
        </div>
      );

    case "nps":
    case "opinion_scale": {
      const start = block.type === "nps" ? 0 : (block.startAt ?? 1);
      const count = block.type === "nps" ? 11 : (block.steps ?? 5);
      return (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: count }, (_, i) => (
              <span
                key={i}
                className="min-w-9 rounded-xl border px-2.5 py-2 text-center text-sm"
                style={chipStyle}
              >
                {start + i}
              </span>
            ))}
          </div>
          {(block.labels?.low || block.labels?.high) && (
            <div className="flex justify-between text-xs opacity-50">
              <span>{block.labels?.low}</span>
              <span>{block.labels?.high}</span>
            </div>
          )}
        </div>
      );
    }

    case "ranking":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(block.items ?? []).map((i) => (
            <span key={i.id} className={chip} style={chipStyle}>
              {i.label}
            </span>
          ))}
        </div>
      );

    case "matrix":
      return (
        <div className="space-y-2">
          {(block.rows ?? []).slice(0, 3).map((r) => (
            <div key={r.id} className="space-y-1">
              <p className="text-xs opacity-60">{r.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {(block.columns ?? []).map((col) => (
                  <span key={col.id} className="rounded-full border px-2.5 py-1 text-xs" style={chipStyle}>
                    {col.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      );

    case "contact_info":
    case "address":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {(block.fields ?? []).map((f) => (
            <div key={f} className="space-y-1">
              <span className="block text-xs opacity-60">{f.replaceAll("_", " ")}</span>
              <div className={cn(input, "h-10 rounded-xl")} style={chipStyle} />
            </div>
          ))}
        </div>
      );

    /**
     * A repeating group, drawn at its opening size.
     *
     * `minEntries` rows and no more: the preview's job is the shape of the
     * question, and an author who set a floor of two should see two.
     */
    /*
      The same repeating group the composer draws, minus the typing.

      Two things here used to disagree with what shipped. The entries were one
      box sliced by `divide-y`, which takes no border colour from `chipStyle` —
      the rules fell back to the current text colour and drew as hard black
      lines across the card. And the add button was drawn unconditionally, so a
      group fixed at five members advertised an Add that the composer would
      never show. Each entry is now its own card on `--cf-sunken`, and Add
      appears only where the respondent will really get one.
    */
    case "field_group": {
      const groupFields = block.groupFields ?? [];
      const max = block.maxEntries ?? 5;
      const rows = Math.min(Math.max(block.minEntries ?? 1, 1), max);
      const itemLabel = block.itemLabel ?? "Entry";
      return (
        <div className="space-y-2">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="space-y-2.5 rounded-2xl border p-3"
              style={{ borderColor: "var(--cf-chip-border)", background: "var(--cf-sunken)" }}
            >
              <p className="flex items-center gap-2 text-xs font-medium">
                <span
                  className="grid size-5 shrink-0 place-items-center rounded-full text-[0.625rem] font-semibold"
                  style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
                >
                  {i + 1}
                </span>
                <span className="truncate opacity-70">{itemLabel}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {groupFields.map((f) => (
                  <div key={f.key} className={cn("space-y-1", f.kind === "long_text" && "sm:col-span-2")}>
                    <span className="block text-xs opacity-60">
                      {f.label}
                      {f.required && <span className="ml-0.5 opacity-70">*</span>}
                    </span>
                    <div className={cn(input, "h-10 rounded-xl")} style={chipStyle} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Nothing to add when the first row count is already the last. */}
          {rows < max && (
            <span className={cn(chip, "inline-flex")} style={chipStyle}>
              + Add {itemLabel.toLowerCase()}
            </span>
          )}
        </div>
      );
    }

    /**
     * The real calendar and the real payment control, not a drawing of them.
     *
     * These two were the only composers this file mocked rather than rendered,
     * and both mocks were wrong in a way that mattered: `date` was a grid of
     * grey rectangles that reads as a loading skeleton, and `payment` had no
     * case at all, so a UPI block with an amount and a payee fell through to
     * "Type your answer…" — the preview said the question collected typed text
     * when it actually shows a QR code. The file promises "what shows here is
     * what ships"; for these two it did not.
     *
     * Both components are pure and prop-driven, so they render here as-is
     * inside `Inert`, which is what keeps this a preview of shape.
     */
    case "date":
      return (
        <Inert>
          <DateComposer
            min={block.minDate}
            max={block.maxDate}
            disablePast={block.disablePast}
            onPick={() => {}}
          />
        </Inert>
      );

    case "payment":
      return (
        <Inert>
          <PaymentAffordance block={block} disabled onStructured={() => {}} onSkip={() => {}} />
        </Inert>
      );

    // Booking sends them out to the builder's own link, so there is nothing to
    // draw but the button that goes there — worth showing, because its wording
    // changes with the link (a bare Meet room has no slot to pick).
    case "scheduling":
      return (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="flex h-10 items-center rounded-full px-5 text-sm font-medium"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            {schedulingLabel(block.url ?? "", block.buttonLabel)}
          </span>
          <span className={chip} style={chipStyle}>
            {block.url ? "I've booked" : "Add a booking link in the panel"}
          </span>
        </div>
      );

    case "file_upload":
    case "signature": {
      // Mirrors the runtime dropzone in `chat/file-upload` — the accent-tinted
      // dash and disc, not the grey box the preview used to draw.
      const Glyph = block.type === "signature" ? PenLine : FileUp;
      return (
        <div
          className="grid h-24 place-items-center gap-2 rounded-2xl border border-dashed"
          style={{
            borderColor: "color-mix(in oklch, var(--cf-accent) 38%, var(--cf-chip-border))",
            background: "color-mix(in oklch, var(--cf-accent) 4%, transparent)",
          }}
        >
          <span
            className="grid size-10 place-items-center justify-self-center rounded-full"
            style={{
              background: "color-mix(in oklch, var(--cf-accent) 14%, transparent)",
              color: "var(--cf-accent)",
            }}
          >
            <Glyph className="size-5" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-medium opacity-70">
            {block.type === "signature" ? "Sign here" : "Drop a file or tap to choose"}
          </span>
        </div>
      );
    }

    case "legal_consent":
      return (
        <div className="space-y-2">
          <p className="rounded-xl border px-3 py-2.5 text-sm opacity-70" style={chipStyle}>
            {block.consentText || "Your consent text"}
          </p>
          <div className="flex flex-wrap gap-2">
            <span className={chip} style={chipStyle}>{block.agreeLabel || "I agree"}</span>
            {block.allowDecline && (
              <span className={chip} style={chipStyle}>{block.declineLabel || "I do not agree"}</span>
            )}
          </div>
        </div>
      );

    // A question that will send a code is a two-step question, and an author
    // deciding whether to ask for it should see that here rather than only in
    // the live preview.
    case "email":
      return (
        <div className="space-y-1.5">
          {block.verify && (
            <p className="text-[0.6875rem] opacity-55">
              We'll email a 6-digit code to confirm this address.
            </p>
          )}
          <div className="flex items-end gap-2">
            <div className={cn(input, "flex-1")} style={chipStyle}>
              you@example.com
            </div>
            <div
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium"
              style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
            >
              Send
              <CornerDownLeft className="hidden size-3.5 opacity-60 sm:block" aria-hidden />
            </div>
          </div>
        </div>
      );

    /*
      The runtime's own field, not a drawing of it.

      A phone question is the one text question whose box is not a text box —
      a country picker and a national number — and the author choosing a
      country code needs to see where the picker opens. Rendered as-is inside
      `Inert` for the same reason `DateComposer` is: it is prop-driven, so a
      mock of it is just a second thing to keep in step.
    */
    case "phone":
      return (
        <div className="space-y-1.5">
          {block.verify && (
            <p className="text-[0.6875rem] opacity-55">
              We'll text a 6-digit code to confirm this number.
            </p>
          )}
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Inert>
                <PhoneInput
                  value=""
                  onChange={() => {}}
                  onSubmit={() => {}}
                  countryHint={block.countryHint}
                  placeholder="Your number"
                />
              </Inert>
            </div>
            <div
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium"
              style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
            >
              Send
              <CornerDownLeft className="hidden size-3.5 opacity-60 sm:block" aria-hidden />
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div className="flex items-end gap-2">
          <div className={cn(input, "flex-1")} style={chipStyle}>
            {block.placeholder || "Type your answer…"}
          </div>
          <div
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            Send
            <CornerDownLeft className="hidden size-3.5 opacity-60 sm:block" aria-hidden />
          </div>
        </div>
      );
  }
}
