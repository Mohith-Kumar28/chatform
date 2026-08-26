"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink, TriangleAlert, Mail, QrCode } from "lucide-react";

export function ShareClient({ slug, appOrigin, status }: { slug: string; appOrigin: string; status?: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<"link" | "embed-web" | "embed-email">("link");
  const liveUrl = `${appOrigin}/f/${slug}`;
  const unpublished = status !== undefined && status !== "published";

  const copy = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  const embedSnippet = `<iframe src="${liveUrl}?embed=1" width="100%" height="600" style="border:none;border-radius:16px" title="${slug}"></iframe>`;
  const scriptSnippet = `<script src="${appOrigin}/embed.js" data-form="${slug}" data-api="${process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8787"}"></script>`;
  const emailSnippet = `<a href="${liveUrl}" style="display:inline-block;background:#f97316;color:#fff;padding:12px 24px;border-radius:9999px;font-family:sans-serif;text-decoration:none">Fill out this form</a>`;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      {unpublished && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            <span className="font-medium">This form isn&apos;t published yet.</span>{" "}
            <span className="text-muted-foreground">The link won&apos;t work for respondents until you publish it.</span>
          </p>
        </div>
      )}

      <div className="bg-card rounded-2xl border p-8">
        {/* segmented tabs */}
        <div className="bg-muted mx-auto mb-8 flex w-fit items-center rounded-full p-1">
          {([
            ["link", "Share link"],
            ["embed-web", "Embed in website"],
            ["embed-email", "Embed in email"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                mode === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "link" && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={liveUrl}
                className="bg-muted h-11 min-w-0 flex-1 rounded-lg px-4 font-mono text-sm outline-none"
              />
              <Button className="h-11 rounded-lg px-5" onClick={() => copy(liveUrl, "link")}>
                {copied === "link" ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
                Copy Link
              </Button>
            </div>
            <p className="text-muted-foreground text-center text-xs">
              {unpublished ? "Publish the form before sharing it to the world." : "Make sure your form is published before you share it to the world."}
            </p>
            <div className="flex items-center justify-center gap-4 pt-2">
              <a href={`/f/${slug}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open form">
                <ExternalLink className="size-5" />
              </a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(liveUrl)}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Share on Facebook">
                <svg viewBox="0 0 24 24" className="size-5 fill-current"><path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.9 3.78-3.9 1.09 0 2.24.2 2.24.2v2.46H15.2c-1.24 0-1.63.77-1.63 1.57v1.88h2.78l-.45 2.9h-2.33V22c4.78-.76 8.43-4.92 8.43-9.94Z"/></svg>
              </a>
              <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(liveUrl)}&text=Fill out this form`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Share on X">
                <svg viewBox="0 0 24 24" className="size-5 fill-current"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(liveUrl)}`} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Share on LinkedIn">
                <svg viewBox="0 0 24 24" className="size-5 fill-current"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45Z"/></svg>
              </a>
              <a href={`mailto:?subject=Fill out this form&body=${encodeURIComponent(liveUrl)}`} className="text-muted-foreground hover:text-foreground" aria-label="Share via email">
                <Mail className="size-5" />
              </a>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(liveUrl)}`}
                alt="QR code"
                width={40}
                height={40}
                className="rounded border"
              />
            </div>
          </div>
        )}

        {mode === "embed-web" && (
          <div className="space-y-4">
            <EmbedBlock label="Inline iframe" snippet={embedSnippet} copied={copied === "embed-web"} onCopy={() => copy(embedSnippet, "embed-web")} />
            <EmbedBlock label="Floating widget" snippet={scriptSnippet} copied={copied === "embed-web-btn"} onCopy={() => copy(scriptSnippet, "embed-web-btn")} />
          </div>
        )}

        {mode === "embed-email" && (
          <div className="space-y-4">
            <EmbedBlock label="Email button" snippet={emailSnippet} copied={copied === "embed-email"} onCopy={() => copy(emailSnippet, "embed-email")} />
            <p className="text-muted-foreground text-xs">
              Paste this into your email template. Most email clients strip scripts — use the button markup.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6">
        <QrCode className="text-muted-foreground mx-auto size-4" />
      </div>
    </div>
  );
}

function EmbedBlock({ label, snippet, copied, onCopy }: { label: string; snippet: string; copied: boolean; onCopy: () => void }) {
  return (
    <div>
      <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">{label}</p>
      <div className="flex items-start gap-2">
        <pre className="bg-muted min-w-0 flex-1 overflow-x-auto rounded-lg p-3 text-xs">{snippet}</pre>
        <Button variant="outline" size="icon" className="size-9 shrink-0" onClick={onCopy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
