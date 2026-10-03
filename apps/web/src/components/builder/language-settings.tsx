"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Download, Info, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { FORM_LANGUAGES, MAX_FORM_LANGUAGES, formLanguage, type FormDoc } from "@repo/form-schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { flagOf } from "@/components/chat/composers/phone-value";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEntitlements } from "@/hooks/use-entitlements";
import { usePlansDialog } from "@/stores/paywall-store";
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
  /** How many of the translated strings the author wrote by hand. */
  edited: number;
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
  // Until the plan is known the control is the real one, so a paying account
  // never sees the plans open under its own cursor.
  const ent = useEntitlements();
  const canAdd = !ent.ready || ent.can("multi_language");
  const openPlans = usePlansDialog((s) => s.openPlans);
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
      <div data-setting="form.language" className="flex flex-col justify-between gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0">
          <p className="text-sm font-medium">Form&apos;s default language</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            The form&apos;s own messages, like buttons and errors, use this language.
          </p>
        </div>
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
          <SelectTrigger className="w-full shrink-0 sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORM_LANGUAGES.map((l) => (
              <SelectItem key={l.code} value={l.code}>
                <LanguageName code={l.code} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-info-soft text-info-soft-foreground flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm leading-relaxed">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          Changing the default language does not change the text you wrote in the builder, like question titles and
          button labels. Write those in the language you choose.
        </p>
      </div>

      <div data-setting="form.languages" className="space-y-4 rounded-xl border px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Add multiple languages</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
            Translations are made from the default language above. Translate each language with AI, or by hand:
            download the file, fill in its third column and upload it back.
          </p>
        </div>

        {/*
          No lock and no plan chip. On a plan without languages the control
          looks exactly as it does on one with them, and pressing it opens the
          plans: the moment somebody reaches for a second language is the
          moment to say what it takes.
        */}
        {!canAdd ? (
          <button
            type="button"
            onClick={() => openPlans()}
            className="border-input hover:bg-muted/40 text-muted-foreground flex h-9 w-full items-center justify-between rounded-md border bg-transparent px-3 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64"
          >
            + Add language
            <ChevronDown className="size-4 opacity-50" />
          </button>
        ) : added.length < MAX_FORM_LANGUAGES - 1 && (
          <Select value="" onValueChange={(code) => setLanguages([...added, code])}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder="+ Add language" />
            </SelectTrigger>
            <SelectContent>
              {available.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  <LanguageName code={l.code} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="space-y-2">
          <div className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg px-4 py-3">
            <p className="min-w-0 truncate text-sm font-medium">
              <LanguageName code={settings.language} />
            </p>
            <Badge variant="secondary">Default</Badge>
          </div>
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
        </div>
      </div>
    </>
  );
}

/**
 * A flag beside each language, as a way to find one in a long list by eye.
 *
 * A language is not a country, so this is a hint and nothing more: the name
 * beside it is what says which language it is.
 */
const FLAG: Record<string, string> = {
  en: "US", hi: "IN", bn: "BD", te: "IN", mr: "IN", ta: "IN", gu: "IN", kn: "IN", ml: "IN", pa: "IN", or: "IN",
  as: "IN", ur: "PK", ne: "NP", si: "LK", es: "ES", fr: "FR", de: "DE", pt: "PT", it: "IT", nl: "NL", pl: "PL",
  ru: "RU", uk: "UA", tr: "TR", ar: "SA", he: "IL", fa: "IR", zh: "CN", ja: "JP", ko: "KR", id: "ID", ms: "MY",
  th: "TH", vi: "VN", tl: "PH", sw: "KE", sv: "SE", da: "DK", nb: "NO", fi: "FI", el: "GR", cs: "CZ", hu: "HU",
  ro: "RO",
};

function LanguageName({ code }: { code: string }) {
  const country = FLAG[code];
  return (
    <span className="inline-flex items-center gap-2">
      {country && (
        <span aria-hidden className="text-base leading-none">
          {flagOf(country)}
        </span>
      )}
      {label(code)}
    </span>
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
  const missing = status ? status.total - status.translated : 0;
  /*
    A finished language says who translated it and steps back: the two buttons
    that got it there have nothing left to do, and leaving them lit read as
    "this still needs doing". What remains is the one thing an author may still
    want, which is to correct it.
  */
  const state = !status
    ? "Translation needed"
    : done
      ? status.edited === 0
        ? "Translated by AI"
        : status.edited >= status.translated
          ? "Translated by you"
          : "Translated by AI, with your edits"
      : status.translated === 0
        ? "Translation needed"
        : missing === 1
          ? "1 new line needs translation"
          : `${missing} new lines need translation`;
  return (
    <div className="bg-muted/50 flex flex-col justify-between gap-3 rounded-lg px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          <LanguageName code={code} />
        </p>
        <p className={cn("mt-0.5 flex items-center gap-1 text-xs", done ? "text-muted-foreground" : "text-warning")}>
          {done && <Check className="text-success size-3" aria-hidden />}
          {state}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!done && (
          <Button size="sm" disabled={busy} onClick={onAi}>
            {busy ? <Spinner /> : <Sparkles />}
            AI translation
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}>
              {done ? "Edit translation" : "Manual translation"}
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
