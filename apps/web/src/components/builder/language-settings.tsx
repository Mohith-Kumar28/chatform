"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { FORM_LANGUAGES, MAX_FORM_LANGUAGES, formLanguage, type FormDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LockedControl } from "@/components/billing/gate";
import { API_ORIGIN, apiHeaders, customFetch, isPlanDenial } from "@/lib/api/mutator";
import { useBuilderStore } from "@/stores/builder-store";
import { cn } from "@/lib/utils";

/**
 * The languages a form is offered in.
 *
 * The form is written in one language. Each other language is added here and
 * starts as "Translation needed" until it is translated: by AI in one press, or
 * by hand, by downloading a spreadsheet, filling in its third column and
 * uploading it back. The two combine: AI first, then the spreadsheet to correct
 * whatever it got wrong.
 *
 * Which languages there are is a setting in the document. The translations are
 * not: they are kept by the server against the text they translate, so the
 * status of a language is something only the server can say, and it says it
 * about the draft as last saved.
 */

interface Status {
  lang: string;
  name: string;
  total: number;
  translated: number;
}

const label = (code: string) => {
  const language = formLanguage(code);
  return language ? (language.native === language.name ? language.name : `${language.name} · ${language.native}`) : code;
};

/** The server translates the saved draft, so a language added a moment ago has to have reached it first. */
function draftSaved(): Promise<boolean> {
  return new Promise((resolve) => {
    const settled = () => useBuilderStore.getState().saveState === "saved";
    if (settled()) return resolve(true);
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(settled());
    }, 10_000);
    const unsubscribe = useBuilderStore.subscribe(() => {
      if (!settled()) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(true);
    });
  });
}

export function LanguageSettings({
  formId,
  settings,
  onChange,
}: {
  formId: string;
  settings: FormDoc["settings"];
  onChange: (next: FormDoc["settings"]) => void;
}) {
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const saveState = useBuilderStore((s) => s.saveState);
  const added = settings.languages.filter((code) => code !== settings.language);
  const addedKey = added.join(",");

  // After each save, because the status is about the saved draft.
  useEffect(() => {
    if (saveState !== "saved" || !addedKey) return;
    let live = true;
    customFetch<{ languages: Status[] }>(`/api/forms/${formId}/translations`)
      .then((res) => {
        if (live) setStatus(Object.fromEntries(res.languages.map((s) => [s.lang, s])));
      })
      // The rows fall back to "Translation needed", which is the safe reading.
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [saveState, addedKey, formId]);

  const setLanguages = (languages: string[]) => onChange({ ...settings, languages });

  async function translateWithAi(lang: string) {
    setBusy(lang);
    try {
      if (!(await draftSaved())) throw new Error("Save the form first, then try again.");
      const next = await customFetch<Status>(`/api/forms/${formId}/translations/${lang}/ai`, { method: "POST" });
      setStatus((s) => ({ ...s, [lang]: next }));
      if (next.translated < next.total) toast.error("Some text could not be translated. Try again, or translate it by hand.");
      else toast.success(`Translated into ${next.name}`);
    } catch (err) {
      // A plan denial has already opened the paywall.
      if (!isPlanDenial(err)) toast.error(err instanceof Error ? err.message : "Translation failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function download(lang: string) {
    try {
      if (!(await draftSaved())) throw new Error("Save the form first, then try again.");
      const res = await fetch(`${API_ORIGIN}/api/forms/${formId}/translations/${lang}/csv`, {
        headers: apiHeaders(),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not download the file. Try again.");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `translations-${lang}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the file. Try again.");
    }
  }

  async function upload(lang: string, file: File) {
    setBusy(lang);
    try {
      if (!(await draftSaved())) throw new Error("Save the form first, then try again.");
      const res = await customFetch<{ saved: number; skipped: number; status: Status }>(
        `/api/forms/${formId}/translations/${lang}/csv`,
        { method: "PUT", body: await file.text(), headers: { "content-type": "text/csv" } },
      );
      setStatus((s) => ({ ...s, [lang]: res.status }));
      if (res.saved === 0) toast.error("No translations found in that file. Fill in the third column and upload it again.");
      else toast.success(`${res.saved} translations saved`);
    } catch (err) {
      if (!isPlanDenial(err)) toast.error(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const available = FORM_LANGUAGES.filter((l) => l.code !== settings.language && !added.includes(l.code));

  return (
    <>
      <div className="divide-border/60 divide-y rounded-xl border">
        <div data-setting="form.language" className="flex flex-col justify-between gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
          <p className="text-sm font-medium">Form language</p>
          <Select
            value={settings.language}
            onValueChange={(code) =>
              onChange({
                ...settings,
                language: code,
                agent: { ...settings.agent, language: code },
                languages: settings.languages.filter((c) => c !== code),
              })
            }
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORM_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {label(l.code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-0.5">
          <p className="text-muted-foreground text-caption font-medium tracking-wide uppercase">Also available in</p>
          <InfoHint label="About translating a form" align="start">
            <p>
              Translate each language with AI, or by hand: download the file, fill in its third column, and upload it
              back. Do both to correct what the AI got wrong.
            </p>
          </InfoHint>
        </div>
        <LockedControl feature="multi_language">
          <div data-setting="form.languages" className="divide-border/60 divide-y rounded-xl border">
            {added.map((code) => (
              <LanguageRow
                key={code}
                code={code}
                status={status[code]}
                busy={busy === code}
                onAi={() => void translateWithAi(code)}
                onDownload={() => void download(code)}
                onUpload={(file) => void upload(code, file)}
                onRemove={() => setLanguages(added.filter((c) => c !== code))}
              />
            ))}
            {added.length < MAX_FORM_LANGUAGES - 1 && (
              <div className="px-4 py-3.5">
                <Select value="" onValueChange={(code) => setLanguages([...added, code])}>
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue placeholder="Add a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {label(l.code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </LockedControl>
      </div>
    </>
  );
}

function LanguageRow({
  code,
  status,
  busy,
  onAi,
  onDownload,
  onUpload,
  onRemove,
}: {
  code: string;
  status: Status | undefined;
  busy: boolean;
  onAi: () => void;
  onDownload: () => void;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const done = status !== undefined && status.total > 0 && status.translated >= status.total;
  return (
    <div className="flex flex-col justify-between gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label(code)}</p>
        <p className={cn("mt-0.5 text-xs", done ? "text-muted-foreground" : "text-warning")}>
          {done ? "Translated" : "Translation needed"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant={done ? "outline" : "default"} disabled={busy} onClick={onAi}>
          {busy ? <Spinner /> : <Sparkles />}
          AI translation
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              Manual translation
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDownload}>
              <Download />
              Download CSV
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
              <Upload />
              Upload CSV
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared so choosing the same file again still fires a change.
            e.target.value = "";
            if (file) onUpload(file);
          }}
        />
        <Button size="icon-sm" variant="ghost" aria-label={`Remove ${formLanguage(code)?.name ?? code}`} onClick={onRemove}>
          <X />
        </Button>
      </div>
    </div>
  );
}
