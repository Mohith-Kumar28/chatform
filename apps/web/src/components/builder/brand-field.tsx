"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ThemeDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_ORIGIN } from "@/lib/api/mutator";


/**
 * Optional brand logo and name.
 *
 * Both are opt-in — a form with neither still looks finished, falling back to
 * the form's initial and title. The logo replaces the letter avatar in the chat
 * header and appears on the completion screen; the name sits under the agent's.
 */
export function BrandField({
  theme,
  onChange,
}: {
  theme: ThemeDoc;
  onChange: (patch: Partial<ThemeDoc>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
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
      const asset = (await res.json()) as { fileId: string; key: string };
      onChange({ logoUrl: `${API_ORIGIN}/p/assets/${asset.fileId}`, logoKey: asset.key });
    } catch (err) {
      toast.error("Couldn't upload", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          aria-label={theme.logoUrl ? "Replace logo" : "Upload logo"}
          className="bg-muted/60 hover:bg-muted grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl transition-colors disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin opacity-60" />
          ) : theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={theme.logoUrl} alt="" className="size-full object-contain" />
          ) : (
            <ImagePlus className="size-4 opacity-50" />
          )}
        </button>

        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="brand-name">Name</Label>
          <Input
            id="brand-name"
            value={theme.brandName ?? ""}
            maxLength={60}
            placeholder="Optional"
            onChange={(e) => onChange({ brandName: e.target.value || undefined })}
          />
        </div>

        {theme.logoUrl && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove logo"
            className="hover:text-destructive mt-5 shrink-0"
            onClick={() => onChange({ logoUrl: null, logoKey: null })}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
