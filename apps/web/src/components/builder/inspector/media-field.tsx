"use client";

import { useRef, useState } from "react";
import { FileText, Film, ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Block, BlockMedia } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { INLINE_IMAGE, INLINE_VIDEO, uploadAsset } from "@/lib/assets";
import { BufferedInput } from "@/components/ui/buffered-input";
import { useEntitlements } from "@/hooks/use-entitlements";
import { fieldInputClass } from "./fields";


/**
 * Attach an image, a short video, or a downloadable file to a question.
 *
 * Images and video render above the question; a file renders as a download the
 * respondent can take away — a brief, a price list, a consent PDF.
 */
export function MediaField({
  media,
  onChange,
}: {
  media: Block["media"];
  onChange: (media: BlockMedia | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const maxMb = useEntitlements().limit("max_upload_mb_per_file");

  async function upload(file: File) {
    setBusy(true);
    try {
      const asset = await uploadAsset(file, { maxMb });
      onChange({
        // Only what a browser draws inline is shown as an image or a clip — an
        // SVG or a .mov is served as a download, so it is offered as one.
        kind: INLINE_IMAGE.test(asset.mime) ? "image" : INLINE_VIDEO.test(asset.mime) ? "video" : "file",
        key: asset.key,
        url: asset.url,
        filename: asset.filename,
        mime: asset.mime,
        sizeBytes: asset.sizeBytes,
      });
    } catch (err) {
      toast.error("Couldn't upload", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (!media) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground -ml-2 justify-start"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          {busy ? "Uploading…" : "Add media"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </>
    );
  }

  const Icon = media.kind === "image" ? ImageIcon : media.kind === "video" ? Film : FileText;

  return (
    <div className="space-y-2">
      <div className="bg-muted/50 flex items-center gap-2 rounded-lg px-2.5 py-2">
        <Icon className="text-muted-foreground size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs">{media.filename ?? media.kind}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Remove media"
          className="hover:text-destructive shrink-0"
          onClick={() => onChange(null)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {media.kind === "image" && (
        <BufferedInput
          value={media.alt ?? ""}
          placeholder="Alt text"
          onCommit={(v) => onChange({ ...media, alt: v || undefined })}
          className={cn("h-9", fieldInputClass, !media.alt && "border-[var(--warning)]/50")}
        />
      )}
    </div>
  );
}
