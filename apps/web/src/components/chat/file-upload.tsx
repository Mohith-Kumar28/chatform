"use client";

import { useRef, useState } from "react";
import { Check, FileText, FileUp, ImageUp, Loader2, TriangleAlert, X } from "lucide-react";
import { uploadToSession, type UploadedFile } from "./upload-transport";
import { cn } from "@/lib/utils";

interface Item {
  key: string;
  name: string;
  size: number;
  state: "uploading" | "done" | "error";
  error?: string;
  file?: UploadedFile;
}

/**
 * Upload control.
 *
 * The answer is sent **once**, from here, with every confirmed file in it.
 *
 * It used to be the server that recorded the answer, on each `confirm` — which
 * meant the first of two files answered the question and moved the
 * conversation on, and the second landed against whatever block came next. Two
 * files selected together produced one saved, one lost, and a validation error
 * for a question the respondent had not been asked yet. Collecting the
 * descriptors here and sending them together is the only shape that matches a
 * `maxFiles` greater than one.
 */
export function FileUploadControl({
  accept,
  maxFiles,
  maxSizeMB,
  blockRef,
  uploadBase,
  respondentToken,
  disabled,
  onSubmit,
}: {
  accept: string[];
  maxFiles: number;
  maxSizeMB: number;
  blockRef: string;
  uploadBase: string;
  respondentToken: string;
  disabled?: boolean;
  onSubmit: (files: UploadedFile[], display: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  /** Ids are generated here so a row can be updated without an index. */
  const nextKey = useRef(0);

  async function upload(files: File[]) {
    // Read the live count from the updater rather than the render's snapshot:
    // `items.length` inside a loop is the value from before any of this batch
    // was added, which is what made two files overwrite the same row.
    let room = maxFiles;
    setItems((s) => {
      room = maxFiles - s.filter((i) => i.state !== "error").length;
      return s;
    });

    for (const file of files.slice(0, Math.max(0, room))) {
      const key = `f${nextKey.current++}`;
      const push = (item: Item) => setItems((s) => [...s, item]);
      const patch = (changes: Partial<Item>) =>
        setItems((s) => s.map((it) => (it.key === key ? { ...it, ...changes } : it)));

      // Say what is wrong AND what to do about it. "Over 10MB" told the
      // respondent they had failed without telling them how to succeed.
      if (file.size > maxSizeMB * 1024 * 1024) {
        push({
          key,
          name: file.name,
          size: file.size,
          state: "error",
          error: `This one is ${formatSize(file.size)} — the limit is ${maxSizeMB}MB. Try a smaller version, or a screenshot instead.`,
        });
        continue;
      }
      if (accept.length > 0 && file.type && !accept.includes(file.type)) {
        push({
          key,
          name: file.name,
          size: file.size,
          state: "error",
          error: `${describeType(file.type)} files aren't accepted here. Try ${describeAccept(accept)}.`,
        });
        continue;
      }

      push({ key, name: file.name, size: file.size, state: "uploading" });
      try {
        const stored = await uploadToSession({ file, blockRef, uploadBase, respondentToken });
        patch({ state: "done", file: stored });
      } catch (err) {
        patch({ state: "error", error: err instanceof Error ? err.message : "Upload failed" });
      }
    }
  }

  const done = items.filter((i) => i.state === "done");
  const busy = items.some((i) => i.state === "uploading");
  const full = items.filter((i) => i.state !== "error").length >= maxFiles;
  // "Up to 3MB" answered the question nobody asked. What a respondent about to
  // dig through their files wants first is which files are even allowed.
  const limits = [
    describeFormats(accept),
    `up to ${maxSizeMB}MB`,
    maxFiles > 1 ? `${maxFiles} files max` : "",
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <div className="space-y-2">
      {/*
        The dropzone carries the form's own accent rather than the neutral
        border every other surface uses. It is the only thing being asked for
        on the screen, and a grey dashed rectangle around a grey glyph read as
        a disabled placeholder — so the dash, the wash and the icon are all
        mixed from `--cf-accent`, which means they follow whatever palette the
        form is themed in.
      */}
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
          "group rounded-2xl border border-dashed",
          "transition-[background-color,border-color] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
          dragging
            ? "border-solid border-[var(--cf-accent)] bg-[color-mix(in_oklch,var(--cf-accent)_10%,transparent)]"
            : cn(
                "border-[color-mix(in_oklch,var(--cf-accent)_38%,var(--cf-chip-border))]",
                "bg-[color-mix(in_oklch,var(--cf-accent)_4%,transparent)]",
                !full && "hover:border-[var(--cf-accent)] hover:bg-[color-mix(in_oklch,var(--cf-accent)_7%,transparent)]",
              ),
          full && "opacity-50",
        )}
      >
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 px-4 py-6 disabled:pointer-events-none"
        >
          {/* The glyph gets a tinted disc so it reads as an affordance rather
              than a stray icon floating in the middle of a box. */}
          <span
            className={cn(
              "grid size-10 place-items-center rounded-full",
              "transition-[background-color,color,transform] duration-[var(--duration-micro)] ease-[var(--ease-out)]",
              "motion-reduce:transition-none",
              dragging
                ? "scale-105 bg-[var(--cf-accent)] text-[var(--cf-accent-text)] motion-reduce:scale-100"
                : cn(
                    "bg-[color-mix(in_oklch,var(--cf-accent)_14%,transparent)] text-[var(--cf-accent)]",
                    !full && "group-hover:bg-[color-mix(in_oklch,var(--cf-accent)_22%,transparent)]",
                  ),
            )}
          >
            {dropIcon(accept)}
          </span>
          <span className="text-sm font-medium">
            {full ? "That's all we need" : dragging ? "Drop to upload" : "Drop a file or tap to choose"}
          </span>
          <span className="text-xs opacity-55">{limits}</span>
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
          {items.map((item) => (
            <li
              key={item.key}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs",
                item.state === "error"
                  ? "border-destructive/35 bg-destructive/5"
                  : "border-[var(--cf-chip-border)] bg-[var(--cf-chip-bg)]",
              )}
            >
              <div className="flex items-center gap-2">
                {item.state === "uploading" ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin opacity-60" />
                ) : item.state === "error" ? (
                  <TriangleAlert className="text-destructive size-3.5 shrink-0" />
                ) : (
                  <Check className="size-3.5 shrink-0 text-[var(--success)]" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 opacity-50">{formatSize(item.size)}</span>
                {item.state !== "uploading" && (
                  <button
                    type="button"
                    aria-label={item.state === "error" ? "Dismiss" : `Remove ${item.name}`}
                    onClick={() => setItems((s) => s.filter((it) => it.key !== item.key))}
                    className="shrink-0 opacity-50 transition-opacity hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              {item.state === "error" && item.error && (
                <p className="text-destructive mt-1 pl-5.5 leading-snug">{item.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {done.length > 0 && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onSubmit(done.map((i) => i.file!), done.map((i) => i.name).join(", "))}
          className={cn(
            "h-11 w-full rounded-full bg-[var(--cf-accent)] text-sm font-medium text-[var(--cf-accent-text)]",
            "transition-transform duration-[var(--duration-micro)] active:scale-[0.98]",
            "motion-reduce:active:scale-100 disabled:pointer-events-none disabled:opacity-40",
          )}
        >
          {busy
            ? "Uploading…"
            : done.length === 1
              ? "Send this file"
              : `Send these ${done.length} files`}
        </button>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PNG", "PDF" — a MIME type means nothing to a respondent. */
function describeType(mime: string): string {
  const sub = mime.split("/")[1] ?? mime;
  if (sub.includes("wordprocessing")) return "Word";
  if (sub.includes("spreadsheet")) return "Excel";
  return sub.split(/[.+-]/).pop()!.toUpperCase();
}

/** The upload glyph, matched to what the block actually takes. */
function dropIcon(accept: string[]) {
  const props = { className: "size-5", strokeWidth: 1.75 };
  if (accept.length === 0) return <FileUp {...props} />;
  if (accept.every((a) => a.startsWith("image/"))) return <ImageUp {...props} />;
  if (accept.every((a) => a === "application/pdf" || a.startsWith("text/") || /word|sheet/.test(a)))
    return <FileText {...props} />;
  return <FileUp {...props} />;
}

/** "PNG, JPG or PDF" — the formats line under the prompt. */
function describeFormats(accept: string[]): string {
  const names = [...new Set(accept.map(describeType))];
  if (names.length === 0) return "";
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}

function describeAccept(accept: string[]): string {
  const names = [...new Set(accept.map(describeType))];
  if (names.length === 1) return `a ${names[0]} file`;
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
}
