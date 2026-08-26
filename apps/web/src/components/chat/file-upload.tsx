"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Upload control.
 *
 * The previous version looked like a drop zone but had no drag handlers, showed
 * no progress, and its "Send file" button called an empty `onSubmit` — the
 * answer only landed because the confirm endpoint records it server-side, so a
 * failed confirm looked identical to a success.
 */
export function FileUploadControl({
  accept,
  maxFiles,
  maxSizeMB,
  blockRef,
  uploadBase,
  respondentToken,
  disabled,
}: {
  accept: string[];
  maxFiles: number;
  maxSizeMB: number;
  blockRef: string;
  uploadBase: string;
  respondentToken: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<
    { name: string; size: number; state: "uploading" | "done" | "error"; error?: string }[]
  >([]);

  async function upload(files: File[]) {
    const room = maxFiles - items.filter((i) => i.state !== "error").length;
    for (const file of files.slice(0, Math.max(0, room))) {
      if (file.size > maxSizeMB * 1024 * 1024) {
        setItems((s) => [...s, { name: file.name, size: file.size, state: "error", error: `Over ${maxSizeMB}MB` }]);
        continue;
      }
      const index = items.length;
      setItems((s) => [...s, { name: file.name, size: file.size, state: "uploading" }]);

      const fail = (error: string) =>
        setItems((s) => s.map((it, i) => (i === index ? { ...it, state: "error", error } : it)));

      try {
        const intent = await fetch(`${uploadBase}/intent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
          body: JSON.stringify({ ref: blockRef, filename: file.name, mime: file.type, size: file.size }),
        });
        if (!intent.ok) {
          const body = (await intent.json().catch(() => null)) as { error?: { message?: string } } | null;
          fail(body?.error?.message ?? "Upload rejected");
          continue;
        }
        const { fileId } = (await intent.json()) as { fileId: string };

        const put = await fetch(`${uploadBase}/${fileId}`, {
          method: "PUT",
          headers: { "x-respondent-token": respondentToken, "content-type": file.type },
          body: file,
        });
        if (!put.ok) {
          fail("Upload failed");
          continue;
        }

        // Confirm is what actually records the answer — surface its failure
        // rather than showing a success state regardless.
        const confirm = await fetch(`${uploadBase}/${fileId}/confirm`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-respondent-token": respondentToken },
          body: JSON.stringify({ ref: blockRef }),
        });
        if (!confirm.ok) {
          fail("Couldn't confirm the upload");
          continue;
        }
        setItems((s) => s.map((it, i) => (i === index ? { ...it, state: "done" } : it)));
      } catch {
        fail("Upload failed");
      }
    }
  }

  const full = items.filter((i) => i.state !== "error").length >= maxFiles;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "rounded-2xl border border-dashed transition-colors",
          dragging ? "border-[var(--cf-accent)] bg-[var(--cf-accent)]/5" : "border-[var(--cf-chip-border)]",
          full && "opacity-50",
        )}
      >
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 px-4 py-6 disabled:pointer-events-none"
        >
          <FileUp className="size-5 opacity-50" />
          <span className="text-sm">
            {full ? "That's all we need" : dragging ? "Drop to upload" : "Drop a file or tap to choose"}
          </span>
          <span className="text-xs opacity-50">
            Up to {maxSizeMB}MB{maxFiles > 1 ? ` · ${maxFiles} files max` : ""}
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple={maxFiles > 1}
          accept={accept.join(",")}
          onChange={(e) => {
            void upload(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li
              key={`${item.name}-${i}`}
              className="flex items-center gap-2 rounded-xl border border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)] px-3 py-2 text-xs"
            >
              {item.state === "uploading" ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin opacity-60" />
              ) : item.state === "error" ? (
                <X className="text-destructive size-3.5 shrink-0" />
              ) : (
                <Paperclip className="size-3.5 shrink-0 opacity-60" />
              )}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className={cn("shrink-0 opacity-60", item.state === "error" && "text-destructive")}>
                {item.state === "error" ? item.error : `${Math.round(item.size / 1024)} KB`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
