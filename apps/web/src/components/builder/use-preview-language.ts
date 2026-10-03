"use client";

import { useEffect, useMemo } from "react";
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
  const known = useBuilderStore((s) => s.previewLanguages);
  const locales = useBuilderStore((s) => s.previewLocales);
  const setPreviewLocale = useBuilderStore((s) => s.setPreviewLocale);
  const saveState = useBuilderStore((s) => s.saveState);

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
        if (live) setPreviewLocale(next);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [formId, offered, wanted, saveState, setPreviewLocale]);

  // The other languages too, ahead of anyone asking, so choosing one changes
  // the card at once instead of after a request. A handful of small reads, once.
  useEffect(() => {
    if (!formId || !offered || saveState !== "saved" || !known) return;
    let live = true;
    for (const code of known) {
      if (code === base || code === wanted || locales[code]) continue;
      customFetch<Locale>(`/api/forms/${formId}/translations/${code}`)
        .then((next) => {
          if (live) setPreviewLocale(next);
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
    // `locales` is read, not watched: each arrival would otherwise start the round again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, offered, known, base, wanted, saveState, setPreviewLocale]);

  /*
    Drawn from what is already known, and corrected when the answer lands. The
    list of languages and any language looked at before are in the store, so
    coming back to a preview shows the switcher and the translated text at once
    rather than after the request.
  */
  const active = offered && wanted !== base ? locales[wanted] : undefined;
  const shown = useMemo(
    () => (active ? localizeFormDoc(doc, wanted, new Map(Object.entries(active.translations))) : doc),
    [doc, active, wanted],
  );

  return {
    language: active ? wanted : base,
    languages: offered ? (known ?? [base]) : [base],
    setLanguage: (code) => setPreviewLanguage(code === base ? null : code),
    shown,
    messages: (offered ? locales[active ? wanted : base]?.messages : undefined) ?? {},
  };
}
