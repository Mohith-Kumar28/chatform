"use client";

import { useRef, useState } from "react";
import { FileText, Film, ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Block, BlockMedia } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { API_ORIGIN } from "@/lib/api/mutator";


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

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_ORIGIN}/api/assets`, {
        method: "POST",
        credentials: "include",
        body,
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(err?.error?.message ?? "Upload failed");
      }
      const asset = (await res.json()) as {
        fileId: string;
        key: string;
        filename: string;
        mime: string;
        sizeBytes: number;
      };
      onChange({
        kind: asset.mime.startsWith("image/") ? "image" : asset.mime.startsWith("video/") ? "video" : "file",
        key: asset.key,
        url: `${API_ORIGIN}/p/assets/${asset.fileId}`,
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
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Paperclip className="size-3.5" />}
          {busy ? "Uploading…" : "Add image, video or file"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept="image/*,video/mp4,video/webm,application/pdf,text/csv,.doc,.docx,.xlsx"
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
        <Input
          value={media.alt ?? ""}
          placeholder="Describe the image"
          onChange={(e) => onChange({ ...media, alt: e.target.value || undefined })}
          className={cn("h-8", !media.alt && "border-[var(--warning)]/50")}
        />
      )}
    </div>
  );
}
