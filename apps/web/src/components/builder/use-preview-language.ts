"use client";

import { useEffect, useMemo, useState } from "react";
import { localizeFormDoc, type FormDoc } from "@repo/form-schema";
import { customFetch } from "@/lib/api/mutator";
import { useBuilderStore } from "@/stores/builder-store";

/**
 * The draft in the language the builder's previews are set to.
 *
 * A form offered in several languages can be looked at in any of them while it
 * is being built. The choice is one value in the builder store, so it holds
 * across questions and across the question card and the full preview.
 *
 * The translations are fetched, not held in the document, and they are about
 * the draft as last saved. So they are read again after each save: a question
 * edited a moment ago shows as written until it has been translated again,
 * which is exactly what a respondent would see.
 */

interface Locale {
  language: string;
  languages: string[];
  messages: Record<string, string>;
  translations: Record<string, string>;
}

export function usePreviewLanguage(doc: FormDoc): {
  /** The language on show. */
  language: string;
  /** The ones that can be shown: the form's own, and each translated one. */
  languages: string[];
  setLanguage: (code: string) => void;
  /** The draft with its text in `language`. The same object when that is the form's own. */
  shown: FormDoc;
  /** chatform's interface text in `language`. */
  messages: Record<string, string>;
} {
  const formId = useBuilderStore((s) => s.formId);
  const chosen = useBuilderStore((s) => s.previewLanguage);
  const setPreviewLanguage = useBuilderStore((s) => s.setPreviewLanguage);
  const saveState = useBuilderStore((s) => s.saveState);
  const [locale, setLocale] = useState<Locale | null>(null);

  const base = doc.settings.language;
  const offered = doc.settings.languages.length > 0;
  const wanted = chosen ?? base;

  useEffect(() => {
    // One language: nothing to ask. And only once the draft has been saved,
    // because the server answers about the saved one.
    if (!formId || !offered || saveState !== "saved") return;
    let live = true;
    customFetch<Locale>(`/api/forms/${formId}/translations/${wanted}`)
      .then((next) => {
        if (live) setLocale(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [formId, offered, wanted, saveState]);

  const active = offered && locale && locale.language === wanted ? locale : null;
  const shown = useMemo(
    () => (active ? localizeFormDoc(doc, active.language, new Map(Object.entries(active.translations))) : doc),
    [doc, active],
  );

  return {
    language: active?.language ?? base,
    languages: offered ? (locale?.languages ?? [base]) : [base],
    setLanguage: (code) => setPreviewLanguage(code === base ? null : code),
    shown,
    messages: active?.messages ?? {},
  };
}
