"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { isOverlay, type EmbedConfig } from "@/lib/embed-snippet";
import { cn } from "@/lib/utils";

/**
 * What the embed looks like on somebody else's page.
 *
 * The corner, the colour and the size of the panel are the whole decision being
 * made here, and every one of them is a spatial question that a form full of
 * selects answers badly. So the controls drive a picture.
 *
 * The mock is drawn at a real 1280×800 and scaled down as one block, rather
 * than drawn small with halved numbers: a 20px offset is 20 real pixels here,
 * so the preview cannot quietly disagree with the snippet beside it.
 */

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 800;

export function EmbedPreview({
  config,
  formTitle,
  open,
  onToggle,
  className,
}: {
  config: EmbedConfig;
  formTitle: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) setScale(width / STAGE_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const vertical = config.position.startsWith("top") ? "top" : "bottom";
  const horizontal = config.position.endsWith("left") ? "left" : "right";
  const clearance = config.offset + 68;

  const panelBox: React.CSSProperties =
    config.mode === "side-tab"
      ? { top: 0, bottom: 0, [horizontal]: 0, width: config.width }
      : {
          [vertical]: clearance,
          [horizontal]: config.offset,
          width: config.width,
          height: config.height,
          borderRadius: 16,
        };

  return (
    <div
      ref={box}
      className={cn(
        "bg-muted/40 relative w-full overflow-hidden rounded-2xl",
        className,
      )}
      style={{ height: STAGE_HEIGHT * scale }}
      aria-label="Preview of the embedded form"
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})` }}
      >
        <MockPage inline={config.mode === "inline"} height={config.autoHeight ? 620 : config.height} />

        {config.mode === "fullpage" && (
          <div className="absolute inset-0 bg-white">
            <MockConversation title={formTitle} color={config.color} />
          </div>
        )}

        {isOverlay(config.mode) && (
          <>
            {open && (
              <div
                className="absolute overflow-hidden bg-white shadow-2xl"
                style={panelBox}
                aria-hidden
              >
                <MockConversation title={formTitle} color={config.color} />
              </div>
            )}

            {/*
              A real button, so the corner can be checked by clicking it rather
              than by reading the snippet and imagining the result.
            */}
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "absolute inline-flex cursor-pointer items-center gap-2 border-0 text-white shadow-lg",
                config.label
                  ? "gap-2 rounded-full px-[18px] py-3"
                  : "size-14 justify-center rounded-full",
              )}
              style={{
                [vertical]: config.offset,
                [horizontal]: config.offset,
                background: config.color,
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1,
              }}
            >
              {config.icon && <MessageCircle className="size-[18px] shrink-0" strokeWidth={2} />}
              {config.label}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Grey bars standing in for whatever page the form is going onto. */
function MockPage({ inline, height }: { inline: boolean; height: number }) {
  return (
    <div className="h-full w-full bg-white">
      <div className="flex h-14 items-center gap-3 border-b border-neutral-200 px-10">
        <div className="size-7 rounded-lg bg-neutral-300" />
        <div className="h-3 w-24 rounded-full bg-neutral-200" />
        <div className="ml-auto flex gap-4">
          <div className="h-3 w-14 rounded-full bg-neutral-200" />
          <div className="h-3 w-14 rounded-full bg-neutral-200" />
          <div className="h-3 w-14 rounded-full bg-neutral-200" />
        </div>
      </div>
      <div className="space-y-4 px-10 py-10">
        <div className="h-8 w-2/5 rounded-lg bg-neutral-300" />
        <div className="h-3 w-3/5 rounded-full bg-neutral-200" />
        <div className="h-3 w-1/2 rounded-full bg-neutral-200" />
        {inline ? (
          <div
            className="mt-6 flex items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 bg-neutral-50"
            style={{ height }}
          >
            <span className="text-sm font-medium text-neutral-400">The conversation, in the page</span>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-neutral-100" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Enough of a conversation to judge the panel's proportions by. */
function MockConversation({ title, color }: { title: string; color: string }) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2 px-5 py-4" style={{ background: color }}>
        <MessageCircle className="size-4 text-white" strokeWidth={2} />
        <span className="truncate text-sm font-medium text-white">{title}</span>
      </div>
      <div className="flex-1 space-y-3 p-5">
        <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
          <div className="h-2.5 w-40 rounded-full bg-neutral-300" />
          <div className="mt-2 h-2.5 w-28 rounded-full bg-neutral-200" />
        </div>
        <div className="ml-auto max-w-[65%] rounded-2xl rounded-br-sm px-4 py-3" style={{ background: color }}>
          <div className="h-2.5 w-24 rounded-full bg-white/70" />
        </div>
        <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3">
          <div className="h-2.5 w-32 rounded-full bg-neutral-300" />
        </div>
      </div>
      <div className="border-t border-neutral-200 p-4">
        <div className="h-9 rounded-full bg-neutral-100" />
      </div>
    </div>
  );
}
