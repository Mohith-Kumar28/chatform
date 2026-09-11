"use client";

import {
  Download,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileMusic,
  FilePlay,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const KINDS: [RegExp, LucideIcon][] = [
  [/^(pdf|docx?|rtf|odt|txt|md|pages|epub)$/, FileText],
  [/^(csv|tsv|xlsx?|ods|numbers|json)$/, FileSpreadsheet],
  [/^(zip|rar|7z|gz|tgz|tar|bz2|xz|dmg|pkg|exe|msi|apk|ipa|deb|rpm|appimage|iso)$/, FileArchive],
  [/^(png|jpe?g|gif|webp|avif|svg|heic|bmp|tiff?|ico|psd|ai|fig|sketch)$/, FileImage],
  [/^(mp4|webm|mov|mkv|avi|m4v)$/, FilePlay],
  [/^(mp3|wav|m4a|aac|flac|ogg|opus)$/, FileMusic],
  [/^(js|jsx|ts|tsx|css|scss|html?|xml|ya?ml|toml|py|rb|go|rs|java|kt|swift|c|cc|cpp|h|sh|sql|php)$/, FileCode],
];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * The icon and the word under the name, by extension — the name's own, or
 * `fallbackExt` (the uploaded file's) when a rename dropped it.
 */
export function fileKind(name: string, fallbackExt?: string | null): { Icon: LucideIcon; label: string } {
  const ext = extensionOf(name) || (fallbackExt ?? "").toLowerCase();
  const hit = KINDS.find(([re]) => re.test(ext));
  return { Icon: hit?.[1] ?? File, label: ext ? ext.toUpperCase() : "File" };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

/**
 * An attached file: a document shape, its name, what it is, and a download button.
 *
 * One card for the chat, the builder's preview and the description editor, so
 * the three cannot drift (see the preview/runtime note in `question-preview`).
 * The editor passes `name` as an input so the author can rename it in place;
 * everywhere else it is text.
 *
 * Colours come from the form's own `--cf-*` variables with plain fallbacks, so
 * the card takes on a form's theme in the chat and still reads in the builder's
 * inspector, which has none.
 */
export function FileCard({
  filename,
  ext,
  name,
  sizeBytes,
  downloadHref,
  actions,
  className,
}: {
  /** The name the file is known by — picks the icon and the type label. */
  filename: string;
  /** The uploaded file's real extension, for a name that no longer has one. */
  ext?: string | null;
  /** What to draw in the name slot; defaults to `filename`. */
  name?: React.ReactNode;
  sizeBytes?: number | null;
  /** Omitted, no download button is drawn. */
  downloadHref?: string;
  /** Extra buttons after the download, e.g. the editor's remove. */
  actions?: React.ReactNode;
  className?: string;
}) {
  const { Icon, label } = fileKind(filename, ext);
  const meta = [label, sizeBytes != null ? formatBytes(sizeBytes) : null].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "my-1 flex w-full max-w-sm items-center gap-3 border px-3 py-2.5 text-sm not-italic",
        className,
      )}
      style={{
        borderColor: "var(--cf-chip-border, var(--border))",
        background: "var(--cf-chip-bg, transparent)",
        borderRadius: "var(--cf-radius, 0.75rem)",
      }}
    >
      {/* A page with a folded corner, the icon sitting on it. */}
      <span
        aria-hidden
        className="relative grid h-11 w-9 shrink-0 place-items-center rounded-[0.3rem]"
        style={{
          background: "color-mix(in srgb, var(--cf-accent, currentColor) 12%, transparent)",
          color: "var(--cf-accent, currentColor)",
          clipPath: "polygon(0 0, calc(100% - 0.6rem) 0, 100% 0.6rem, 100% 100%, 0 100%)",
        }}
      >
        <span
          className="absolute top-0 right-0 size-[0.6rem] rounded-bl-[0.2rem]"
          style={{ background: "color-mix(in srgb, var(--cf-accent, currentColor) 28%, transparent)" }}
        />
        <Icon className="size-4" strokeWidth={1.75} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{name ?? filename}</span>
        <span className="block truncate text-xs opacity-60">{meta}</span>
      </span>

      {downloadHref && (
        <a
          href={downloadHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Download ${filename}`}
          title="Download"
          className="grid size-8 shrink-0 place-items-center rounded-full transition-opacity hover:opacity-80"
          style={{
            background: "var(--cf-accent, var(--primary))",
            color: "var(--cf-accent-text, var(--primary-foreground))",
          }}
        >
          <Download className="size-4" />
        </a>
      )}
      {actions}
    </div>
  );
}
