"use client";

import { useEffect, useState } from "react";
import { BookOpen, FileSpreadsheet, FileText, Globe, ImageIcon, Mic } from "lucide-react";
import { API_ORIGIN, apiHeaders } from "@/lib/api/mutator";
import { cn } from "@/lib/utils";

/**
 * How a knowledge source looks, before and after it is uploaded: a tile you
 * can recognise it by, and the thing itself when opened.
 *
 * Shared by the builder's knowledge panel and the create dialog's staged list,
 * so an image added in either place shows as that image.
 */

export type PreviewKind = "file" | "text" | "link" | "crawl" | "image" | "audio";

/** A site's own icon. Public, and only ever asked for a hostname. */
export function faviconUrl(url: string): string | null {
  try {
    return `https://www.google.com/s2/favicons?sz=64&domain=${new URL(url).hostname}`;
  } catch {
    return null;
  }
}

/** The address without its scheme or trailing slash: what people call a page. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

/** "PDF", "DOCX", "PNG": the file's type as people name it. */
export function typeLabel(mime: string | null, filename?: string | null): string | null {
  const ext = filename?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
  if (ext) return ext.toUpperCase();
  if (!mime) return null;
  if (mime === "application/pdf") return "PDF";
  const sub = mime.split("/")[1]?.split(/[.+;-]/).pop();
  return sub ? sub.toUpperCase() : null;
}

/**
 * The start of a source's text, split into the page's own title and a
 * readable snippet. A web page is stored as `# Title` then its text, which
 * usually repeats the title, so neither is shown twice.
 */
export function readExcerpt(excerpt: string | null): { heading: string | null; snippet: string | null } {
  if (!excerpt) return { heading: null, snippet: null };
  const m = /^#\s+(.+)\n+/.exec(excerpt);
  const heading = m?.[1]?.trim() || null;
  let body = m ? excerpt.slice(m[0].length) : excerpt;
  if (heading && body.startsWith(heading)) body = body.slice(heading.length);
  const snippet = body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/\s*·\s*/g, " · ")
    .replace(/\s+/g, " ")
    .replace(/^[\s·]+/, "")
    .trim();
  return { heading, snippet: snippet || null };
}

function KindIcon({ kind, mime, className }: { kind: PreviewKind; mime: string | null; className: string }) {
  const props = { className, strokeWidth: 1.75 };
  if (kind === "text") return <BookOpen {...props} />;
  if (kind === "link" || kind === "crawl") return <Globe {...props} />;
  if (kind === "image") return <ImageIcon {...props} />;
  if (kind === "audio") return <Mic {...props} />;
  if (mime && /sheet|excel|csv/.test(mime)) return <FileSpreadsheet {...props} />;
  return <FileText {...props} />;
}

/**
 * The square at the start of a row: the image itself, the site's icon, or the
 * file's type over a document icon.
 */
export function SourceThumb({
  kind,
  mime = null,
  imageSrc = null,
  url = null,
  label = null,
  failed = false,
}: {
  kind: PreviewKind;
  mime?: string | null;
  imageSrc?: string | null;
  url?: string | null;
  label?: string | null;
  failed?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const favicon = url && !broken ? faviconUrl(url) : null;

  return (
    <div
      className={cn(
        "bg-muted border-border relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        failed && "border-destructive/40 bg-destructive/5",
        label && kind === "file" && !imageSrc && "pb-2.5",
      )}
    >
      {imageSrc && !broken ? (
        // A blob or local object URL; next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageSrc} alt="" className="size-full object-cover" onError={() => setBroken(true)} />
      ) : favicon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={favicon} alt="" className="size-5" onError={() => setBroken(true)} />
      ) : (
        <KindIcon kind={kind} mime={mime} className={cn("size-4", failed ? "text-destructive" : "text-muted-foreground")} />
      )}
      {label && !imageSrc && !favicon && kind === "file" && (
        <span className="bg-background text-muted-foreground absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-[9px] leading-3 font-medium">
          {label}
        </span>
      )}
    </div>
  );
}

/**
 * An uploaded knowledge file as an object URL, fetched with the session and
 * any impersonation header, so an `<img>` or `<iframe>` can show it.
 * Null until it arrives, and when there is nothing to fetch.
 */
export function useKnowledgeFile(formId: string, sourceId: string, enabled: boolean): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let url: string | null = null;
    let cancelled = false;
    void fetch(`${API_ORIGIN}/api/forms/${formId}/knowledge/${sourceId}/file`, {
      headers: apiHeaders(),
      credentials: "include",
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob || cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {
        // No preview is a fallback, not an error: the row still names the file.
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setSrc(null);
    };
  }, [formId, sourceId, enabled]);
  return src;
}

/** Whether the browser can show this file itself, rather than only its text. */
export function viewable(mime: string | null): "image" | "pdf" | "audio" | null {
  if (!mime) return null;
  if (/^image\/(png|jpeg|gif|webp|avif)$/.test(mime)) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("audio/")) return "audio";
  return null;
}

/** The source itself, opened: the image, the PDF, the recording, or its text. */
export function SourceBody({
  mime,
  src,
  text,
  title,
}: {
  mime: string | null;
  src: string | null;
  text: string | null;
  title: string;
}) {
  const view = viewable(mime);
  if (view && !src) {
    return <div className="bg-muted h-40 animate-pulse rounded-lg" />;
  }
  if (view === "image" && src) {
    return (
      <div className="bg-muted flex justify-center rounded-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={title} className="max-h-80 rounded-lg object-contain" />
      </div>
    );
  }
  if (view === "pdf" && src) {
    // The viewer's toolbar would title the page with the blob's random id.
    return <iframe src={`${src}#toolbar=0&navpanes=0&view=FitH`} title={title} className="border-border h-96 w-full rounded-lg border bg-white" />;
  }
  if (view === "audio" && src) {
    return <audio src={src} controls className="w-full" />;
  }
  if (!text) return null;
  return (
    <p className="bg-muted text-muted-foreground max-h-48 overflow-y-auto rounded-lg p-3 text-caption leading-relaxed whitespace-pre-line">
      {text}
    </p>
  );
}
