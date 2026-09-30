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
 * Paste a link, press Convert, talk to the result.
 *
 * The one control behind every marketing converter. The server works out the
 * builder from the link, so a Google Form pasted under the Typeform tab still
 * converts; `onDetect` lets the surrounding tabs follow what was pasted.
 */
export function ConvertField({
  source,
  onDetect,
  className,
}: {
  source: ImportSource;
  onDetect?: (source: ImportSource) => void;
  className?: string;
}) {
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
    <div className={className}>
      <form
        className="bg-background flex flex-col gap-2 rounded-[1.25rem] p-1.5 shadow-sm ring-1 ring-black/5 sm:flex-row sm:items-center sm:rounded-full dark:ring-white/10"
        onSubmit={(e) => {
          e.preventDefault();
          void convert();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
              const detected = detectImportSource(e.target.value);
              if (detected) onDetect?.(detected);
            }}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={`Paste your ${meta.name} link`}
            aria-label={`${meta.name} link`}
            aria-invalid={error ? true : undefined}
            className="h-11 rounded-full border-0 bg-transparent pr-10 pl-4 text-base shadow-none focus-visible:ring-0 md:text-sm dark:bg-transparent"
          />
          <InfoHint label="Where's my link?" align="end" className="absolute top-1/2 right-2 -translate-y-1/2">
            {meta.where} It has to open without signing in.
          </InfoHint>
        </div>
        <Button type="submit" shape="pill" size="lg" className="h-11 rounded-full px-6" disabled={busy || url.trim().length < 4}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Converting…" : `Convert`}
          {!busy && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p
        role={error ? "alert" : undefined}
        className={cn("mt-3 min-h-5 px-2 text-sm", error ? "text-destructive" : "text-muted-foreground")}
      >
        {error ? (
          <>
            {error.message}{" "}
            {error.limit && (
              <Link href="/signin?mode=signup" className="text-foreground font-medium underline underline-offset-2">
                Sign up free
              </Link>
            )}
          </>
        ) : (
          "Free. No account needed to try it."
        )}
      </p>

      <ImportPreviewDialog trial={trial} onOpenChange={(open) => !open && setTrial(null)} />
    </div>
  );
}
