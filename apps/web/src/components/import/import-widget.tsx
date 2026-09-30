"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { ImportPreviewDialog } from "./import-preview-dialog";
import { detectImportSource, IMPORT_SOURCES, importErrorOf, previewImport, type ImportSource, type ImportTrial } from "./import-client";

/**
 * Paste a link, get your form back as a conversation.
 *
 * The marketing site's converter, and the same shape Youform's switcher has:
 * a tab per builder, one field, one button. The tab only changes the example
 * and the hint; the server works out the builder from the link, so pasting a
 * Google Form under the Typeform tab still works.
 */
export function ImportWidget({ initial = "typeform", className }: { initial?: ImportSource; className?: string }) {
  const [source, setSource] = useState<ImportSource>(initial);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; limit: boolean } | null>(null);
  const [trial, setTrial] = useState<ImportTrial | null>(null);

  const meta = IMPORT_SOURCES.find((s) => s.id === source)!;

  const convert = async () => {
    const link = url.trim();
    if (!link || busy) return;
    setBusy(true);
    setError(null);
    try {
      setTrial(await previewImport(link));
    } catch (err) {
      setError(importErrorOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("border-border bg-card rounded-2xl border p-4 shadow-xs sm:p-5", className)}>
      <div role="tablist" aria-label="Your current form builder" className="flex flex-wrap gap-2">
        {IMPORT_SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={source === s.id}
            onClick={() => setSource(s.id)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-[var(--duration-micro)]",
              source === s.id
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <form
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void convert();
        }}
      >
        <div className="relative flex-1">
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
              // Pasted a different builder's link: follow it, so the hint matches.
              const detected = detectImportSource(e.target.value);
              if (detected) setSource(detected);
            }}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={meta.placeholder}
            aria-label={`${meta.name} link`}
            aria-invalid={error ? true : undefined}
            className="h-11 rounded-full pr-10 pl-4 text-base md:text-sm"
          />
          <InfoHint label="Where's my link?" align="end" className="absolute top-1/2 right-3 -translate-y-1/2">
            {meta.where} The form has to open without signing in.
          </InfoHint>
        </div>
        <Button type="submit" shape="pill" size="lg" disabled={busy || url.trim().length < 4}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Converting…" : "Convert"}
          {!busy && <ArrowRight className="size-4" />}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-destructive mt-3 text-sm">
          {error.message}{" "}
          {error.limit && (
            <Link href="/signin?mode=signup" className="text-foreground font-medium underline underline-offset-2">
              Sign up free
            </Link>
          )}
        </p>
      )}

      <ImportPreviewDialog trial={trial} onOpenChange={(open) => !open && setTrial(null)} />
    </div>
  );
}
