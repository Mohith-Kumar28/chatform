"use client";

import { useMemo } from "react";
import { Download, FileText } from "lucide-react";
import { toPublicBlock, type Block, type FormDoc } from "@repo/form-schema";
import { chatThemeVars } from "@/lib/chat-theme";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api/mutator";


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
export function QuestionPreview({ doc, block }: { doc: FormDoc; block: Block }) {
  const themeVars = useMemo(() => chatThemeVars(doc.theme), [doc.theme]);
  const pub = useMemo(() => toPublicBlock(block), [block]);
  const agentName = doc.settings.agent.displayName || doc.title;

  return (
    <div
      className="chat-surface shadow-md flex max-h-full flex-col overflow-hidden rounded-2xl"
      style={themeVars}
    >
      <header className="flex items-center gap-2.5 px-4 py-3">
        {doc.theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={doc.theme.logoUrl} alt="" className="size-7 shrink-0 rounded-lg object-contain" />
        ) : (
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--cf-accent)] text-xs font-semibold text-[var(--cf-accent-text)]">
            {agentName.charAt(0).toUpperCase()}
          </div>
        )}
        <p className="min-w-0 truncate text-sm font-medium">
          {agentName}
          {doc.theme.brandName && (
            <span className="ml-1.5 font-normal opacity-50">· {doc.theme.brandName}</span>
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={media.alt ?? ""}
          className="max-h-56 w-full rounded-xl object-cover"
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

    case "date":
      return (
        <div className="rounded-2xl border p-3" style={chipStyle}>
          <div className="mb-2 h-4 w-24 rounded opacity-20" style={{ background: "currentColor" }} />
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 21 }, (_, i) => (
              <div key={i} className="h-6 rounded opacity-10" style={{ background: "currentColor" }} />
            ))}
          </div>
        </div>
      );

    case "file_upload":
    case "signature":
      return (
        <div
          className="grid h-24 place-items-center rounded-2xl border border-dashed text-sm opacity-50"
          style={{ borderColor: "var(--cf-chip-border)" }}
        >
          {block.type === "signature" ? "Sign here" : "Drop a file or tap to choose"}
        </div>
      );

    case "legal_consent":
      return (
        <div className="space-y-2">
          <p className="rounded-xl border px-3 py-2.5 text-sm opacity-70" style={chipStyle}>
            {block.consentText || "Your consent text"}
          </p>
          <span className={chip} style={chipStyle}>I agree</span>
        </div>
      );

    default:
      return (
        <div className="flex items-end gap-2">
          <div className={cn(input, "flex-1")} style={chipStyle}>
            {block.placeholder || "Type your answer…"}
          </div>
          <div
            className="grid h-11 shrink-0 place-items-center rounded-full px-4 text-sm font-medium"
            style={{ background: "var(--cf-accent)", color: "var(--cf-accent-text)" }}
          >
            Send
          </div>
        </div>
      );
  }
}
