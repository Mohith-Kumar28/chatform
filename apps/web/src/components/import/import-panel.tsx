"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InfoHint } from "@/components/ui/info-hint";
import { importErrorOf, importIntoWorkspace, IMPORT_SOURCES, type ImportReport } from "./import-client";

/**
 * The New form dialog's import screen: one field, straight into the workspace.
 *
 * No preview here, unlike the marketing converter. Someone in the dashboard
 * already has an account and a builder, and the builder is the better place
 * to look the result over, with the report of anything not copied waiting for
 * them there.
 */
export function ImportPanel({
  initialUrl = "",
  autoStart = false,
  workspaceId,
  onBack,
  onImported,
}: {
  initialUrl?: string;
  /** Start at once, for a link already pasted into the AI box. */
  autoStart?: boolean;
  workspaceId?: string;
  onBack: () => void;
  onImported: (formId: string, report: ImportReport) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = async (link: string) => {
    if (!link.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { formId, report } = await importIntoWorkspace(link.trim(), workspaceId);
      onImported(formId, report);
    } catch (err) {
      setError(importErrorOf(err).message);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoStart && initialUrl && !started.current) {
      started.current = true;
      void run(initialUrl);
    }
    // Once, on mount, for the link that opened this panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run(url);
        }}
      >
        <div className="relative flex-1">
          <Input
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError(null);
            }}
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste a Typeform, Google Forms or Tally link"
            aria-label="Form link"
            aria-invalid={error ? true : undefined}
            className="h-11 rounded-full pr-10 pl-4 text-base md:text-sm"
          />
          <InfoHint label="Where's my link?" align="end" className="absolute top-1/2 right-3 -translate-y-1/2">
            <ul className="space-y-1.5">
              {IMPORT_SOURCES.map((s) => (
                <li key={s.id}>{s.where}</li>
              ))}
            </ul>
          </InfoHint>
        </div>
        <Button type="submit" shape="pill" size="lg" disabled={busy || url.trim().length < 4}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Importing…" : "Import"}
          {!busy && <ArrowRight className="size-4" />}
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <Button variant="ghost" size="sm" shape="pill" onClick={onBack} disabled={busy} className="text-muted-foreground -ml-2">
        <ArrowLeft className="size-4" />
        Back
      </Button>
    </div>
  );
}
