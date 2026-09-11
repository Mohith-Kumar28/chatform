"use client";

import { QuestionDescription } from "@/components/chat/rich-text";
import { useMemo } from "react";
import { FileUp } from "lucide-react";
import { fileDownloadUrl, toPublicBlock, type Block, type FormDoc } from "@repo/form-schema";
import { FileCard } from "@/components/chat/file-card";
import { PhoneInput } from "@/components/chat/composers/phone";
import { QuestionAffordance } from "@/components/chat/question-affordance";
import { SendRow, TextInput } from "@/components/chat/composers/primitives";
import { inputSemanticsFor } from "@/components/chat/composers/input-semantics";
import { chatThemeVars } from "@/lib/chat-theme";
import { API_ORIGIN } from "@/lib/api/mutator";
import { LogoMark } from "@/components/brand/logo";
import { useEntitlements } from "@/hooks/use-entitlements";
import { revealInInspector } from "./inspector-reveal";


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
      className="chat-surface shadow-md flex max-h-full flex-col overflow-hidden rounded-2xl [&_[data-inspect]]:cursor-pointer"
      style={themeVars}
      // Nothing here is editable in place, and people click it expecting it to
      // be — so a click points them at the field that is. See `inspector-reveal`.
      onClick={(e) => {
        const hit = (e.target as HTMLElement).closest<HTMLElement>("[data-inspect]");
        if (hit?.dataset.inspect) revealInInspector(hit.dataset.inspect);
      }}
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
          <div data-inspect="media" className="empty:hidden">
            <MediaBlock block={block} />
          </div>

          <div className="flex justify-start">
            <div
              data-inspect="title"
              className="bubble-bot max-w-[90%] border px-4 py-2.5 text-[0.9375rem] leading-relaxed"
              style={{
                background: "var(--cf-bot-bubble)",
                color: "var(--cf-bot-bubble-text)",
                borderColor: "var(--cf-bot-bubble-border)",
              }}
            >
              <p className="whitespace-pre-wrap">{block.title || "Your question"}</p>
            </div>
          </div>

          {/* Under the bubble, as the chat draws it (`chat-client`). */}
          {block.description && (
            <div data-inspect="description">
              <QuestionDescription
                markdown={block.description}
                recall={new Map(doc.blocks.map((b) => [b.ref, b.title || b.ref]))}
                className="max-w-[90%] px-1 opacity-85"
              />
            </div>
          )}

          {/* `answer` is the catch-all; the composer marks its own parts more
              precisely where the inspector has a field for them. */}
          <div className="pt-1" data-inspect="answer">
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

  // The chat's own card, so the preview cannot draw a file differently.
  const name = media.filename ?? "Attachment";
  return <FileCard filename={name} sizeBytes={media.sizeBytes} downloadHref={fileDownloadUrl(src, name)} />;
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
 * The control this block shows, drawn by the runtime's own component.
 *
 * This file used to carry a hand-written imitation of every composer — chips
 * for the choices, stars for a rating, a grid of grey boxes for a date. It
 * drifted, exactly as a second implementation of anything does: the chips had
 * no `1` `2` `3` key hints, a picture choice showed its labels and not its
 * pictures, and a ranking list looked like a row of plain chips. An author
 * checking their question in the preview was reading a drawing of the product
 * rather than the product.
 *
 * So the affordance is now `QuestionAffordance`, the same component the hosted
 * runtime renders, in `preview` mode: full strength, sealed with `inert`, and
 * deaf to the keyboard. Two things it cannot do are still drawn here —
 *
 *   - the message box and Send, which in the runtime belong to the chat
 *     composer rather than to the question, and
 *   - the upload dropzone, which the runtime only draws once a session exists
 *     to upload into, and would otherwise render nothing at all.
 */
function StaticComposer({ block }: { block: ReturnType<typeof toPublicBlock> }) {
  // `inspector-reveal` targets, kept at the granularity the panel has fields
  // for. A click anywhere else in here falls through to the `answer` marker
  // this whole composer sits inside.
  const inspect =
    block.type === "welcome" || block.type === "statement"
      ? "button"
      : CHOICE_BLOCKS.has(block.type)
        ? "options"
        : undefined;

  if (block.type === "file_upload") return <UploadDropzone />;

  return (
    <div className="space-y-2" data-inspect={inspect}>
      <QuestionAffordance
        preview
        block={block}
        uploadBase={null}
        respondentToken={null}
        onStructured={noop}
        onSkip={noop}
      />
      {TYPED_BLOCKS.has(block.type) && <TypedComposer block={block} />}
    </div>
  );
}

const noop = () => {};

/** The blocks whose answer is typed into the message box. */
const TYPED_BLOCKS = new Set(["short_text", "long_text", "email", "phone", "url", "number"]);

/** The blocks whose affordance is the option list the inspector edits. */
const CHOICE_BLOCKS = new Set([
  "single_select",
  "multi_select",
  "dropdown",
  "picture_choice",
  "ranking",
]);

/**
 * The message box and Send, as the runtime draws them.
 *
 * `SendRow` and `TextInput` rather than a copy of their markup, so the Send
 * button's ⏎ hint, the box's radius and the skip affordance cannot drift from
 * the thing a respondent uses. Empty and inert: this is where an answer would
 * be typed, not a place to type one.
 */
function TypedComposer({ block }: { block: ReturnType<typeof toPublicBlock> }) {
  return (
    <div className="space-y-1.5">
      {/* A question that will send a code is a two-step question, and the
          author deciding whether to ask for it should see that here. */}
      {(block.type === "email" || block.type === "phone") && block.verify && (
        <p className="text-[0.6875rem] opacity-55">
          {block.type === "email"
            ? "We’ll email a 6-digit code to confirm this address."
            : "We’ll text a 6-digit code to confirm this number."}
        </p>
      )}
      {/* The marker goes outside `Inert`: an inert subtree is never a click
          target, so a marker inside one is never found by `closest`. */}
      <div data-inspect="placeholder">
        <Inert>
          <SendRow onSend={noop}>
            {block.type === "phone" ? (
              <PhoneInput
                value=""
                onChange={noop}
                onSubmit={noop}
                countryHint={block.countryHint}
                placeholder={block.placeholder || "Your number"}
              />
            ) : (
              <TextInput
                value=""
                onChange={noop}
                onSubmit={noop}
                placeholder={block.placeholder || "Type your answer…"}
                semantics={inputSemanticsFor(block)}
                multiline={block.type === "long_text"}
              />
            )}
          </SendRow>
        </Inert>
      </div>
    </div>
  );
}

/**
 * The dropzone, which is the one control the runtime will not render here.
 *
 * `FileUploadControl` needs a session to upload into and returns nothing
 * without one, so a preview of a file question would be an empty space. This
 * mirrors its resting state — the accent-tinted dash and disc — and nothing
 * else about it.
 */
function UploadDropzone() {
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
        <FileUp className="size-5" strokeWidth={1.75} />
      </span>
      <span className="text-sm font-medium opacity-70">Drop a file or tap to choose</span>
    </div>
  );
}
