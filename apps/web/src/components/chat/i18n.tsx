"use client";

import { createContext, useCallback, useContext } from "react";

/**
 * chatform's own words on a respondent's screen, in the form's language.
 *
 * The form's questions arrive already translated. What is left is everything
 * the runtime says for itself: Send, Skip, "Start over", the hint under a
 * field. Those are written in English at the call site and looked up here by
 * that English, so there is no key to invent, nothing to keep in step with a
 * dictionary file, and a string with no translation yet simply reads as it was
 * written.
 *
 *   const t = useT();
 *   t("Send")
 *   t("{count} of {total} answered", { count, total })
 *
 * The argument must be a plain string literal: `pnpm gen:interface-text` finds
 * these calls by reading the source, and that list is what the API translates.
 * A string built at runtime would never be on it.
 */

type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

const Messages = createContext<Record<string, string>>({});

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{([a-zA-Z]+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;
}

export function I18nProvider({ messages, children }: { messages?: Record<string, string>; children: React.ReactNode }) {
  return <Messages.Provider value={messages ?? {}}>{children}</Messages.Provider>;
}

export function useT(): Translate {
  const messages = useContext(Messages);
  return useCallback((text, vars) => fill(messages[text] ?? text, vars), [messages]);
}

/**
 * Marks a string for translation where there is no hook to call: a helper that
 * returns a message for a component to show. The component passes the result
 * through `t`. Returns its argument unchanged.
 */
export function msg(text: string): string {
  return text;
}
