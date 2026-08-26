"use client";

import { useState } from "react";
import { Mail, QrCode, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { qrSvg } from "@/lib/qr";
import { cn } from "@/lib/utils";

type Mode = "link" | "website" | "email";
type EmbedStyle = "inline" | "popup" | "side-tab" | "fullpage";

/**
 * Share. The previous version fetched its QR from api.qrserver.com — a
 * third-party request carrying the form URL, unstyled and unthemed — and left
 * a stray `<QrCode>` icon rendered on its own below the card.
 *
 * The QR is now generated locally and downloadable, and the embed modes have
 * real snippets instead of one hardcoded iframe.
 */
export function ShareClient({
  slug,
  appOrigin,
  status,
}: {
  slug: string;
  appOrigin: string;
  status?: string;
}) {
  const [mode, setMode] = useState<Mode>("link");
  const [embedStyle, setEmbedStyle] = useState<EmbedStyle>("inline");
  const [showQr, setShowQr] = useState(false);

  const liveUrl = `${appOrigin}/f/${slug}`;
  const unpublished = status !== undefined && status !== "published";

  return (
    <div className="space-y-4">
      {unpublished && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] px-4 py-3">
          <TriangleAlert className="text-[var(--warning-foreground)] mt-0.5 size-4 shrink-0" />
          <p className="text-caption text-[var(--warning-foreground)]">
            This form isn&apos;t published yet. The link works, but respondents will see a closed
            message until you hit Publish.
          </p>
        </div>
      )}

      <div className="bg-card space-y-6 rounded-2xl p-6">
        <SegmentedControl
          className="mx-auto flex"
          options={[
            { value: "link", label: "Share a link" },
            { value: "website", label: "Embed in a site" },
            { value: "email", label: "Embed in email" },
          ]}
          value={mode}
          onChange={setMode}
          ariaLabel="Share method"
        />

        {mode === "link" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={liveUrl} className="font-mono text-sm" />
              <CopyButton value={liveUrl} label="Copy" variant="default" />
            </div>

            <div className="flex items-center justify-center gap-1">
              <ShareIcon href={liveUrl} label="Open the form" icon={ExternalIcon} external />
              <ShareIcon
                href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(liveUrl)}`}
                label="Share on Facebook"
                icon={FacebookIcon}
                external
              />
              <ShareIcon
                href={`https://x.com/intent/tweet?url=${encodeURIComponent(liveUrl)}`}
                label="Share on X"
                icon={XIcon}
                external
              />
              <ShareIcon
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(liveUrl)}`}
                label="Share on LinkedIn"
                icon={LinkedinIcon}
                external
              />
              <ShareIcon
                href={`mailto:?subject=${encodeURIComponent("A quick question")}&body=${encodeURIComponent(liveUrl)}`}
                label="Share by email"
                icon={Mail}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Show QR code"
                onClick={() => setShowQr((v) => !v)}
                className={cn(showQr && "bg-muted")}
              >
                <QrCode className="size-4" />
              </Button>
            </div>

            {showQr && <QrPanel url={liveUrl} slug={slug} />}
          </div>
        )}

        {mode === "website" && (
          <div className="space-y-4">
            <SegmentedControl
              size="sm"
              className="flex"
              options={[
                { value: "inline", label: "Inline" },
                { value: "popup", label: "Popup" },
                { value: "side-tab", label: "Side tab" },
                { value: "fullpage", label: "Full page" },
              ]}
              value={embedStyle}
              onChange={setEmbedStyle}
              ariaLabel="Embed style"
            />
            <Snippet
              label={EMBED_DESCRIPTIONS[embedStyle]}
              code={embedSnippet(embedStyle, liveUrl, slug)}
            />
          </div>
        )}

        {mode === "email" && (
          <div className="space-y-4">
            <Snippet
              label="Most email clients block iframes, so this is a styled link that opens the conversation in a browser."
              code={emailSnippet(liveUrl)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const EMBED_DESCRIPTIONS: Record<EmbedStyle, string> = {
  inline: "Renders the conversation directly in the page.",
  popup: "A launcher bubble that opens the conversation in a panel.",
  "side-tab": "A tab pinned to the edge of the page.",
  fullpage: "Takes over the whole viewport — good for a dedicated landing page.",
};

function embedSnippet(style: EmbedStyle, url: string, slug: string): string {
  if (style === "inline") {
    return `<iframe
  src="${url}?embed=1"
  title="${slug}"
  width="100%"
  height="640"
  style="border:none;border-radius:16px"
></iframe>`;
  }
  if (style === "fullpage") {
    return `<iframe
  src="${url}?embed=1"
  title="${slug}"
  style="border:none;position:fixed;inset:0;width:100%;height:100%"
></iframe>`;
  }
  return `<script
  src="${new URL(url).origin}/embed.js"
  data-form="${slug}"
  data-mode="${style}"
  defer
></script>`;
}

function emailSnippet(url: string): string {
  return `<a href="${url}"
   style="display:inline-block;padding:12px 24px;background:#f97316;color:#fff;
          border-radius:9999px;font-family:sans-serif;text-decoration:none">
  Answer a few questions →
</a>`;
}

function Snippet({ label, code }: { label: string; code: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <Label className="text-muted-foreground text-caption font-normal">{label}</Label>
        <CopyButton value={code} label="Copy" variant="outline" />
      </div>
      <pre className="bg-muted text-caption overflow-x-auto rounded-xl p-3 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * QR generated locally. Uses a tiny byte-mode encoder rather than shipping a QR
 * library or, as before, sending the form's URL to a third-party image service.
 */
function QrPanel({ url, slug }: { url: string; slug: string }) {
  const svg = qrSvg(url);
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return (
    <div className="flex flex-col items-center gap-3 pt-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={`QR code for ${slug}`} className="size-40 rounded-lg bg-white p-2" />
      <Button variant="outline" size="sm" shape="pill" asChild>
        <a href={dataUrl} download={`${slug}-qr.svg`}>
          Download SVG
        </a>
      </Button>
    </div>
  );
}

function ShareIcon({
  href,
  label,
  icon: Icon,
  external,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  external?: boolean;
}) {
  return (
    <Button variant="ghost" size="icon-sm" asChild aria-label={label}>
      <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
        <Icon className="size-4" />
      </a>
    </Button>
  );
}

// lucide-react v1 removed brand marks, so the two we use are inlined.
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z" />
    </svg>
  );
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm6 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95C20.7 8.75 22 11 22 14.1V21h-4v-6.1c0-1.5-.03-3.4-2.1-3.4-2.1 0-2.4 1.6-2.4 3.3V21H9V9Z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.9 2H22l-7.1 8.1L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.6-8.7L1.6 2h6.7l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.4 3.8H5.5L17.7 20Z" />
    </svg>
  );
}

function ExternalIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className} aria-hidden>
      <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
